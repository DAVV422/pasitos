import { uuidv7 } from 'uuidv7';
import { asistentes, eventos, organizaciones, retos, withOrganizacion, type Db } from '@pasitos/db';

/** Datos inventados para los tests del libro. */
export async function createOrganizacionYEvento(
  sistema: Db,
  opciones: { topePuntosPersona?: number } = {},
) {
  const organizacionId = uuidv7();
  const eventoId = uuidv7();
  const ahora = new Date();
  await sistema.insert(organizaciones).values({
    id: organizacionId,
    nombre: 'Organización de prueba',
    slug: `org-${organizacionId}`,
  });
  await sistema.insert(eventos).values({
    id: eventoId,
    organizacionId,
    slug: `evento-${eventoId}`,
    nombre: 'Evento de prueba',
    tipo: 'prueba',
    estado: 'en_curso',
    inicioAt: ahora,
    finAt: new Date(ahora.getTime() + 8 * 3_600_000),
    topePuntosPersona: opciones.topePuntosPersona ?? null,
  });
  return { organizacionId, eventoId };
}

export async function createAsistentes(
  app: Db,
  organizacionId: string,
  eventoId: string,
  cantidad: number,
): Promise<string[]> {
  const filas = Array.from({ length: cantidad }, (_, i) => ({
    id: uuidv7(),
    organizacionId,
    eventoId,
    codigoAsistente: `A-${String(i + 1).padStart(4, '0')}`,
    nombre: `Asistente de prueba ${String(i + 1).padStart(3, '0')}`,
    estado: 'presente',
  }));
  await withOrganizacion(app, organizacionId, (tx) => tx.insert(asistentes).values(filas));
  return filas.map((fila) => fila.id);
}

export async function createReto(
  app: Db,
  organizacionId: string,
  eventoId: string,
  datos: { puntos?: number; topeTotal?: number; vecesPorPersona?: number } = {},
) {
  const id = uuidv7();
  const [fila] = await withOrganizacion(app, organizacionId, (tx) =>
    tx
      .insert(retos)
      .values({
        id,
        organizacionId,
        eventoId,
        nombre: 'Reto de prueba',
        puntos: datos.puntos ?? 20,
        topeTotal: datos.topeTotal ?? 100,
        vecesPorPersona: datos.vecesPorPersona ?? 1,
      })
      .returning({ id: retos.id, numero: retos.numero }),
  );
  if (!fila) {
    throw new Error('No se creó el reto');
  }
  return fila;
}

export async function createAsistente(
  app: Db,
  organizacionId: string,
  eventoId: string,
): Promise<string> {
  const [id] = await createAsistentes(app, organizacionId, eventoId, 1);
  if (!id) {
    throw new Error('No se creó el asistente');
  }
  return id;
}
