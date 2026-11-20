import { eq } from 'drizzle-orm';
import { actividades, eventos, preguntasFrecuentes, premios, retos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createEventoDePrueba, type EventoDePrueba } from '../../pruebas/equipo-de-prueba';

const TODAS = [
  'descripcion',
  'fecha',
  'lugar',
  'agenda',
  'sponsors',
  'preguntas',
  'retos',
  'catalogo',
  'contacto',
];

/** La página pública del evento (HU-406), con PostgreSQL real. Requiere Docker. */
describe('Página pública del evento (HU-406)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  async function newEvento(
    cambios: Partial<typeof eventos.$inferInsert>,
  ): Promise<{ evento: EventoDePrueba; slug: string }> {
    const evento = await createEventoDePrueba(base, { nombre: 'Feria pública' });
    const slug = `feria-${evento.eventoId.slice(-12)}`;
    await base.sistema.db
      .update(eventos)
      .set({ slug, estado: 'publicado', visibilidad: 'publico', ...cambios })
      .where(eq(eventos.id, evento.eventoId));
    return { evento, slug };
  }

  const pedir = (url: string) => api.app.inject({ method: 'GET', url: `/api/v1/publico${url}` });

  it('con todas las secciones: lo público, nunca el wifi, los topes ni el stock exacto', async () => {
    const { evento, slug } = await newEvento({
      descripcion: 'Una feria de ciencia',
      contacto: 'Escríbenos al stand',
      wifi: 'clave-del-wifi',
      lugarNombre: 'Centro de Ejemplo',
      seccionesPublicas: TODAS,
    });
    await base.sistema.db.insert(actividades).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      titulo: 'Charla de apertura',
      inicioAt: new Date('2026-12-01T14:00:00Z'),
      finAt: new Date('2026-12-01T15:00:00Z'),
    });
    await base.sistema.db.insert(preguntasFrecuentes).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      pregunta: '¿Hay parqueo?',
      respuesta: 'Sí, en la entrada.',
    });
    await base.sistema.db
      .update(premios)
      .set({ estado: 'activo', stockTotal: 20, stockEntregado: 18 })
      .where(eq(premios.id, evento.recursos.premios));
    await base.sistema.db
      .update(retos)
      .set({ estado: 'activo' })
      .where(eq(retos.id, evento.retoId));

    const respuesta = await pedir(`/eventos/${slug}`);
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['cache-control']).toContain('public, max-age=60');
    const datos = respuesta.json();
    expect(datos).toMatchObject({
      nombre: 'Feria pública',
      organizacion: 'Org de prueba',
      estado: 'proximo',
      descripcion: 'Una feria de ciencia',
      contacto: 'Escríbenos al stand',
      lugar: { nombre: 'Centro de Ejemplo' },
    });
    expect(datos.agenda[0]).toMatchObject({ titulo: 'Charla de apertura', lugar: null });
    expect(datos.preguntas).toContainEqual({
      pregunta: '¿Hay parqueo?',
      respuesta: 'Sí, en la entrada.',
    });
    expect(datos.catalogo[0]).toMatchObject({ nombre: 'Taza', estado: 'pocos' });
    expect(datos.retos.length).toBeGreaterThan(0);
    expect(respuesta.body).not.toContain('clave-del-wifi');
    expect(respuesta.body).not.toContain('stockTotal');
    expect(respuesta.body).not.toContain('topeTotal');
    expect(respuesta.body).not.toContain(evento.eventoId);
  });

  it('solo las secciones marcadas', async () => {
    const { slug } = await newEvento({
      descripcion: 'Oculta',
      contacto: 'Oculto',
      lugarNombre: 'Lugar oculto',
      seccionesPublicas: ['fecha'],
    });
    const datos = (await pedir(`/eventos/${slug}`)).json();
    expect(datos.fecha).not.toBeNull();
    expect(datos).toMatchObject({ descripcion: null, contacto: null, lugar: null });
    expect(datos.agenda).toEqual([]);
    expect(datos.catalogo).toEqual([]);
  });

  it('Solo con enlace tiene página; privado, borrador, demo, prueba e inventado responden igual', async () => {
    const { slug: conEnlace } = await newEvento({ visibilidad: 'solo_enlace' });
    expect((await pedir(`/eventos/${conEnlace}`)).json().visibilidad).toBe('solo_enlace');
    const sinPagina = [
      (await newEvento({ visibilidad: 'privado' })).slug,
      (await newEvento({ estado: 'borrador' })).slug,
      (await newEvento({ tipo: 'demo' })).slug,
      (await newEvento({ tipo: 'prueba' })).slug,
      'no-existe-este-evento',
    ];
    const cuerpos = new Set<string>();
    for (const slug of sinPagina) {
      const respuesta = await pedir(`/eventos/${slug}`);
      expect(respuesta.statusCode).toBe(404);
      const cuerpo = respuesta.json() as Record<string, unknown>;
      delete cuerpo['traceId'];
      cuerpos.add(JSON.stringify(cuerpo));
    }
    expect(cuerpos.size).toBe(1);
    expect([...cuerpos][0]).toContain('EVENTO_SIN_PAGINA_PUBLICA');
  });

  it('mi-entrada: sin la cookie del asistente, o con una inventada, no está vinculado', async () => {
    const { slug } = await newEvento({});
    const sinCookie = await pedir(`/eventos/${slug}/mi-entrada`);
    expect(sinCookie.json()).toEqual({ vinculado: false });
    expect(sinCookie.headers['cache-control']).toBe('private, no-store');
    const inventada = await api.app.inject({
      method: 'GET',
      url: `/api/v1/publico/eventos/${slug}/mi-entrada`,
      headers: { cookie: 'px_asistente=inventada' },
    });
    expect(inventada.json()).toEqual({ vinculado: false });
  });
});
