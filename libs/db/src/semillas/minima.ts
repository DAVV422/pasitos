import { uuidv7 } from 'uuidv7';
import type { Db } from '../cliente';
import { eventos, miembrosOrganizacion, organizaciones, usuarios } from '../esquema';

/**
 * Semilla mínima (T-003 §6): una organización, su dueño y un evento en borrador.
 * Solo desarrollo y CI. Idempotente.
 */
export async function seedMinima(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const organizacionId = uuidv7();
    const [organizacion] = await tx
      .insert(organizaciones)
      .values({ id: organizacionId, nombre: 'Organización de prueba', slug: 'prueba' })
      .onConflictDoUpdate({
        target: organizaciones.slug,
        set: { nombre: 'Organización de prueba' },
      })
      .returning({ id: organizaciones.id });

    const [dueno] = await tx
      .insert(usuarios)
      .values({ id: uuidv7(), email: 'dueno@example.com', nombre: 'Dueña de prueba' })
      .onConflictDoUpdate({ target: usuarios.email, set: { nombre: 'Dueña de prueba' } })
      .returning({ id: usuarios.id });

    if (!organizacion || !dueno) {
      throw new Error('No se pudo crear la semilla mínima');
    }

    await tx
      .insert(miembrosOrganizacion)
      .values({ id: uuidv7(), organizacionId: organizacion.id, usuarioId: dueno.id, rol: 'dueno' })
      .onConflictDoNothing();

    const inicio = new Date();
    const fin = new Date(inicio.getTime() + 8 * 60 * 60 * 1000);
    await tx
      .insert(eventos)
      .values({
        id: uuidv7(),
        organizacionId: organizacion.id,
        slug: 'evento-de-prueba',
        nombre: 'Evento de prueba',
        inicioAt: inicio,
        finAt: fin,
      })
      .onConflictDoNothing({ target: eventos.slug });
  });
}
