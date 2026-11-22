import { and, asc, eq, getTableColumns, max } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  actividades,
  eventos,
  lugares,
  outbox,
  pantallas,
  preguntasFrecuentes,
  retos,
  sponsors,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, type AccionBitacora } from '@pasitos/dominio';
import type { RecursoContenido } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import type { ArchivosService } from '../archivos/archivos.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, diff } from '../bitacora/bitacora.service';

type Datos = Record<string, unknown>;

interface DefinicionRecurso {
  readonly tabla: PgTable & { id: PgColumn; eventoId: PgColumn };
  readonly accion: 'lugar' | 'actividad' | 'sponsor' | 'pregunta';
  readonly nombre: (fila: Datos) => string;
  readonly orden: readonly PgColumn[];
  /** Con columna `orden` (sponsors y preguntas): al crear va al final; se reordena con una lista. */
  readonly ordenable: boolean;
}

const RECURSOS: Readonly<Record<RecursoContenido, DefinicionRecurso>> = {
  lugares: {
    tabla: lugares,
    accion: 'lugar',
    nombre: (f) => String(f['nombre']),
    orden: [lugares.tipo, lugares.numeroMapa, lugares.nombre],
    ordenable: false,
  },
  actividades: {
    tabla: actividades,
    accion: 'actividad',
    nombre: (f) => String(f['titulo']),
    orden: [actividades.inicioAt, actividades.titulo],
    ordenable: false,
  },
  sponsors: {
    tabla: sponsors,
    accion: 'sponsor',
    nombre: (f) => String(f['nombre']),
    orden: [sponsors.orden, sponsors.nombre],
    ordenable: true,
  },
  preguntas: {
    tabla: preguntasFrecuentes,
    accion: 'pregunta',
    nombre: (f) => String(f['pregunta']),
    orden: [preguntasFrecuentes.orden],
    ordenable: true,
  },
};

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

function isNumeroMapaRepetido(error: unknown): boolean {
  const causa = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return causa.code === '23505' && (causa.constraint ?? '').includes('numero_mapa');
}

/**
 * Lugares, agenda, sponsors y preguntas frecuentes (HU-206 §2): la misma forma de CRUD para los
 * cuatro, con las reglas de cada uno. Cada escritura deja bitácora (solo lo que cambió) y avisa en
 * `outbox` `evento.contenido_actualizado` (la fase 3 invalida el caché de la app).
 */
