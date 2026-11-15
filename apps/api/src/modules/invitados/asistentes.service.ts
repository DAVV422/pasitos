import { and, asc, count, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import { asistentes, eventos, withOrganizacion, type Db, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import {
  isCodigoAsistente,
  maskEmail,
  SIMILITUD_DUPLICADO,
  type ESTADOS_ASISTENTE,
  type ESTADOS_EMAIL,
} from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, diff } from '../bitacora/bitacora.service';

type Asistente = typeof asistentes.$inferSelect;

export interface DatosAsistente {
  readonly nombre?: string | undefined;
  readonly email?: string | null | undefined;
  readonly codigoExterno?: string | null | undefined;
  readonly confirmarDuplicado?: boolean | undefined;
}

export interface FiltrosAsistentes {
  readonly q?: string | undefined;
  readonly estado?: (typeof ESTADOS_ASISTENTE)[number] | undefined;
  readonly emailEstado?: (typeof ESTADOS_EMAIL)[number] | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/** Nombre normalizado en SQL (minúsculas, sin tildes): el mismo que usa el índice trigram. */
export const normalizado = (valor: SQL | string) => sql`pasitos_normalizar(${valor})`;

/** `%` y `_` del texto de búsqueda no son comodines. */
function escapeLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * La lista de invitados (HU-210 §2 y §3): cargar a mano con aviso de duplicados, corregir,
 * quitar de la lista, buscar y contar. El código lo asigna la base.
 */
export class AsistentesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  async search(contexto: ContextoEvento, filtros: FiltrosAsistentes) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const condiciones: SQL[] = [eq(asistentes.eventoId, contexto.eventoId)];
      if (filtros.estado) condiciones.push(eq(asistentes.estado, filtros.estado));
      if (filtros.emailEstado) condiciones.push(eq(asistentes.emailEstado, filtros.emailEstado));
      const q = filtros.q?.trim() ?? '';
      let orden: SQL[] = [
        sql`length(${asistentes.codigoAsistente})`,
        asc(asistentes.codigoAsistente),
      ];

      if (q !== '') {
        if (isCodigoAsistente(q)) {
          condiciones.push(eq(asistentes.codigoAsistente, q.toUpperCase()));
        } else if (q.includes('@')) {
          condiciones.push(sql`${asistentes.email} = ${q.toLowerCase()}`);
        } else if (q.length < 3) {
          condiciones.push(eq(asistentes.codigoExterno, q));
          const filas = await this.selectFilas(tx, and(...condiciones), orden, filtros.limit);
          if (filas.length === 0) {
            throw new AppError('VALIDACION', {
              errors: [{ field: 'q', code: 'MUY_CORTO', message: 'Escribe al menos 3 letras.' }],
            });
          }
          return { items: filas.map((a) => this.toFila(a, contexto)), nextCursor: null };
        } else {
          const buscado = normalizado(q);
          const nombre = normalizado(sql`${asistentes.nombre}`);
          condiciones.push(
            or(
              eq(asistentes.codigoExterno, q),
              sql`${nombre} ilike '%' || ${normalizado(escapeLike(q))} || '%'`,
              sql`${nombre} % ${buscado}`,
            ) as SQL,
          );
          orden = [sql`similarity(${nombre}, ${buscado}) desc`, asc(asistentes.codigoAsistente)];
        }
        const filas = await this.selectFilas(tx, and(...condiciones), orden, filtros.limit);
        return { items: filas.map((a) => this.toFila(a, contexto)), nextCursor: null };
      }

      if (filtros.cursor) {
        condiciones.push(
          sql`(length(${asistentes.codigoAsistente}), ${asistentes.codigoAsistente}) > (length(${filtros.cursor}), ${filtros.cursor})`,
        );
      }
      const filas = await this.selectFilas(tx, and(...condiciones), orden, filtros.limit + 1);
      const hayMas = filas.length > filtros.limit;
      const pagina = hayMas ? filas.slice(0, filtros.limit) : filas;
      return {
        items: pagina.map((a) => this.toFila(a, contexto)),
        nextCursor: hayMas ? (pagina.at(-1)?.codigoAsistente ?? null) : null,
      };
    });
  }

  /** *No vinieron* aparece recién al cierre (fase 3). */
  countPorEstado(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select({ estado: asistentes.estado, total: count() })
        .from(asistentes)
        .where(eq(asistentes.eventoId, contexto.eventoId))
        .groupBy(asistentes.estado);
      const de = (estado: string) => filas.find((f) => f.estado === estado)?.total ?? 0;
      return {
        invitados: de('invitado'),
        registrados: de('registrado'),
        presentes: de('presente'),
        cancelados: de('cancelado'),
        total: filas.reduce((suma, f) => suma + f.total, 0),
      };
    });
  }

  async create(contexto: ContextoEvento, datos: DatosAsistente & { nombre: string }) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      // Un solo alta a la vez por evento: así el control de repetidos ve lo último (también la importación).
      await tx
        .select({ id: eventos.id })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId))
        .for('update');
      const email = datos.email ?? null;
      const codigoExterno = datos.codigoExterno ?? null;
      await this.checkRepetido(tx, contexto, email, codigoExterno, null);
      if (!datos.confirmarDuplicado) {
        await this.checkParecido(tx, contexto, datos.nombre, null);
      }
      const id = uuidv7();
      await tx.insert(asistentes).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        nombre: datos.nombre,
        email,
        codigoExterno,
        origen: 'lista',
        estado: 'invitado',
        emailEstado: email ? 'pendiente' : 'sin_correo',
        createdBy: contexto.usuarioId,
      });
      const creado = await this.getAsistente(tx, contexto, id);
      await this.record(
        tx,
        contexto,
        'asistente.create',
        creado,
        undefined,
        this.toBitacora(creado),
      );
      return this.toFila(creado, contexto);
    });
  }

  async update(contexto: ContextoEvento, id: string, datos: DatosAsistente) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getAsistente(tx, contexto, id, true);
      const email = datos.email === undefined ? actual.email : datos.email;
      const codigoExterno =
        datos.codigoExterno === undefined ? actual.codigoExterno : datos.codigoExterno;
      await this.checkRepetido(tx, contexto, email, codigoExterno, id);
      if (
        datos.nombre !== undefined &&
        datos.nombre !== actual.nombre &&
        !datos.confirmarDuplicado
      ) {
        await this.checkParecido(tx, contexto, datos.nombre, id);
      }
      const cambioCorreo = datos.email !== undefined && datos.email !== actual.email;
      await tx
        .update(asistentes)
        .set({
          ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
          ...(datos.codigoExterno === undefined ? {} : { codigoExterno }),
          ...(cambioCorreo ? { email, emailEstado: email ? 'pendiente' : 'sin_correo' } : {}),
          updatedAt: this.reloj.now(),
        })
        .where(eq(asistentes.id, id));
      // Con la invitación sin usar, cambiar el correo la revoca: HU-211 la vuelve a crear al enviar.
      const nuevo = await this.getAsistente(tx, contexto, id);
      const recortado = diff(this.toBitacora(actual), this.toBitacora(nuevo));
      if (Object.keys(recortado.despues).length > 0) {
        await this.record(
          tx,
          contexto,
          'asistente.update',
          nuevo,
          recortado.antes,
          recortado.despues,
        );
      }
      return { fila: this.toFila(nuevo, contexto), cambioCorreo };
    });
  }

  /** Quitar de la lista: no se borra nunca; sus movimientos, si los hay, se conservan. */
  async cancel(contexto: ContextoEvento, id: string, motivo: string | undefined) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getAsistente(tx, contexto, id, true);
      if (actual.estado !== 'cancelado') {
        await tx
          .update(asistentes)
          .set({ estado: 'cancelado', updatedAt: this.reloj.now() })
          .where(eq(asistentes.id, id));
        await this.record(
          tx,
          contexto,
          'asistente.cancel',
          actual,
          { estado: actual.estado },
          { estado: 'cancelado', ...(motivo ? { motivo } : {}) },
        );
      }
      return this.toFila(await this.getAsistente(tx, contexto, id), contexto);
    });
  }

  // ── Repetidos ──────────────────────────────────────────────────────────────

  private async checkRepetido(
    tx: Tx,
    contexto: ContextoEvento,
    email: string | null,
    codigoExterno: string | null,
    exceptoId: string | null,
  ): Promise<void> {
    if (!email && !codigoExterno) return;
    const [repetido] = await tx
      .select()
      .from(asistentes)
      .where(
        and(
          eq(asistentes.eventoId, contexto.eventoId),
          exceptoId ? ne(asistentes.id, exceptoId) : undefined,
          or(
            email ? sql`${asistentes.email} = ${email}` : undefined,
            codigoExterno ? eq(asistentes.codigoExterno, codigoExterno) : undefined,
          ),
        ),
      )
      .limit(1);
    if (repetido) {
      const porCorreo = email !== null && repetido.email?.toLowerCase() === email.toLowerCase();
      throw new AppError('ASISTENTE_YA_REGISTRADO', {
        detail: `${porCorreo ? 'Ese correo' : 'Ese código'} ya está en la lista: ${repetido.codigoAsistente} · ${repetido.nombre}.`,
        meta: { asistente: { codigo: repetido.codigoAsistente, nombre: repetido.nombre } },
        errors: [
          {
            field: porCorreo ? 'email' : 'codigoExterno',
            code: 'REPETIDO',
            message: `Ya está en la lista como ${repetido.codigoAsistente}.`,
          },
        ],
      });
    }
  }

  private async checkParecido(
    tx: Tx,
    contexto: ContextoEvento,
    nombre: string,
    exceptoId: string | null,
  ): Promise<void> {
    const similitud = sql<number>`similarity(${normalizado(sql`${asistentes.nombre}`)}, ${normalizado(nombre)})`;
    const candidatos = await tx
      .select({
        codigo: asistentes.codigoAsistente,
        nombre: asistentes.nombre,
        email: asistentes.email,
      })
      .from(asistentes)
      .where(
        and(
          eq(asistentes.eventoId, contexto.eventoId),
          ne(asistentes.estado, 'cancelado'),
          exceptoId ? ne(asistentes.id, exceptoId) : undefined,
          sql`${similitud} >= ${SIMILITUD_DUPLICADO}`,
        ),
      )
      .orderBy(sql`${similitud} desc`)
      .limit(5);
    if (candidatos.length > 0) {
      throw new AppError('ASISTENTE_POSIBLE_DUPLICADO', {
        meta: {
          candidatos: candidatos.map((c) => ({ ...c, email: maskEmail(c.email) })),
        },
      });
    }
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  private selectFilas(tx: Tx, donde: SQL | undefined, orden: SQL[], limite: number) {
    return tx
      .select()
      .from(asistentes)
      .where(donde)
      .orderBy(...orden)
      .limit(limite);
  }

  private async getAsistente(
    tx: Tx,
    contexto: ContextoEvento,
    id: string,
    bloquear = false,
  ): Promise<Asistente> {
    const consulta = tx.select().from(asistentes).where(eq(asistentes.id, id));
    const [asistente] = bloquear ? await consulta.for('update') : await consulta;
    if (asistente?.eventoId !== contexto.eventoId) {
      throw new AppError('NO_ENCONTRADO');
    }
    return asistente;
  }

  /** El registrador ve el correo enmascarado (HU-210 §3). */
  toFila(a: Asistente, contexto: Pick<ContextoEvento, 'rol'>) {
    return {
      id: a.id,
      codigo: a.codigoAsistente,
      nombre: a.nombre,
      email: contexto.rol === 'registrador' ? maskEmail(a.email) : a.email,
      codigoExterno: a.codigoExterno,
      estado: a.estado,
      emailEstado: a.emailEstado,
      origen: a.origen,
      // HU-211: la invitación por correo.
      invitacion: null,
    };
  }

  /** En la bitácora, el correo siempre enmascarado. */
  private toBitacora(a: Asistente): Record<string, unknown> {
    return {
      nombre: a.nombre,
      email: maskEmail(a.email),
      codigoExterno: a.codigoExterno,
    };
  }

  private record(
    tx: Tx,
    contexto: ContextoEvento,
    accion: 'asistente.create' | 'asistente.update' | 'asistente.cancel',
    a: Asistente,
    antes?: Record<string, unknown>,
    despues?: Record<string, unknown>,
  ) {
    return this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: 'asistente', id: a.id, nombre: `${a.codigoAsistente} · ${a.nombre}` },
      ...(antes ? { antes } : {}),
      ...(despues ? { despues } : {}),
    });
  }
}
