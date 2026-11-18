import { and, desc, eq } from 'drizzle-orm';
import {
  asistentes,
  escaneos,
  eventos,
  outbox,
  pantallas,
  participaciones,
  retos,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, type CodigoError } from '@pasitos/dominio';
import type { LibroService } from '@pasitos/libro';
import {
  getFranjaQr,
  importLlavePublica,
  parseQrReto,
  verifyQrReto,
  type QrRetoLeido,
} from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import type { ContextoAsistente, FirmaVerificada } from '../../common/sesion/asistente';
import { runIdempotente } from '../acceso/idempotencia';
import { checkA5 } from '../acceso/reglas-alertas';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';

/** La franja anterior todavía vale 5 s (HU-310 §1, fila 5): el QR justo cambió al escanearlo. */
export const GRACIA_FRANJA_MS = 5_000;

export interface ReclamoAceptado {
  readonly movimientoId: string;
  readonly reto: { readonly id: string; readonly nombre: string };
  readonly puntos: number;
  readonly saldo: number;
}

/** Cómo queda cada rechazo en `escaneos`. */
const RESULTADO_POR_CODIGO: Partial<Record<CodigoError, string>> = {
  QR_INVALIDO: 'firma_invalida',
  EVENTO_NO_ACTIVO: 'evento_no_activo',
  QR_VENCIDO: 'vencido',
  QR_YA_USADO: 'ya_usado',
  RETO_NO_DISPONIBLE: 'fuera_de_horario',
  SIN_CHECK_IN: 'sin_check_in',
  RETO_YA_COMPLETADO: 'ya_completado',
  TOPE_ALCANZADO: 'agotado',
};

interface Contexto {
  pantallaId?: string;
  retoId?: string;
  leido?: QrRetoLeido;
}

/**
 * Ganar puntos con un QR (HU-310 §1): una transacción corta con las comprobaciones en orden.
 * Cada intento queda en `escaneos`; los rechazos, aparte de la transacción.
 */
export class ReclamosService {
  /** Las llaves de las pantallas, ya importadas (verificar cuesta menos de 1 ms). */
  private readonly llaves = new Map<string, { cruda: string; llave: CryptoKey }>();
  /** 30 por minuto por dispositivo. */
  private readonly limite: Limitador;

  constructor(
    private readonly db: Db,
    private readonly libro: LibroService,
    private readonly reloj: Reloj,
  ) {
    this.limite = new Limitador([{ maximo: 30, ms: 60_000 }], () => this.reloj.now().getTime());
  }

  async claim(
    asistente: ContextoAsistente,
    qr: string,
    firma: FirmaVerificada,
  ): Promise<ReclamoAceptado> {
    const inicio = Date.now();
    const espera = this.limite.hit(asistente.dispositivoId);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    const visto: Contexto = {};
    try {
      return await withOrganizacion(this.db, asistente.organizacionId, (tx) =>
        runIdempotente(tx, `asistente:${asistente.asistenteId}`, firma, () =>
          this.run(tx, asistente, qr, firma, visto, inicio),
        ),
      );
    } catch (error) {
      if (error instanceof AppError) {
        await this.recordRechazo(asistente, visto, error, Date.now() - inicio);
        throw await this.withMeta(asistente, visto, error);
      }
      throw error;
    }
  }

