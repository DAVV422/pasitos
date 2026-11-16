import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import type { CorreosService } from '@pasitos/correos';
import {
  asistentes,
  enviosCorreo,
  eventos,
  invitaciones,
  organizaciones,
  withOrganizacion,
  type Cifrador,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { buildCsv } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { createTokenAleatorio, hashToken } from '../auth/auth.repository';
import { formatFechaHora } from '../auth/auth.service';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';

type Asistente = typeof asistentes.$inferSelect;
type Invitacion = typeof invitaciones.$inferSelect;

export interface Enlace {
  readonly codigo: string;
  readonly nombre: string;
  readonly enlace: string;
}

/** Ruta del enlace de invitación (la abre la app del asistente en la fase 3). */
const RUTA_ENLACE = '/app/acceso/invitacion';

/**
 * Revoca la invitación vigente sin usar de un asistente y cancela su correo si sigue en cola
 * (HU-211 §3; HU-210 al cambiar el correo o quitarlo de la lista). Una usada no se toca.
 */
export async function revokeInvitacion(tx: Tx, asistenteId: string, ahora: Date) {
  const [vigente] = await tx
    .select()
    .from(invitaciones)
    .where(and(eq(invitaciones.asistenteId, asistenteId), ne(invitaciones.estado, 'revocada')))
    .for('update');
  if (!vigente || vigente.estado === 'usada') {
    return vigente ?? null;
  }
  await tx
    .update(invitaciones)
    .set({ estado: 'revocada', revocadaAt: ahora, updatedAt: ahora })
    .where(eq(invitaciones.id, vigente.id));
  if (vigente.envioCorreoId) {
    await tx
      .update(enviosCorreo)
      .set({ estado: 'cancelado', updatedAt: ahora })
      .where(and(eq(enviosCorreo.id, vigente.envioCorreoId), eq(enviosCorreo.estado, 'en_cola')));
  }
  return null;
}

/** Para la lista de invitados: la invitación vigente de cada uno y, si está en cola, cuándo sale. */
export async function listEstadosInvitacion(tx: Tx, asistenteIds: readonly string[]) {
  const porAsistente = new Map<string, { estado: string; saleEl: string | null }>();
  if (asistenteIds.length === 0) return porAsistente;
  const filas = await tx
    .select({
      asistenteId: invitaciones.asistenteId,
      estado: invitaciones.estado,
      envioEstado: enviosCorreo.estado,
      programadoPara: enviosCorreo.programadoPara,
    })
    .from(invitaciones)
    .leftJoin(enviosCorreo, eq(enviosCorreo.id, invitaciones.envioCorreoId))
    .where(
      and(
        inArray(invitaciones.asistenteId, [...asistenteIds]),
        ne(invitaciones.estado, 'revocada'),
      ),
    );
  for (const f of filas) {
    porAsistente.set(f.asistenteId, {
      estado: f.estado,
      saleEl: f.envioEstado === 'en_cola' ? (f.programadoPara?.toISOString() ?? null) : null,
    });
  }
  return porAsistente;
}

/**
 * Invitaciones por correo (HU-211): enviar por la cola con tope (D57), reenviar y los enlaces
 * para WhatsApp o imprimir. El token se guarda solo como hash y cifrado (ajuste 6).
 */
export class InvitacionesAsistentesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly correos: CorreosService,
    private readonly cifrador: Cifrador,
    private readonly reloj: Reloj,
    private readonly publicUrl: string,
  ) {}

  /** Lo que muestra el panel antes de enviar. */
  async estimate(contexto: ContextoEvento) {
    const pendientes = await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      this.listPendientes(tx, contexto, undefined).then((p) => p.length),
    );
    const { dias, ultimoDia } = await this.correos.estimateEntrega(Math.max(pendientes, 1), 4);
    return { pendientes, diasEstimados: dias, saleUltimaEl: ultimoDia.toISOString() };
  }

  async send(contexto: ContextoEvento, asistenteIds: readonly string[] | undefined) {
    const encoladas = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto);
      const pendientes = await this.listPendientes(tx, contexto, asistenteIds);
      const ahora = this.reloj.now();
      for (const asistente of pendientes) {
        const [creada] = await tx
          .select()
          .from(invitaciones)
          .where(
            and(eq(invitaciones.asistenteId, asistente.id), eq(invitaciones.estado, 'creada')),
          );
        const invitacion = creada ?? (await this.createInvitacion(tx, contexto, asistente.id)).fila;
        await this.enqueue(tx, evento, asistente, invitacion, ahora);
      }
      if (pendientes.length > 0) {
        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion: 'invitaciones.send',
          organizacionId: contexto.organizacionId,
          eventoId: contexto.eventoId,
          despues: { cantidad: pendientes.length },
        });
      }
      return pendientes.length;
    });
    const { dias, ultimoDia } = await this.correos.estimateEntrega(Math.max(encoladas, 1), 4);
    return { encoladas, diasEstimados: dias, saleUltimaEl: ultimoDia.toISOString() };
  }

  /** El enlace anterior deja de servir al instante. Una usada no se reenvía. */
  async resend(contexto: ContextoEvento, asistenteId: string) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [asistente] = await tx
        .select()
        .from(asistentes)
        .where(eq(asistentes.id, asistenteId))
        .for('update');
      if (asistente?.eventoId !== contexto.eventoId) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (!asistente.email) {
        throw new AppError('VALIDACION', {
          errors: [{ field: 'email', code: 'REQUERIDO', message: 'Agrega su correo primero.' }],
        });
      }
      const ahora = this.reloj.now();
      if (await revokeInvitacion(tx, asistente.id, ahora)) {
        throw new AppError('INVITACION_YA_USADA');
      }
      const evento = await this.getEvento(tx, contexto);
      const { fila } = await this.createInvitacion(tx, contexto, asistente.id);
      const saleEl = await this.enqueue(tx, evento, asistente, fila, ahora);
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'invitacion.resend',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: {
          tipo: 'asistente',
          id: asistente.id,
          nombre: `${asistente.codigoAsistente} · ${asistente.nombre}`,
        },
      });
      return { estado: 'en_cola', saleEl: saleEl.toISOString() };
    });
  }

  /**
   * Los enlaces de cada uno (para WhatsApp o imprimir): el mismo que se mandó por correo, descifrado.
   * Quien no tiene invitación recibe una nueva (sin correo). Las usadas no se listan. Verlos queda
   * en la bitácora: dan acceso.
   */
  async listEnlaces(
    contexto: ContextoEvento,
    asistenteIds: readonly string[] | undefined,
  ): Promise<Enlace[]> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const lista = await tx
        .select()
        .from(asistentes)
        .where(
          and(
            eq(asistentes.eventoId, contexto.eventoId),
            ne(asistentes.estado, 'cancelado'),
            asistenteIds && asistenteIds.length > 0
              ? inArray(asistentes.id, [...asistenteIds])
              : undefined,
          ),
        )
        .orderBy(sql`length(${asistentes.codigoAsistente})`, asc(asistentes.codigoAsistente));
      const vigentes = await this.listVigentes(
        tx,
        lista.map((a) => a.id),
      );
      const enlaces: Enlace[] = [];
      for (const asistente of lista) {
        const vigente = vigentes.get(asistente.id);
        if (vigente?.estado === 'usada') continue;
        const token = vigente
          ? this.cifrador.decryptTexto(Buffer.from(vigente.tokenCifrado))
          : (await this.createInvitacion(tx, contexto, asistente.id)).token;
        enlaces.push({
          codigo: asistente.codigoAsistente,
          nombre: asistente.nombre,
          enlace: `${this.publicUrl}${RUTA_ENLACE}/${token}`,
        });
      }
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'invitaciones.enlaces.view',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        despues: { cantidad: enlaces.length },
      });
      return enlaces;
    });
  }

  toCsv(enlaces: readonly Enlace[]): string {
    return buildCsv(
      ['Código', 'Nombre', 'Enlace'],
      enlaces.map((e) => [e.codigo, e.nombre, e.enlace]),
    );
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  /** Con correo, invitados, sin invitación enviada ni usada, y con el correo pendiente. */
  private async listPendientes(
    tx: Tx,
    contexto: ContextoEvento,
    asistenteIds: readonly string[] | undefined,
  ): Promise<Asistente[]> {
    const conInvitacion = tx
      .select({ id: invitaciones.asistenteId })
      .from(invitaciones)
      .where(
        and(
          eq(invitaciones.eventoId, contexto.eventoId),
          inArray(invitaciones.estado, ['enviada', 'usada']),
        ),
      );
    return tx
      .select()
      .from(asistentes)
      .where(
        and(
          eq(asistentes.eventoId, contexto.eventoId),
          eq(asistentes.estado, 'invitado'),
          eq(asistentes.emailEstado, 'pendiente'),
          sql`${asistentes.email} is not null`,
          notInArray(asistentes.id, conInvitacion),
          asistenteIds && asistenteIds.length > 0
            ? inArray(asistentes.id, [...asistenteIds])
            : undefined,
        ),
      )
      .orderBy(sql`length(${asistentes.codigoAsistente})`, asc(asistentes.codigoAsistente));
  }

  private async listVigentes(tx: Tx, asistenteIds: readonly string[]) {
    const vigentes = new Map<string, Invitacion>();
    if (asistenteIds.length === 0) return vigentes;
    const filas = await tx
      .select()
      .from(invitaciones)
      .where(
        and(
          inArray(invitaciones.asistenteId, [...asistenteIds]),
          ne(invitaciones.estado, 'revocada'),
          isNull(invitaciones.revocadaAt),
        ),
      );
    for (const f of filas) vigentes.set(f.asistenteId, f);
    return vigentes;
  }

  private async createInvitacion(tx: Tx, contexto: ContextoEvento, asistenteId: string) {
    const { token, hash } = createTokenAleatorio();
    const id = uuidv7();
    await tx.insert(invitaciones).values({
      id,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      asistenteId,
      tokenHash: hash,
      tokenCifrado: this.cifrador.encrypt(token),
      createdBy: contexto.usuarioId,
    });
    const [fila] = await tx.select().from(invitaciones).where(eq(invitaciones.id, id));
    if (!fila || !hashToken(token).equals(fila.tokenHash)) {
      throw new AppError('ERROR_INTERNO');
    }
    return { fila, token };
  }

  /**
   * Encola el correo (prioridad 4). En la cola el enlace va **sin** el token: el trabajador lo
   * descifra de la invitación al enviarlo, así no queda en claro en `envios_correo`.
   */
  private async enqueue(
    tx: Tx,
    evento: Awaited<ReturnType<InvitacionesAsistentesService['getEvento']>>,
    asistente: Asistente,
    invitacion: Invitacion,
    ahora: Date,
  ): Promise<Date> {
    const envioId = await this.correos.enqueue(tx, {
      tipo: 'invitacion_evento',
      destinatario: asistente.email ?? '',
      refId: invitacion.id,
      datos: {
        nombre: asistente.nombre,
        evento: evento.nombre,
        fecha: formatFechaHora(evento.inicioAt).fecha,
        lugar: evento.lugar,
        nombrePuntos: evento.nombrePuntos,
        codigo: asistente.codigoAsistente,
        organizacion: evento.organizacion,
        enlace: `${this.publicUrl}${RUTA_ENLACE}`,
      },
    });
    await tx
      .update(invitaciones)
      .set({ envioCorreoId: envioId, updatedAt: ahora })
      .where(eq(invitaciones.id, invitacion.id));
    await tx
      .update(asistentes)
      .set({ emailEstado: 'en_cola', updatedAt: ahora })
      .where(eq(asistentes.id, asistente.id));
    const [envio] = await tx
      .select({ programadoPara: enviosCorreo.programadoPara })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.id, envioId));
    return envio?.programadoPara ?? ahora;
  }

  private async getEvento(tx: Tx, contexto: ContextoEvento) {
    const [fila] = await tx
      .select({
        nombre: eventos.nombre,
        inicioAt: eventos.inicioAt,
        lugarNombre: eventos.lugarNombre,
        nombrePuntos: eventos.nombrePuntos,
        organizacion: organizaciones.nombre,
      })
      .from(eventos)
      .innerJoin(organizaciones, eq(organizaciones.id, eventos.organizacionId))
      .where(eq(eventos.id, contexto.eventoId));
    if (!fila) {
      throw new AppError('NO_ENCONTRADO');
    }
    return { ...fila, lugar: fila.lugarNombre ?? 'el lugar que te avisaremos' };
  }
}
