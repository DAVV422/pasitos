import { uuidv7 } from 'uuidv7';
import {
  asistentes,
  eventos,
  organizaciones,
  pantallas,
  retos,
  withOrganizacion,
  type Db,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { LibroService, type NuevoMovimiento } from '../libro.service';

/** Misma organización demo que T-010 (libs/db/src/semillas/produccion-demo.ts). */
const SLUG_ORGANIZACION_DEMO = 'demo';

export interface OpcionesMovimientosPrueba {
  readonly asistentes: number;
  /** En cuántos minutos se reparten los reclamos. 0 = todos de una vez. */
  readonly minutos: number;
  readonly alAvanzar?: (hechos: number, total: number) => void;
}

export interface ResultadoMovimientosPrueba {
  readonly eventoId: string;
  readonly slug: string;
  readonly movimientos: number;
  readonly rechazados: number;
}

const espera = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Evento de prueba con movimientos para el Hito A (HU-101 §6).
 * Siempre crea un evento nuevo de tipo `prueba` en la organización demo, con 4 retos de topes chicos
 * (algunos asistentes llegan al tope) y 2 pantallas. Usa addMovimiento(): respeta todas las reglas.
 * Recibe la conexión de `pasitos_sistema`.
 */
export async function seedMovimientosPrueba(
  db: Db,
  opciones: OpcionesMovimientosPrueba,
): Promise<ResultadoMovimientosPrueba> {
  const libro = new LibroService();
  const ahora = new Date();
  const slug = `prueba-anclaje-${ahora.toISOString().slice(0, 19).replaceAll(/[-:T]/g, '')}`;

  const [organizacion] = await db
    .insert(organizaciones)
    .values({
      id: uuidv7(),
      nombre: 'Comunidad Demo Pasitos',
      slug: SLUG_ORGANIZACION_DEMO,
      esDemo: true,
    })
    .onConflictDoUpdate({ target: organizaciones.slug, set: { esDemo: true } })
    .returning({ id: organizaciones.id });
  if (!organizacion) {
    throw new Error('No se pudo obtener la organización demo');
  }
  const organizacionId = organizacion.id;
  const eventoId = uuidv7();

  const { idsRetos, idsPantallas, idsAsistentes } = await withOrganizacion(
    db,
    organizacionId,
    async (tx) => {
      await tx.insert(eventos).values({
        id: eventoId,
        organizacionId,
        slug,
        nombre: `Prueba de anclaje ${ahora.toISOString().slice(0, 16).replace('T', ' ')}`,
        tipo: 'prueba',
        estado: 'en_curso',
        inicioAt: ahora,
        finAt: new Date(ahora.getTime() + 8 * 3_600_000),
      });
      const topes = [
        Math.max(5, Math.ceil(opciones.asistentes * 0.8)),
        Math.max(3, Math.ceil(opciones.asistentes * 0.5)),
        opciones.asistentes * 2,
        Math.max(2, Math.ceil(opciones.asistentes * 0.2)),
      ];
      const filasRetos = topes.map((topeTotal, i) => ({
        id: uuidv7(),
        organizacionId,
        eventoId,
        nombre: `Reto de prueba ${i + 1}`,
        puntos: 10 * (i + 1),
        topeTotal,
        vecesPorPersona: i === 2 ? 2 : 1,
      }));
      await tx.insert(retos).values(filasRetos);
      const filasPantallas = [1, 2].map((i) => ({
        id: uuidv7(),
        organizacionId,
        eventoId,
        nombre: `Pantalla de prueba ${i}`,
      }));
      await tx.insert(pantallas).values(filasPantallas);
      const filasAsistentes = Array.from({ length: opciones.asistentes }, (_, i) => ({
        id: uuidv7(),
        organizacionId,
        eventoId,
        codigoAsistente: `A-${String(i + 1).padStart(4, '0')}`,
        nombre: `Asistente de prueba ${String(i + 1).padStart(3, '0')}`,
        estado: 'presente',
      }));
      await tx.insert(asistentes).values(filasAsistentes);
      return {
        idsRetos: filasRetos.map((f) => f.id),
        idsPantallas: filasPantallas.map((f) => f.id),
        idsAsistentes: filasAsistentes.map((f) => f.id),
      };
    },
  );

  // Un check-in por persona y unos tres reclamos por persona, mezclados al azar.
  const reclamos: NuevoMovimiento[] = idsAsistentes.flatMap((asistenteId) =>
    Array.from({ length: 3 }, (): NuevoMovimiento => {
      const indice = Math.floor(Math.random() * idsRetos.length);
      return {
        eventoId,
        asistenteId,
        tipo: 'reto',
        origen: 'asistente',
        retoId: idsRetos[indice] ?? '',
        pantallaId: idsPantallas[indice % idsPantallas.length] ?? '',
      };
    }),
  );
  reclamos.sort(() => Math.random() - 0.5);
  const operaciones: NuevoMovimiento[] = [
    ...idsAsistentes.map((asistenteId): NuevoMovimiento => ({
      eventoId,
      asistenteId,
      tipo: 'checkin',
      origen: 'equipo',
      puntos: 0,
    })),
    ...reclamos,
  ];

  const pausaMs = opciones.minutos > 0 ? (opciones.minutos * 60_000) / operaciones.length : 0;
  let movimientos = 0;
  let rechazados = 0;
  for (const [i, operacion] of operaciones.entries()) {
    try {
      await withOrganizacion(db, organizacionId, (tx) => libro.addMovimiento(tx, operacion));
      movimientos++;
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }
      rechazados++; // Topes y veces por persona: es parte de la prueba.
    }
    opciones.alAvanzar?.(i + 1, operaciones.length);
    if (pausaMs > 0) {
      await espera(pausaMs);
    }
  }

  return { eventoId, slug, movimientos, rechazados };
}
