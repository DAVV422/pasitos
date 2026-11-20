import { eq } from 'drizzle-orm';
import { eventos } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createEventoDePrueba } from '../../pruebas/equipo-de-prueba';

const HORA = 3_600_000;

/** La sección *Eventos* (HU-405), con PostgreSQL real. Requiere Docker. */
describe('Eventos públicos (HU-405)', () => {
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
    nombre: string,
    cambios: Partial<typeof eventos.$inferInsert>,
  ): Promise<string> {
    const evento = await createEventoDePrueba(base, { nombre });
    await base.sistema.db
      .update(eventos)
      .set({ visibilidad: 'publico', ...cambios })
      .where(eq(eventos.id, evento.eventoId));
    return evento.eventoId;
  }

  function listar(momento: string, extra = '') {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1/publico/eventos?momento=${momento}${extra}`,
    });
  }

  const nombres = (respuesta: Awaited<ReturnType<typeof listar>>) =>
    (respuesta.json().items as { nombre: string }[]).map((e) => e.nombre);

  it('cada momento con lo suyo; nunca demo, prueba, privado, solo con enlace ni borrador', async () => {
    const ahora = api.reloj.now().getTime();
    const futuro = { inicioAt: new Date(ahora + 48 * HORA), finAt: new Date(ahora + 56 * HORA) };
    await newEvento('Próximo A', { estado: 'publicado', ...futuro });
    await newEvento('En curso B', { estado: 'en_curso' });
    await newEvento('Pausado C', { estado: 'pausado' });
    await newEvento('Pasado D', { estado: 'cerrado', cerradoAt: new Date(ahora - HORA) });
    await newEvento('Demo E', { estado: 'publicado', tipo: 'demo', ...futuro });
    await newEvento('Prueba F', { estado: 'en_curso', tipo: 'prueba' });
    await newEvento('Privado G', { estado: 'publicado', visibilidad: 'privado', ...futuro });
    await newEvento('Enlace H', { estado: 'publicado', visibilidad: 'solo_enlace', ...futuro });
    await newEvento('Borrador I', { estado: 'borrador', ...futuro });

    const proximos = await listar('proximos');
    expect(proximos.headers['cache-control']).toContain('public, max-age=60');
    expect(nombres(proximos)).toEqual(['Próximo A']);
    expect(nombres(await listar('en_curso')).sort()).toEqual(['En curso B', 'Pausado C']);
    expect(nombres(await listar('pasados'))).toEqual(['Pasado D']);
    expect(proximos.json().items[0]).toMatchObject({
      estado: 'proximo',
      organizacion: 'Org de prueba',
    });
  });

  it('solo las columnas públicas; el lugar solo si su sección es pública', async () => {
    const ahora = api.reloj.now().getTime();
    await newEvento('Con lugar', {
      estado: 'publicado',
      inicioAt: new Date(ahora + 72 * HORA),
      finAt: new Date(ahora + 80 * HORA),
      lugarNombre: 'Centro de Convenciones',
      wifi: 'clave-secreta',
      seccionesPublicas: ['descripcion', 'fecha', 'lugar'],
    });
    await newEvento('Sin lugar', {
      estado: 'publicado',
      inicioAt: new Date(ahora + 96 * HORA),
      finAt: new Date(ahora + 104 * HORA),
      lugarNombre: 'Lugar oculto',
      seccionesPublicas: ['descripcion', 'fecha'],
    });
    const respuesta = await listar('proximos');
    const items = respuesta.json().items as Record<string, unknown>[];
    expect(items.find((e) => e['nombre'] === 'Con lugar')?.['lugar']).toBe(
      'Centro de Convenciones',
    );
    expect(items.find((e) => e['nombre'] === 'Sin lugar')?.['lugar']).toBeNull();
    expect(Object.keys(items[0] ?? {}).sort()).toEqual(
      [
        'estado',
        'finAt',
        'imagen',
        'inicioAt',
        'lugar',
        'nombre',
        'organizacion',
        'slug',
        'zonaHoraria',
      ].sort(),
    );
    expect(respuesta.body).not.toContain('clave-secreta');
    expect(respuesta.body).not.toContain('Lugar oculto');
  });

  it('el cursor recorre todo sin repetir', async () => {
    const ahora = api.reloj.now().getTime();
    for (let i = 0; i < 5; i++) {
      await newEvento(`Serie ${i}`, {
        estado: 'publicado',
        inicioAt: new Date(ahora + (200 + i) * HORA),
        finAt: new Date(ahora + (208 + i) * HORA),
      });
    }
    const vistos: string[] = [];
    let cursor: string | null = null;
    do {
      const respuesta = await listar(
        'proximos',
        `&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      vistos.push(...nombres(respuesta));
      cursor = respuesta.json().pagination.nextCursor;
    } while (cursor);
    expect(new Set(vistos).size).toBe(vistos.length);
    expect(vistos.filter((n) => n.startsWith('Serie '))).toEqual([
      'Serie 0',
      'Serie 1',
      'Serie 2',
      'Serie 3',
      'Serie 4',
    ]);
  });
});
