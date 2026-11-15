import { and, eq, sql } from 'drizzle-orm';
import {
  eventos,
  miembroTerminales,
  miembrosEvento,
  miembrosOrganizacion,
  type Db,
} from '@pasitos/db';
import { isRolEvento, type RolEvento } from '@pasitos/dominio';
import { TABLAS_RECURSO, type RecursoEvento } from './marcas';

export interface EventoResuelto {
  readonly id: string;
  readonly organizacionId: string;
  readonly estado: string;
}

export interface RolResuelto {
  readonly rol: RolEvento;
  readonly miembroId: string | null;
  readonly terminales: { readonly pantallas: readonly string[]; readonly mesas: readonly string[] };
}

/**
 * Búsquedas del guard de permisos con la conexión de sistema (HU-204 §2): **solo** para saber de
 * qué evento y organización es una ruta y qué rol tiene la persona. Después, el servicio trabaja
 * con `withOrganizacion()` y RLS.
 */
export class RolesRepository {
  constructor(private readonly sistema: Db) {}

  async findEventoDeRecurso(recurso: RecursoEvento, id: string): Promise<string | null> {
    const tabla = TABLAS_RECURSO[recurso];
    const columna = tabla === 'eventos' ? 'id' : 'evento_id';
    const { rows } = await this.sistema.execute<{ evento_id: string }>(
      sql`select ${sql.identifier(columna)} as evento_id from ${sql.identifier(tabla)} where id = ${id}`,
    );
    return rows[0]?.evento_id ?? null;
  }

  async findEvento(id: string): Promise<EventoResuelto | null> {
    const [fila] = await this.sistema
      .select({ id: eventos.id, organizacionId: eventos.organizacionId, estado: eventos.estado })
      .from(eventos)
      .where(eq(eventos.id, id));
    return fila ?? null;
  }

  /** Dueño de la organización (dueño de todos sus eventos) o miembro activo del evento. */
  async findRol(usuarioId: string, evento: EventoResuelto): Promise<RolResuelto | null> {
    const [dueno] = await this.sistema
      .select({ id: miembrosOrganizacion.id })
      .from(miembrosOrganizacion)
      .where(
        and(
          eq(miembrosOrganizacion.organizacionId, evento.organizacionId),
          eq(miembrosOrganizacion.usuarioId, usuarioId),
          eq(miembrosOrganizacion.rol, 'dueno'),
          eq(miembrosOrganizacion.estado, 'activo'),
        ),
      );
    if (dueno) {
      return { rol: 'dueno', miembroId: null, terminales: { pantallas: [], mesas: [] } };
    }
    const [miembro] = await this.sistema
      .select({ id: miembrosEvento.id, rol: miembrosEvento.rol })
      .from(miembrosEvento)
      .where(
        and(
          eq(miembrosEvento.eventoId, evento.id),
          eq(miembrosEvento.usuarioId, usuarioId),
          eq(miembrosEvento.estado, 'activo'),
        ),
      );
    if (!miembro || !isRolEvento(miembro.rol)) {
      return null;
    }
    const terminales = await this.sistema
      .select({ pantallaId: miembroTerminales.pantallaId, mesaId: miembroTerminales.mesaId })
      .from(miembroTerminales)
      .where(eq(miembroTerminales.miembroEventoId, miembro.id));
    return {
      rol: miembro.rol,
      miembroId: miembro.id,
      terminales: {
        pantallas: terminales.flatMap((t) => (t.pantallaId ? [t.pantallaId] : [])),
        mesas: terminales.flatMap((t) => (t.mesaId ? [t.mesaId] : [])),
      },
    };
  }
}

/**
 * Caché del rol por `usuarioId:eventoId`, 30 s en memoria (HU-204 §4). Cambiar el rol o quitar a
 * alguien la invalida en el mismo proceso: vale desde la request siguiente.
 */
export class RolesCache {
  private readonly entradas = new Map<string, { valor: RolResuelto | null; hasta: number }>();

  constructor(
    private readonly duracionMs = 30_000,
    private readonly ahora: () => number = Date.now,
  ) {}

  get(usuarioId: string, eventoId: string): RolResuelto | null | undefined {
    const entrada = this.entradas.get(`${usuarioId}:${eventoId}`);
    if (!entrada || entrada.hasta <= this.ahora()) {
      return undefined;
    }
    return entrada.valor;
  }

  set(usuarioId: string, eventoId: string, valor: RolResuelto | null): void {
    if (this.entradas.size > 10_000) {
      this.entradas.clear();
    }
    this.entradas.set(`${usuarioId}:${eventoId}`, { valor, hasta: this.ahora() + this.duracionMs });
  }

  /** Sin `eventoId`: todas las entradas de esa persona (al quitarla o revocar sus sesiones). */
  invalidate(usuarioId: string, eventoId?: string): void {
    if (eventoId) {
      this.entradas.delete(`${usuarioId}:${eventoId}`);
      return;
    }
    for (const clave of this.entradas.keys()) {
      if (clave.startsWith(`${usuarioId}:`)) {
        this.entradas.delete(clave);
      }
    }
  }
}
