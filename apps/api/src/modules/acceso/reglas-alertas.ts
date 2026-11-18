import { and, count, desc, eq, gte, isNotNull, ne } from 'drizzle-orm';
import {
  asistentes,
  dispositivos,
  escaneos,
  pantallas,
  registrosTecnicos,
  vinculaciones,
  type Tx,
} from '@pasitos/db';
import { getVentana, isA3, isA4, isA5, isA7, isA9, UMBRALES_ALERTAS } from '@pasitos/dominio';
import { raiseAlerta } from './registro-tecnico';

/**
 * Las reglas de alerta que se evalúan en el momento (HU-318 §1). Corren dentro de la transacción
 * de la acción: si la acción se deshace, la alerta también. **Ninguna bloquea.** Una alerta no se
 * repite: la clave lleva el sujeto y, si corresponde, la ventana de tiempo.
 */

/** A3: un registrador registra o vincula más de 15 personas en 10 minutos. */
export async function checkA3(
  tx: Tx,
  datos: { organizacionId: string; eventoId: string; registradorId: string; ahora: Date },
): Promise<void> {
  const desde = new Date(datos.ahora.getTime() - UMBRALES_ALERTAS.a3VentanaMs);
  const vinculadas = await tx
    .select({ id: vinculaciones.asistenteId })
    .from(vinculaciones)
    .where(
      and(
        eq(vinculaciones.eventoId, datos.eventoId),
        eq(vinculaciones.registradorId, datos.registradorId),
        gte(vinculaciones.createdAt, desde),
      ),
    );
  const registradas = await tx
    .select({ id: asistentes.id })
    .from(asistentes)
    .where(
      and(
        eq(asistentes.eventoId, datos.eventoId),
        eq(asistentes.origen, 'puerta'),
        eq(asistentes.registradoPor, datos.registradorId),
        gte(asistentes.createdAt, desde),
      ),
    );
  // Registrar y vincular a la misma persona cuenta una vez.
  const personas = new Set([...vinculadas, ...registradas].map((f) => f.id)).size;
  if (!isA3(personas)) return;
  await raiseAlerta(tx, datos.organizacionId, {
    eventoId: datos.eventoId,
    tipo: 'A3',
    datos: { registradorId: datos.registradorId, personas },
    clave: `A3:${datos.registradorId}:${getVentana(datos.ahora, UMBRALES_ALERTAS.a3VentanaMs)}`,
  });
}

/** A4: muchas revinculaciones del mismo registrador o del mismo asistente. */
export async function checkA4(
  tx: Tx,
  datos: {
    organizacionId: string;
    eventoId: string;
    registradorId: string;
    asistenteId: string;
    ahora: Date;
  },
): Promise<void> {
  const desde = new Date(datos.ahora.getTime() - UMBRALES_ALERTAS.a4VentanaMs);
  const [delRegistrador] = await tx
    .select({ total: count() })
    .from(vinculaciones)
    .where(
      and(
        eq(vinculaciones.eventoId, datos.eventoId),
        eq(vinculaciones.anuladaPor, datos.registradorId),
        gte(vinculaciones.anuladaAt, desde),
      ),
    );
  const [delAsistente] = await tx
    .select({ total: count() })
    .from(vinculaciones)
    .where(
      and(eq(vinculaciones.asistenteId, datos.asistenteId), isNotNull(vinculaciones.anuladaPor)),
    );
  const cuentas = {
    delRegistrador: delRegistrador?.total ?? 0,
    delAsistente: delAsistente?.total ?? 0,
  };
  if (!isA4(cuentas)) return;
  const porAsistente = cuentas.delAsistente > UMBRALES_ALERTAS.a4PorAsistente;
  await raiseAlerta(tx, datos.organizacionId, {
    eventoId: datos.eventoId,
    tipo: 'A4',
    asistenteId: datos.asistenteId,
    datos: { registradorId: datos.registradorId, ...cuentas },
    clave: porAsistente
      ? `A4:asistente:${datos.asistenteId}`
      : `A4:registrador:${datos.registradorId}:${getVentana(datos.ahora, UMBRALES_ALERTAS.a4VentanaMs)}`,
  });
}

