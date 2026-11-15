import { and, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import type { CorreosService } from '@pasitos/correos';
import {
  eventos,
  miembrosOrganizacion,
  organizaciones,
  usuarios,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../auth/sesiones.service';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';
import type { InvitacionesService } from '../invitaciones/invitaciones.service';
import { findSlugLibre, toSlug } from './slug';

export interface FiltrosOrganizaciones {
  readonly q?: string | undefined;
  readonly estado?: 'activa' | 'suspendida' | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/**
 * Organizaciones desde la consola (HU-202 §2). Conexión de sistema: trabaja sobre todas. Cada
 * escritura deja su fila en la bitácora (`organizacion_id` nulo: es una acción de la consola).
 */
export class OrganizacionesPlataformaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly sistema: Db,
    private readonly correos: CorreosService,
    private readonly invitaciones: InvitacionesService,
    private readonly reloj: Reloj,
    private readonly publicUrl: string,
  ) {}

  async list(filtros: FiltrosOrganizaciones) {
    const condiciones: SQL[] = [];
    if (filtros.q) {
      const patron = `%${filtros.q.replace(/[\\%_]/g, '\\$&')}%`;
      condiciones.push(
        or(ilike(organizaciones.nombre, patron), ilike(organizaciones.slug, patron)) as SQL,
      );
    }
    if (filtros.estado) {
      condiciones.push(eq(organizaciones.estado, filtros.estado));
    }
    if (filtros.cursor) {
      condiciones.push(lt(organizaciones.id, filtros.cursor));
    }
    const filas = await this.sistema
      .select({
        id: organizaciones.id,
        nombre: organizaciones.nombre,
        slug: organizaciones.slug,
        estado: organizaciones.estado,
        esDemo: organizaciones.esDemo,
        createdAt: organizaciones.createdAt,
        eventos: sql<Record<string, number>>`coalesce((
          select jsonb_object_agg(e.estado, e.total) from (
            select estado, count(*)::int as total from eventos
             where organizacion_id = "organizaciones"."id" group by estado) e), '{}'::jsonb)`,
        dueno: sql<{ nombre: string | null; email: string | null; estado: string } | null>`(
          select jsonb_build_object('nombre', u.nombre, 'email', coalesce(u.email, m.email_invitado::text), 'estado', m.estado)
            from miembros_organizacion m left join usuarios u on u.id = m.usuario_id
           where m.organizacion_id = "organizaciones"."id" and m.estado in ('activo', 'invitado')
           order by (m.estado = 'activo') desc, m.created_at limit 1)`,
      })
      .from(organizaciones)
      .where(condiciones.length > 0 ? and(...condiciones) : undefined)
      .orderBy(desc(organizaciones.id))
      .limit(filtros.limit + 1);
    const pagina = filas.slice(0, filtros.limit);
    return {
      items: pagina,
      pagination: {
        nextCursor: filas.length > filtros.limit ? (pagina.at(-1)?.id ?? null) : null,
      },
    };
  }

  async get(id: string) {
    const [organizacion] = await this.sistema
      .select()
      .from(organizaciones)
      .where(eq(organizaciones.id, id));
    if (!organizacion) {
      throw new AppError('NO_ENCONTRADO');
    }
    const [duenos, lista] = await Promise.all([
      this.sistema
        .select({
          id: miembrosOrganizacion.id,
          estado: miembrosOrganizacion.estado,
          nombre: usuarios.nombre,
          email: sql<string>`coalesce(${usuarios.email}, ${miembrosOrganizacion.emailInvitado})`,
          aceptadoAt: miembrosOrganizacion.aceptadoAt,
        })
        .from(miembrosOrganizacion)
        .leftJoin(usuarios, eq(usuarios.id, miembrosOrganizacion.usuarioId))
        .where(eq(miembrosOrganizacion.organizacionId, id))
        .orderBy(desc(miembrosOrganizacion.createdAt)),
      this.sistema
        .select({
          id: eventos.id,
          nombre: eventos.nombre,
          tipo: eventos.tipo,
          estado: eventos.estado,
          inicioAt: eventos.inicioAt,
          finAt: eventos.finAt,
        })
        .from(eventos)
        .where(eq(eventos.organizacionId, id))
        .orderBy(desc(eventos.inicioAt)),
    ]);
    return { ...organizacion, duenos, eventos: lista };
  }

  async create(
    actor: ActorBitacora & { tipo: 'usuario' },
    datos: { nombre: string; slug?: string | undefined; duenoEmail: string; duenoNombre: string },
  ): Promise<{ id: string; slug: string }> {
    return this.sistema.transaction(async (tx) => {
      const slug = datos.slug
        ? await this.checkSlugLibre(tx, datos.slug)
        : await findSlugLibre(toSlug(datos.nombre), (s) => this.existsSlug(tx, s));
      const id = uuidv7();
      await tx.insert(organizaciones).values({ id, nombre: datos.nombre, slug });
      await this.inviteDuenoEnTx(tx, actor, id, datos.nombre, datos.duenoEmail, datos.duenoNombre);
      await this.bitacora.record(tx, {
        actor,
        accion: 'organizacion.create',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'organizacion', id, nombre: datos.nombre },
        despues: { nombre: datos.nombre, slug, dueno: datos.duenoNombre },
      });
      return { id, slug };
    });
  }

  async update(
    actor: ActorBitacora & { tipo: 'usuario' },
    id: string,
    datos: {
      nombre?: string | undefined;
      estado?: 'activa' | 'suspendida' | undefined;
      motivo?: string | undefined;
    },
  ): Promise<void> {
    await this.sistema.transaction(async (tx) => {
      const [actual] = await tx
        .select()
        .from(organizaciones)
        .where(eq(organizaciones.id, id))
        .for('update');
      if (!actual) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (datos.estado === 'suspendida' && actual.esDemo) {
        throw new AppError('VALIDACION', {
          errors: [
            { field: 'estado', code: 'ES_DEMO', message: 'La organización demo no se suspende.' },
          ],
        });
      }
      const cambios = {
        ...(datos.nombre !== undefined && datos.nombre !== actual.nombre
          ? { nombre: datos.nombre }
          : {}),
        ...(datos.estado !== undefined && datos.estado !== actual.estado
          ? { estado: datos.estado }
          : {}),
      };
      if (Object.keys(cambios).length === 0) {
        return;
      }
      await tx
        .update(organizaciones)
        .set({ ...cambios, updatedAt: this.reloj.now() })
        .where(eq(organizaciones.id, id));
      await this.bitacora.record(tx, {
        actor,
        accion:
          cambios.estado === 'suspendida'
            ? 'organizacion.suspend'
            : cambios.estado === 'activa'
              ? 'organizacion.reactivate'
              : 'organizacion.update',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'organizacion', id, nombre: cambios.nombre ?? actual.nombre },
        antes: Object.fromEntries(
          Object.keys(cambios).map((campo) => [campo, actual[campo as keyof typeof cambios]]),
        ),
        despues: { ...cambios, ...(datos.motivo ? { motivo: datos.motivo } : {}) },
      });
    });
  }

  /** Invita a un dueño nuevo; el anterior deja de serlo cuando el nuevo acepta. */
  async inviteDueno(
    actor: ActorBitacora & { tipo: 'usuario' },
    id: string,
    datos: { email: string; nombre: string; motivo: string },
  ): Promise<void> {
    await this.sistema.transaction(async (tx) => {
      const [organizacion] = await tx
        .select({ nombre: organizaciones.nombre })
        .from(organizaciones)
        .where(eq(organizaciones.id, id));
      if (!organizacion) {
        throw new AppError('NO_ENCONTRADO');
      }
      await this.inviteDuenoEnTx(tx, actor, id, organizacion.nombre, datos.email, datos.nombre);
      await this.bitacora.record(tx, {
        actor,
        accion: 'organizacion.dueno.invite',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'organizacion', id, nombre: organizacion.nombre },
        despues: { dueno: datos.nombre, motivo: datos.motivo },
      });
    });
  }

  /** Evento de tipo `prueba` para una organización (HU-202 §3). */
  async createEventoPrueba(
    actor: ActorBitacora & { tipo: 'usuario' },
    organizacionId: string,
    datos: { nombre: string; inicioAt: string; finAt: string },
  ): Promise<{ id: string; slug: string }> {
    return this.sistema.transaction(async (tx) => {
      const [organizacion] = await tx
        .select({ id: organizaciones.id })
        .from(organizaciones)
        .where(eq(organizaciones.id, organizacionId));
      if (!organizacion) {
        throw new AppError('NO_ENCONTRADO');
      }
      const slug = await findSlugLibre(toSlug(`prueba-${datos.nombre}`), async (s) => {
        const [fila] = await tx.select({ id: eventos.id }).from(eventos).where(eq(eventos.slug, s));
        return fila !== undefined;
      });
      const id = uuidv7();
      await tx.insert(eventos).values({
        id,
        organizacionId,
        slug,
        nombre: datos.nombre,
        tipo: 'prueba',
        inicioAt: new Date(datos.inicioAt),
        finAt: new Date(datos.finAt),
      });
      await this.bitacora.record(tx, {
        actor,
        accion: 'plataforma.evento_prueba.create',
        organizacionId,
        eventoId: id,
        objeto: { tipo: 'evento', id, nombre: datos.nombre },
      });
      return { id, slug };
    });
  }

  private async inviteDuenoEnTx(
    tx: Tx,
    actor: ActorBitacora & { tipo: 'usuario' },
    organizacionId: string,
    organizacion: string,
    email: string,
    nombre: string,
  ): Promise<void> {
    // Una sola invitación pendiente por organización.
    const pendientes = await tx
      .update(miembrosOrganizacion)
      .set({ estado: 'revocado', revocadoAt: this.reloj.now() })
      .where(
        and(
          eq(miembrosOrganizacion.organizacionId, organizacionId),
          eq(miembrosOrganizacion.estado, 'invitado'),
        ),
      )
      .returning({ id: miembrosOrganizacion.id });
    for (const pendiente of pendientes) {
      await this.invitaciones.revokeToken(tx, 'invitacion_organizacion', pendiente.id);
    }
    const [activo] = await tx
      .select({ id: miembrosOrganizacion.id })
      .from(miembrosOrganizacion)
      .innerJoin(usuarios, eq(usuarios.id, miembrosOrganizacion.usuarioId))
      .where(
        and(
          eq(miembrosOrganizacion.organizacionId, organizacionId),
          eq(miembrosOrganizacion.estado, 'activo'),
          eq(usuarios.email, email),
        ),
      );
    if (activo) {
      throw new AppError('VALIDACION', {
        errors: [{ field: 'email', code: 'YA_ES_DUENO', message: 'Esa persona ya es la dueña.' }],
      });
    }
    const miembroId = uuidv7();
    await tx.insert(miembrosOrganizacion).values({
      id: miembroId,
      organizacionId,
      emailInvitado: email,
      rol: 'dueno',
      estado: 'invitado',
      invitadoPor: actor.id,
    });
    const token = await this.invitaciones.createToken(tx, 'invitacion_organizacion', miembroId);
    await this.correos.enqueue(tx, {
      tipo: 'invitacion_organizacion',
      destinatario: email,
      datos: {
        nombre,
        quienInvita: actor.nombre,
        organizacion,
        enlace: `${this.publicUrl}/admin/invitacion/${token}`,
      },
      refId: miembroId,
    });
  }

  private async existsSlug(tx: Tx, slug: string): Promise<boolean> {
    const [fila] = await tx
      .select({ id: organizaciones.id })
      .from(organizaciones)
      .where(eq(organizaciones.slug, slug));
    return fila !== undefined;
  }

  private async checkSlugLibre(tx: Tx, slug: string): Promise<string> {
    if (await this.existsSlug(tx, slug)) {
      throw new AppError('VALIDACION', {
        errors: [
          { field: 'slug', code: 'YA_EXISTE', message: 'Ya hay una organización con ese slug.' },
        ],
      });
    }
    return slug;
  }
}
