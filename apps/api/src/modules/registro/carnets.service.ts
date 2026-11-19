import { createHmac, randomBytes } from 'node:crypto';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  asistentes,
  eventos,
  miembrosEvento,
  movimientos,
  participaciones,
  saldos,
  usuarios,
  withOrganizacion,
  type Cifrador,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, canDo, getCiUltimos, maskCi, normalizeCi } from '@pasitos/dominio';
import type { LibroService } from '@pasitos/libro';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { verifyQrEntrada } from '../acceso/entrada';
import type { FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import type { RegistroTecnicoService } from '../acceso/registro-tecnico';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { AnulacionesService } from '../movimientos/anulaciones.service';
import { getNombreCorto, type CheckInService } from '../puerta/check-in.service';

type Pedido = Pick<FirmaVerificada, 'clave' | 'hashCuerpo' | 'ruta'>;

/**
 * La ficha para verificar (HU-321 §3): el carnet **completo** que escribió la persona, para
 * compararlo con el físico. Verlo aquí no deja bitácora: es el flujo previsto.
 */
export interface FichaCarnet {
  readonly id: string;
  readonly nombre: string;
  readonly codigo: string;
  readonly ci: string | null;
  readonly presente: boolean;
  readonly verificacion: { readonly at: string; readonly por: string | null } | null;
}

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

function isCarnetRepetido(error: unknown): boolean {
  const causa = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return causa.code === '23505' && causa.constraint === 'asistentes_ci_verificado';
}

/**
 * Verificar el carnet (HU-321): comparar el físico con el que escribió la persona, corregirlo si
 * hace falta y verificarlo, con los puntos de su reto. **El mismo carnet no se verifica en dos
 * cuentas:** el hash del número normalizado es único en el evento. El carnet nunca va a los logs
 * ni a los mensajes de error.
 */
export class CarnetsService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly cifrador: Cifrador,
    private readonly libro: LibroService,
    private readonly anulaciones: AnulacionesService,
    private readonly checkIn: CheckInService,
    private readonly registro: RegistroTecnicoService,
    private readonly reloj: Reloj,
  ) {}

  /** Por *Mi entrada* (una ficha) o por nombre o código (hasta 10). */
  search(
    contexto: ContextoEvento,
    criterio: { qr?: string | undefined; q?: string | undefined },
  ): Promise<{ items: FichaCarnet[] }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await this.checkVerifica(tx, contexto);
      if (criterio.qr) {
        const [evento] = await tx
          .select({ llave: eventos.llaveEntradas })
          .from(eventos)
          .where(eq(eventos.id, contexto.eventoId));
        if (!evento) throw new AppError('NO_ENCONTRADO');
        const leido = verifyQrEntrada(evento.llave, criterio.qr, this.reloj.now().getTime());
        if (!leido.valido) {
          throw new AppError(leido.motivo === 'vencido' ? 'QR_ASISTENTE_VENCIDO' : 'QR_INVALIDO', {
            detail:
              leido.motivo === 'vencido'
                ? 'Pídele que abra Mi entrada de nuevo.'
                : 'Este QR no es la entrada de este evento.',
          });
        }
        return { items: [await this.getFicha(tx, contexto, leido.asistenteId)] };
      }
      const q = (criterio.q ?? '').trim();
      const filas = await tx
        .select({ id: asistentes.id })
        .from(asistentes)
        .where(
          and(
            eq(asistentes.eventoId, contexto.eventoId),
            or(
              eq(asistentes.codigoAsistente, q.toUpperCase()),
              q.length >= 3
                ? ilike(asistentes.nombre, `%${q.replace(/[\\%_]/g, '\\$&')}%`)
                : sql`false`,
            ),
          ),
        )
        .orderBy(asistentes.nombre)
        .limit(10);
      return {
        items: await Promise.all(filas.map((f) => this.getFicha(tx, contexto, f.id))),
      };
    });
  }

  /** Verificar (con `ci`, primero se corrige). Suma los puntos de su reto una sola vez. */
  async verify(
    contexto: ContextoEvento,
    asistenteId: string,
    datos: { ci?: string | undefined },
    pedido: Pedido,
  ): Promise<{ ficha: FichaCarnet; puntos: number; saldo: number }> {
    const choque: { otro?: { id: string; codigo: string; nombre: string; at: Date | null } } = {};
    try {
      return await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
        runIdempotente(tx, `equipo:${contexto.usuarioId}`, pedido, async () => {
          await this.checkVerifica(tx, contexto);
          const evento = await this.lockEvento(tx, contexto);
          if (!evento.verificacionCiActiva || !evento.retoVerificacionId) {
            throw new AppError('VERIFICACION_CI_INACTIVA');
          }
          if (evento.estado !== 'publicado' && evento.estado !== 'en_curso') {
            throw new AppError('EVENTO_NO_ACTIVO');
          }
          const [persona] = await tx
            .select()
            .from(asistentes)
            .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)))
            .for('update');
          if (!persona) throw new AppError('NO_ENCONTRADO');
          if (persona.ciVerificadoAt) throw new AppError('CI_YA_VERIFICADO');
          const escrito = persona.ciCifrado ? this.cifrador.decryptTexto(persona.ciCifrado) : null;
          const ci = datos.ci ?? escrito;
          if (!ci) throw errorCampo('ci', 'Escribe el carnet tal como está en el documento.');
          const corregido = datos.ci !== undefined && datos.ci !== escrito;
          const hash = createHmac('sha256', this.getLlave(evento.llaveCarnetsCifrada))
            .update(normalizeCi(ci), 'utf8')
            .digest();
          const ahora = this.reloj.now();
          try {
            await tx.transaction((sub) =>
              sub
                .update(asistentes)
                .set({
                  ...(corregido
                    ? { ciCifrado: this.cifrador.encrypt(ci), ciUltimos: getCiUltimos(ci) }
                    : {}),
                  ciHashVerificado: hash,
                  ciVerificadoAt: ahora,
                  ciVerificadoPor: contexto.usuarioId,
                  updatedAt: ahora,
                })
                .where(eq(asistentes.id, asistenteId)),
            );
          } catch (error) {
            if (!isCarnetRepetido(error)) throw error;
            const [otro] = await tx
              .select({
                id: asistentes.id,
                codigo: asistentes.codigoAsistente,
                nombre: asistentes.nombre,
                at: asistentes.ciVerificadoAt,
              })
              .from(asistentes)
              .where(
                and(
                  eq(asistentes.eventoId, contexto.eventoId),
                  eq(asistentes.ciHashVerificado, hash),
                ),
              );
            if (otro) choque.otro = otro;
            throw new AppError('CI_VERIFICADO_EN_OTRA_CUENTA', {
              meta: {
                codigo: otro?.codigo ?? null,
                nombre: getNombreCorto(otro?.nombre ?? null),
                at: otro?.at?.toISOString() ?? null,
              },
            });
          }
          // Los puntos del reto, con su tope, como cualquier reto otorgado por el equipo. Si ya los
          // ganó (se deshizo y se vuelve a verificar), no se repiten: el reto es una vez por persona,
          // también en el contrato.
          const [previa] = await tx
            .select({ id: participaciones.id })
            .from(participaciones)
            .where(
              and(
                eq(participaciones.retoId, evento.retoVerificacionId),
                eq(participaciones.asistenteId, asistenteId),
              ),
            )
            .limit(1);
          const ganado = previa
            ? null
            : await this.libro.addMovimiento(tx, {
                eventoId: contexto.eventoId,
                asistenteId,
                tipo: 'reto',
                retoId: evento.retoVerificacionId,
                origen: 'equipo',
                autorId: contexto.usuarioId,
              });
          const puntosGanados = ganado?.movimiento.puntos ?? 0;
          let saldo = ganado?.saldo ?? (await this.getSaldo(tx, asistenteId));
          // Ajuste 9: si no estaba presente y el evento lo pide, el check-in en el mismo paso.
          if (evento.retosRequierenCheckIn && !(await this.checkIn.findActivo(tx, asistenteId))) {
            const hecho = await this.checkIn.register(tx, {
              organizacionId: contexto.organizacionId,
              eventoId: contexto.eventoId,
              asistenteId,
              metodo: 'verificacion_ci',
              registradorId: contexto.usuarioId,
              actor: toActor(contexto),
            });
            saldo = hecho.saldo;
          }
          await this.bitacora.record(tx, {
            actor: toActor(contexto),
            accion: 'ci.verify',
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            objeto: { tipo: 'asistente', id: asistenteId, nombre: persona.nombre },
            // Corregido: el anterior y el nuevo, enmascarados.
            ...(corregido
              ? {
                  antes: { carnet: maskCi(persona.ciUltimos) },
                  despues: { carnet: maskCi(getCiUltimos(ci)), puntos: puntosGanados },
                }
              : { despues: { puntos: puntosGanados } }),
          });
          return {
            ficha: await this.getFicha(tx, contexto, asistenteId),
            puntos: puntosGanados,
            saldo,
          };
        }),
      );
    } catch (error) {
      // A10: el mismo carnet en otra cuenta. Aparte: la transacción del intento se deshizo.
      if (
        error instanceof AppError &&
        error.code === 'CI_VERIFICADO_EN_OTRA_CUENTA' &&
        choque.otro
      ) {
        await this.registro.recordAparte(
          contexto.organizacionId,
          {
            eventoId: contexto.eventoId,
            asistenteId,
            momento: 'intento_fallido',
            resultado: 'rechazado',
            motivo: 'ci_verificado_en_otra_cuenta',
          },
          {
            eventoId: contexto.eventoId,
            tipo: 'A10',
            asistenteId,
            datos: { otroAsistenteId: choque.otro.id },
            clave: `A10:${asistenteId}:${choque.otro.id}`,
          },
        );
      }
      throw error;
    }
  }

  /** *No coincide*: es otra persona. Queda la nota; no cambia nada más. */
  reject(contexto: ContextoEvento, asistenteId: string, nota: string): Promise<FichaCarnet> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await this.checkVerifica(tx, contexto);
      const ficha = await this.getFicha(tx, contexto, asistenteId);
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'ci.reject',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'asistente', id: asistenteId, nombre: ficha.nombre },
        despues: { nota },
      });
      return ficha;
    });
  }

  /** Deshacer (D y C): anula los puntos (HU-317) y desbloquea el carnet. */
  cancel(
    contexto: ContextoEvento,
    asistenteId: string,
    motivo: string,
    pedido: Pedido,
  ): Promise<FichaCarnet> {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(
        tx,
        `equipo:${contexto.usuarioId}`,
        pedido,
        async () => {
          const evento = await this.lockEvento(tx, contexto);
          const [persona] = await tx
            .select({ id: asistentes.id, nombre: asistentes.nombre, at: asistentes.ciVerificadoAt })
            .from(asistentes)
            .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)))
            .for('update');
          if (!persona) throw new AppError('NO_ENCONTRADO');
          if (!persona.at) {
            throw new AppError('VALIDACION', { detail: 'Este carnet no está verificado.' });
          }
          if (evento.retoVerificacionId) {
            const [movimiento] = await tx
              .select({ id: movimientos.id })
              .from(movimientos)
              .where(
                and(
                  eq(movimientos.asistenteId, asistenteId),
                  eq(movimientos.retoId, evento.retoVerificacionId),
                  isNull(movimientos.anulaMovimientoId),
                  sql`not exists (select 1 from movimientos a where a.anula_movimiento_id = ${movimientos.id})`,
                ),
              )
              .orderBy(desc(movimientos.id))
              .limit(1);
            if (movimiento) {
              await this.anulaciones.cancelMovimiento(tx, {
                movimientoId: movimiento.id,
                autorId: contexto.usuarioId,
                motivo,
              });
            }
          }
          await tx
            .update(asistentes)
            .set({
              ciHashVerificado: null,
              ciVerificadoAt: null,
              ciVerificadoPor: null,
              updatedAt: this.reloj.now(),
            })
            .where(eq(asistentes.id, asistenteId));
          await this.bitacora.record(tx, {
            actor: toActor(contexto),
            accion: 'ci.unverify',
            organizacionId: contexto.organizacionId,
            eventoId: contexto.eventoId,
            objeto: { tipo: 'asistente', id: asistenteId, nombre: persona.nombre },
            despues: { motivo },
          });
          return this.getFicha(tx, contexto, asistenteId);
        },
        200,
      ),
    );
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  /** D, C y R por la matriz; además, quien tenga *Verifica carnets*. */
  private async checkVerifica(tx: Tx, contexto: ContextoEvento): Promise<void> {
    if (canDo(contexto.rol, 'ci.verify')) return;
    if (contexto.miembroId) {
      const [miembro] = await tx
        .select({ verificaCi: miembrosEvento.verificaCi })
        .from(miembrosEvento)
        .where(eq(miembrosEvento.id, contexto.miembroId));
      if (miembro?.verificaCi) return;
    }
    throw new AppError('NO_VERIFICA_CI');
  }

  private async lockEvento(tx: Tx, contexto: ContextoEvento) {
    const [evento] = await tx
      .select({
        estado: eventos.estado,
        verificacionCiActiva: eventos.verificacionCiActiva,
        retoVerificacionId: eventos.retoVerificacionId,
        retosRequierenCheckIn: eventos.retosRequierenCheckIn,
        llaveCarnetsCifrada: eventos.llaveCarnetsCifrada,
      })
      .from(eventos)
      .where(eq(eventos.id, contexto.eventoId))
      .for('update');
    if (!evento) throw new AppError('NO_ENCONTRADO');
    if (evento.estado === 'cerrado') throw new AppError('EVENTO_CERRADO');
    if (!evento.llaveCarnetsCifrada) {
      // La llave de los carnets del evento se crea la primera vez (cifrada con la de datos).
      const cifrada = this.cifrador.encrypt(randomBytes(32));
      await tx
        .update(eventos)
        .set({ llaveCarnetsCifrada: cifrada })
        .where(eq(eventos.id, contexto.eventoId));
      return { ...evento, llaveCarnetsCifrada: cifrada };
    }
    return evento;
  }

  private async getSaldo(tx: Tx, asistenteId: string): Promise<number> {
    const [fila] = await tx
      .select({ puntos: saldos.puntos })
      .from(saldos)
      .where(eq(saldos.asistenteId, asistenteId));
    return fila?.puntos ?? 0;
  }

  private getLlave(cifrada: Buffer | null): Buffer {
    if (!cifrada) throw new AppError('SERVICIO_NO_DISPONIBLE');
    return this.cifrador.decrypt(cifrada);
  }

  private async getFicha(
    tx: Tx,
    contexto: ContextoEvento,
    asistenteId: string,
  ): Promise<FichaCarnet> {
    const [fila] = await tx
      .select({
        id: asistentes.id,
        nombre: asistentes.nombre,
        codigo: asistentes.codigoAsistente,
        estado: asistentes.estado,
        ci: asistentes.ciCifrado,
        at: asistentes.ciVerificadoAt,
        por: usuarios.nombre,
      })
      .from(asistentes)
      .leftJoin(usuarios, eq(usuarios.id, asistentes.ciVerificadoPor))
      .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)));
    if (!fila) throw new AppError('NO_ENCONTRADO');
    return {
      id: fila.id,
      nombre: fila.nombre,
      codigo: fila.codigo,
      ci: fila.ci ? this.cifrador.decryptTexto(fila.ci) : null,
      presente: fila.estado === 'presente',
      verificacion: fila.at ? { at: fila.at.toISOString(), por: getNombreCorto(fila.por) } : null,
    };
  }
}
