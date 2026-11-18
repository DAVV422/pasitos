import {
  actividades,
  asistentes,
  invitaciones,
  lugares,
  premios,
  retos,
  withOrganizacion,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import { createParLlaves, exportLlavePublica } from '@pasitos/firmas';
import { LibroRepository, LibroService } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createEventoDePrueba, type EventoDePrueba } from '../../pruebas/equipo-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** `GET /app/estado` y `GET /app/evento` (HU-308) con PostgreSQL real. Requiere Docker. */
describe('Inicio de la app (HU-308)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let ip = 0;
  const libro = new LibroService(new LibroRepository());

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  /** Un invitado vinculado: devuelve su id y la cookie de su sesión. */
  async function newVinculado(nombre: string) {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre,
    });
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db.insert(invitaciones).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId,
      tokenHash: hash,
      tokenCifrado: Buffer.from('cifrado-de-prueba'),
      estado: 'enviada',
    });
    const par = await createParLlaves();
    ip++;
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: `10.9.0.${ip}`,
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'invitacion',
        token,
        llavePublica: await exportLlavePublica(par),
        deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    expect(respuesta.statusCode).toBe(201);
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente');
    return { asistenteId, cookie: `px_asistente=${cookie?.value ?? ''}` };
  }

  async function newReto(datos: Partial<typeof retos.$inferInsert> & { nombre: string }) {
    const id = uuidv7();
    await base.sistema.db.insert(retos).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      puntos: 20,
      topeTotal: 100,
      ...datos,
    });
    return id;
  }

  function get(url: string, cookie: string, etag?: string) {
    return api.app.inject({
      method: 'GET',
      url,
      headers: { cookie, ...(etag ? { 'if-none-match': etag } : {}) },
    });
  }

  it('una sola llamada con el estado de cada reto, el stock y los últimos movimientos', async () => {
    const charla = await newReto({ nombre: 'Charla de apertura' });
    const cierre = await newReto({
      nombre: 'Charla de cierre',
      disponibleDesde: new Date(api.reloj.now().getTime() + 3 * 3_600_000),
    });
    const agotado = await newReto({ nombre: 'Stand lleno', topeTotal: 1 });
    const apagado = await newReto({ nombre: 'Reto apagado', estado: 'desactivado' });
    const premioId = uuidv7();
    await base.sistema.db.insert(premios).values({
      id: premioId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Taza',
      puntos: 50,
      stockTotal: 10,
      stockEntregado: 9,
    });

    const valeria = await newVinculado('Valeria Quispe');
    const otro = await newVinculado('Otro Asistente');
    await withOrganizacion(base.app.db, evento.organizacionId, async (tx) => {
      await libro.addMovimiento(tx, {
        eventoId: evento.eventoId,
        asistenteId: valeria.asistenteId,
        tipo: 'reto',
        origen: 'asistente',
        retoId: charla,
      });
      await libro.addMovimiento(tx, {
        eventoId: evento.eventoId,
        asistenteId: otro.asistenteId,
        tipo: 'reto',
        origen: 'asistente',
        retoId: agotado,
      });
    });

    const respuesta = await get('/api/v1/app/estado', valeria.cookie);
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('private, no-cache');
    const estado = respuesta.json();
    expect(estado).toMatchObject({
      asistente: {
        nombre: 'Valeria Quispe',
        grupos: [],
        ci: { cargado: false, verificado: false },
      },
      saldo: 20,
      evento: { estado: 'en_curso' },
      premios: [{ id: premioId, disponible: 1, pocos: true }],
      ultimosMovimientos: [
        { tipo: 'reto', puntos: 20, detalle: 'Charla de apertura', enStellar: false },
      ],
    });
    const porId = new Map((estado.retos as { id: string; estado: string }[]).map((r) => [r.id, r]));
    expect(porId.get(charla)).toMatchObject({ estado: 'completado', completadas: 1 });
    expect(porId.get(cierre)).toMatchObject({ estado: 'desde' });
    expect(porId.get(agotado)).toMatchObject({ estado: 'agotado' });
    expect(porId.get(apagado)).toMatchObject({ estado: 'desactivado' });
    expect(respuesta.body.length).toBeLessThan(4_096);
  });

  it('responde 304 con el mismo ETag y 200 cuando algo cambia', async () => {
    const lucia = await newVinculado('Lucía Etag');
    const primera = await get('/api/v1/app/estado', lucia.cookie);
    const etag = primera.headers['etag'] as string;
    expect(etag).toMatch(/^"[\w-]+"$/);

    const igual = await get('/api/v1/app/estado', lucia.cookie, etag);
    expect(igual.statusCode).toBe(304);
    expect(igual.body).toBe('');

    await newReto({ nombre: 'Reto nuevo' });
    const cambio = await get('/api/v1/app/estado', lucia.cookie, etag);
    expect(cambio.statusCode).toBe(200);
    expect(cambio.headers['etag']).not.toBe(etag);
  });

  it('GET /app/evento trae la definición de retos y premios y la agenda, con ETag', async () => {
    const lugarId = uuidv7();
    await base.sistema.db.insert(lugares).values({
      id: lugarId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      tipo: 'sala',
      nombre: 'Auditorio',
    });
    const retoId = await newReto({ nombre: 'Taller de Stellar', puntos: 30, lugarId });
    await base.sistema.db.insert(actividades).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      titulo: 'Taller de Stellar',
      inicioAt: new Date('2026-12-01T15:00:00Z'),
      finAt: new Date('2026-12-01T16:00:00Z'),
      lugarId,
      retoId,
    });
    const mario = await newVinculado('Mario Agenda');
    const respuesta = await get('/api/v1/app/evento', mario.cookie);
    expect(respuesta.statusCode).toBe(200);
    const contenido = respuesta.json();
    expect(contenido.retos).toContainEqual(
      expect.objectContaining({
        id: retoId,
        nombre: 'Taller de Stellar',
        puntos: 30,
        lugar: 'Auditorio',
      }),
    );
    expect(contenido.agenda).toContainEqual(
      expect.objectContaining({ titulo: 'Taller de Stellar', lugar: 'Auditorio', retoId }),
    );
    expect(contenido.premios[0]).toMatchObject({ nombre: 'Taza', puntos: 50, imagenUrl: null });
    const igual = await get(
      '/api/v1/app/evento',
      mario.cookie,
      respuesta.headers['etag'] as string,
    );
    expect(igual.statusCode).toBe(304);
  });

  it('sin sesión no responde', async () => {
    const respuesta = await get('/api/v1/app/evento', 'px_asistente=inventada');
    expect(respuesta.json().code).toBe('NO_AUTENTICADO');
  });
});
