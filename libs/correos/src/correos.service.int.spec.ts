import { asc, eq, sql } from 'drizzle-orm';
import { enviosCorreo } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { EJEMPLOS_CORREO, type DatosCorreo } from '@pasitos/dominio/correos';
import { CorreosService } from './correos.service';

/** Encolar y estimar con PostgreSQL real (T-007 §3). Requiere Docker. */
describe('CorreosService', () => {
  let base: BaseDePrueba;
  let ahora: Date;
  let servicio: CorreosService;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  beforeEach(async () => {
    await base.sistema.db.delete(enviosCorreo);
    ahora = new Date('2026-11-15T15:00:00Z');
    servicio = new CorreosService(base.sistema.db, undefined, () => ahora);
  });

  function enqueueInvitaciones(cantidad: number) {
    return Promise.all(
      Array.from({ length: cantidad }, (_, i) =>
        servicio.enqueue(base.sistema.db, {
          tipo: 'invitacion_evento',
          destinatario: `invitado${i}@example.com`,
          datos: EJEMPLOS_CORREO.invitacion_evento,
        }),
      ),
    );
  }

  it('encola con la prioridad del catálogo y el correo normalizado', async () => {
    const id = await servicio.enqueue(base.sistema.db, {
      tipo: 'restablecer_password',
      destinatario: '  Ana@example.com ',
      datos: EJEMPLOS_CORREO.restablecer_password,
    });
    const [fila] = await base.sistema.db.select().from(enviosCorreo).where(eq(enviosCorreo.id, id));
    expect(fila).toMatchObject({
      tipo: 'restablecer_password',
      prioridad: 1,
      destinatario: 'ana@example.com',
      estado: 'en_cola',
      datos: EJEMPLOS_CORREO.restablecer_password,
    });
    expect(fila?.programadoPara.toISOString()).toBe(ahora.toISOString());
  });

  it('falla al encolar si faltan datos, sin escribir nada', async () => {
    await expect(
      servicio.enqueue(base.sistema.db, {
        tipo: 'restablecer_password',
        destinatario: 'ana@example.com',
        datos: { nombre: 'Ana' } as unknown as DatosCorreo<'restablecer_password'>,
      }),
    ).rejects.toThrow('{enlace}');
    expect(await base.sistema.db.$count(enviosCorreo)).toBe(0);
  });

  it('dentro de una transacción que falla, el correo no queda en la cola', async () => {
    await expect(
      base.sistema.db.transaction(async (tx) => {
        await servicio.enqueue(tx, {
          tipo: 'cuenta_bloqueada',
          destinatario: 'ana@example.com',
          datos: EJEMPLOS_CORREO.cuenta_bloqueada,
        });
        throw new Error('la acción falló');
      }),
    ).rejects.toThrow('la acción falló');
    expect(await base.sistema.db.$count(enviosCorreo)).toBe(0);
  });

  it('100 invitaciones: la estimación dice 2 días y la cola, 70 hoy y 30 mañana', async () => {
    expect(await servicio.estimateEntrega(100, 4)).toEqual({
      dias: 2,
      ultimoDia: new Date('2026-11-16T04:00:00Z'),
    });
    await enqueueInvitaciones(100);
    await servicio.reprogramar();

    const dias = await base.sistema.db
      .select({ dia: enviosCorreo.programadoPara, total: sql<number>`count(*)`.mapWith(Number) })
      .from(enviosCorreo)
      .groupBy(enviosCorreo.programadoPara)
      .orderBy(asc(enviosCorreo.programadoPara));
    expect(dias).toEqual([
      { dia: ahora, total: 70 },
      { dia: new Date('2026-11-16T04:00:00Z'), total: 30 },
    ]);
  });

  it('un correo de seguridad sale hoy aunque haya 100 invitaciones antes', async () => {
    await enqueueInvitaciones(100);
    await servicio.enqueue(base.sistema.db, {
      tipo: 'cuenta_bloqueada',
      destinatario: 'ana@example.com',
      datos: EJEMPLOS_CORREO.cuenta_bloqueada,
    });
    const [fila] = await base.sistema.db
      .select({ dia: enviosCorreo.programadoPara })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.prioridad, 1));
    expect(fila?.dia).toEqual(ahora);
  });

  it('con 70 enviados hoy, la invitación siguiente sale mañana', async () => {
    await enqueueInvitaciones(70);
    await base.sistema.db.update(enviosCorreo).set({ estado: 'enviado', enviadoAt: ahora });
    expect(await servicio.getEnviadosHoy()).toEqual({ total: 70, seguridad: 0 });
    expect(await servicio.estimateEntrega(1, 4)).toEqual({
      dias: 2,
      ultimoDia: new Date('2026-11-16T04:00:00Z'),
    });
    // Al día siguiente, el cupo vuelve a empezar.
    ahora = new Date('2026-11-16T12:00:00Z');
    expect(await servicio.getEnviadosHoy()).toEqual({ total: 0, seguridad: 0 });
  });
});
