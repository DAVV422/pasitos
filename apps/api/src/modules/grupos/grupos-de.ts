import { and, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { asistenteGrupos, grupos, type Tx } from '@pasitos/db';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/** Un grupo como lo ve la app y la mesa (HU-325): el nombre y su color. */
export interface GrupoVisto {
  readonly id: string;
  readonly nombre: string;
  readonly color: string;
}

/** Los grupos de una persona, en orden de nombre. */
export async function listGruposDe(tx: Tx, asistenteId: string): Promise<GrupoVisto[]> {
  return tx
    .select({ id: grupos.id, nombre: grupos.nombre, color: grupos.color })
    .from(asistenteGrupos)
    .innerJoin(grupos, eq(grupos.id, asistenteGrupos.grupoId))
    .where(eq(asistenteGrupos.asistenteId, asistenteId))
    .orderBy(grupos.nombre);
}

/** Los grupos de un evento, por id, para poner su nombre en retos y premios. */
export async function mapGruposDelEvento(
  tx: Tx,
  eventoId: string,
): Promise<ReadonlyMap<string, GrupoVisto>> {
  const filas = await tx
    .select({ id: grupos.id, nombre: grupos.nombre, color: grupos.color })
    .from(grupos)
    .where(eq(grupos.eventoId, eventoId));
  return new Map(filas.map((g) => [g.id, g]));
}

/** `grupo_id` nulo (todo el evento) o uno de los grupos de la persona (HU-325 §3). */
export function whereParaLaPersona(columna: AnyPgColumn, grupoIds: readonly string[]): SQL {
  return grupoIds.length > 0
    ? (or(isNull(columna), inArray(columna, [...grupoIds])) as SQL)
    : isNull(columna);
}

/** Si una persona está en un grupo. */
export async function isEnGrupo(tx: Tx, asistenteId: string, grupoId: string): Promise<boolean> {
  const [fila] = await tx
    .select({ grupoId: asistenteGrupos.grupoId })
    .from(asistenteGrupos)
    .where(and(eq(asistenteGrupos.asistenteId, asistenteId), eq(asistenteGrupos.grupoId, grupoId)));
  return !!fila;
}
