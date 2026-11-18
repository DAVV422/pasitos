import { eq } from 'drizzle-orm';
import { asistentes, eventos, saldos, type Tx } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';

/**
 * Lo que la app pide al abrir (`GET /app/estado`, API §5.2). Esta es la base de HU-306: quién es,
 * su saldo y el estado del evento. HU-308 suma los retos, los premios y los últimos movimientos.
 */
export interface EstadoApp {
  readonly asistente: {
    readonly codigo: string;
    readonly nombre: string;
    readonly estado: string;
  };
  readonly saldo: number;
  readonly evento: {
    readonly id: string;
    readonly nombre: string;
    readonly estado: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly nombrePuntos: string;
    readonly requiereCheckIn: boolean;
  };
}

export async function getEstadoApp(tx: Tx, asistenteId: string): Promise<EstadoApp> {
  const [fila] = await tx
    .select({
      codigo: asistentes.codigoAsistente,
      nombre: asistentes.nombre,
      estado: asistentes.estado,
      saldo: saldos.puntos,
      eventoId: eventos.id,
      evento: eventos.nombre,
      eventoEstado: eventos.estado,
      inicioAt: eventos.inicioAt,
      finAt: eventos.finAt,
      nombrePuntos: eventos.nombrePuntos,
      requiereCheckIn: eventos.retosRequierenCheckIn,
    })
    .from(asistentes)
    .innerJoin(eventos, eq(eventos.id, asistentes.eventoId))
    .leftJoin(saldos, eq(saldos.asistenteId, asistentes.id))
    .where(eq(asistentes.id, asistenteId));
  if (!fila) {
    throw new AppError('NO_ENCONTRADO');
  }
  return {
    asistente: { codigo: fila.codigo, nombre: fila.nombre, estado: fila.estado },
    saldo: fila.saldo ?? 0,
    evento: {
      id: fila.eventoId,
      nombre: fila.evento,
      estado: fila.eventoEstado,
      inicioAt: fila.inicioAt.toISOString(),
      finAt: fila.finAt.toISOString(),
      nombrePuntos: fila.nombrePuntos,
      requiereCheckIn: fila.requiereCheckIn,
    },
  };
}
