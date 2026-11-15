import { eq } from 'drizzle-orm';
import { bitacora, eventos, miembrosEvento } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Reglas y puerta con PostgreSQL real (HU-212). Requiere Docker. */
describe('Configurar la puerta (HU-212)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let coorganizador: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  let registradorId: string;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña');
    coorganizador = await createPersonaConSesion(base, 'Coorganizador');
    registrador = await createPersonaConSesion(base, 'Registrador');
    await addRol(base, evento, dueno, 'dueno');
    await addRol(base, evento, coorganizador, 'coorganizador');
    registradorId = (await addRol(base, evento, registrador, 'registrador')) ?? '';
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(persona: PersonaDePrueba, method: 'GET' | 'PATCH', url: string, body?: object) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: persona.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  it('los valores por defecto son los de la especificación', async () => {
    const respuesta = await pedir(dueno, 'GET', `/eventos/${evento.eventoId}`);
    expect(respuesta.json().reglas).toEqual({
      registroPuertaActivo: true,
      topeRegistrosPuerta: null,
      puntosCheckIn: 0,
      retosRequierenCheckIn: true,
      topePuntosPersona: null,
      topeAjuste: 100,
    });
  });

  it('cambia las reglas dentro de sus rangos; fuera de rango, VALIDACION', async () => {
    const cambio = await pedir(dueno, 'PATCH', `/eventos/${evento.eventoId}`, {
      registroPuertaActivo: false,
      topeRegistrosPuerta: 300,
      puntosCheckIn: 10,
      retosRequierenCheckIn: false,
      topePuntosPersona: 5_000,
      topeAjuste: 50,
    });
    expect(cambio.statusCode).toBe(200);
    expect(cambio.json().reglas).toMatchObject({ topeRegistrosPuerta: 300, puntosCheckIn: 10 });

    for (const fuera of [
      { topeRegistrosPuerta: 0 },
      { topeRegistrosPuerta: 10_001 },
      { puntosCheckIn: 1_001 },
      { topePuntosPersona: 1_000_001 },
      { topeAjuste: 0 },
    ]) {
      const respuesta = await pedir(dueno, 'PATCH', `/eventos/${evento.eventoId}`, fuera);
      expect(respuesta.json()).toMatchObject({
        code: 'VALIDACION',
        errors: [{ field: Object.keys(fuera)[0] }],
      });
    }
    // Sin límite otra vez.
    const sinLimite = await pedir(dueno, 'PATCH', `/eventos/${evento.eventoId}`, {
      topeRegistrosPuerta: null,
    });
    expect(sinLimite.json().reglas.topeRegistrosPuerta).toBeNull();
  });

  it('con el evento en curso, el coorganizador amplía el tope; el registrador no puede', async () => {
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'en_curso' })
      .where(eq(eventos.id, evento.eventoId));
    const amplia = await pedir(coorganizador, 'PATCH', `/eventos/${evento.eventoId}`, {
      topeRegistrosPuerta: 800,
    });
    expect(amplia.json().reglas.topeRegistrosPuerta).toBe(800);
    const noPuede = await pedir(registrador, 'PATCH', `/eventos/${evento.eventoId}`, {
      topeRegistrosPuerta: 5,
    });
    expect(noPuede.statusCode).toBe(403);
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'borrador' })
      .where(eq(eventos.id, evento.eventoId));
  });

  it('cada cambio de reglas va a la bitácora como puerta.config.update, con antes y después', async () => {
    await pedir(dueno, 'PATCH', `/eventos/${evento.eventoId}`, {
      puntosCheckIn: 25,
      nombre: 'Evento con reglas',
    });
    const filas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(eq(bitacora.eventoId, evento.eventoId));
    const ultima = (accion: string) => filas.filter((f) => f.accion === accion).at(-1);
    expect(ultima('puerta.config.update')).toMatchObject({
      antes: { puntosCheckIn: 10 },
      despues: { puntosCheckIn: 25 },
    });
    expect(ultima('evento.update')?.despues).toEqual({ nombre: 'Evento con reglas' });
  });

  it('el tope por registrador se guarda en el miembro, solo para registradores', async () => {
    const respuesta = await pedir(dueno, 'PATCH', `/miembros/${registradorId}`, {
      topeRegistrosPuerta: 40,
    });
    expect(respuesta.statusCode).toBe(204);
    const [fila] = await base.sistema.db
      .select({ tope: miembrosEvento.topeRegistrosPuerta })
      .from(miembrosEvento)
      .where(eq(miembrosEvento.id, registradorId));
    expect(fila?.tope).toBe(40);
  });
});
