import { and, eq } from 'drizzle-orm';
import { bitacora, eventos, outbox } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Información y contenido del evento con PostgreSQL real (HU-206). Requiere Docker. */
describe('Información del evento (HU-206)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let financiador: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña');
    await addRol(base, evento, dueno, 'dueno');
    financiador = await createPersonaConSesion(base, 'Financiador');
    await addRol(base, evento, financiador, 'financiador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    quien: PersonaDePrueba,
    body?: object,
  ) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: quien.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  it('edita los datos generales; la bitácora guarda solo lo que cambió', async () => {
    const respuesta = await pedir('PATCH', `/eventos/${evento.eventoId}`, dueno, {
      descripcion: 'Un encuentro para la comunidad.',
      nombrePuntos: 'pasos',
      wifi: 'Red: Evento · Clave: hola1234',
      seccionesPublicas: ['descripcion', 'agenda'],
    });
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      descripcion: 'Un encuentro para la comunidad.',
      nombrePuntos: 'pasos',
      seccionesPublicas: ['descripcion', 'agenda'],
    });
    const [fila] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'evento.update')));
    expect(Object.keys(fila?.despues as object).sort()).toEqual([
      'descripcion',
      'nombrePuntos',
      'seccionesPublicas',
      'wifi',
    ]);
    expect(
      await base.sistema.db.$count(
        outbox,
        and(eq(outbox.eventoId, evento.eventoId), eq(outbox.tipo, 'evento.contenido_actualizado')),
      ),
    ).toBeGreaterThan(0);
  });

  it('el wifi no se puede marcar como público, ni desde el API', async () => {
    const respuesta = await pedir('PATCH', `/eventos/${evento.eventoId}`, dueno, {
      seccionesPublicas: ['descripcion', 'wifi'],
    });
    expect(respuesta.json().code).toBe('VALIDACION');
  });

  it('el slug solo cambia en borrador y privado; publicado, el inicio no va al pasado', async () => {
    expect(
      (await pedir('PATCH', `/eventos/${evento.eventoId}`, dueno, { slug: 'nuevo-enlace' })).json()
        .slug,
    ).toBe('nuevo-enlace');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'publicado' })
      .where(eq(eventos.id, evento.eventoId));
    const slug = await pedir('PATCH', `/eventos/${evento.eventoId}`, dueno, {
      slug: 'otro-enlace',
    });
    expect(slug.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'slug' }] });
    const pasado = await pedir('PATCH', `/eventos/${evento.eventoId}`, dueno, {
      inicioAt: '2026-11-14T10:00:00Z',
      finAt: '2026-11-14T18:00:00Z',
    });
    expect(pasado.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'inicioAt' }] });
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'borrador' })
      .where(eq(eventos.id, evento.eventoId));
  });

  it('una imagen que no es del evento o del propósito no se acepta', async () => {
    const respuesta = await pedir('PATCH', `/eventos/${evento.eventoId}`, dueno, {
      logoArchivoId: '01900000-0000-7000-8000-000000000001',
    });
    expect(respuesta.json()).toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'logoArchivoId' }],
    });
  });

  it('lugares: crear, número del plano único y no se borra si se usa (con quién lo usa)', async () => {
    const sala = await pedir('POST', `/eventos/${evento.eventoId}/lugares`, dueno, {
      tipo: 'sala',
      nombre: 'Auditorio',
      numeroMapa: 3,
    });
    expect(sala.statusCode).toBe(201);
    const repetido = await pedir('POST', `/eventos/${evento.eventoId}/lugares`, dueno, {
      tipo: 'stand',
      nombre: 'Stand B',
      numeroMapa: 3,
    });
    expect(repetido.json()).toMatchObject({
      code: 'VALIDACION',
      errors: [{ field: 'numeroMapa' }],
    });

    await pedir('POST', `/eventos/${evento.eventoId}/actividades`, dueno, {
      titulo: 'Taller en el auditorio',
      inicioAt: '2026-12-01T14:00:00Z',
      finAt: '2026-12-01T15:00:00Z',
      lugarId: sala.json().id,
    });
    const borrar = await pedir('DELETE', `/lugares/${sala.json().id}`, dueno);
    expect(borrar.statusCode).toBe(409);
    expect(borrar.json()).toMatchObject({
      code: 'LUGAR_EN_USO',
      meta: { usadoPor: [{ tipo: 'actividad', nombre: 'Taller en el auditorio' }] },
    });
  });

  it('una actividad fuera de las fechas del evento se rechaza con el campo marcado', async () => {
    const fuera = await pedir('POST', `/eventos/${evento.eventoId}/actividades`, dueno, {
      titulo: 'Fuera de fecha',
      inicioAt: '2027-01-01T10:00:00Z',
      finAt: '2027-01-01T11:00:00Z',
    });
    expect(fuera.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'inicioAt' }] });
  });

  it('sponsors: el enlace solo https; editar deja antes → después', async () => {
    const malo = await pedir('POST', `/eventos/${evento.eventoId}/sponsors`, dueno, {
      nombre: 'Banco',
      enlace: 'http://banco.example.com',
    });
    expect(malo.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'enlace' }] });
    const bien = await pedir('POST', `/eventos/${evento.eventoId}/sponsors`, dueno, {
      nombre: 'Banco',
      enlace: 'https://banco.example.com',
    });
    const editado = await pedir('PATCH', `/sponsors/${bien.json().id}`, dueno, {
      nombre: 'Banco Ejemplo',
    });
    expect(editado.json()).toMatchObject({
      nombre: 'Banco Ejemplo',
      enlace: 'https://banco.example.com',
    });
    const [fila] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.objetoId, bien.json().id), eq(bitacora.accion, 'sponsor.update')));
    expect(fila).toMatchObject({
      antes: { nombre: 'Banco' },
      despues: { nombre: 'Banco Ejemplo' },
    });
  });

  it('reordenar las preguntas guarda el orden nuevo de todas', async () => {
    const primera = (
      await pedir('POST', `/eventos/${evento.eventoId}/preguntas`, dueno, {
        pregunta: '¿Hay wifi?',
        respuesta: 'Sí.',
      })
    ).json();
    const lista = (await pedir('GET', `/eventos/${evento.eventoId}/preguntas`, dueno)).json().items;
    const ids = lista.map((p: { id: string }) => p.id).reverse();
    const reordenada = await pedir('PUT', `/eventos/${evento.eventoId}/preguntas/orden`, dueno, {
      ids,
    });
    expect(reordenada.json().items.map((p: { id: string }) => p.id)).toEqual(ids);
    expect(reordenada.json().items[0].id).toBe(primera.id);
    const incompleta = await pedir('PUT', `/eventos/${evento.eventoId}/preguntas/orden`, dueno, {
      ids: [ids[0]],
    });
    expect(incompleta.json().code).toBe('VALIDACION');
  });

  it('el financiador lee el contenido y no lo edita; con el evento cerrado, nadie edita', async () => {
    expect(
      (await pedir('GET', `/eventos/${evento.eventoId}/lugares`, financiador)).statusCode,
    ).toBe(200);
    expect(
      (
        await pedir('POST', `/eventos/${evento.eventoId}/lugares`, financiador, {
          tipo: 'sala',
          nombre: 'No',
        })
      ).json().code,
    ).toBe('SIN_PERMISO');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'cerrado' })
      .where(eq(eventos.id, evento.eventoId));
    expect(
      (
        await pedir('POST', `/eventos/${evento.eventoId}/lugares`, dueno, {
          tipo: 'sala',
          nombre: 'Tarde',
        })
      ).json().code,
    ).toBe('EVENTO_CERRADO');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'borrador' })
      .where(eq(eventos.id, evento.eventoId));
  });
});
