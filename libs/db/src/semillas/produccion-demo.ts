import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import type { Db } from '../cliente';
import { eventos, miembrosOrganizacion, organizaciones, usuarios } from '../esquema';

/**
 * Organización demo de producción (T-010, D52). Idempotente.
 * En la fase 0 crea la organización y los dos eventos vacíos; cada HU que crea
 * contenido de un evento lo agrega aquí (Definición de terminado, punto 9).
 */
export const SLUG_ORGANIZACION_DEMO = 'demo';
export const SLUG_DEMO_EN_VIVO = 'demo-en-vivo';
export const SLUG_DEMO_CERRADO = 'demo-cerrado';

const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

export interface OpcionesDemo {
  /** Correos del equipo que serán dueños de la demo (variable DEMO_DUENOS, separados por coma). */
  readonly duenos: readonly string[];
  readonly reiniciarEnVivo: boolean;
}

export async function seedProduccionDemo(db: Db, opciones: OpcionesDemo): Promise<void> {
  await db.transaction(async (tx) => {
    const [organizacion] = await tx
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
      throw new Error('No se pudo crear la organización demo');
    }

    for (const email of opciones.duenos) {
      const [usuario] = await tx
        .insert(usuarios)
        .values({ id: uuidv7(), email, nombre: email.split('@')[0] ?? email })
        .onConflictDoUpdate({ target: usuarios.email, set: { email } })
        .returning({ id: usuarios.id });
      if (usuario) {
        await tx
          .insert(miembrosOrganizacion)
          .values({
            id: uuidv7(),
            organizacionId: organizacion.id,
            usuarioId: usuario.id,
            rol: 'dueno',
          })
          .onConflictDoNothing();
      }
    }

    if (opciones.reiniciarEnVivo) {
      // El libro no permite borrar: se archiva el evento y se crea uno nuevo (T-010 §5).
      await tx
        .update(eventos)
        .set({
          estado: 'archivado',
          slug: `${SLUG_DEMO_EN_VIVO}-archivado-${Date.now()}`,
          updatedAt: new Date(),
        })
        .where(
          and(eq(eventos.slug, SLUG_DEMO_EN_VIVO), eq(eventos.organizacionId, organizacion.id)),
        );
    }

    const ahora = new Date();
    await tx
      .insert(eventos)
      .values([
        {
          id: uuidv7(),
          organizacionId: organizacion.id,
          slug: SLUG_DEMO_EN_VIVO,
          nombre: 'Demo · En vivo',
          tipo: 'demo',
          visibilidad: 'solo_enlace',
          inicioAt: ahora,
          finAt: new Date(ahora.getTime() + UN_ANIO_MS),
        },
        {
          id: uuidv7(),
          organizacionId: organizacion.id,
          slug: SLUG_DEMO_CERRADO,
          nombre: 'Demo · Cerrado',
          tipo: 'demo',
          visibilidad: 'solo_enlace',
          inicioAt: new Date(ahora.getTime() - 2 * 24 * 60 * 60 * 1000),
          finAt: new Date(ahora.getTime() - 24 * 60 * 60 * 1000),
        },
      ])
      .onConflictDoNothing({ target: eventos.slug });
  });
}
