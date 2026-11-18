import { and, count, eq, ne, or, sql } from 'drizzle-orm';
import {
  asistentes,
  eventos,
  miembrosEvento,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { maskEmail, SIMILITUD_DUPLICADO } from '@pasitos/dominio/esquemas';
import type { CorreosService } from '@pasitos/correos';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import { formatFechaHora } from '../auth/auth.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { normalizado } from '../invitados/asistentes.service';
import type { CheckInService } from './check-in.service';
import type { FichaPuerta } from './puerta.service';

type Pedido = Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>;

export interface DatosRegistroPuerta {
  readonly nombre: string;
  readonly email?: string | undefined;
  readonly confirmarDuplicado?: boolean | undefined;
}

/** Lo que dice la puerta al llegar al tope del registrador. */
const TEXTO_TOPE_REGISTRADOR =
  'Llegaste al tope de registros en la puerta. Pide a un coorganizador que lo amplíe.';

/**
 * Registrar en la puerta a alguien que no estaba en la lista (HU-303 §1): los topes, el aviso de
 * parecidos, el asistente nuevo, su check-in y el aviso *Te registraste* si dio su correo.
 */
export class RegistroPuertaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly checkIn: CheckInService,
    private readonly correos: CorreosService,
    private readonly buildFicha: (
      tx: Tx,
      contexto: ContextoEvento,
      asistenteId: string,
    ) => Promise<FichaPuerta>,
  ) {}

  register(contexto: ContextoEvento, datos: DatosRegistroPuerta, pedido: Pedido) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(tx, `usuario:${contexto.usuarioId}`, pedido, async () => {
        const evento = await this.lockTopes(tx, contexto);
        const email = datos.email ?? null;
        await this.checkParecidos(tx, contexto, datos.nombre, email, datos.confirmarDuplicado);

        const id = uuidv7();
        await tx.insert(asistentes).values({
          id,
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          nombre: datos.nombre,
          email,
          origen: 'puerta',
          estado: 'registrado',
          emailEstado: email ? 'en_cola' : 'sin_correo',
          registradoPor: contexto.usuarioId,
          createdBy: contexto.usuarioId,
        });
        const [creado] = await tx
          .select({ codigo: asistentes.codigoAsistente })
          .from(asistentes)
          .where(eq(asistentes.id, id));
        await this.checkIn.register(tx, {
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          asistenteId: id,
          metodo: 'registro_puerta',
          registradorId: contexto.usuarioId,
          actor: toActor(contexto),
        });
        if (email) {
          // V22: solo un aviso, con la prioridad de la puerta (D57).
          await this.correos.enqueue(tx, {
            tipo: 'registro_puerta',
            destinatario: email,
            refId: id,
            datos: {
              nombre: datos.nombre,
              evento: evento.nombre,
              fecha: formatFechaHora(evento.inicioAt).fecha,
              lugar: evento.lugarNombre ?? 'el lugar del evento',
              codigo: creado?.codigo ?? '',
            },
          });
        }
        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion: 'asistente.registrar_puerta',
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          objeto: { tipo: 'asistente', id, nombre: datos.nombre },
          despues: {
            nombre: datos.nombre,
            email: maskEmail(email),
            ...(datos.confirmarDuplicado ? { confirmoParecido: true } : {}),
          },
        });
        return this.buildFicha(tx, contexto, id);
      }),
    );
  }

  /**
   * El registro abierto y los topes, con la fila del evento y la del miembro bloqueadas: dos
   * registradores a la vez no se pasan del cupo.
   */
  private async lockTopes(tx: Tx, contexto: ContextoEvento) {
    const [evento] = await tx
      .select({
        nombre: eventos.nombre,
        inicioAt: eventos.inicioAt,
        lugarNombre: eventos.lugarNombre,
        activo: eventos.registroPuertaActivo,
        tope: eventos.topeRegistrosPuerta,
      })
      .from(eventos)
      .where(eq(eventos.id, contexto.eventoId))
      .for('update');
    if (!evento) throw new AppError('NO_ENCONTRADO');
    if (!evento.activo) throw new AppError('REGISTRO_PUERTA_CERRADO');
    const [miembro] = contexto.miembroId
      ? await tx
          .select({ tope: miembrosEvento.topeRegistrosPuerta })
          .from(miembrosEvento)
          .where(eq(miembrosEvento.id, contexto.miembroId))
          .for('update')
      : [];
    const enPuerta = and(
      eq(asistentes.eventoId, contexto.eventoId),
      eq(asistentes.origen, 'puerta'),
    );
    if (evento.tope !== null) {
      const [usados] = await tx.select({ total: count() }).from(asistentes).where(enPuerta);
      if ((usados?.total ?? 0) >= evento.tope) {
        throw new AppError('LIMITE_REGISTRO_ALCANZADO', { meta: { cual: 'evento' } });
      }
    }
    if (miembro?.tope != null) {
      const [mios] = await tx
        .select({ total: count() })
        .from(asistentes)
        .where(and(enPuerta, eq(asistentes.registradoPor, contexto.usuarioId)));
      if ((mios?.total ?? 0) >= miembro.tope) {
        throw new AppError('LIMITE_REGISTRO_ALCANZADO', {
          detail: TEXTO_TOPE_REGISTRADOR,
          meta: { cual: 'registrador' },
        });
      }
    }
    return evento;
  }

  /**
   * Los parecidos (la búsqueda de HU-210): nombre parecido o el mismo correo. Con el mismo correo
   * no se registra aunque confirme: es la misma persona.
   */
  private async checkParecidos(
    tx: Tx,
    contexto: ContextoEvento,
    nombre: string,
    email: string | null,
    confirmado: boolean | undefined,
  ): Promise<void> {
    const similitud = sql<number>`similarity(${normalizado(sql`${asistentes.nombre}`)}, ${normalizado(nombre)})`;
    const candidatos = await tx
      .select({
        id: asistentes.id,
        codigo: asistentes.codigoAsistente,
        nombre: asistentes.nombre,
        email: asistentes.email,
        estado: asistentes.estado,
      })
      .from(asistentes)
      .where(
        and(
          eq(asistentes.eventoId, contexto.eventoId),
          ne(asistentes.estado, 'cancelado'),
          or(
            sql`${similitud} >= ${SIMILITUD_DUPLICADO}`,
            email ? sql`${asistentes.email} = ${email}` : undefined,
          ),
        ),
      )
      .orderBy(sql`${similitud} desc`)
      .limit(5);
    const mismoCorreo = email ? candidatos.find((c) => c.email === email) : undefined;
    if (mismoCorreo) {
      throw new AppError('ASISTENTE_YA_REGISTRADO', {
        detail: `Ya está en la lista como ${mismoCorreo.codigo}.`,
        meta: { candidatos: [this.toCandidato(mismoCorreo)] },
      });
    }
    if (candidatos.length > 0 && !confirmado) {
      throw new AppError('ASISTENTE_POSIBLE_DUPLICADO', {
        meta: { candidatos: candidatos.map((c) => this.toCandidato(c)) },
      });
    }
  }

  private toCandidato(c: {
    id: string;
    codigo: string;
    nombre: string;
    email: string | null;
    estado: string;
  }) {
    return {
      id: c.id,
      codigo: c.codigo,
      nombre: c.nombre,
      email: maskEmail(c.email),
      presente: c.estado === 'presente',
    };
  }
}