export class ContenidoService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly archivos: ArchivosService,
    private readonly reloj: Reloj,
  ) {}

  list(contexto: ContextoEvento, recurso: RecursoContenido) {
    const { tabla, orden } = RECURSOS[recurso];
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx
        .select()
        .from(tabla)
        .where(eq(tabla.eventoId, contexto.eventoId))
        .orderBy(...orden.map((c) => asc(c))),
    );
  }

  async create(contexto: ContextoEvento, recurso: RecursoContenido, datos: Datos) {
    const definicion = RECURSOS[recurso];
    await this.checkReferencias(contexto, recurso, datos);
    return this.write(contexto, async (tx) => {
      await this.checkReglas(tx, contexto, recurso, datos);
      const id = uuidv7();
      const valores: Datos = {
        ...datos,
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        ...(definicion.ordenable
          ? { orden: await this.getSiguienteOrden(tx, definicion, contexto) }
          : {}),
        ...this.toFechas(datos),
      };
      await tx.insert(definicion.tabla).values(valores as never);
      await this.record(
        tx,
        contexto,
        `${definicion.accion}.create`,
        id,
        definicion.nombre(datos),
        undefined,
        datos,
      );
      return this.getFila(tx, definicion, id);
    });
  }

  async update(contexto: ContextoEvento, recurso: RecursoContenido, id: string, datos: Datos) {
    const definicion = RECURSOS[recurso];
    await this.checkReferencias(contexto, recurso, datos);
    return this.write(contexto, async (tx) => {
      const actual = await this.getFila(tx, definicion, id, true);
      const final = { ...actual, ...datos };
      await this.checkReglas(tx, contexto, recurso, final);
      await tx
        .update(definicion.tabla)
        .set({ ...datos, ...this.toFechas(datos), updatedAt: this.reloj.now() } as never)
        .where(eq(definicion.tabla.id, id));
      const cambios = diff(actual, final);
      if (Object.keys(cambios.despues).length > 0) {
        await this.record(
          tx,
          contexto,
          `${definicion.accion}.update`,
          id,
          definicion.nombre(final),
          cambios.antes,
          cambios.despues,
        );
      }
      if (
        recurso === 'sponsors' &&
        datos['logoArchivoId'] !== undefined &&
        datos['logoArchivoId'] !== actual['logoArchivoId']
      ) {
        await this.archivos.markReemplazado(
          contexto,
          (actual['logoArchivoId'] as string | null) ?? null,
        );
      }
      return this.getFila(tx, definicion, id);
    });
  }

  async delete(contexto: ContextoEvento, recurso: RecursoContenido, id: string): Promise<void> {
    const definicion = RECURSOS[recurso];
    await this.write(contexto, async (tx) => {
      const actual = await this.getFila(tx, definicion, id, true);
      await this.checkNoEnUso(tx, recurso, id);
      await tx.delete(definicion.tabla).where(eq(definicion.tabla.id, id));
      await this.record(
        tx,
        contexto,
        `${definicion.accion}.delete`,
        id,
        definicion.nombre(actual),
        actual,
        undefined,
      );
    });
  }

  /** `PUT …/orden { ids }`: el orden nuevo de **todos** (sponsors y preguntas). */
  async reorder(
    contexto: ContextoEvento,
    recurso: 'sponsors' | 'preguntas',
    ids: readonly string[],
  ) {
    const definicion = RECURSOS[recurso];
    return this.write(contexto, async (tx) => {
      const filas = await tx
        .select({ id: definicion.tabla.id })
        .from(definicion.tabla)
        .where(eq(definicion.tabla.eventoId, contexto.eventoId));
      const actuales = new Set(filas.map((f) => f.id as string));
      if (
        ids.length !== actuales.size ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !actuales.has(id))
      ) {
        throw errorCampo('ids', 'Manda todos los elementos, una vez cada uno.');
      }
      for (const [orden, id] of ids.entries()) {
        await tx
          .update(definicion.tabla)
          .set({ orden } as never)
          .where(eq(definicion.tabla.id, id));
      }
      await this.record(
        tx,
        contexto,
        recurso === 'preguntas' ? 'preguntas.reorder' : 'sponsor.update',
        contexto.eventoId,
        recurso === 'preguntas' ? 'Preguntas frecuentes' : 'Orden de los sponsors',
        undefined,
        { orden: ids },
      );
      return tx
        .select()
        .from(definicion.tabla)
        .where(eq(definicion.tabla.eventoId, contexto.eventoId))
        .orderBy(...definicion.orden.map((c) => asc(c)));
    });
  }

  // ── Reglas ─────────────────────────────────────────────────────────────────

  /** Las imágenes, antes de la transacción (miran `archivos`). */
  private async checkReferencias(
    contexto: ContextoEvento,
    recurso: RecursoContenido,
    datos: Datos,
  ) {
    if (recurso === 'sponsors' && typeof datos['logoArchivoId'] === 'string') {
      await this.archivos.checkUsable(
        contexto,
        datos['logoArchivoId'],
        'logo_sponsor',
        'logoArchivoId',
      );
    }
  }

  private async checkReglas(
    tx: Tx,
    contexto: ContextoEvento,
    recurso: RecursoContenido,
    datos: Datos,
  ) {
    // HU-414: la marca en el plano va con sus dos coordenadas, o sin ninguna.
    if (
      recurso === 'lugares' &&
      ((datos['mapaX'] ?? null) === null) !== ((datos['mapaY'] ?? null) === null)
    ) {
      throw errorCampo('mapaX', 'Marca el lugar en el plano con sus dos coordenadas.');
    }
    const delEvento = async (
      tabla: typeof lugares | typeof sponsors | typeof retos,
      campo: string,
    ) => {
      const id = datos[campo];
      if (typeof id !== 'string') return;
      const [fila] = await tx
        .select({ id: tabla.id })
        .from(tabla)
        .where(and(eq(tabla.id, id), eq(tabla.eventoId, contexto.eventoId)));
      if (!fila) throw errorCampo(campo, 'No es de este evento.');
    };
    if (recurso === 'actividades') {
      const [evento] = await tx
        .select({ inicioAt: eventos.inicioAt, finAt: eventos.finAt })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId));
      const inicio = new Date(String(datos['inicioAt']));
      const fin = new Date(String(datos['finAt']));
      if (!(fin > inicio)) {
        throw errorCampo('finAt', 'El fin tiene que ser después del inicio.');
      }
      if (evento && (inicio < evento.inicioAt || fin > evento.finAt)) {
        throw errorCampo(
          'inicioAt',
          'La actividad tiene que estar dentro de las fechas del evento.',
        );
      }
      await delEvento(lugares, 'lugarId');
      await delEvento(sponsors, 'sponsorId');
      await delEvento(retos, 'retoId');
    }
    if (recurso === 'sponsors') {
      await delEvento(lugares, 'lugarId');
    }
  }

  /** Un lugar o un sponsor en uso no se borra: el error dice quién lo usa (HU-206 §2). */
  private async checkNoEnUso(tx: Tx, recurso: RecursoContenido, id: string): Promise<void> {
    const usos: { tipo: string; nombre: string }[] = [];
    const sumar = async (tipo: string, tabla: PgTable, columna: PgColumn, nombre: PgColumn) => {
      const filas = await tx.select({ nombre }).from(tabla).where(eq(columna, id)).limit(5);
      usos.push(...filas.map((f) => ({ tipo, nombre: String(f.nombre) })));
    };
    if (recurso === 'lugares') {
      await sumar('actividad', actividades, actividades.lugarId, actividades.titulo);
      await sumar('sponsor', sponsors, sponsors.lugarId, sponsors.nombre);
      if ('lugarId' in getTableColumns(retos)) {
        await sumar(
          'reto',
          retos,
          (retos as unknown as { lugarId: PgColumn }).lugarId,
          retos.nombre,
        );
      }
      if ('lugarId' in getTableColumns(pantallas)) {
        await sumar(
          'pantalla',
          pantallas,
          (pantallas as unknown as { lugarId: PgColumn }).lugarId,
          pantallas.nombre,
        );
      }
      if (usos.length > 0) {
        throw new AppError('LUGAR_EN_USO', { meta: { usadoPor: usos } });
      }
    }
    if (recurso === 'sponsors') {
      await sumar('actividad', actividades, actividades.sponsorId, actividades.titulo);
      if (usos.length > 0) {
        throw new AppError('RECURSO_EN_USO', { meta: { usadoPor: usos } });
      }
    }
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  private async write<T>(contexto: ContextoEvento, trabajo: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
        const resultado = await trabajo(tx);
        await tx.insert(outbox).values({
          id: uuidv7(),
          tipo: 'evento.contenido_actualizado',
          eventoId: contexto.eventoId,
          payload: { eventoId: contexto.eventoId },
        });
        return resultado;
      });
    } catch (error) {
      if (isNumeroMapaRepetido(error)) {
        throw errorCampo('numeroMapa', 'Ese número del plano ya lo tiene otro lugar.');
      }
      throw error;
    }
  }

  private async getFila(
    tx: Tx,
    definicion: DefinicionRecurso,
    id: string,
    bloquear = false,
  ): Promise<Datos> {
    const consulta = tx.select().from(definicion.tabla).where(eq(definicion.tabla.id, id));
    const [fila] = (bloquear ? await consulta.for('update') : await consulta) as Datos[];
    if (!fila) {
      throw new AppError('NO_ENCONTRADO');
    }
    return fila;
  }

  private async getSiguienteOrden(tx: Tx, definicion: DefinicionRecurso, contexto: ContextoEvento) {
    const columna = (definicion.tabla as unknown as { orden: PgColumn }).orden;
    const [fila] = await tx
      .select({ ultimo: max(columna) })
      .from(definicion.tabla)
      .where(eq(definicion.tabla.eventoId, contexto.eventoId));
    return Number(fila?.ultimo ?? -1) + 1;
  }

  private toFechas(datos: Datos): Datos {
    return Object.fromEntries(
      (['inicioAt', 'finAt'] as const)
        .filter((campo) => typeof datos[campo] === 'string')
        .map((campo) => [campo, new Date(String(datos[campo]))]),
    );
  }

  private record(
    tx: Tx,
    contexto: ContextoEvento,
    accion: string,
    id: string,
    nombre: string,
    antes: Datos | undefined,
    despues: Datos | undefined,
  ) {
    return this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion: accion as AccionBitacora,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: accion.split('.')[0] ?? 'contenido', id, nombre },
      ...(antes ? { antes } : {}),
      ...(despues ? { despues } : {}),
    });
  }
}
