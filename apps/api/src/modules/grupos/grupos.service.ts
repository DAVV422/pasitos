import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  asistenteGrupos,
  asistentes,
  grupos,
  outbox,
  premios,
  qrRegistro,
  retos,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { DatosGrupo } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';

/** Un grupo en el panel (HU-325 §4): cuántas personas, retos y premios tiene. */
export interface GrupoPanel {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
  readonly personas: number;
  readonly retos: number;
  readonly premios: number;
  readonly qrRegistro: number;
}

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

function isNombreRepetido(error: unknown): boolean {
  const causa = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return causa.code === '23505' && causa.constraint === 'grupos_nombre';
}

/**
 * Los grupos del evento (HU-325): crear, editar, borrar si no se usa y agregar o quitar personas.
 * Un cambio avisa a la app (`evento.contenido_actualizado`): lo que ve cada persona depende de sus
 * grupos.
 */
export class GruposService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  list(contexto: ContextoEvento): Promise<{ items: GrupoPanel[] }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => ({
      items: await this.select(tx, contexto.eventoId),
    }));
  }

  create(contexto: ContextoEvento, datos: DatosGrupo): Promise<GrupoPanel> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const id = uuidv7();
      try {
        await tx.transaction((sub) =>
          sub.insert(grupos).values({
            id,
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            nombre: datos.nombre,
            color: datos.color,
            createdBy: contexto.usuarioId,
          }),
        );
      } catch (error) {
        if (isNombreRepetido(error)) throw errorCampo('nombre', 'Ya hay un grupo con ese nombre.');
        throw error;
      }
      await this.record(tx, contexto, 'grupo.create', { id, nombre: datos.nombre }, undefined, {
        ...datos,
      });
      return this.getOne(tx, contexto.eventoId, id);
    });
  }

  update(
    contexto: ContextoEvento,
    id: string,
    cambios: { nombre?: string | undefined; color?: DatosGrupo['color'] | undefined },
  ): Promise<GrupoPanel> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.lock(tx, contexto, id);
      try {
        await tx.transaction((sub) =>
          sub
            .update(grupos)
            .set({ ...cambios, updatedAt: this.reloj.now() })
            .where(eq(grupos.id, id)),
        );
      } catch (error) {
        if (isNombreRepetido(error)) throw errorCampo('nombre', 'Ya hay un grupo con ese nombre.');
        throw error;
      }
      await this.record(
        tx,
        contexto,
        'grupo.update',
        { id, nombre: cambios.nombre ?? actual.nombre },
        { nombre: actual.nombre, color: actual.color },
        { ...cambios },
      );
      await this.notify(tx, contexto.eventoId);
      return this.getOne(tx, contexto.eventoId, id);
    });
  }

  /** No se borra un grupo con personas, retos, premios o QR de registro (`GRUPO_EN_USO`). */
  delete(contexto: ContextoEvento, id: string): Promise<void> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.lock(tx, contexto, id);
      const [uso] = await this.select(tx, contexto.eventoId, id);
      if (uso && uso.personas + uso.retos + uso.premios + uso.qrRegistro > 0) {
        throw new AppError('GRUPO_EN_USO', { meta: { ...uso } });
      }
      await tx.delete(grupos).where(eq(grupos.id, id));
      await this.record(
        tx,
        contexto,
        'grupo.delete',
        { id, nombre: actual.nombre },
        {
          nombre: actual.nombre,
        },
      );
    });
  }

  /** Agregar a mano, por código (`via = 'manual'`). Quien ya estaba, sigue igual. */
  addMiembros(
    contexto: ContextoEvento,
    id: string,
    codigos: readonly string[],
  ): Promise<{ agregados: string[]; yaEstaban: string[]; noEncontrados: string[] }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const grupo = await this.lock(tx, contexto, id);
      const normalizados = [...new Set(codigos.map((c) => c.trim().toUpperCase()))];
      const encontrados = await tx
        .select({ id: asistentes.id, codigo: asistentes.codigoAsistente })
        .from(asistentes)
        .where(
          and(
            eq(asistentes.eventoId, contexto.eventoId),
            inArray(asistentes.codigoAsistente, normalizados),
          ),
        );
      const porCodigo = new Map(encontrados.map((a) => [a.codigo, a.id]));
      const insertados = encontrados.length
        ? await tx
            .insert(asistenteGrupos)
            .values(
              encontrados.map((a) => ({
                asistenteId: a.id,
                grupoId: id,
                organizacionId: contexto.organizacionId,
                eventoId: contexto.eventoId,
                via: 'manual',
                agregadoPor: contexto.usuarioId,
              })),
            )
            .onConflictDoNothing()
            .returning({ asistenteId: asistenteGrupos.asistenteId })
        : [];
      const nuevos = new Set(insertados.map((i) => i.asistenteId));
      const agregados = normalizados.filter((c) => nuevos.has(porCodigo.get(c) ?? ''));
      const resultado = {
        agregados,
        yaEstaban: normalizados.filter((c) => porCodigo.has(c) && !agregados.includes(c)),
        noEncontrados: normalizados.filter((c) => !porCodigo.has(c)),
      };
      if (agregados.length > 0) {
        await this.record(tx, contexto, 'grupo.agregar', { id, nombre: grupo.nombre }, undefined, {
          asistentes: agregados,
        });
        await this.notify(tx, contexto.eventoId);
      }
      return resultado;
    });
  }

  /** Quitar del grupo (si no estaba, no pasa nada). Un canje ya hecho no se toca. */
  removeMiembro(contexto: ContextoEvento, id: string, asistenteId: string): Promise<void> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const grupo = await this.lock(tx, contexto, id);
      const borrados = await tx
        .delete(asistenteGrupos)
        .where(and(eq(asistenteGrupos.grupoId, id), eq(asistenteGrupos.asistenteId, asistenteId)))
        .returning({ asistenteId: asistenteGrupos.asistenteId });
      // Quien no estaba en el grupo: nada que hacer.
      if (borrados.length === 0) return;
      const [persona] = await tx
        .select({ codigo: asistentes.codigoAsistente })
        .from(asistentes)
        .where(eq(asistentes.id, asistenteId));
      await this.record(
        tx,
        contexto,
        'grupo.quitar',
        { id, nombre: grupo.nombre },
        {
          asistente: persona?.codigo ?? null,
        },
      );
      await this.notify(tx, contexto.eventoId);
    });
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  private async lock(tx: Tx, contexto: ContextoEvento, id: string) {
    const [grupo] = await tx
      .select()
      .from(grupos)
      .where(and(eq(grupos.id, id), eq(grupos.eventoId, contexto.eventoId)))
      .for('update');
    if (!grupo) throw new AppError('NO_ENCONTRADO');
    return grupo;
  }

  private async getOne(tx: Tx, eventoId: string, id: string): Promise<GrupoPanel> {
    const [grupo] = await this.select(tx, eventoId, id);
    if (!grupo) throw new AppError('NO_ENCONTRADO');
    return grupo;
  }

  private async select(tx: Tx, eventoId: string, id?: string): Promise<GrupoPanel[]> {
    const filas = await tx
      .select({ id: grupos.id, nombre: grupos.nombre, color: grupos.color })
      .from(grupos)
      .where(
        id ? and(eq(grupos.eventoId, eventoId), eq(grupos.id, id)) : eq(grupos.eventoId, eventoId),
      )
      .orderBy(asc(grupos.nombre));
    if (filas.length === 0) return [];
    const ids = filas.map((f) => f.id);
    const contar = async (
      tabla: typeof asistenteGrupos | typeof retos | typeof premios | typeof qrRegistro,
    ) => {
      const columna = tabla.grupoId;
      const cuentas = await tx
        .select({ grupoId: columna, n: count() })
        .from(tabla)
        .where(inArray(columna, ids))
        .groupBy(columna);
      return new Map(cuentas.map((c) => [c.grupoId, c.n]));
    };
    const [personas, deRetos, dePremios, deQr] = await Promise.all([
      contar(asistenteGrupos),
      contar(retos),
      contar(premios),
      contar(qrRegistro),
    ]);
    return filas.map((g) => ({
      ...g,
      personas: personas.get(g.id) ?? 0,
      retos: deRetos.get(g.id) ?? 0,
      premios: dePremios.get(g.id) ?? 0,
      qrRegistro: deQr.get(g.id) ?? 0,
    }));
  }

  /** Lo que ve cada persona cambió: la app vuelve a pedir el contenido. */
  private async notify(tx: Tx, eventoId: string): Promise<void> {
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'evento.contenido_actualizado',
      eventoId,
      payload: { eventoId },
    });
  }

  private record(
    tx: Tx,
    contexto: ContextoEvento,
    accion: 'grupo.create' | 'grupo.update' | 'grupo.delete' | 'grupo.agregar' | 'grupo.quitar',
    objeto: { id: string; nombre: string },
    antes?: Record<string, unknown>,
    despues?: Record<string, unknown>,
  ) {
    return this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: 'grupo', ...objeto },
      ...(antes ? { antes } : {}),
      ...(despues ? { despues } : {}),
    });
  }
}
