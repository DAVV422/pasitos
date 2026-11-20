import { and, eq, ne } from 'drizzle-orm';
import { eventos, reportes, type Db } from '@pasitos/db';
import { toReportePublico, type DatosReporte, type Reporte } from '@pasitos/dominio';
import { getStellarReporte } from '@pasitos/libro';
import { getTokenReporte, hashTokenReporte } from '../reportes/reportes.service';

/** El token es base64url de 32 bytes (43 letras). */
export const FORMATO_TOKEN_REPORTE = /^[A-Za-z0-9_-]{43}$/;

/**
 * El reporte que ve cualquiera con el enlace (HU-402 §5): sin los nombres de los registradores.
 * `null` si el token no existe, si dejó de compartirse o si el evento es demo. Recibe la conexión de
 * sistema (no hay organización), como `evento-publico.ts`.
 */
export async function getReportePublico(
  sistema: Db,
  token: string,
  red: 'local' | 'testnet',
): Promise<Reporte | null> {
  if (!FORMATO_TOKEN_REPORTE.test(token)) return null;
  const [fila] = await sistema
    .select({ eventoId: reportes.eventoId, datos: reportes.datos })
    .from(reportes)
    .innerJoin(eventos, eq(eventos.id, reportes.eventoId))
    .where(
      and(
        eq(reportes.tokenPublicoHash, hashTokenReporte(token)),
        eq(reportes.publico, true),
        ne(eventos.tipo, 'demo'),
      ),
    );
  if (!fila) return null;
  return {
    datos: toReportePublico(fila.datos as DatosReporte),
    stellar: await getStellarReporte(sistema, fila.eventoId, red),
  };
}

/** El camino del reporte público de un evento (`/reporte/<token>`), si se comparte. */
export async function getCaminoReporte(
  sistema: Db,
  eventoId: string,
  llave: string,
): Promise<string | null> {
  const [fila] = await sistema
    .select({ id: reportes.id, publico: reportes.publico, version: reportes.enlaceVersion })
    .from(reportes)
    .where(eq(reportes.eventoId, eventoId));
  return fila?.publico ? `/reporte/${getTokenReporte(llave, fila.id, fila.version)}` : null;
}
