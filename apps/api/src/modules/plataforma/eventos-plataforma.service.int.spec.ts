import { and, eq } from 'drizzle-orm';
import { AppError, type IntervaloAnclajeMin } from '@pasitos/dominio';
import { bitacora, eventos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { EventosPlataformaService, type ActorPlataforma } from './eventos-plataforma.service';

const SOPORTE: ActorPlataforma = {
  tipo: 'sistema',
  id: null,
  nombre: 'Soporte de Pasitos (comando)',
  rol: null,
};

/** Intervalo de anclaje desde la plataforma (HU-105 §1). Requiere Docker. */
describe('EventosPlataformaService.updateIntervaloAnclaje', () => {
  let base: BaseDePrueba;
  let servicio: EventosPlataformaService;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    servicio = new EventosPlataformaService(base.sistema.db);
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  async function getIntervalo(eventoId: string) {
    const [fila] = await base.sistema.db
      .select({ intervalo: eventos.intervaloAnclajeMin })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    return fila?.intervalo;
  }

  function listBitacora(eventoId: string) {
    return base.sistema.db
      .select()
      .from(bitacora)
      .where(
        and(
          eq(bitacora.eventoId, eventoId),
          eq(bitacora.accion, 'evento.intervalo_anclaje.update'),
        ),
      )
      .orderBy(bitacora.id);
  }

  it('cambia el intervalo y deja en la bitácora el valor anterior y el nuevo', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    await servicio.updateIntervaloAnclaje(eventoId, 1, SOPORTE, 'Hito A');
    expect(await getIntervalo(eventoId)).toBe(1);

    await servicio.updateIntervaloAnclaje(eventoId, null, SOPORTE);
    expect(await getIntervalo(eventoId)).toBeNull();

    const filas = await listBitacora(eventoId);
    expect(filas.map((f) => [f.antes, f.despues])).toEqual([
      [{ intervaloAnclajeMin: null }, { intervaloAnclajeMin: 1, motivo: 'Hito A' }],
      [{ intervaloAnclajeMin: 1 }, { intervaloAnclajeMin: null }],
    ]);
    expect(filas[0]).toMatchObject({
      actorTipo: 'sistema',
      actorNombre: 'Soporte de Pasitos (comando)',
      objetoTipo: 'evento',
      objetoId: eventoId,
    });

    // Repetir el mismo valor no deja otra fila.
    await servicio.updateIntervaloAnclaje(eventoId, null, SOPORTE);
    expect(await listBitacora(eventoId)).toHaveLength(2);
  });

  it('rechaza un valor fuera de la lista con VALIDACION, y un evento que no existe con NO_ENCONTRADO', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const error = await servicio
      .updateIntervaloAnclaje(eventoId, 3 as IntervaloAnclajeMin, SOPORTE)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      code: 'VALIDACION',
      errors: [expect.objectContaining({ field: 'intervaloAnclajeMin' })],
    });
    expect(await getIntervalo(eventoId)).toBeNull();

    await expect(
      servicio.updateIntervaloAnclaje('00000000-0000-7000-8000-000000000000', 5, SOPORTE),
    ).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});
