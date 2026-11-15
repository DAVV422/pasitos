import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { CorreosService } from '@pasitos/correos';
import {
  eventos,
  miembroTerminales,
  miembrosEvento,
  mesas,
  miembrosOrganizacion,
  pantallas,
  sessions,
  tokens,
  usuarios,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, canManageRol, NOMBRES_ROL, type RolEvento } from '@pasitos/dominio';
import { QUE_HACE_POR_ROL } from '@pasitos/dominio/correos';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { RolesCache } from '../../common/permisos/roles.repository';
import { formatFechaHora } from '../auth/auth.service';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { InvitacionesService, TipoInvitacion } from '../invitaciones/invitaciones.service';

type RolInvitable = Exclude<RolEvento, 'dueno'>;

export interface DatosInvitar {
  readonly email: string;
  readonly nombre?: string | undefined;
  readonly rol: RolInvitable;
  readonly terminales?:
    | {
        readonly pantallas?: readonly string[] | undefined;
        readonly mesas?: readonly string[] | undefined;
      }
    | undefined;
  readonly topeRegistrosPuerta?: number | null | undefined;
}

export interface DatosEditarMiembro {
  readonly rol?: RolInvitable | undefined;
  readonly terminales?:
    | {
        readonly pantallas?: readonly string[] | undefined;
        readonly mesas?: readonly string[] | undefined;
      }
    | undefined;
  readonly topeRegistrosPuerta?: number | null | undefined;
}

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

/**
 * El equipo del evento (HU-203): invitar con rol y alcance, reenviar, cambiar, quitar. Las
 * reglas que no entran en la matriz (¹) van aquí. Cada cambio deja bitácora en la misma
 * transacción y borra el caché de rol (vale desde la request siguiente).
 */
