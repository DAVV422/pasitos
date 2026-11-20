import { and, eq } from 'drizzle-orm';
import {
  bitacora,
  enviosCorreo,
  eventos,
  miembrosOrganizacion,
  movimientos,
  outbox,
  usuarios,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { seedMovimientosPrueba } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { CierresEventosService } from './cierres.service';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/** Cierre programado y automático (HU-401 §5). Requiere Docker. */
describe('cerrar-eventos', () => {
  let base: BaseDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  }, 60_000);

  async function newEvento(): Promise<{ eventoId: string; organizacionId: string }> {
    const { eventoId } = await seedMovimientosPrueba(base.sistema.db, {
      asistentes: 3,
      minutos: 0,
    });
    const [evento] = await base.sistema.db
      .select({ organizacionId: eventos.organizacionId })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    return { eventoId, organizacionId: evento?.organizacionId ?? '' };
  }

  function getEvento(eventoId: string) {
    return base.sistema.db
      .select()
      .from(eventos)
      .where(eq(eventos.id, eventoId))
      .then((filas) => filas[0]);
  }

  function newServicio(reloj = createReloj()) {
    return {
      reloj,
      servicio: new CierresEventosService(
        base.sistema.db,
        reloj,
        { topeDiario: 80, reservaSeguridad: 10 },
        'https://pasitos.example.com',
      ),
    };
  }

  it('programado: avisa 30 minutos antes y cierra a su hora, como Pasitos (automático)', async () => {
    const { eventoId } = await newEvento();
    const { reloj, servicio } = newServicio();
    await base.sistema.db
      .update(eventos)
      .set({ cierreProgramadoAt: new Date(reloj.now().getTime() + 20 * MINUTO) })
      .where(eq(eventos.id, eventoId));

    const primera = await servicio.run();
    expect(primera.avisos).toBeGreaterThanOrEqual(1);
    expect(primera.cerrados).not.toContain(eventoId);
    expect((await getEvento(eventoId))?.cierreAvisoAt).toBeInstanceOf(Date);
    expect(
      await base.sistema.db.$count(
        outbox,
        and(eq(outbox.eventoId, eventoId), eq(outbox.tipo, 'evento.cierre_proximo')),
      ),
    ).toBe(1);
    // El aviso sale una sola vez.
    await servicio.run();
    expect(
      await base.sistema.db.$count(
        outbox,
        and(eq(outbox.eventoId, eventoId), eq(outbox.tipo, 'evento.cierre_proximo')),
      ),
    ).toBe(1);

    reloj.adelantar(21 * MINUTO);
    expect((await servicio.run()).cerrados).toContain(eventoId);
    const evento = await getEvento(eventoId);
    expect(evento).toMatchObject({ estado: 'cerrado', cerradoPor: null, cierreEstado: 'sellando' });
    const [entrada] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, eventoId), eq(bitacora.accion, 'evento.close')));
    expect(entrada).toMatchObject({ actorTipo: 'sistema', actorNombre: 'Pasitos (automático)' });
    expect(entrada?.despues).toMatchObject({ origen: 'programado' });
    expect(
      await base.sistema.db.$count(
        movimientos,
        and(eq(movimientos.eventoId, eventoId), eq(movimientos.tipo, 'vencimiento')),
      ),
    ).toBeGreaterThan(0);
  });

  it('automático: correo al dueño 2 h antes y cierre a las 24 h del fin', async () => {
    const { eventoId, organizacionId } = await newEvento();
    const { reloj, servicio } = newServicio();
    const usuarioId = uuidv7();
    const email = `duena-${usuarioId}@example.com`;
    await base.sistema.db.insert(usuarios).values({ id: usuarioId, email, nombre: 'Ana Rojas' });
    await base.sistema.db
      .insert(miembrosOrganizacion)
      .values({ id: uuidv7(), organizacionId, usuarioId, rol: 'dueno' });
    // Terminó hace 23 h: faltan 60 minutos para el cierre automático.
    const fin = new Date(reloj.now().getTime() - 23 * HORA);
    await base.sistema.db
      .update(eventos)
      .set({ inicioAt: new Date(fin.getTime() - 8 * HORA), finAt: fin })
      .where(eq(eventos.id, eventoId));

    const primera = await servicio.run();
    expect(primera.cerrados).not.toContain(eventoId);
    const [correo] = await base.sistema.db
      .select()
      .from(enviosCorreo)
      .where(and(eq(enviosCorreo.destinatario, email), eq(enviosCorreo.tipo, 'cierre_automatico')));
    expect(correo?.datos).toMatchObject({
      nombre: 'Ana',
      enlace: `https://pasitos.example.com/admin/eventos/${eventoId}/cierre`,
    });
    // El correo sale una sola vez.
    await servicio.run();
    expect(
      await base.sistema.db.$count(
        enviosCorreo,
        and(eq(enviosCorreo.destinatario, email), eq(enviosCorreo.tipo, 'cierre_automatico')),
      ),
    ).toBe(1);

    reloj.adelantar(61 * MINUTO);
    expect((await servicio.run()).cerrados).toContain(eventoId);
    const [entrada] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, eventoId), eq(bitacora.accion, 'evento.close')));
    expect(entrada?.despues).toMatchObject({ origen: 'automatico' });
  });

  it('un evento con el cierre programado no se cierra solo a las 24 h', async () => {
    const { eventoId } = await newEvento();
    const { reloj, servicio } = newServicio();
    const fin = new Date(reloj.now().getTime() - 30 * HORA);
    await base.sistema.db
      .update(eventos)
      .set({
        inicioAt: new Date(fin.getTime() - 8 * HORA),
        finAt: fin,
        cierreProgramadoAt: new Date(reloj.now().getTime() + 2 * HORA),
      })
      .where(eq(eventos.id, eventoId));
    expect((await servicio.run()).cerrados).not.toContain(eventoId);
    expect((await getEvento(eventoId))?.estado).toBe('en_curso');
  });
});
