import { and, count, desc, eq, isNull } from 'drizzle-orm';
import {
  alertas,
  asistentes,
  dispositivos,
  eventos,
  miembrosEvento,
  saldos,
  vinculaciones,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, describeMotivoAnulacion } from '@pasitos/dominio';
import { maskEmail } from '@pasitos/dominio/esquemas';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { FirmaVerificada } from '../../common/sesion/asistente';
import { buildQrEntradaFija, verifyQrEntrada } from '../acceso/entrada';
import { runIdempotente } from '../acceso/idempotencia';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { getNombreCorto, type CheckInService, type MetodoCheckIn } from './check-in.service';

type Pedido = Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>;

/** La ficha corta de la puerta (PU2): lo justo para reconocer a la persona y marcarla. */
export interface FichaPuerta {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  /** Enmascarado para el registrador (HU-210 §3). */
  readonly email: string | null;
  readonly estado: string;
  readonly saldo: number;
  readonly dispositivo: {
    readonly modelo: string;
    readonly desde: string;
    readonly metodo: string;
  } | null;
  /** HU-304: cada celular que tuvo la entrada, con cuándo y por qué se anuló. */
  readonly historial: readonly {
    readonly modelo: string;
    readonly metodo: string;
    readonly desde: string;
    readonly anuladaAt: string;
    readonly motivo: string | null;
  }[];
  readonly checkIn: { readonly at: string; readonly por: string | null } | null;
  /** HU-325. */
  readonly grupos: readonly string[];
  /** HU-321: el carnet enmascarado. */
  readonly carnet: null;
}

/** La vista Puerta (HU-301 §2): resumen, escanear *Mi entrada*, la ficha y marcar presente. */
export class PuertaService {
  constructor(
    private readonly db: Db,
    private readonly checkIn: CheckInService,
    private readonly reloj: Reloj,
  ) {}

