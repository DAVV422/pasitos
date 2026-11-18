import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { dispositivos, eventos, registrosTecnicos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { BorradoDispositivosService } from './borrado-dispositivos.service';

/** El borrado de lo técnico a los 30 días (HU-307 §7). Requiere Docker. */
describe('borrar-dispositivos', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  it('borra los registros vencidos y deja sin llave ni huella a los dispositivos vencidos', async () => {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 1,
      minutos: 0,
    });
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    const organizacionId = evento?.organizacionId ?? '';
    const reloj = createReloj();
    const ayer = new Date(reloj.now().getTime() - 86_400_000);
    const manana = new Date(reloj.now().getTime() + 86_400_000);

    const ids = { vencido: uuidv7(), vigente: uuidv7() };
    for (const [id, borrarAt] of [
      [ids.vencido, ayer],
      [ids.vigente, manana],
    ] as const) {
      await base.sistema.db.insert(dispositivos).values({
        id,
        organizacionId,
        eventoId,
        deviceIdHash: randomBytes(32),
        llavePublica: randomBytes(65),
        huella: randomBytes(32),
        modelo: 'Chrome en Android',
        borrarAt,
      });
      await base.sistema.db.insert(registrosTecnicos).values({
        id: uuidv7(),
        organizacionId,
        eventoId,
        dispositivoId: id,
        momento: 'vinculacion',
        resultado: 'aceptado',
        ip: '203.0.113.7',
        borrarAt,
      });
    }

    const resultado = await new BorradoDispositivosService(base.sistema.db, reloj).deleteVencidos();
    expect(resultado).toEqual({ registros: 1, dispositivos: 1 });

    const filas = await base.sistema.db.select().from(dispositivos);
    const vencido = filas.find((d) => d.id === ids.vencido);
    const vigente = filas.find((d) => d.id === ids.vigente);
    expect(vencido).toMatchObject({
      llavePublica: null,
      huella: null,
      modelo: 'Chrome en Android',
    });
    expect(vigente?.llavePublica).not.toBeNull();
    const registros = await base.sistema.db.select().from(registrosTecnicos);
    expect(registros.map((r) => r.dispositivoId)).toEqual([ids.vigente]);

    // Una segunda vuelta no toca nada.
    expect(await new BorradoDispositivosService(base.sistema.db, reloj).deleteVencidos()).toEqual({
      registros: 0,
      dispositivos: 0,
    });
  });
});