export class EquipoService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly correos: CorreosService,
    private readonly invitaciones: InvitacionesService,
    private readonly roles: RolesCache,
    private readonly reloj: Reloj,
    private readonly publicUrl: string,
  ) {}

  async list(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await this.markVencidos(tx, contexto.eventoId);
      const filas = await tx
        .select({
          id: miembrosEvento.id,
          email: miembrosEvento.emailInvitado,
          rol: miembrosEvento.rol,
          estado: miembrosEvento.estado,
          topeRegistrosPuerta: miembrosEvento.topeRegistrosPuerta,
          aceptadoAt: miembrosEvento.aceptadoAt,
          createdAt: miembrosEvento.createdAt,
          nombre: usuarios.nombre,
          invitadoPor: sql<
            string | null
          >`(select u2.nombre from usuarios u2 where u2.id = ${miembrosEvento.invitadoPor})`,
        })
        .from(miembrosEvento)
        .leftJoin(usuarios, eq(usuarios.id, miembrosEvento.usuarioId))
        .where(
          and(
            eq(miembrosEvento.eventoId, contexto.eventoId),
            ne(miembrosEvento.estado, 'revocado'),
          ),
        )
        .orderBy(asc(miembrosEvento.createdAt));
      const terminales = await tx
        .select({
          miembroId: miembroTerminales.miembroEventoId,
          pantallaId: miembroTerminales.pantallaId,
          mesaId: miembroTerminales.mesaId,
        })
        .from(miembroTerminales)
        .where(
          inArray(
            miembroTerminales.miembroEventoId,
            filas.length > 0 ? filas.map((f) => f.id) : [uuidv7()],
          ),
        );
      return filas.map((fila) => ({
        ...fila,
        terminales: {
          pantallas: terminales
            .filter((t) => t.miembroId === fila.id && t.pantallaId)
            .map((t) => t.pantallaId as string),
          mesas: terminales
            .filter((t) => t.miembroId === fila.id && t.mesaId)
            .map((t) => t.mesaId as string),
        },
      }));
    });
  }

  async invite(contexto: ContextoEvento, datos: DatosInvitar): Promise<{ id: string }> {
    if (!canManageRol(contexto.rol, datos.rol)) {
      throw new AppError('ROL_NO_PERMITIDO');
    }
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      await this.markVencidos(tx, contexto.eventoId);
      const [existente] = await tx
        .select({ id: miembrosEvento.id, estado: miembrosEvento.estado })
        .from(miembrosEvento)
        .where(
          and(
            eq(miembrosEvento.eventoId, contexto.eventoId),
            eq(miembrosEvento.emailInvitado, datos.email),
            ne(miembrosEvento.estado, 'revocado'),
          ),
        )
        .for('update');
      if (existente && existente.estado !== 'vencido') {
        throw errorCampo('email', 'Esta persona ya está en el equipo.');
      }
      if (existente) {
        await tx
          .update(miembrosEvento)
          .set({ estado: 'revocado', revocadoAt: this.reloj.now() })
          .where(eq(miembrosEvento.id, existente.id));
      }
      if (await this.isDuenaDeLaOrganizacion(tx, datos.email)) {
        throw errorCampo('email', 'Esa persona es la dueña de la organización: ya tiene acceso.');
      }
      const id = uuidv7();
      await tx.insert(miembrosEvento).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        emailInvitado: datos.email,
        rol: datos.rol,
        estado: 'invitado',
        invitadoPor: contexto.usuarioId,
        topeRegistrosPuerta:
          datos.rol === 'registrador' ? (datos.topeRegistrosPuerta ?? null) : null,
      });
      await this.setTerminales(tx, contexto, id, datos.rol, datos.terminales);
      await this.sendInvitacion(tx, contexto, evento, id, datos.email, datos.rol, datos.nombre);
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'miembro.invite',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'miembro', id, nombre: datos.nombre ?? NOMBRES_ROL[datos.rol] },
        despues: { rol: datos.rol },
      });
      return { id };
    });
  }

  /** Token nuevo de 7 días; el anterior se revoca. Solo `invitado` o `vencido`. */
  async resend(contexto: ContextoEvento, miembroId: string): Promise<void> {
    await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const miembro = await this.getMiembro(tx, contexto, miembroId);
      if (!canManageRol(contexto.rol, miembro.rol as RolEvento)) {
        throw new AppError('ROL_NO_PERMITIDO');
      }
      if (miembro.estado !== 'invitado' && miembro.estado !== 'vencido') {
        throw errorCampo('estado', 'Solo se reenvía una invitación que no se aceptó.');
      }
      const evento = await this.getEvento(tx, contexto.eventoId);
      await tx
        .update(miembrosEvento)
        .set({ estado: 'invitado', updatedAt: this.reloj.now() })
        .where(eq(miembrosEvento.id, miembroId));
      await this.sendInvitacion(
        tx,
        contexto,
        evento,
        miembroId,
        miembro.emailInvitado,
        miembro.rol as RolInvitable,
      );
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'miembro.resend',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: {
          tipo: 'miembro',
          id: miembroId,
          nombre: miembro.nombre ?? NOMBRES_ROL[miembro.rol as RolEvento],
        },
      });
    });
  }

  async update(
    contexto: ContextoEvento,
    miembroId: string,
    datos: DatosEditarMiembro,
  ): Promise<void> {
    const usuarioId = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const miembro = await this.getMiembro(tx, contexto, miembroId);
      const rolActual = miembro.rol as RolInvitable;
      const rolNuevo = datos.rol ?? rolActual;
      if (!canManageRol(contexto.rol, rolActual) || !canManageRol(contexto.rol, rolNuevo)) {
        throw new AppError('ROL_NO_PERMITIDO');
      }
      if (miembro.estado === 'revocado') {
        throw new AppError('NO_ENCONTRADO');
      }
      const tope =
        rolNuevo === 'registrador'
          ? datos.topeRegistrosPuerta === undefined
            ? miembro.topeRegistrosPuerta
            : datos.topeRegistrosPuerta
          : null;
      await tx
        .update(miembrosEvento)
        .set({ rol: rolNuevo, topeRegistrosPuerta: tope, updatedAt: this.reloj.now() })
        .where(eq(miembrosEvento.id, miembroId));
      if (datos.terminales !== undefined || rolNuevo !== rolActual) {
        await tx.delete(miembroTerminales).where(eq(miembroTerminales.miembroEventoId, miembroId));
        await this.setTerminales(tx, contexto, miembroId, rolNuevo, datos.terminales);
      }
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'miembro.update',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: {
          tipo: 'miembro',
          id: miembroId,
          nombre: miembro.nombre ?? NOMBRES_ROL[rolActual],
        },
        antes: { rol: rolActual, topeRegistrosPuerta: miembro.topeRegistrosPuerta },
        despues: {
          rol: rolNuevo,
          topeRegistrosPuerta: tope,
          ...(datos.terminales ? { terminales: datos.terminales } : {}),
        },
      });
      return miembro.usuarioId;
    });
    if (usuarioId) {
      this.roles.invalidate(usuarioId, contexto.eventoId);
    }
  }

  /** Lo quita: revoca su invitación o, si aceptó, **todas sus sesiones** (HU-203 §2). */
  async remove(contexto: ContextoEvento, miembroId: string): Promise<void> {
    const usuarioId = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const miembro = await this.getMiembro(tx, contexto, miembroId);
      if (!canManageRol(contexto.rol, miembro.rol as RolEvento)) {
        throw new AppError('ROL_NO_PERMITIDO');
      }
      if (miembro.estado === 'revocado') {
        return null;
      }
      const ahora = this.reloj.now();
      await tx
        .update(miembrosEvento)
        .set({ estado: 'revocado', revocadoAt: ahora, updatedAt: ahora })
        .where(eq(miembrosEvento.id, miembroId));
      await this.invitaciones.revokeToken(tx, 'invitacion_equipo', miembroId);
      if (miembro.usuarioId) {
        await tx
          .update(sessions)
          .set({ revocadaAt: ahora })
          .where(and(eq(sessions.usuarioId, miembro.usuarioId), isNull(sessions.revocadaAt)));
      }
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'miembro.remove',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: {
          tipo: 'miembro',
          id: miembroId,
          nombre: miembro.nombre ?? NOMBRES_ROL[miembro.rol as RolEvento],
        },
        antes: { rol: miembro.rol, estado: miembro.estado },
      });
      return miembro.usuarioId;
    });
    if (usuarioId) {
      this.roles.invalidate(usuarioId);
    }
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  private async getEvento(tx: Tx, eventoId: string) {
    const [evento] = await tx
      .select({ id: eventos.id, nombre: eventos.nombre, inicioAt: eventos.inicioAt })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    if (!evento) {
      throw new AppError('NO_ENCONTRADO');
    }
    return evento;
  }

  private async getMiembro(tx: Tx, contexto: ContextoEvento, miembroId: string) {
    const [miembro] = await tx
      .select({
        id: miembrosEvento.id,
        rol: miembrosEvento.rol,
        estado: miembrosEvento.estado,
        usuarioId: miembrosEvento.usuarioId,
        emailInvitado: miembrosEvento.emailInvitado,
        topeRegistrosPuerta: miembrosEvento.topeRegistrosPuerta,
        nombre: usuarios.nombre,
      })
      .from(miembrosEvento)
      .leftJoin(usuarios, eq(usuarios.id, miembrosEvento.usuarioId))
      .where(and(eq(miembrosEvento.id, miembroId), eq(miembrosEvento.eventoId, contexto.eventoId)))
      .for('update', { of: miembrosEvento });
    if (!miembro) {
      throw new AppError('NO_ENCONTRADO');
    }
    return miembro;
  }

  private async isDuenaDeLaOrganizacion(tx: Tx, email: string): Promise<boolean> {
    const [fila] = await tx
      .select({ id: miembrosOrganizacion.id })
      .from(miembrosOrganizacion)
      .innerJoin(usuarios, eq(usuarios.id, miembrosOrganizacion.usuarioId))
      .where(and(eq(usuarios.email, email), eq(miembrosOrganizacion.estado, 'activo')));
    return fila !== undefined;
  }

  /** `terminales` solo para operadores (²); las pantallas tienen que ser de este evento. */
  private async setTerminales(
    tx: Tx,
    contexto: ContextoEvento,
    miembroId: string,
    rol: RolInvitable,
    terminales: DatosInvitar['terminales'],
  ): Promise<void> {
    const deStand = rol === 'operador_stand' ? [...new Set(terminales?.pantallas ?? [])] : [];
    const deMesa = rol === 'operador_mesa' ? [...new Set(terminales?.mesas ?? [])] : [];
    if (deStand.length > 0) {
      const delEvento = await tx
        .select({ id: pantallas.id })
        .from(pantallas)
        .where(and(eq(pantallas.eventoId, contexto.eventoId), inArray(pantallas.id, deStand)));
      if (delEvento.length !== deStand.length) {
        throw new AppError('NO_ENCONTRADO');
      }
    }
    if (deMesa.length > 0) {
      const delEvento = await tx
        .select({ id: mesas.id })
        .from(mesas)
        .where(and(eq(mesas.eventoId, contexto.eventoId), inArray(mesas.id, deMesa)));
      if (delEvento.length !== deMesa.length) {
        throw new AppError('NO_ENCONTRADO');
      }
    }
    const filas = [
      ...deStand.map((pantallaId) => ({ pantallaId, mesaId: null })),
      ...deMesa.map((mesaId) => ({ pantallaId: null, mesaId })),
    ];
    if (filas.length === 0) {
      return;
    }
    await tx.insert(miembroTerminales).values(
      filas.map((fila) => ({
        id: uuidv7(),
        organizacionId: contexto.organizacionId,
        miembroEventoId: miembroId,
        ...fila,
      })),
    );
  }

  private async sendInvitacion(
    tx: Tx,
    contexto: ContextoEvento,
    evento: { nombre: string; inicioAt: Date },
    miembroId: string,
    email: string,
    rol: RolInvitable,
    nombre?: string,
  ): Promise<void> {
    const token = await this.invitaciones.createToken(tx, 'invitacion_equipo', miembroId);
    await this.correos.enqueue(tx, {
      tipo: 'invitacion_equipo',
      destinatario: email,
      datos: {
        ...(nombre ? { nombre } : {}),
        quienInvita: contexto.usuarioNombre,
        rol: NOMBRES_ROL[rol].toLowerCase(),
        evento: evento.nombre,
        fecha: formatFechaHora(evento.inicioAt).fecha,
        queHace: QUE_HACE_POR_ROL[rol],
        enlace: `${this.publicUrl}/admin/invitacion/${token}`,
      },
      refId: miembroId,
    });
  }

  /** Una invitación cuyo token venció se muestra y guarda como `vencido` (HU-203 §2). */
  private async markVencidos(tx: Tx, eventoId: string): Promise<void> {
    await tx.execute(sql`
      update miembros_evento m set estado = 'vencido', updated_at = now()
       where m.evento_id = ${eventoId} and m.estado = 'invitado'
         and not exists (
           select 1 from ${tokens} t
            where t.proposito = 'invitacion_equipo' and t.ref_id = m.id
              and t.usado_at is null and t.revocado_at is null and t.expira_at > ${this.reloj.now()})`);
  }
}

