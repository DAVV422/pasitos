import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { normalize, resolve, sep } from 'node:path';
import { and, asc, count, desc, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  archivos,
  asistentes,
  enviosFoto,
  outbox,
  retoResponsables,
  retos,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import {
  AppError,
  canDo,
  MOTIVOS_RECHAZO_FOTO,
  type MotivoRechazoFoto,
  type VarianteImagen,
} from '@pasitos/dominio';
import type { LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import { raiseAlerta } from '../acceso/registro-tecnico';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { AnulacionesService } from '../movimientos/anulaciones.service';
import { getNombreCorto } from '../puerta/check-in.service';

type Pedido = Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>;
type Envio = typeof enviosFoto.$inferSelect;

/** Cuánto dura la toma de una foto mientras se mira (HU-323 §2). */
const TOMA_MS = 2 * 60_000;

/** La foto que se revisa ahora (HU-323 §2). */
export interface FotoParaRevisar {
  readonly envio: { readonly id: string; readonly retoId: string; readonly reto: string };
  readonly foto: { readonly url1200: string };
  readonly asistente: { readonly nombre: string; readonly codigo: string };
  readonly intento: number;
  readonly intentosAnteriores: readonly { readonly motivo: string | null }[];
  readonly origen: string;
  readonly autorizaUso: boolean;
  readonly enviadaAt: string;
  readonly puntos: number;
}

export type ResultadoRevision =
  | { readonly estado: 'aprobada'; readonly puntos: number; readonly asistente: string }
  | { readonly estado: 'rechazada'; readonly motivo: string; readonly asistente: string };

/**
 * Revisar las fotos de los retos (HU-323): la cola, tomar, aprobar, rechazar y deshacer. Dueño y
 * coorganizadores ven todos los retos; cada responsable, **solo** los suyos, en cada ruta.
 */
export class FotosRevisionService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly libro: LibroService,
    private readonly anulaciones: AnulacionesService,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {}

  /** Cuántas hay por reto, de los retos que reviso. */
  pendientes(contexto: ContextoEvento, retoId?: string) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const mios = await this.listMisRetos(tx, contexto);
      const filas = mios.length
        ? await tx
            .select({ retoId: enviosFoto.retoId, n: count() })
            .from(enviosFoto)
            .where(
              and(
                inArray(
                  enviosFoto.retoId,
                  mios.map((r) => r.id),
                ),
                eq(enviosFoto.estado, 'en_revision'),
              ),
            )
            .groupBy(enviosFoto.retoId)
        : [];
      const porReto = new Map(filas.map((f) => [f.retoId, f.n]));
      const items = mios
        .filter((r) => !retoId || r.id === retoId)
        .map((r) => ({ retoId: r.id, nombre: r.nombre, pendientes: porReto.get(r.id) ?? 0 }));
      return {
        puedeRevisar: mios.length > 0,
        total: items.reduce((s, i) => s + i.pendientes, 0),
        items,
      };
    });
  }

  /**
   * Toma la siguiente `en_revision` (la más vieja) de mis retos que nadie tenga tomada, con
   * `SKIP LOCKED`: dos revisores a la vez nunca reciben la misma. `null`: no hay.
   */
  next(contexto: ContextoEvento, retoId?: string): Promise<FotoParaRevisar | null> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const mios = (await this.listMisRetos(tx, contexto)).map((r) => r.id);
      const elegibles = retoId ? mios.filter((id) => id === retoId) : mios;
      if (elegibles.length === 0) return null;
      const ahora = this.reloj.now();
      const [envio] = await tx
        .select()
        .from(enviosFoto)
        .where(
          and(
            inArray(enviosFoto.retoId, elegibles),
            eq(enviosFoto.estado, 'en_revision'),
            or(
              isNull(enviosFoto.tomadaPor),
              eq(enviosFoto.tomadaPor, contexto.usuarioId),
              lt(enviosFoto.tomadaHasta, ahora),
            ),
          ),
        )
        .orderBy(asc(enviosFoto.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });
      if (!envio) return null;
      await tx
        .update(enviosFoto)
        .set({ tomadaPor: contexto.usuarioId, tomadaHasta: new Date(ahora.getTime() + TOMA_MS) })
        .where(eq(enviosFoto.id, envio.id));
      const [datos] = await tx
        .select({
          reto: retos.nombre,
          puntos: retos.puntos,
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
        })
        .from(retos)
        .innerJoin(asistentes, eq(asistentes.id, envio.asistenteId))
        .where(eq(retos.id, envio.retoId));
      const anteriores = await tx
        .select({ motivo: enviosFoto.motivoRechazo })
        .from(enviosFoto)
        .where(
          and(
            eq(enviosFoto.retoId, envio.retoId),
            eq(enviosFoto.asistenteId, envio.asistenteId),
            ne(enviosFoto.id, envio.id),
            eq(enviosFoto.estado, 'rechazada'),
          ),
        )
        .orderBy(asc(enviosFoto.intento));
      return {
        envio: { id: envio.id, retoId: envio.retoId, reto: datos?.reto ?? '' },
        foto: { url1200: `/api/v1/fotos/${envio.id}/imagen/1200` },
        asistente: { nombre: datos?.nombre ?? '', codigo: datos?.codigo ?? '' },
        intento: envio.intento,
        intentosAnteriores: anteriores,
        origen: envio.origen,
        autorizaUso: envio.autorizaUso && !envio.autorizaUsoRetiradaAt,
        enviadaAt: envio.createdAt.toISOString(),
        puntos: datos?.puntos ?? 0,
      };
    });
  }

  /** Aprobar: los puntos con el tope, las veces por persona y el tope por persona del libro. */
  approve(contexto: ContextoEvento, id: string, pedido: Pedido): Promise<ResultadoRevision> {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(
        tx,
        `equipo:${contexto.usuarioId}`,
        pedido,
        async () => {
          const envio = await this.lockParaDecidir(tx, contexto, id);
          const nombre = await this.getNombre(tx, envio.asistenteId);
          const ahora = this.reloj.now();
          let movimiento;
          try {
            movimiento = await tx.transaction((sub) =>
              this.libro.addMovimiento(sub, {
                eventoId: contexto.eventoId,
                asistenteId: envio.asistenteId,
                tipo: 'reto',
                retoId: envio.retoId,
                origen: 'equipo',
                autorId: contexto.usuarioId,
              }),
            );
          } catch (error) {
            if (error instanceof AppError && error.code === 'TOPE_ALCANZADO') {
              // Agotado: esta y todas las pendientes del reto se rechazan (*Agotado*).
              await this.rejectAgotadas(tx, contexto, envio.retoId);
              return { estado: 'rechazada' as const, motivo: 'agotado', asistente: nombre };
            }
            if (error instanceof AppError && error.code === 'RETO_YA_COMPLETADO') {
              await this.decide(tx, contexto, envio, 'rechazada', 'repetida', null);
              return { estado: 'rechazada' as const, motivo: 'repetida', asistente: nombre };
            }
            throw error;
          }
          await tx
            .update(enviosFoto)
            .set({
              estado: 'aprobada',
              revisadaPor: contexto.usuarioId,
              revisadaAt: ahora,
              movimientoId: movimiento.movimiento.id,
              tomadaPor: null,
              tomadaHasta: null,
              updatedAt: ahora,
            })
            .where(eq(enviosFoto.id, envio.id));
          await this.notify(tx, envio, 'aprobada', { puntos: movimiento.movimiento.puntos });
          await this.bitacora.record(tx, {
            actor: toActor(contexto),
            accion: 'foto.aprobar',
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            objeto: { tipo: 'envio_foto', id: envio.id, nombre },
            despues: { retoId: envio.retoId, puntos: movimiento.movimiento.puntos },
          });
          return {
            estado: 'aprobada' as const,
            puntos: movimiento.movimiento.puntos,
            asistente: nombre,
          };
        },
        200,
      ),
    );
  }

  /** Rechazar con un motivo (lo ve la persona). *Inapropiada* oculta la foto y crea una alerta. */
  reject(
    contexto: ContextoEvento,
    id: string,
    datos: { motivo: Exclude<MotivoRechazoFoto, 'agotado'>; nota?: string | undefined },
  ): Promise<ResultadoRevision> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const envio = await this.lockParaDecidir(tx, contexto, id);
      const nombre = await this.getNombre(tx, envio.asistenteId);
      await this.decide(tx, contexto, envio, 'rechazada', datos.motivo, datos.nota ?? null);
      if (datos.motivo === 'inapropiada') {
        await raiseAlerta(tx, contexto.organizacionId, {
          eventoId: contexto.eventoId,
          tipo: 'foto_inapropiada',
          asistenteId: envio.asistenteId,
          datos: { envioId: envio.id, retoId: envio.retoId },
          clave: `foto_inapropiada:${envio.id}`,
        });
      }
      return {
        estado: 'rechazada',
        motivo: datos.motivo === 'otro' ? (datos.nota ?? 'otro') : datos.motivo,
        asistente: nombre,
      };
    });
  }

  /** Suelta la toma al cerrar la pantalla. */
  release(contexto: ContextoEvento, id: string): Promise<void> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await tx
        .update(enviosFoto)
        .set({ tomadaPor: null, tomadaHasta: null })
        .where(
          and(
            eq(enviosFoto.id, id),
            eq(enviosFoto.eventoId, contexto.eventoId),
            eq(enviosFoto.tomadaPor, contexto.usuarioId),
          ),
        );
    });
  }

  /** Deshacer una aprobación (D y C): anula el movimiento (HU-317). */
  cancel(contexto: ContextoEvento, id: string, motivo: string, pedido: Pedido) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(
        tx,
        `equipo:${contexto.usuarioId}`,
        pedido,
        async () => {
          const [envio] = await tx
            .select()
            .from(enviosFoto)
            .where(and(eq(enviosFoto.id, id), eq(enviosFoto.eventoId, contexto.eventoId)))
            .for('update');
          if (!envio) throw new AppError('NO_ENCONTRADO');
          if (envio.estado !== 'aprobada' || !envio.movimientoId) {
            throw new AppError('VALIDACION', { detail: 'Solo se deshace una foto aprobada.' });
          }
          await this.anulaciones.cancelMovimiento(tx, {
            movimientoId: envio.movimientoId,
            autorId: contexto.usuarioId,
            motivo,
          });
          await tx
            .update(enviosFoto)
            .set({ estado: 'anulada', updatedAt: this.reloj.now() })
            .where(eq(enviosFoto.id, id));
          await this.notify(tx, envio, 'anulada', {});
          await this.bitacora.record(tx, {
            actor: toActor(contexto),
            accion: 'foto.anular',
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            objeto: {
              tipo: 'envio_foto',
              id,
              nombre: await this.getNombre(tx, envio.asistenteId),
            },
            despues: { motivo },
          });
          return { estado: 'anulada' as const };
        },
        200,
      ),
    );
  }

  /**
   * La imagen, para quien revisa ese reto (y dueño y coorganizadores). Una inapropiada, solo D y
   * C. Nunca con caché pública.
   */
  async open(contexto: ContextoEvento, id: string, variante: VarianteImagen) {
    const relativa = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [fila] = await tx
        .select({
          envio: enviosFoto,
          variantes: archivos.variantes,
          estadoArchivo: archivos.estado,
        })
        .from(enviosFoto)
        .innerJoin(archivos, eq(archivos.id, enviosFoto.archivoId))
        .where(and(eq(enviosFoto.id, id), eq(enviosFoto.eventoId, contexto.eventoId)));
      if (!fila || fila.estadoArchivo !== 'aprobado') throw new AppError('FOTO_NO_DISPONIBLE');
      const todos = canDo(contexto.rol, 'fotos.review');
      if (!todos) {
        const mios = (await this.listMisRetos(tx, contexto)).map((r) => r.id);
        if (!mios.includes(fila.envio.retoId) || fila.envio.motivoRechazo === 'inapropiada') {
          throw new AppError('FOTO_NO_DISPONIBLE');
        }
      }
      return (fila.variantes as Partial<Record<VarianteImagen, string>> | null)?.[variante] ?? null;
    });
    if (!relativa) throw new AppError('FOTO_NO_DISPONIBLE');
    const carpeta = resolve(this.archivosDir, 'eventos');
    const ruta = normalize(resolve(this.archivosDir, relativa));
    if (!ruta.startsWith(carpeta + sep)) throw new AppError('FOTO_NO_DISPONIBLE');
    const { size } = await stat(ruta).catch(() => {
      throw new AppError('FOTO_NO_DISPONIBLE');
    });
    return { stream: createReadStream(ruta), tamano: size };
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  /** Los retos con foto que revisa esta persona: todos (D y C) o los suyos (responsable). */
  async listMisRetos(tx: Tx, contexto: ContextoEvento): Promise<{ id: string; nombre: string }[]> {
    if (canDo(contexto.rol, 'fotos.review')) {
      return tx
        .select({ id: retos.id, nombre: retos.nombre })
        .from(retos)
        .where(and(eq(retos.eventoId, contexto.eventoId), eq(retos.tipo, 'foto')))
        .orderBy(asc(retos.numero));
    }
    if (!contexto.miembroId) return [];
    return tx
      .select({ id: retos.id, nombre: retos.nombre })
      .from(retoResponsables)
      .innerJoin(retos, eq(retos.id, retoResponsables.retoId))
      .where(
        and(
          eq(retoResponsables.miembroId, contexto.miembroId),
          eq(retos.eventoId, contexto.eventoId),
        ),
      )
      .orderBy(asc(retos.numero));
  }

  /** La foto bloqueada, de mis retos, en revisión y tomada por mí (o con la toma vencida). */
  private async lockParaDecidir(tx: Tx, contexto: ContextoEvento, id: string): Promise<Envio> {
    const [envio] = await tx
      .select()
      .from(enviosFoto)
      .where(and(eq(enviosFoto.id, id), eq(enviosFoto.eventoId, contexto.eventoId)))
      .for('update');
    const mios = (await this.listMisRetos(tx, contexto)).map((r) => r.id);
    if (!envio || !mios.includes(envio.retoId)) throw new AppError('FOTO_NO_DISPONIBLE');
    if (envio.estado !== 'en_revision') throw new AppError('FOTO_YA_REVISADA');
    const ahora = this.reloj.now();
    const deOtro =
      envio.tomadaPor !== null &&
      envio.tomadaPor !== contexto.usuarioId &&
      envio.tomadaHasta !== null &&
      envio.tomadaHasta > ahora;
    if (deOtro) throw new AppError('FOTO_YA_TOMADA');
    return envio;
  }

  private async decide(
    tx: Tx,
    contexto: ContextoEvento,
    envio: Envio,
    estado: 'rechazada',
    motivo: MotivoRechazoFoto,
    nota: string | null,
  ): Promise<void> {
    const ahora = this.reloj.now();
    const texto = motivo === 'otro' && nota ? nota : MOTIVOS_RECHAZO_FOTO[motivo];
    await tx
      .update(enviosFoto)
      .set({
        estado,
        // `inapropiada` queda como código: así se oculta la foto.
        motivoRechazo: motivo === 'inapropiada' ? 'inapropiada' : texto,
        nota,
        revisadaPor: contexto.usuarioId,
        revisadaAt: ahora,
        tomadaPor: null,
        tomadaHasta: null,
        updatedAt: ahora,
      })
      .where(eq(enviosFoto.id, envio.id));
    await this.notify(tx, envio, estado, { motivo: texto });
    await this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion: 'foto.rechazar',
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: {
        tipo: 'envio_foto',
        id: envio.id,
        nombre: await this.getNombre(tx, envio.asistenteId),
      },
      despues: { retoId: envio.retoId, motivo, ...(nota ? { nota } : {}) },
    });
  }

  /** Con el tope alcanzado, todas las pendientes del reto pasan a *Agotado*. */
  private async rejectAgotadas(tx: Tx, contexto: ContextoEvento, retoId: string): Promise<void> {
    const pendientes = await tx
      .select()
      .from(enviosFoto)
      .where(
        and(
          eq(enviosFoto.retoId, retoId),
          sql`${enviosFoto.estado} in ('recibida', 'en_revision')`,
        ),
      )
      .orderBy(desc(enviosFoto.createdAt))
      .for('update');
    for (const envio of pendientes) {
      await this.decide(tx, contexto, envio, 'rechazada', 'agotado', null);
    }
  }

  /** La persona lo ve en su reto, en vivo (`foto.revisada`, T-301). */
  private async notify(
    tx: Tx,
    envio: Envio,
    estado: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'foto.revisada',
      eventoId: envio.eventoId,
      payload: {
        eventoId: envio.eventoId,
        asistenteId: envio.asistenteId,
        envioId: envio.id,
        retoId: envio.retoId,
        estado,
        ...extra,
      },
    });
  }

  private async getNombre(tx: Tx, asistenteId: string): Promise<string> {
    const [fila] = await tx
      .select({ nombre: asistentes.nombre })
      .from(asistentes)
      .where(eq(asistentes.id, asistenteId));
    return getNombreCorto(fila?.nombre ?? null) ?? '';
  }
}