  private async run(
    tx: Tx,
    asistente: ContextoAsistente,
    texto: string,
    firma: FirmaVerificada,
    visto: Contexto,
    inicio: number,
  ): Promise<ReclamoAceptado> {
    // 2. El formato, la pantalla del evento y su firma.
    const leido = parseQrReto(texto);
    if (!leido) throw new AppError('QR_INVALIDO');
    visto.leido = leido;
    const [pantalla] = await tx
      .select({
        id: pantallas.id,
        epoca: pantallas.epoca,
        llave: pantallas.llavePublica,
      })
      .from(pantallas)
      .where(and(eq(pantallas.eventoId, asistente.eventoId), eq(pantallas.numero, leido.datos.p)));
    if (!pantalla?.llave) throw new AppError('QR_INVALIDO');
    visto.pantallaId = pantalla.id;
    if (!(await verifyQrReto(await this.getLlave(pantalla.id, pantalla.llave), leido))) {
      throw new AppError('QR_INVALIDO');
    }
    const [reto] = await tx
      .select({
        id: retos.id,
        nombre: retos.nombre,
        tipo: retos.tipo,
        estado: retos.estado,
        modoQr: retos.modoQr,
        rotacionSegundos: retos.rotacionSegundos,
        disponibleDesde: retos.disponibleDesde,
        disponibleHasta: retos.disponibleHasta,
      })
      .from(retos)
      .where(and(eq(retos.eventoId, asistente.eventoId), eq(retos.numero, leido.datos.r)));
    if (!reto) throw new AppError('QR_INVALIDO');
    visto.retoId = reto.id;

    // 3. El evento en curso.
    const [evento] = await tx
      .select({ estado: eventos.estado, requiereCheckIn: eventos.retosRequierenCheckIn })
      .from(eventos)
      .where(eq(eventos.id, asistente.eventoId));
    if (evento?.estado !== 'en_curso') {
      throw new AppError('EVENTO_NO_ACTIVO', {
        detail:
          evento?.estado === 'pausado'
            ? 'Pausamos un momento. Tus puntos están seguros.'
            : evento?.estado === 'cerrado'
              ? 'El evento ya cerró.'
              : 'El evento todavía no empezó.',
      });
    }

    // 4. La época actual de la pantalla.
    const ahora = this.reloj.now().getTime();
    if (leido.datos.e !== pantalla.epoca) throw new AppError('QR_VENCIDO');
    // El modo del QR tiene que ser el del reto.
    const porTiempo = leido.datos.f !== undefined;
    if (porTiempo !== (reto.modoQr === 'por_tiempo')) throw new AppError('QR_INVALIDO');
    // 5. Por tiempo: la franja actual, o la anterior dentro de la gracia.
    if (porTiempo) {
      const actual = getFranjaQr(ahora, reto.rotacionSegundos);
      const inicioActual = actual * reto.rotacionSegundos * 1000;
      const enGracia = leido.datos.f === actual - 1 && ahora - inicioActual <= GRACIA_FRANJA_MS;
      if (leido.datos.f !== actual && !enGracia) throw new AppError('QR_VENCIDO');
    }
    // 6. Un solo uso: el nonce no fue aceptado antes (también lo cuida el índice único).
    if (leido.datos.u !== undefined) {
      const [usado] = await tx
        .select({ id: escaneos.id })
        .from(escaneos)
        .where(
          and(
            eq(escaneos.pantallaId, pantalla.id),
            eq(escaneos.qrNonce, leido.datos.u),
            eq(escaneos.resultado, 'aceptado'),
          ),
        );
      if (usado) throw new AppError('QR_YA_USADO');
    }

    // 7. El reto activo, de QR y en horario.
    const fecha = new Date(ahora);
    if (reto.estado !== 'activo' || reto.tipo !== 'qr') throw new AppError('RETO_NO_DISPONIBLE');
    if (
      (reto.disponibleDesde && reto.disponibleDesde > fecha) ||
      (reto.disponibleHasta && reto.disponibleHasta <= fecha)
    ) {
      throw new AppError('RETO_NO_DISPONIBLE');
    }

    // 8. El check-in, si el evento lo pide (D30).
    if (evento.requiereCheckIn) {
      const [persona] = await tx
        .select({ estado: asistentes.estado })
        .from(asistentes)
        .where(eq(asistentes.id, asistente.asistenteId));
      if (persona?.estado !== 'presente') throw new AppError('SIN_CHECK_IN');
    }

    // 9. El libro: saldo y reto bloqueados, tope, veces por persona y tope por persona.
    const { movimiento, saldo } = await this.libro.addMovimiento(tx, {
      eventoId: asistente.eventoId,
      asistenteId: asistente.asistenteId,
      tipo: 'reto',
      origen: 'asistente',
      retoId: reto.id,
      pantallaId: pantalla.id,
      qr: {
        e: leido.datos.e,
        ...(porTiempo ? { f: leido.datos.f } : { u: leido.datos.u }),
        firma: leido.firma,
      },
      firmaDispositivo: firma.firma,
    });

    // 10. El escaneo aceptado y el contador de la pantalla (en un solo uso, con el nonce usado).
    const escaneoId = uuidv7();
    try {
      await tx.insert(escaneos).values({
        id: escaneoId,
        organizacionId: asistente.organizacionId,
        eventoId: asistente.eventoId,
        pantallaId: pantalla.id,
        retoId: reto.id,
        asistenteId: asistente.asistenteId,
        dispositivoId: asistente.dispositivoId,
        qrEpoca: leido.datos.e,
        qrFranja: leido.datos.f ?? null,
        qrNonce: leido.datos.u ?? null,
        resultado: 'aceptado',
        movimientoId: movimiento.id,
        latenciaMs: Date.now() - inicio,
      });
    } catch (error) {
      if (isNonceRepetido(error)) throw new AppError('QR_YA_USADO');
      throw error;
    }
    // HU-318: A5 si reclamó en otro lugar hace menos de 60 s.
    await checkA5(tx, {
      organizacionId: asistente.organizacionId,
      eventoId: asistente.eventoId,
      asistenteId: asistente.asistenteId,
      pantallaId: pantalla.id,
      escaneoId,
      ahora: new Date(),
    });
    const [contador] = await tx
      .select({ entregados: retos.entregados })
      .from(retos)
      .where(eq(retos.id, reto.id));
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'contador.actualizado',
      eventoId: asistente.eventoId,
      payload: {
        eventoId: asistente.eventoId,
        pantallaId: pantalla.id,
        retoId: reto.id,
        entregados: contador?.entregados ?? 0,
        ...(leido.datos.u ? { nonceUsado: leido.datos.u } : {}),
      },
    });
    return {
      movimientoId: movimiento.id,
      reto: { id: reto.id, nombre: reto.nombre },
      puntos: movimiento.puntos,
      saldo,
    };
  }

  private async getLlave(pantallaId: string, cruda: Buffer): Promise<CryptoKey> {
    const texto = cruda.toString('base64url');
    const guardada = this.llaves.get(pantallaId);
    if (guardada?.cruda === texto) return guardada.llave;
    const llave = await importLlavePublica(new Uint8Array(cruda));
    if (this.llaves.size >= 1_000) this.llaves.clear();
    this.llaves.set(pantallaId, { cruda: texto, llave });
    return llave;
  }

  /** El rechazo queda en `escaneos`, aunque la transacción se haya deshecho. */
  private async recordRechazo(
    asistente: ContextoAsistente,
    visto: Contexto,
    error: AppError,
    latenciaMs: number,
  ): Promise<void> {
    const resultado = RESULTADO_POR_CODIGO[error.code];
    if (!resultado) return;
    await withOrganizacion(this.db, asistente.organizacionId, (tx) =>
      tx.insert(escaneos).values({
        id: uuidv7(),
        organizacionId: asistente.organizacionId,
        eventoId: asistente.eventoId,
        pantallaId: visto.pantallaId ?? null,
        retoId: visto.retoId ?? null,
        asistenteId: asistente.asistenteId,
        dispositivoId: asistente.dispositivoId,
        qrEpoca: visto.leido?.datos.e ?? null,
        qrFranja: visto.leido?.datos.f ?? null,
        qrNonce: visto.leido?.datos.u ?? null,
        resultado,
        latenciaMs,
      }),
    ).catch(() => undefined);
  }

  /** Lo que la app necesita para su mensaje: cuándo lo completó o desde cuándo se puede. */
  private async withMeta(
    asistente: ContextoAsistente,
    visto: Contexto,
    error: AppError,
  ): Promise<AppError> {
    if (!visto.retoId) return error;
    const retoId = visto.retoId;
    if (error.code === 'RETO_YA_COMPLETADO') {
      const [ultima] = await withOrganizacion(this.db, asistente.organizacionId, (tx) =>
        tx
          .select({ at: participaciones.createdAt })
          .from(participaciones)
          .where(
            and(
              eq(participaciones.retoId, retoId),
              eq(participaciones.asistenteId, asistente.asistenteId),
            ),
          )
          .orderBy(desc(participaciones.createdAt))
          .limit(1),
      );
      return ultima
        ? new AppError('RETO_YA_COMPLETADO', { meta: { completadoAt: ultima.at.toISOString() } })
        : error;
    }
    if (error.code === 'RETO_NO_DISPONIBLE') {
      const [reto] = await withOrganizacion(this.db, asistente.organizacionId, (tx) =>
        tx.select({ desde: retos.disponibleDesde }).from(retos).where(eq(retos.id, retoId)),
      );
      const desde =
        reto?.desde && reto.desde.getTime() > this.reloj.now().getTime() ? reto.desde : null;
      return desde
        ? new AppError('RETO_NO_DISPONIBLE', { meta: { desde: desde.toISOString() } })
        : error;
    }
    return error;
  }
}

function isNonceRepetido(error: unknown): boolean {
  let actual: unknown = error;
  for (let i = 0; i < 4 && actual; i++) {
    const pg = actual as { code?: string; constraint?: string; cause?: unknown };
    if (pg.code === '23505' && pg.constraint === 'escaneos_nonce_aceptado') return true;
    actual = pg.cause;
  }
  return false;
}
