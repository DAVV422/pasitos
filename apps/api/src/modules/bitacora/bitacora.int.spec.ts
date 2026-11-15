import { eq, sql } from 'drizzle-orm';
import { bitacora, withOrganizacion } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { BitacoraService } from './bitacora.service';

/** Bitácora con PostgreSQL real (HU-213). Requiere Docker. */
describe('Bitácora (HU-213)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  const servicio = new BitacoraService();

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Ana Mamani');
    await addRol(base, evento, dueno, 'dueno');
    registrador = await createPersonaConSesion(base, 'Luis Condori');
    await addRol(base, evento, registrador, 'registrador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function record(nombre: string, accion: 'reto.update' | 'premio.create' = 'reto.update') {
    return withOrganizacion(base.app.db, evento.organizacionId, (tx) =>
      servicio.record(tx, {
        actor: {
          tipo: 'usuario',
          id: dueno.usuarioId,
          nombre,
          rol: 'coorganizador',
          dispositivo: 'Chrome en Windows',
        },
        accion,
        organizacionId: evento.organizacionId,
        eventoId: evento.eventoId,
        objeto: { tipo: 'reto', id: evento.retoId, nombre: 'Reto' },
        antes: { puntos: 10 },
        despues: { puntos: 20, pin: '1234' },
      }),
    );
  }

  it('escribe con el rol para mostrar, el dispositivo y sin campos prohibidos', async () => {
    const id = await record('Ana Mamani');
    const [fila] = await base.sistema.db.select().from(bitacora).where(eq(bitacora.id, id));
    expect(fila).toMatchObject({
      actorNombre: 'Ana Mamani',
      actorRol: 'Coorganizador',
      accion: 'reto.update',
      objetoNombre: 'Reto',
      antes: { puntos: 10 },
      despues: { puntos: 20 },
      dispositivoModelo: 'Chrome en Windows',
    });
  });

  it('si la acción falla después de escribir, no queda la fila', async () => {
    const antes = await base.sistema.db.$count(bitacora);
    await expect(
      withOrganizacion(base.app.db, evento.organizacionId, async (tx) => {
        await servicio.record(tx, {
          actor: { tipo: 'sistema', nombre: 'Pasitos (automático)' },
          accion: 'evento.update',
          organizacionId: evento.organizacionId,
          eventoId: evento.eventoId,
        });
        throw new Error('la acción falló');
      }),
    ).rejects.toThrow('la acción falló');
    expect(await base.sistema.db.$count(bitacora)).toBe(antes);
  });

  it('el rol del API no puede editar ni borrar filas', async () => {
    const id = await record('Ana Mamani');
    await expect(
      withOrganizacion(base.app.db, evento.organizacionId, (tx) =>
        tx.execute(sql`update bitacora set actor_nombre = 'otra' where id = ${id}`),
      ),
    ).rejects.toThrow();
    await expect(
      withOrganizacion(base.app.db, evento.organizacionId, (tx) =>
        tx.execute(sql`delete from bitacora where id = ${id}`),
      ),
    ).rejects.toThrow();
  });

  it('el dueño lista con texto, busca por persona y pagina; el registrador recibe 403', async () => {
    for (let i = 0; i < 3; i++) {
      await record('Rosa Quispe', 'premio.create');
    }
    const lista = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/bitacora?actor=rosa&limit=2`,
      headers: { cookie: dueno.cookie },
    });
    expect(lista.statusCode).toBe(200);
    const cuerpo = lista.json();
    expect(cuerpo.items).toHaveLength(2);
    expect(cuerpo.items[0]).toMatchObject({
      quien: { nombre: 'Rosa Quispe', rol: 'Coorganizador', tipo: 'usuario' },
      accion: 'premio.create',
      texto: 'Agregó un premio',
    });
    const siguiente = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/bitacora?actor=rosa&limit=2&cursor=${cuerpo.pagination.nextCursor}`,
      headers: { cookie: dueno.cookie },
    });
    expect(siguiente.json().items).toHaveLength(1);
    expect(siguiente.json().pagination.nextCursor).toBeNull();

    const prohibido = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/bitacora`,
      headers: { cookie: registrador.cookie },
    });
    expect(prohibido.json().code).toBe('SIN_PERMISO');
  });
});
