/**
 * Qué reto muestra una pantalla (HU-314 §2). Puro: lo usa `GET /sala/estado`.
 *
 * 1. El reto fijado por el operador (HU-315), si sigue disponible.
 * 2. Si no, el reto activo con QR del lugar de la pantalla que esté en horario.
 * 3. Si hay varios, el de inicio más reciente.
 * 4. Si ninguno está en horario, *En espera*, con el próximo.
 */
export type EstadoSala = 'activa' | 'pausada' | 'agotado' | 'espera' | 'evento_no_activo';

/** Los modos de QR del piloto: *bajo demanda* y *usos limitados* son P2. */
export const MODOS_QR_PILOTO = ['por_tiempo', 'un_uso'] as const;

export interface RetoDeSala {
  readonly id: string;
  readonly lugarId: string | null;
  readonly tipo: string;
  readonly estado: string;
  readonly modoQr: string;
  readonly disponibleDesde: Date | null;
  readonly disponibleHasta: Date | null;
  readonly entregados: number;
  readonly topeTotal: number;
}

export interface PantallaParaReto {
  readonly estado: string;
  readonly lugarId: string | null;
  /** El reto que fijó el operador (*Cambiar de reto*, HU-315). */
  readonly retoFijadoId: string | null;
}

export interface RetoElegido<T extends RetoDeSala> {
  readonly estado: EstadoSala;
  readonly reto: T | null;
  readonly proximo: T | null;
}

function isMostrable(reto: RetoDeSala): boolean {
  return (
    reto.estado === 'activo' &&
    reto.tipo === 'qr' &&
    (MODOS_QR_PILOTO as readonly string[]).includes(reto.modoQr)
  );
}

function isEnHorario(reto: RetoDeSala, ahora: Date): boolean {
  return (
    (reto.disponibleDesde === null || reto.disponibleDesde <= ahora) &&
    (reto.disponibleHasta === null || reto.disponibleHasta > ahora)
  );
}

/** Los que se pueden elegir con *Cambiar de reto* (HU-315): con QR, del lugar y en horario. */
export function listRetosElegibles<T extends RetoDeSala>(
  retos: readonly T[],
  lugarId: string | null,
  ahora: Date,
): T[] {
  return retos.filter(
    (r) => lugarId !== null && r.lugarId === lugarId && isMostrable(r) && isEnHorario(r, ahora),
  );
}

export function pickRetoDePantalla<T extends RetoDeSala>(
  pantalla: PantallaParaReto,
  retos: readonly T[],
  evento: { readonly estado: string },
  ahora: Date,
): RetoElegido<T> {
  const mostrables = retos.filter(isMostrable);
  const fijado = mostrables.find((r) => r.id === pantalla.retoFijadoId && isEnHorario(r, ahora));
  const delLugar = mostrables.filter(
    (r) => pantalla.lugarId !== null && r.lugarId === pantalla.lugarId,
  );
  const enHorario = delLugar
    .filter((r) => isEnHorario(r, ahora))
    .sort((a, b) => (b.disponibleDesde?.getTime() ?? 0) - (a.disponibleDesde?.getTime() ?? 0));
  const reto = fijado ?? enHorario[0] ?? null;
  const proximo =
    delLugar
      .filter((r) => r.disponibleDesde !== null && r.disponibleDesde > ahora && r.id !== reto?.id)
      .sort(
        (a, b) => (a.disponibleDesde?.getTime() ?? 0) - (b.disponibleDesde?.getTime() ?? 0),
      )[0] ?? null;

  if (evento.estado !== 'en_curso') return { estado: 'evento_no_activo', reto, proximo };
  if (pantalla.estado === 'pausada') return { estado: 'pausada', reto, proximo };
  if (!reto) return { estado: 'espera', reto: null, proximo };
  if (reto.entregados >= reto.topeTotal) return { estado: 'agotado', reto, proximo };
  return { estado: 'activa', reto, proximo };
}