/** Invitación al equipo de un evento (HU-203 §3). `refId` = la fila de `miembros_evento`. */
export function createTipoEquipo(roles: RolesCache): TipoInvitacion {
  const bitacora = new BitacoraService();
  return {
    proposito: 'invitacion_equipo',
    async describe(tx, refId) {
      const [fila] = await tx
        .select({
          email: miembrosEvento.emailInvitado,
          rol: miembrosEvento.rol,
          estado: miembrosEvento.estado,
          evento: eventos.nombre,
          inicioAt: eventos.inicioAt,
          finAt: eventos.finAt,
          quienInvita: usuarios.nombre,
          organizacion: sql<string>`(select o.nombre from organizaciones o where o.id = ${miembrosEvento.organizacionId})`,
        })
        .from(miembrosEvento)
        .innerJoin(eventos, eq(eventos.id, miembrosEvento.eventoId))
        .leftJoin(usuarios, eq(usuarios.id, miembrosEvento.invitadoPor))
        .where(eq(miembrosEvento.id, refId));
      if (!fila || fila.estado !== 'invitado') {
        return null;
      }
      return {
        tipo: 'equipo',
        email: fila.email,
        rol: fila.rol,
        quienInvita: fila.quienInvita,
        organizacion: fila.organizacion,
        evento: { nombre: fila.evento, inicioAt: fila.inicioAt, finAt: fila.finAt },
        app: 'admin',
      };
    },
    async accept(tx, refId, usuario, ahora) {
      const [miembro] = await tx
        .update(miembrosEvento)
        .set({ usuarioId: usuario.id, estado: 'activo', aceptadoAt: ahora, updatedAt: ahora })
        .where(eq(miembrosEvento.id, refId))
        .returning({
          eventoId: miembrosEvento.eventoId,
          organizacionId: miembrosEvento.organizacionId,
          rol: miembrosEvento.rol,
        });
      if (!miembro) {
        throw new AppError('ENLACE_VENCIDO');
      }
      await bitacora.record(tx, {
        actor: { tipo: 'usuario', id: usuario.id, nombre: usuario.nombre, rol: miembro.rol },
        accion: 'miembro.accept',
        organizacionId: miembro.organizacionId,
        eventoId: miembro.eventoId,
        objeto: { tipo: 'miembro', id: refId, nombre: usuario.nombre },
      });
      roles.invalidate(usuario.id, miembro.eventoId);
    },
  };
}