/** A5: el mismo asistente reclama en dos lugares distintos en menos de 60 s. */
export async function checkA5(
  tx: Tx,
  datos: {
    organizacionId: string;
    eventoId: string;
    asistenteId: string;
    pantallaId: string;
    escaneoId: string;
    ahora: Date;
  },
): Promise<void> {
  const [actual] = await tx
    .select({ lugarId: pantallas.lugarId })
    .from(pantallas)
    .where(eq(pantallas.id, datos.pantallaId));
  const [anterior] = await tx
    .select({ lugarId: pantallas.lugarId, at: escaneos.createdAt, pantallaId: escaneos.pantallaId })
    .from(escaneos)
    .innerJoin(pantallas, eq(pantallas.id, escaneos.pantallaId))
    .where(
      and(
        eq(escaneos.asistenteId, datos.asistenteId),
        eq(escaneos.resultado, 'aceptado'),
        ne(escaneos.id, datos.escaneoId),
      ),
    )
    .orderBy(desc(escaneos.createdAt))
    .limit(1);
  if (!isA5(anterior ?? null, { lugarId: actual?.lugarId ?? null, at: datos.ahora })) return;
  await raiseAlerta(tx, datos.organizacionId, {
    eventoId: datos.eventoId,
    tipo: 'A5',
    asistenteId: datos.asistenteId,
    datos: { pantallas: [anterior?.pantallaId, datos.pantallaId] },
    clave: `A5:${datos.asistenteId}:${getVentana(datos.ahora, UMBRALES_ALERTAS.a5VentanaMs)}`,
  });
}

/** A7: un dispositivo anulado intenta más de 3 veces. */
export async function checkA7(
  tx: Tx,
  datos: { organizacionId: string; eventoId: string; asistenteId: string; dispositivoId: string },
): Promise<void> {
  const [intentos] = await tx
    .select({ total: count() })
    .from(registrosTecnicos)
    .where(
      and(
        eq(registrosTecnicos.dispositivoId, datos.dispositivoId),
        eq(registrosTecnicos.momento, 'intento_fallido'),
        eq(registrosTecnicos.motivo, 'DISPOSITIVO_NO_VINCULADO'),
      ),
    );
  if (!isA7(intentos?.total ?? 0)) return;
  await raiseAlerta(tx, datos.organizacionId, {
    eventoId: datos.eventoId,
    tipo: 'A7',
    asistenteId: datos.asistenteId,
    dispositivoId: datos.dispositivoId,
    datos: { intentos: intentos?.total ?? 0 },
    clave: `A7:${datos.dispositivoId}`,
  });
}

/**
 * A9 (HU-320): 3 o más cuentas creadas desde el mismo QR de registro en 10 minutos con la misma
 * huella de dispositivo. Una alerta por QR y ventana; en `datos`, los ids (nunca la huella).
 */
export async function checkA9(
  tx: Tx,
  datos: {
    organizacionId: string;
    eventoId: string;
    qrRegistroId: string;
    asistenteId: string;
    dispositivoId: string;
    huella: Buffer | null;
    ahora: Date;
  },
): Promise<void> {
  if (!datos.huella) return;
  const desde = new Date(datos.ahora.getTime() - UMBRALES_ALERTAS.a9VentanaMs);
  const filas = await tx
    .select({ id: asistentes.id })
    .from(asistentes)
    .innerJoin(vinculaciones, eq(vinculaciones.asistenteId, asistentes.id))
    .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
    .where(
      and(
        eq(asistentes.qrRegistroId, datos.qrRegistroId),
        gte(asistentes.createdAt, desde),
        eq(dispositivos.huella, datos.huella),
      ),
    );
  const cuentas = new Set(filas.map((f) => f.id)).size;
  if (!isA9(cuentas)) return;
  await raiseAlerta(tx, datos.organizacionId, {
    eventoId: datos.eventoId,
    tipo: 'A9',
    asistenteId: datos.asistenteId,
    dispositivoId: datos.dispositivoId,
    datos: { qrRegistroId: datos.qrRegistroId, cuentas },
    clave: `A9:${datos.qrRegistroId}:${getVentana(datos.ahora, UMBRALES_ALERTAS.a9VentanaMs)}`,
  });
}
