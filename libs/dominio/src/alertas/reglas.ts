/**
 * Las reglas de las alertas de trampa (HU-318 §1, Acceso §6.2). **Ninguna bloquea**: solo avisan.
 * Los umbrales viven aquí, para ajustarlos en un solo lugar.
 */
export const UMBRALES_ALERTAS = {
  /** A3: personas registradas o vinculadas por un registrador… */
  a3Personas: 15,
  /** …en esta ventana. */
  a3VentanaMs: 10 * 60 * 1000,
  /** A4: revinculaciones del mismo registrador… */
  a4PorRegistrador: 3,
  a4VentanaMs: 30 * 60 * 1000,
  /** …o del mismo asistente en todo el evento. */
  a4PorAsistente: 2,
  /** A5: reclamos en dos lugares distintos con menos de esta distancia. */
  a5VentanaMs: 60 * 1000,
  /** A6: escaneos vencidos en el minuto siguiente a un cambio de QR… */
  a6Vencidos: 10,
  a6VentanaMs: 60 * 1000,
  /** …durante tantos cambios seguidos. */
  a6Cambios: 3,
  /** A7: intentos de un dispositivo anulado. */
  a7Intentos: 3,
  /** A9 (HU-320): cuentas con la misma huella desde el mismo QR de registro… */
  a9Cuentas: 3,
  a9VentanaMs: 10 * 60 * 1000,
  /** A11 (HU-322): distancia de Hamming del hash perceptual. */
  a11DistanciaMaxima: 6,
} as const;

/** A3: más de 15 en 10 minutos. */
export function isA3(personas: number): boolean {
  return personas > UMBRALES_ALERTAS.a3Personas;
}

/** A9: 3 o más cuentas con la misma huella desde el mismo QR de registro en 10 minutos. */
export function isA9(cuentas: number): boolean {
  return cuentas >= UMBRALES_ALERTAS.a9Cuentas;
}

/** A4: más de 3 del registrador en 30 minutos, o más de 2 del mismo asistente. */
export function isA4(revinculaciones: { delRegistrador: number; delAsistente: number }): boolean {
  return (
    revinculaciones.delRegistrador > UMBRALES_ALERTAS.a4PorRegistrador ||
    revinculaciones.delAsistente > UMBRALES_ALERTAS.a4PorAsistente
  );
}

/** A5: dos lugares distintos en menos de 60 s. */
export function isA5(
  anterior: { lugarId: string | null; at: Date } | null,
  actual: { lugarId: string | null; at: Date },
): boolean {
  if (!anterior || anterior.lugarId === null || actual.lugarId === null) return false;
  return (
    anterior.lugarId !== actual.lugarId &&
    actual.at.getTime() - anterior.at.getTime() < UMBRALES_ALERTAS.a5VentanaMs
  );
}

/** A6: más de 10 vencidos después de cada uno de los últimos 3 cambios. */
export function isA6(vencidosPorCambio: readonly number[]): boolean {
  return (
    vencidosPorCambio.length >= UMBRALES_ALERTAS.a6Cambios &&
    vencidosPorCambio
      .slice(0, UMBRALES_ALERTAS.a6Cambios)
      .every((n) => n > UMBRALES_ALERTAS.a6Vencidos)
  );
}

/** A7: más de 3 intentos del dispositivo anulado. */
export function isA7(intentos: number): boolean {
  return intentos > UMBRALES_ALERTAS.a7Intentos;
}

/** La ventana de tiempo a la que pertenece un momento: una alerta por sujeto y ventana. */
export function getVentana(at: Date, ventanaMs: number): number {
  return Math.floor(at.getTime() / ventanaMs);
}
