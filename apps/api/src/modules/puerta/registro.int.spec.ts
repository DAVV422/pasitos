import { and, eq } from 'drizzle-orm';
import { asistentes, bitacora, checkIns, enviosCorreo, eventos, miembrosEvento } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Registro en la puerta (HU-303) con PostgreSQL real. Requiere Docker. */
describe('Registro en la puerta (HU-303)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let luis: PersonaDePrueba;
  let rita: PersonaDePrueba;
  let miembroRita: string | null;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    luis = await createPersonaConSesion(base, 'Luis Condori');
    rita = await createPersonaConSesion(base, 'Rita Mamani');
    await addRol(base, evento, luis, 'registrador');
    miembroRita = await addRol(base, evento, rita, 'registrador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function registrar(persona: PersonaDePrueba, cuerpo: object, clave = uuidv7()) {
    return api.app.inject({
      method: 'POST',
      url: `/api/v1/eventos/${evento.eventoId}/puerta/registros`,
      headers: {
        cookie: persona.cookie,
        'content-type': 'application/json',
        'idempotency-key': clave,
      },
      payload: JSON.stringify(cuerpo),
    });
  }

  function setEvento(cambios: Partial<typeof eventos.$inferInsert>) {
    return base.sistema.db.update(eventos).set(cambios).where(eq(eventos.id, evento.eventoId));
  }

  it('registra a la persona presente, con quién la registró, su check-in y el aviso por correo', async () => {
    const respuesta = await registrar(luis, {
      nombre: 'Carla Rojas',
      email: 'Carla.Rojas@example.com',
    });
    expect(respuesta.statusCode).toBe(201);
    const ficha = respuesta.json();
    expect(ficha).toMatchObject({
      nombre: 'Carla Rojas',
      estado: 'presente',
      checkIn: { por: 'Luis C.' },
    });
    expect(ficha.codigo).toMatch(/^A-\d{4}$/);

    const [asistente] = await base.sistema.db
      .select()
      .from(asistentes)
      .where(eq(asistentes.id, ficha.id));
    expect(asistente).toMatchObject({
      origen: 'puerta',
      registradoPor: luis.usuarioId,
      email: 'carla.rojas@example.com',
      emailEstado: 'en_cola',
    });
    const [checkIn] = await base.sistema.db
      .select({ metodo: checkIns.metodo })
      .from(checkIns)
      .where(eq(checkIns.asistenteId, ficha.id));
    expect(checkIn?.metodo).toBe('registro_puerta');
    const [correo] = await base.sistema.db
      .select({ tipo: enviosCorreo.tipo, refId: enviosCorreo.refId })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.refId, ficha.id));
    expect(correo).toEqual({ tipo: 'registro_puerta', refId: ficha.id });
    const [fila] = await base.sistema.db
      .select({ despues: bitacora.despues })
      .from(bitacora)
      .where(
        and(eq(bitacora.objetoId, ficha.id), eq(bitacora.accion, 'asistente.registrar_puerta')),
      );
    expect(fila?.despues).toMatchObject({ email: 'ca•••@example.com' });

    // Sin correo, no hay aviso.
    const sinCorreo = (await registrar(luis, { nombre: 'Tomás Sin Correo' })).json();
    const correos = await base.sistema.db
      .select()
      .from(enviosCorreo)
      .where(eq(enviosCorreo.refId, sinCorreo.id));
    expect(correos).toHaveLength(0);
  });

  it('con un nombre parecido avisa antes de crear; "es otra persona" lo crea igual', async () => {
    await registrar(luis, { nombre: 'Valeria Quispe Mamani' });
    const parecido = await registrar(luis, { nombre: 'Valeria Quispe Mamami' });
    expect(parecido.statusCode).toBe(409);
    expect(parecido.json()).toMatchObject({
      code: 'ASISTENTE_POSIBLE_DUPLICADO',
      meta: { candidatos: [{ nombre: 'Valeria Quispe Mamani', presente: true }] },
    });
    const otra = await registrar(luis, {
      nombre: 'Valeria Quispe Mamami',
      confirmarDuplicado: true,
    });
    expect(otra.statusCode).toBe(201);

    // El mismo correo es la misma persona: no se registra aunque confirme.
    const mismoCorreo = await registrar(luis, {
      nombre: 'Otra Carla',
      email: 'carla.rojas@example.com',
      confirmarDuplicado: true,
    });
    expect(mismoCorreo.json().code).toBe('ASISTENTE_YA_REGISTRADO');
  });

  it('el tope del evento se respeta con dos registradores a la vez', async () => {
    const [{ usados } = { usados: 0 }] = await base.sistema.db
      .select({ usados: asistentes.id })
      .from(asistentes)
      .where(and(eq(asistentes.eventoId, evento.eventoId), eq(asistentes.origen, 'puerta')))
      .then((filas) => [{ usados: filas.length }]);
    await setEvento({ topeRegistrosPuerta: usados + 1 });
    const [a, b] = await Promise.all([
      registrar(luis, { nombre: 'Primera En Llegar' }),
      registrar(rita, { nombre: 'Segunda En Llegar' }),
    ]);
    const estados = [a.statusCode, b.statusCode].sort();
    expect(estados).toEqual([201, 422]);
    const rechazo = a.statusCode === 422 ? a : b;
    expect(rechazo.json()).toMatchObject({
      code: 'LIMITE_REGISTRO_ALCANZADO',
      meta: { cual: 'evento' },
    });
    await setEvento({ topeRegistrosPuerta: null });
  });

  it('el tope del registrador, con su texto', async () => {
    await base.sistema.db
      .update(miembrosEvento)
      .set({ topeRegistrosPuerta: 1 })
      .where(eq(miembrosEvento.id, miembroRita ?? ''));
    const [a, b] = await Promise.all([
      registrar(rita, { nombre: 'Rita Registra Uno' }),
      registrar(rita, { nombre: 'Rita Registra Dos' }),
    ]);
    const rechazos = [a, b].filter((r) => r.statusCode === 422);
    // Rita ya registró en la prueba anterior o en esta: pasado el tope, el texto lo dice.
    expect(rechazos.length).toBeGreaterThanOrEqual(1);
    expect(rechazos[0]?.json()).toMatchObject({
      code: 'LIMITE_REGISTRO_ALCANZADO',
      detail: 'Llegaste al tope de registros en la puerta. Pide a un coorganizador que lo amplíe.',
      meta: { cual: 'registrador' },
    });
    const resumen = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/puerta`,
      headers: { cookie: rita.cookie },
    });
    expect(resumen.json()).toMatchObject({ registrosRestantes: 0 });
    expect(resumen.json().registrosPorRegistrador).toContainEqual(
      expect.objectContaining({ nombre: 'Luis C.' }),
    );
  });

  it('con el registro en la puerta desactivado, no deja registrar', async () => {
    await setEvento({ registroPuertaActivo: false });
    expect((await registrar(luis, { nombre: 'Llega Tarde' })).json().code).toBe(
      'REGISTRO_PUERTA_CERRADO',
    );
    await setEvento({ registroPuertaActivo: true });
  });

  it('la lista de invitados filtra por origen y dice quién registró', async () => {
    const dueno = await createPersonaConSesion(base, 'Diana Dueña');
    await addRol(base, evento, dueno, 'dueno');
    const respuesta = await api.app.inject({
      method: 'GET',
      url: `/api/v1/eventos/${evento.eventoId}/asistentes?origen=puerta`,
      headers: { cookie: dueno.cookie },
    });
    const items = respuesta.json().items as { origen: string; registradoPor: string | null }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.origen === 'puerta')).toBe(true);
    expect(items.map((i) => i.registradoPor)).toContain('Luis C.');
  });

  it('celular (HU-411): obligatorio en la puerta; la ficha lo muestra completo a D y oculto a R', async () => {
    await setEvento({ topeRegistrosPuerta: null, pedirCelular: 'obligatorio' });
    const nora = await createPersonaConSesion(base, 'Nora Registra');
    await addRol(base, evento, nora, 'registrador');
    const duena = await createPersonaConSesion(base, 'Dalia Dueña');
    await addRol(base, evento, duena, 'dueno');

    const sinCelular = await registrar(nora, { nombre: 'Celeste Puerta' });
    expect(sinCelular.statusCode).toBe(400);
    expect(sinCelular.json().errors[0]).toMatchObject({ field: 'celular' });

    const registrada = await registrar(nora, { nombre: 'Celeste Puerta', celular: '71234567' });
    expect(registrada.statusCode).toBe(201);
    expect(registrada.json().celular).toBe('•••• 4567');
    const id = registrada.json().id as string;
    const fichaDuena = await api.app.inject({
      method: 'GET',
      url: `/api/v1/asistentes/${id}/ficha`,
      headers: { cookie: duena.cookie },
    });
    expect(fichaDuena.json().celular).toBe('+59171234567');

    // Mismo celular, otro nombre: pregunta si es la misma persona (no bloquea).
    const parecido = await registrar(nora, { nombre: 'Otra Persona', celular: '7123-4567' });
    expect(parecido.json().code).toBe('ASISTENTE_POSIBLE_DUPLICADO');

    // La lista: completo para la dueña, oculto para el registrador.
    const lista = (quien: PersonaDePrueba) =>
      api.app.inject({
        method: 'GET',
        url: `/api/v1/eventos/${evento.eventoId}/asistentes?q=Celeste`,
        headers: { cookie: quien.cookie },
      });
    expect((await lista(duena)).json().items[0].celular).toBe('+59171234567');
    expect((await lista(nora)).json().items[0].celular).toBe('•••• 4567');
    await setEvento({ pedirCelular: 'opcional' });
  });
});