  getResumen(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const porEstado = await tx
        .select({ estado: asistentes.estado, total: count() })
        .from(asistentes)
        .where(eq(asistentes.eventoId, contexto.eventoId))
        .groupBy(asistentes.estado);
      const de = (estado: string) => porEstado.find((f) => f.estado === estado)?.total ?? 0;
      const total = porEstado.reduce((suma, f) => suma + f.total, 0) - de('cancelado');
      const [avisos] = await tx
        .select({ total: count() })
        .from(alertas)
        .where(
          and(
            eq(alertas.eventoId, contexto.eventoId),
            eq(alertas.tipo, 'no_fui_yo'),
            eq(alertas.estado, 'abierta'),
          ),
        );
      return {
        presentes: de('presente'),
        total,
        registrosRestantes: await this.getRegistrosRestantes(tx, contexto),
        avisosNoFuiYo: avisos?.total ?? 0,
      };
    });
  }

  /** Escanear *Mi entrada* (`PXE1`): la ficha, o `QR_ASISTENTE_VENCIDO` si es una captura vieja. */
  scanEntrada(contexto: ContextoEvento, qr: string): Promise<FichaPuerta> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [evento] = await tx
        .select({ llave: eventos.llaveEntradas })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId));
      if (!evento) throw new AppError('NO_ENCONTRADO');
      const resultado = verifyQrEntrada(evento.llave, qr, this.reloj.now().getTime());
      if (!resultado.valido) {
        if (resultado.motivo === 'vencido') {
          throw new AppError('QR_ASISTENTE_VENCIDO', {
            detail: 'Pídele que abra Mi entrada de nuevo.',
          });
        }
        throw new AppError('QR_INVALIDO', {
          detail: 'Este QR no es la entrada de este evento.',
        });
      }
      return this.buildFicha(tx, contexto, resultado.asistenteId);
    });
  }

  /**
   * La tarjeta impresa (HU-302 §4, D31) para quien no tiene celular: nombre, código y el QR fijo
   * de *Mi entrada*. Sirve para el check-in; no para vincular.
   */
  getTarjeta(contexto: ContextoEvento, asistenteId: string) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [fila] = await tx
        .select({
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
          evento: eventos.nombre,
          llave: eventos.llaveEntradas,
        })
        .from(asistentes)
        .innerJoin(eventos, eq(eventos.id, asistentes.eventoId))
        .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)));
      if (!fila) throw new AppError('NO_ENCONTRADO');
      return {
        nombre: fila.nombre,
        codigo: fila.codigo,
        evento: fila.evento,
        qr: buildQrEntradaFija(fila.llave, asistenteId),
      };
    });
  }

  getFicha(contexto: ContextoEvento, asistenteId: string): Promise<FichaPuerta> {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      this.buildFicha(tx, contexto, asistenteId),
    );
  }

  /** Marcar presente, con `Idempotency-Key`: un doble toque no da dos bienvenidas. */
  register(
    contexto: ContextoEvento,
    asistenteId: string,
    metodo: Extract<MetodoCheckIn, 'escaneo_entrada' | 'busqueda'>,
    pedido: Pedido,
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(tx, `usuario:${contexto.usuarioId}`, pedido, async () => {
        await this.checkIn.register(tx, {
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          asistenteId,
          metodo,
          registradorId: contexto.usuarioId,
          actor: toActor(contexto),
        });
        return this.buildFicha(tx, contexto, asistenteId);
      }),
    );
  }

  undo(contexto: ContextoEvento, asistenteId: string, motivo: string, pedido: Pedido) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(
        tx,
        `usuario:${contexto.usuarioId}`,
        pedido,
        async () => {
          await this.checkIn.undo(tx, {
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            asistenteId,
            motivo,
            autorId: contexto.usuarioId,
            actor: toActor(contexto),
            ahora: this.reloj.now(),
          });
          return this.buildFicha(tx, contexto, asistenteId);
        },
        200,
      ),
    );
  }

  /**
   * Cuántos registros en la puerta le quedan (HU-212): el menor entre el tope del evento y el de
   * este registrador. `null` si no hay tope.
   */
  private async getRegistrosRestantes(tx: Tx, contexto: ContextoEvento): Promise<number | null> {
    const [evento] = await tx
      .select({ tope: eventos.topeRegistrosPuerta })
      .from(eventos)
      .where(eq(eventos.id, contexto.eventoId));
    const [miembro] = contexto.miembroId
      ? await tx
          .select({ tope: miembrosEvento.topeRegistrosPuerta })
          .from(miembrosEvento)
          .where(eq(miembrosEvento.id, contexto.miembroId))
      : [];
    const restantes: number[] = [];
    if (evento?.tope != null) {
      const [usados] = await tx
        .select({ total: count() })
        .from(asistentes)
        .where(and(eq(asistentes.eventoId, contexto.eventoId), eq(asistentes.origen, 'puerta')));
      restantes.push(evento.tope - (usados?.total ?? 0));
    }
    if (miembro?.tope != null) {
      const [mios] = await tx
        .select({ total: count() })
        .from(asistentes)
        .where(
          and(
            eq(asistentes.eventoId, contexto.eventoId),
            eq(asistentes.origen, 'puerta'),
            eq(asistentes.registradoPor, contexto.usuarioId),
          ),
        );
      restantes.push(miembro.tope - (mios?.total ?? 0));
    }
    return restantes.length > 0 ? Math.max(0, Math.min(...restantes)) : null;
  }

  private async buildFicha(
    tx: Tx,
    contexto: ContextoEvento,
    asistenteId: string,
  ): Promise<FichaPuerta> {
    const [fila] = await tx
      .select({
        id: asistentes.id,
        codigo: asistentes.codigoAsistente,
        nombre: asistentes.nombre,
        email: asistentes.email,
        estado: asistentes.estado,
        saldo: saldos.puntos,
      })
      .from(asistentes)
      .leftJoin(saldos, eq(saldos.asistenteId, asistentes.id))
      .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)));
    if (!fila) throw new AppError('NO_ENCONTRADO');
    // Solo el modelo: nunca la IP ni la huella (Acceso §6.3).
    const vinculos = await tx
      .select({
        modelo: dispositivos.modelo,
        desde: vinculaciones.createdAt,
        metodo: vinculaciones.metodo,
        anuladaAt: vinculaciones.anuladaAt,
        motivo: vinculaciones.motivoAnulacion,
      })
      .from(vinculaciones)
      .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
      .where(eq(vinculaciones.asistenteId, asistenteId))
      .orderBy(desc(vinculaciones.createdAt))
      .limit(20);
    const dispositivo = vinculos.find((v) => v.anuladaAt === null);
    const activo = await this.checkIn.findActivo(tx, asistenteId);
    return {
      id: fila.id,
      codigo: fila.codigo,
      nombre: fila.nombre,
      email: contexto.rol === 'registrador' ? maskEmail(fila.email) : fila.email,
      estado: fila.estado,
      saldo: fila.saldo ?? 0,
      dispositivo: dispositivo
        ? {
            modelo: dispositivo.modelo,
            desde: dispositivo.desde.toISOString(),
            metodo: dispositivo.metodo,
          }
        : null,
      historial: vinculos.flatMap((v) =>
        v.anuladaAt
          ? [
              {
                modelo: v.modelo,
                metodo: v.metodo,
                desde: v.desde.toISOString(),
                anuladaAt: v.anuladaAt.toISOString(),
                motivo: describeMotivoAnulacion(v.motivo),
              },
            ]
          : [],
      ),
      checkIn: activo ? { at: activo.at.toISOString(), por: getNombreCorto(activo.por) } : null,
      grupos: [],
      carnet: null,
    };
  }
}
