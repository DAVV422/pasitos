import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, count, eq } from 'drizzle-orm';
import {
  archivos,
  asistentes,
  enviosFoto,
  eventos,
  retos,
  withOrganizacion,
  type Db,
} from '@pasitos/db';
import { AppError, FOTOS_POR_HORA, type OrigenFoto } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { ContextoAsistente, FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import type { ArchivosService } from '../archivos/archivos.service';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';
import { isEnGrupo } from '../grupos/grupos-de';

/** Lo que llega del celular: la foto ya achicada (HU-322 §5). */
export interface FotoRecibida {
  readonly datos: Buffer;
  readonly nombre: string;
  readonly mime: string;
  readonly origen: OrigenFoto;
  readonly autorizaUso: boolean;
}

export interface EnvioAceptado {
  readonly envioId: string;
  readonly estado: 'recibida';
}

/**
 * Enviar la foto de un reto (HU-322 §3): las comprobaciones en orden, la foto en cuarentena y la
 * fila `recibida`. La procesa el trabajador (`procesar-fotos`) y la revisa el equipo (HU-323).
 */
export class FotosAppService {
  /** 10 por hora por celular. */
  private readonly porDispositivo: Limitador;

  constructor(
    private readonly db: Db,
    private readonly archivosService: ArchivosService,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {
    this.porDispositivo = new Limitador([{ maximo: FOTOS_POR_HORA, ms: 3_600_000 }], () =>
      this.reloj.now().getTime(),
    );
  }

  submit(
    asistente: ContextoAsistente,
    retoId: string,
    foto: FotoRecibida,
    firma: FirmaVerificada,
  ): Promise<EnvioAceptado> {
    this.archivosService.checkDeclarado('foto_reto', foto.nombre, foto.mime);
    return withOrganizacion(this.db, asistente.organizacionId, (tx) =>
      runIdempotente(
        tx,
        `asistente:${asistente.asistenteId}`,
        firma,
        async () => {
          const espera = this.porDispositivo.hit(asistente.dispositivoId);
          if (espera > 0) {
            throw new AppError('DEMASIADOS_INTENTOS', {
              meta: { reintentarEnSegundos: espera },
            });
          }
          const ahora = this.reloj.now();
          // 2. El reto es de foto, está activo, en horario, es de su grupo, y el evento en curso.
          const [fila] = await tx
            .select({
              reto: retos,
              eventoEstado: eventos.estado,
              requiereCheckIn: eventos.retosRequierenCheckIn,
            })
            .from(retos)
            .innerJoin(eventos, eq(eventos.id, retos.eventoId))
            .where(and(eq(retos.id, retoId), eq(retos.eventoId, asistente.eventoId)))
            .for('update', { of: retos });
          if (!fila || fila.reto.tipo !== 'foto') throw new AppError('NO_ENCONTRADO');
          const { reto } = fila;
          if (fila.eventoEstado !== 'en_curso') {
            throw new AppError('EVENTO_NO_ACTIVO', {
              detail:
                fila.eventoEstado === 'pausado'
                  ? 'Pausamos un momento. Tu foto puede esperar.'
                  : 'El evento no está en curso.',
            });
          }
          if (
            reto.estado !== 'activo' ||
            (reto.disponibleDesde && reto.disponibleDesde > ahora) ||
            (reto.disponibleHasta && reto.disponibleHasta <= ahora)
          ) {
            throw new AppError('RETO_NO_DISPONIBLE');
          }
          if (reto.grupoId && !(await isEnGrupo(tx, asistente.asistenteId, reto.grupoId))) {
            throw new AppError('SOLO_PARA_GRUPO', { detail: 'Este reto es solo para un grupo.' });
          }
          // 3. El check-in, si el evento lo pide.
          if (fila.requiereCheckIn) {
            const [persona] = await tx
              .select({ estado: asistentes.estado })
              .from(asistentes)
              .where(eq(asistentes.id, asistente.asistenteId));
            if (persona?.estado !== 'presente') throw new AppError('SIN_CHECK_IN');
          }
          // 4 a 6. Lo que ya mandó en este reto.
          const previos = await tx
            .select({ estado: enviosFoto.estado, n: count() })
            .from(enviosFoto)
            .where(
              and(eq(enviosFoto.retoId, retoId), eq(enviosFoto.asistenteId, asistente.asistenteId)),
            )
            .groupBy(enviosFoto.estado);
          const cuantos = (estados: readonly string[]) =>
            previos.filter((p) => estados.includes(p.estado)).reduce((s, p) => s + p.n, 0);
          if (cuantos(['recibida', 'en_revision']) > 0) throw new AppError('FOTO_EN_REVISION');
          if (cuantos(['aprobada']) >= reto.vecesPorPersona) {
            throw new AppError('RETO_YA_COMPLETADO');
          }
          if (cuantos(['rechazada']) >= reto.intentosMax) throw new AppError('INTENTOS_AGOTADOS');
          // 7. Un control suave: el tope de verdad se aplica al aprobar (HU-323).
          if (reto.entregados >= reto.topeTotal) throw new AppError('TOPE_ALCANZADO');
          // 8 y 9. La autorización y la galería.
          if (reto.autorizacionUso === 'requerida' && !foto.autorizaUso) {
            throw new AppError('AUTORIZACION_REQUERIDA');
          }
          if (foto.origen === 'galeria' && !reto.permiteGaleria) {
            throw new AppError('VALIDACION', {
              errors: [
                {
                  field: 'origen',
                  code: 'NO_VALIDO',
                  message: 'Este reto pide sacar la foto con la cámara.',
                },
              ],
            });
          }

          // El archivo, en cuarentena: lo procesa el trabajador.
          const archivoId = uuidv7();
          await mkdir(join(this.archivosDir, 'cuarentena'), { recursive: true });
          await writeFile(join(this.archivosDir, 'cuarentena', archivoId), foto.datos, {
            mode: 0o600,
          });
          await tx.insert(archivos).values({
            id: archivoId,
            organizacionId: asistente.organizacionId,
            eventoId: asistente.eventoId,
            proposito: 'foto_reto',
            nombreOriginal: 'foto',
            mime: foto.mime,
            tamanoBytes: foto.datos.length,
          });
          const envioId = uuidv7();
          await tx.insert(enviosFoto).values({
            id: envioId,
            organizacionId: asistente.organizacionId,
            eventoId: asistente.eventoId,
            retoId,
            asistenteId: asistente.asistenteId,
            dispositivoId: asistente.dispositivoId,
            intento: previos.reduce((s, p) => s + p.n, 0) + 1,
            archivoId,
            origen: foto.origen,
            firmaDispositivo: Buffer.from(firma.firma),
            autorizaUso: foto.autorizaUso,
            autorizaUsoAt: foto.autorizaUso ? ahora : null,
          });
          return { envioId, estado: 'recibida' as const };
        },
        202,
      ),
    );
  }
}
