import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import {
  canjeItems,
  canjes,
  dispositivos,
  enviosCorreo,
  eventos,
  invitaciones,
  outbox,
  premios,
  qrRegistro,
  registrosTecnicos,
  saldos,
  sessions,
  tokens,
  vinculaciones,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { canTransicion } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import { LibroService } from './libro.service';

/** Los datos técnicos y las sesiones de los asistentes viven 30 días después del cierre (D43). */
const DIAS_DESPUES_DEL_CIERRE = 30;
const LOTE_VENCIMIENTOS = 500;

export type OrigenCierre = 'dueno' | 'programado' | 'automatico';

export interface OpcionesCierre {
  readonly eventoId: string;
  /** Quién cerró: el dueño, o `null` si lo cerró Pasitos (programado o automático). */
  readonly cerradoPor: string | null;
  readonly origen: OrigenCierre;
  readonly ahora: Date;
}

export interface ResultadoCierre {
  readonly eventoId: string;
  readonly organizacionId: string;
  readonly nombre: string;
  readonly estadoAnterior: string;
  readonly vencimientos: number;
  readonly puntosVencidos: number;
  readonly cobrosCancelados: number;
}

/**
 * Cierra el evento (HU-401 §3), dentro de la transacción de quien llama (el API, con RLS, o el
 * trabajador, con la conexión de sistema). Bloquea el evento: dos cierres a la vez, el segundo
 * recibe `TRANSICION_NO_PERMITIDA`. No escribe la bitácora: cada lado lo hace con su actor.
 */
export async function closeEvento(
  tx: Tx,
  opciones: OpcionesCierre,
  libro: LibroService = new LibroService(),
): Promise<ResultadoCierre> {
  const { eventoId, ahora } = opciones;
  // 1. El evento, bloqueado.
  const [evento] = await tx.select().from(eventos).where(eq(eventos.id, eventoId)).for('update');
  if (!evento) throw new AppError('NO_ENCONTRADO');
  if (!canTransicion(evento.estado, 'cerrar')) {
    throw new AppError('TRANSICION_NO_PERMITIDA', { meta: { estado: evento.estado } });
  }
  if (evento.estado === 'publicado' && !evento.contratoId) {
    throw new AppError('EVENTO_SIN_CONTRATO');
  }

  // 2. El estado. Desde aquí, el guard responde EVENTO_CERRADO a lo que escribe.
  await tx
    .update(eventos)
    .set({
      estado: 'cerrado',
      cerradoAt: ahora,
      cerradoPor: opciones.cerradoPor,
      cierreEstado: 'sellando',
      updatedAt: ahora,
    })
    .where(eq(eventos.id, eventoId));

  // 3. Los cobros pendientes se cancelan y su stock vuelve (canje → premios, como la mesa).
  const pendientes = await tx
    .select({ id: canjes.id, mesaId: canjes.mesaId, comprobante: canjes.comprobante })
    .from(canjes)
    .where(and(eq(canjes.eventoId, eventoId), eq(canjes.estado, 'pendiente')))
    .orderBy(asc(canjes.id))
    .for('update');
  for (const canje of pendientes) {
    const items = await tx
      .select({ premioId: canjeItems.premioId, cantidad: canjeItems.cantidad })
      .from(canjeItems)
      .where(eq(canjeItems.canjeId, canje.id))
      .orderBy(asc(canjeItems.premioId));
    for (const item of items) {
      await tx
        .update(premios)
        .set({ stockReservado: sql`${premios.stockReservado} - ${item.cantidad}` })
        .where(eq(premios.id, item.premioId));
    }
    await tx
      .update(canjes)
      .set({ estado: 'cancelado', canceladoAt: ahora, canceladoPorCierre: true })
      .where(eq(canjes.id, canje.id));
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'canje.cancelado',
      eventoId,
      payload: {
        eventoId,
        mesaId: canje.mesaId,
        canjeId: canje.id,
        comprobante: canje.comprobante,
      },
    });
  }

  // 4. Los puntos sin usar vencen: un movimiento por persona con saldo, por todo su saldo.
  let vencimientos = 0;
  let puntosVencidos = 0;
  for (;;) {
    const conSaldo = await tx
      .select({ asistenteId: saldos.asistenteId, puntos: saldos.puntos })
      .from(saldos)
      .where(and(eq(saldos.eventoId, eventoId), gt(saldos.puntos, 0)))
      .orderBy(asc(saldos.asistenteId))
      .limit(LOTE_VENCIMIENTOS);
    if (conSaldo.length === 0) break;
    for (const fila of conSaldo) {
      await libro.addMovimiento(tx, {
        eventoId,
        asistenteId: fila.asistenteId,
        tipo: 'vencimiento',
        origen: 'sistema',
        puntos: -fila.puntos,
      });
      vencimientos += 1;
      puntosVencidos += fila.puntos;
    }
  }

  // 5. Los accesos que quedaban abiertos.
  const vencidas = await tx
    .update(invitaciones)
    .set({ estado: 'vencida' })
    .where(
      and(
        eq(invitaciones.eventoId, eventoId),
        inArray(invitaciones.estado, ['creada', 'enviada', 'rebotada']),
      ),
    )
    .returning({ id: invitaciones.id });
  if (vencidas.length > 0) {
    await tx
      .update(enviosCorreo)
      .set({ estado: 'cancelado' })
      .where(
        and(
          eq(enviosCorreo.estado, 'en_cola'),
          inArray(
            enviosCorreo.refId,
            vencidas.map((v) => v.id),
          ),
        ),
      );
  }
  await tx
    .update(tokens)
    .set({ revocadoAt: ahora })
    .where(
      and(
        eq(tokens.eventoId, eventoId),
        inArray(tokens.proposito, ['qr_asistente', 'enlace_corto_asistente']),
        isNull(tokens.usadoAt),
        isNull(tokens.revocadoAt),
      ),
    );
  await tx
    .update(qrRegistro)
    .set({ estado: 'invalidado' })
    .where(and(eq(qrRegistro.eventoId, eventoId), eq(qrRegistro.estado, 'activo')));

  // 6. Los 30 días de los datos del dispositivo cuentan desde el cierre (HU-409, ajuste 1).
  const borrarAt = new Date(ahora.getTime() + DIAS_DESPUES_DEL_CIERRE * 86_400_000);
  await tx.update(dispositivos).set({ borrarAt }).where(eq(dispositivos.eventoId, eventoId));
  await tx
    .update(registrosTecnicos)
    .set({ borrarAt })
    .where(eq(registrosTecnicos.eventoId, eventoId));
  await tx
    .update(sessions)
    .set({ expiraAt: borrarAt })
    .where(
      and(
        isNull(sessions.revocadaAt),
        inArray(
          sessions.vinculacionId,
          tx
            .select({ id: vinculaciones.id })
            .from(vinculaciones)
            .where(eq(vinculaciones.eventoId, eventoId)),
        ),
      ),
    );

  // 7. El aviso en vivo y, con él, el cierre en Stellar (`close-contrato`).
  await tx.insert(outbox).values({
    id: uuidv7(),
    tipo: 'evento.cerrado',
    eventoId,
    payload: { eventoId, origen: opciones.origen },
  });

  return {
    eventoId,
    organizacionId: evento.organizacionId,
    nombre: evento.nombre,
    estadoAnterior: evento.estado,
    vencimientos,
    puntosVencidos,
    cobrosCancelados: pendientes.length,
  };
}
