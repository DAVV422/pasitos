import { Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import { eventos, miembrosEvento } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import {
  ACCIONES_ESCRITURA,
  ACCIONES_EVENTO,
  ACCIONES_POR_TERMINAL,
  ROLES_EVENTO,
  type AccionEvento,
} from '@pasitos/dominio';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addInvitado,
  createRecursoDePrueba,
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { runV9, type ActorV9 } from '../../pruebas/v9';
import { AccionBitacoraDe } from '../../modules/bitacora/bitacora.service';
import { Contexto, Permiso, type ContextoEvento } from './marcas';
import { RolesCache } from './roles.repository';
import { checkMarcasDeRutas } from './rutas';

/**
 * Un controlador con una ruta por acción de la matriz, armado desde `ACCIONES_EVENTO`: una acción
 * nueva entra sola en V9. Más una ruta por recurso (`/retos/:id`) y una por terminal (²).
 */
@Controller('prueba-permisos')
class PermisosPruebaController {
  @Get('retos/:id')
  @Permiso('contenido.read', { recurso: 'retos' })
  getReto(@Contexto() contexto: ContextoEvento) {
    return { rol: contexto.rol, eventoId: contexto.eventoId };
  }

  @Post('pantallas/:id/control')
  @Permiso('pantallas.control', { recurso: 'pantallas' })
  @AccionBitacoraDe('pantalla.update')
  controlPantalla(@Contexto() contexto: ContextoEvento) {
    return { rol: contexto.rol };
  }
}

const prototipo = PermisosPruebaController.prototype as unknown as Record<string, unknown>;
// Las acciones por terminal (²) necesitan la terminal en la ruta: van con su recurso (arriba la
// pantalla; la mesa llega con su tabla en HU-209).
for (const accion of ACCIONES_EVENTO.filter((a) => !(a in ACCIONES_POR_TERMINAL))) {
  const nombre = `accion_${accion.replace('.', '_')}`;
  prototipo[nombre] = function (contexto: ContextoEvento) {
    return { rol: contexto.rol, accion };
  };
  const descriptor = Object.getOwnPropertyDescriptor(prototipo, nombre) as PropertyDescriptor;
  Get(`:eventoId/${accion}`)(prototipo, nombre, descriptor);
  Permiso(accion as AccionEvento)(prototipo, nombre, descriptor);
  if (ACCIONES_ESCRITURA.has(accion)) {
    AccionBitacoraDe('evento.update')(prototipo, nombre, descriptor);
  }
  Contexto()(prototipo, nombre, 0);
}

/** Permisos por rol con PostgreSQL real (HU-204). Requiere Docker. */
describe('Permisos por rol (HU-204)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let eventoA: EventoDePrueba;
  let eventoB: EventoDePrueba;
  const personas = new Map<string, PersonaDePrueba>();

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base, { controladores: [PermisosPruebaController] });
    eventoA = await createEventoDePrueba(base, { nombre: 'Evento A' });
    eventoB = await createEventoDePrueba(base, { nombre: 'Evento B' });
    for (const rol of ROLES_EVENTO) {
      const persona = await createPersonaConSesion(base, rol);
      await addRol(base, eventoA, persona, rol, {
        pantallas: rol === 'operador_stand' ? [eventoA.pantallaId] : [],
      });
      personas.set(rol, persona);
    }
    personas.set('sin_rol', await createPersonaConSesion(base, 'Sin rol'));
    const deOtro = await createPersonaConSesion(base, 'Dueña del evento B');
    await addRol(base, eventoB, deOtro, 'dueno');
    personas.set('dueno_de_otro', deOtro);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function get(url: string, quien: string) {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1${url}`,
      headers: { cookie: personas.get(quien)?.cookie ?? '' },
    });
  }

  it('V9: cada ruta con @Permiso, con cada rol, sin rol y con rol en otro evento', async () => {
    const actores: ActorV9[] = [
      ...ROLES_EVENTO.map((rol) => ({ nombre: rol, cookie: personas.get(rol)?.cookie ?? '', rol })),
      { nombre: 'sin rol', cookie: personas.get('sin_rol')?.cookie ?? '', rol: null },
      { nombre: 'dueña de otro', cookie: personas.get('dueno_de_otro')?.cookie ?? '', rol: null },
    ];
    const { resultados, rutas } = await runV9(api.app, actores, {
      eventoId: eventoA.eventoId,
      recursos: { ...eventoA.recursos, miembros: await addInvitado(base, eventoA) },
      recrear: (recurso) => createRecursoDePrueba(base, eventoA, recurso),
    });
    expect(rutas).toBeGreaterThanOrEqual(ACCIONES_EVENTO.length);
    const distintos = resultados.filter((r) => r.esperado !== r.obtenido);
    expect(distintos).toEqual([]);
  }, 120_000);

  it('el dueño de la organización tiene rol dueño en todos sus eventos sin estar en miembros_evento', async () => {
    const otroDeLaOrg = await createEventoDePrueba(base, {
      organizacionId: eventoA.organizacionId,
    });
    const respuesta = await get(`/prueba-permisos/${otroDeLaOrg.eventoId}/evento.close`, 'dueno');
    expect(respuesta.json()).toMatchObject({ rol: 'dueno' });
  });

  it('un recurso de otro evento responde 404 aunque sea dueña de ese otro evento', async () => {
    expect((await get(`/prueba-permisos/retos/${eventoB.retoId}`, 'dueno')).json().code).toBe(
      'NO_ENCONTRADO',
    );
    expect(
      (await get(`/prueba-permisos/retos/${eventoB.retoId}`, 'dueno_de_otro')).json(),
    ).toMatchObject({
      rol: 'dueno',
      eventoId: eventoB.eventoId,
    });
    expect((await get('/prueba-permisos/retos/no-es-un-uuid', 'dueno')).statusCode).toBe(404);
  });

  it('² un operador de stand controla sus pantallas y no las de otros (404)', async () => {
    const otraPantalla = (
      await createEventoDePrueba(base, { organizacionId: eventoA.organizacionId })
    ).pantallaId;
    const operador = personas.get('operador_stand')?.cookie ?? '';
    const suya = await api.app.inject({
      method: 'POST',
      url: `/api/v1/prueba-permisos/pantallas/${eventoA.pantallaId}/control`,
      headers: { cookie: operador },
    });
    expect(suya.statusCode).toBe(201);
    const ajena = await api.app.inject({
      method: 'POST',
      url: `/api/v1/prueba-permisos/pantallas/${otraPantalla}/control`,
      headers: { cookie: operador },
    });
    expect(ajena.json().code).toBe('NO_ENCONTRADO');
  });

  it('con el evento cerrado, toda escritura responde EVENTO_CERRADO y la lectura sigue', async () => {
    const cerrado = await createEventoDePrueba(base, { organizacionId: eventoA.organizacionId });
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'cerrado' })
      .where(eq(eventos.id, cerrado.eventoId));
    expect(
      (await get(`/prueba-permisos/${cerrado.eventoId}/contenido.update`, 'dueno')).json().code,
    ).toBe('EVENTO_CERRADO');
    expect(
      (await get(`/prueba-permisos/${cerrado.eventoId}/reporte.read`, 'dueno')).statusCode,
    ).toBe(200);
  });

  it('cambiar el rol vale en la request siguiente al invalidar el caché', async () => {
    const url = `/prueba-permisos/${eventoA.eventoId}/contenido.update`;
    expect((await get(url, 'financiador')).json().code).toBe('SIN_PERMISO');
    const financiador = personas.get('financiador');
    await base.sistema.db
      .update(miembrosEvento)
      .set({ rol: 'coorganizador' })
      .where(
        and(
          eq(miembrosEvento.eventoId, eventoA.eventoId),
          eq(miembrosEvento.usuarioId, financiador?.usuarioId ?? ''),
        ),
      );
    api.app.get(RolesCache).invalidate(financiador?.usuarioId ?? '', eventoA.eventoId);
    expect((await get(url, 'financiador')).json()).toMatchObject({ rol: 'coorganizador' });
  });

  it('una ruta sin marca de acceso hace fallar el arranque', async () => {
    @Controller('sin-marca')
    class SinMarcaController {
      @Get()
      get() {
        return {};
      }
    }
    const modulo = await Test.createTestingModule({
      imports: [(await import('@nestjs/core')).DiscoveryModule],
      controllers: [SinMarcaController],
    }).compile();
    const app = modulo.createNestApplication();
    await app.init();
    expect(() => checkMarcasDeRutas(app)).toThrow('GET /sin-marca');
    await app.close();
  }, 30_000);
});
