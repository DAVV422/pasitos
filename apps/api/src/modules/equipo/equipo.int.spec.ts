import { and, desc, eq } from 'drizzle-orm';
import { bitacora, enviosCorreo, miembrosEvento, miembroTerminales } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { getCookieSesion, startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

const PASSWORD = 'una frase larga de prueba';
const DIA = 24 * 60 * 60 * 1000;

/** Equipo e invitaciones con PostgreSQL real (HU-203). Requiere Docker. */
describe('Equipo del evento (HU-203)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;
  let coorganizador: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { nombre: 'Feria de Ciencias' });
    dueno = await createPersonaConSesion(base, 'Ana Dueña', api.reloj.now());
    await addRol(base, evento, dueno, 'dueno');
    coorganizador = await createPersonaConSesion(base, 'Coco Coorganizador', api.reloj.now());
    await addRol(base, evento, coorganizador, 'coorganizador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    cookie: string | null,
    body?: object,
  ) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      ...(cookie ? { headers: { cookie } } : {}),
      ...(body ? { payload: body } : {}),
    });
  }

  async function getToken(email: string): Promise<string> {
    const [fila] = await base.sistema.db
      .select({ datos: enviosCorreo.datos })
      .from(enviosCorreo)
      .where(and(eq(enviosCorreo.destinatario, email), eq(enviosCorreo.tipo, 'invitacion_equipo')))
      .orderBy(desc(enviosCorreo.createdAt));
    return (fila?.datos as { enlace: string }).enlace.split('/').at(-1) ?? '';
  }

  function invitar(cookie: string, body: object) {
    return pedir('POST', `/eventos/${evento.eventoId}/miembros`, cookie, body);
  }

  it('la dueña invita con rol y alcance; el correo dice qué va a hacer', async () => {
    const registrador = await invitar(dueno.cookie, {
      email: 'registrador@example.com',
      nombre: 'Rita',
      rol: 'registrador',
      topeRegistrosPuerta: 50,
    });
    expect(registrador.statusCode).toBe(201);
    const stand = await invitar(dueno.cookie, {
      email: 'stand@example.com',
      rol: 'operador_stand',
      terminales: { pantallas: [evento.pantallaId] },
    });
    expect(stand.statusCode).toBe(201);
    const [terminal] = await base.sistema.db
      .select()
      .from(miembroTerminales)
      .where(eq(miembroTerminales.miembroEventoId, stand.json().id));
    expect(terminal?.pantallaId).toBe(evento.pantallaId);

    const [correo] = await base.sistema.db
      .select({ datos: enviosCorreo.datos, prioridad: enviosCorreo.prioridad })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.destinatario, 'registrador@example.com'));
    expect(correo).toMatchObject({
      prioridad: 2,
      datos: {
        nombre: 'Rita',
        quienInvita: 'Ana Dueña',
        rol: 'registrador',
        evento: 'Feria de Ciencias',
        queHace: 'Vas a recibir a los asistentes en la puerta',
      },
    });
    const lista = await pedir('GET', `/eventos/${evento.eventoId}/miembros`, dueno.cookie);
    expect(lista.json().items.map((m: { email: string }) => m.email)).toEqual(
      expect.arrayContaining(['registrador@example.com', 'stand@example.com']),
    );
    expect(
      await base.sistema.db.$count(
        bitacora,
        and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'miembro.invite')),
      ),
    ).toBe(2);
  });

  it('el mismo correo no se invita dos veces; una pantalla de otro evento, 404', async () => {
    await invitar(dueno.cookie, { email: 'repetido@example.com', rol: 'financiador' });
    const otra = await invitar(dueno.cookie, { email: 'repetido@example.com', rol: 'financiador' });
    expect(otra.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'email' }] });
    const ajena = (await createEventoDePrueba(base)).pantallaId;
    const conAjena = await invitar(dueno.cookie, {
      email: 'ajena@example.com',
      rol: 'operador_stand',
      terminales: { pantallas: [ajena] },
    });
    expect(conAjena.statusCode).toBe(404);
  });

  it('¹ un coorganizador no invita, cambia ni quita a un coorganizador', async () => {
    expect(
      (
        await invitar(coorganizador.cookie, {
          email: 'otro.coorg@example.com',
          rol: 'coorganizador',
        })
      ).json().code,
    ).toBe('ROL_NO_PERMITIDO');
    const propio = await base.sistema.db
      .select({ id: miembrosEvento.id })
      .from(miembrosEvento)
      .where(
        and(
          eq(miembrosEvento.eventoId, evento.eventoId),
          eq(miembrosEvento.usuarioId, coorganizador.usuarioId),
        ),
      );
    const idCoorg = propio[0]?.id ?? '';
    expect((await pedir('DELETE', `/miembros/${idCoorg}`, coorganizador.cookie)).json().code).toBe(
      'ROL_NO_PERMITIDO',
    );
    expect(
      (
        await pedir('PATCH', `/miembros/${idCoorg}`, coorganizador.cookie, { rol: 'financiador' })
      ).json().code,
    ).toBe('ROL_NO_PERMITIDO');
    // A un registrador sí.
    expect(
      (await invitar(coorganizador.cookie, { email: 'puerta2@example.com', rol: 'registrador' }))
        .statusCode,
    ).toBe(201);
  });

  it('sin cuenta: acepta, define su contraseña, entra y tiene su rol al instante', async () => {
    await invitar(dueno.cookie, { email: 'nueva@example.com', rol: 'financiador' });
    const token = await getToken('nueva@example.com');
    const vista = await pedir('GET', `/auth/invitaciones/${token}`, null);
    expect(vista.json()).toMatchObject({
      tipo: 'equipo',
      rol: 'financiador',
      quienInvita: 'Ana Dueña',
      evento: { nombre: 'Feria de Ciencias' },
      tieneCuenta: false,
    });
    const aceptada = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, null, {
      nombre: 'Nueva Financiadora',
      password: PASSWORD,
      aceptaTerminos: true,
    });
    expect(aceptada.statusCode).toBe(200);
    const cookie = getCookieSesion(aceptada) ?? '';
    const detalle = await pedir('GET', `/eventos/${evento.eventoId}`, cookie);
    expect(detalle.json().miRol).toBe('financiador');
    // Usado dos veces: el segundo falla.
    expect((await pedir('GET', `/auth/invitaciones/${token}`, null)).json().code).toBe(
      'ENLACE_YA_USADO',
    );
  });

  it('cambiar el rol vale al instante; quitar cierra sus sesiones', async () => {
    await invitar(dueno.cookie, { email: 'cambia@example.com', rol: 'financiador' });
    const token = await getToken('cambia@example.com');
    const aceptada = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, null, {
      nombre: 'Persona que cambia',
      password: PASSWORD,
      aceptaTerminos: true,
    });
    const cookie = getCookieSesion(aceptada) ?? '';
    const [miembro] = await base.sistema.db
      .select({ id: miembrosEvento.id })
      .from(miembrosEvento)
      .where(eq(miembrosEvento.emailInvitado, 'cambia@example.com'));
    const id = miembro?.id ?? '';
    expect((await pedir('GET', `/eventos/${evento.eventoId}/bitacora`, cookie)).json().code).toBe(
      'SIN_PERMISO',
    );

    expect(
      (await pedir('PATCH', `/miembros/${id}`, dueno.cookie, { rol: 'coorganizador' })).statusCode,
    ).toBe(204);
    // Como coorganizador ahora necesita segundo factor: el panel le pide configurarlo.
    const yo = await pedir('GET', '/auth/yo', cookie);
    expect(yo.json().segundoFactor).toMatchObject({ requerido: true, estado: 'por_configurar' });

    expect((await pedir('DELETE', `/miembros/${id}`, dueno.cookie)).statusCode).toBe(204);
    expect((await pedir('GET', '/auth/yo', cookie)).statusCode).toBe(401);
  });

  it('el enlace vence a los 7 días: se ve como vencido y reenviar da uno nuevo', async () => {
    await invitar(dueno.cookie, { email: 'tarde@example.com', rol: 'registrador' });
    const viejo = await getToken('tarde@example.com');
    api.reloj.advance(8 * DIA);
    // La sesión de antes también venció: otra dueña de la organización, con sesión de hoy.
    const duenaHoy = await createPersonaConSesion(base, 'Dueña de hoy', api.reloj.now());
    await addRol(base, evento, duenaHoy, 'dueno');
    const lista = await pedir('GET', `/eventos/${evento.eventoId}/miembros`, duenaHoy.cookie);
    const tarde = lista
      .json()
      .items.find((m: { email: string }) => m.email === 'tarde@example.com');
    expect(tarde.estado).toBe('vencido');
    expect((await pedir('GET', `/auth/invitaciones/${viejo}`, null)).json().code).toBe(
      'ENLACE_VENCIDO',
    );
    expect(
      (await pedir('POST', `/miembros/${tarde.id}/reenviar`, duenaHoy.cookie)).statusCode,
    ).toBe(202);
    const nuevo = await getToken('tarde@example.com');
    expect(nuevo).not.toBe(viejo);
    expect((await pedir('GET', `/auth/invitaciones/${nuevo}`, null)).statusCode).toBe(200);
  });
});
