import { and, desc, eq } from 'drizzle-orm';
import {
  bitacora,
  enviosCorreo,
  miembrosOrganizacion,
  organizaciones,
  sessions,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { getCookieSesion, startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createPersonaConSesion, type PersonaDePrueba } from '../../pruebas/equipo-de-prueba';

const PASSWORD = 'una frase larga de prueba';

/** Consola de plataforma con PostgreSQL real (HU-202). Requiere Docker. */
describe('Consola de plataforma (HU-202)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let superadmin: PersonaDePrueba;
  let soporte: PersonaDePrueba;
  let sinRol: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    const ahora = api.reloj.now();
    superadmin = await createPersonaConSesion(base, 'Super Admin', ahora, {
      rolPlataforma: 'superadmin',
    });
    soporte = await createPersonaConSesion(base, 'Sofía Soporte', ahora, {
      rolPlataforma: 'soporte',
    });
    sinRol = await createPersonaConSesion(base, 'Sin Rol', ahora);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    quien: PersonaDePrueba | string | null,
    body?: object,
  ) {
    const cookie = typeof quien === 'string' ? quien : quien?.cookie;
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      ...(cookie ? { headers: { cookie } } : {}),
      ...(body ? { payload: body } : {}),
    });
  }

  async function getEnlace(destinatario: string, tipo: string): Promise<string> {
    const [fila] = await base.sistema.db
      .select({ datos: enviosCorreo.datos })
      .from(enviosCorreo)
      .where(and(eq(enviosCorreo.destinatario, destinatario), eq(enviosCorreo.tipo, tipo)))
      .orderBy(desc(enviosCorreo.createdAt));
    return (fila?.datos as { enlace: string }).enlace;
  }

  it('crea una organización con slug, invita a su dueña y ella acepta sin cuenta', async () => {
    const creada = await pedir('POST', '/plataforma/organizaciones', superadmin, {
      nombre: 'Feria de Ciencias Ñandú',
      duenoEmail: 'duena.feria@example.com',
      duenoNombre: 'Ana Dueña',
    });
    expect(creada.statusCode).toBe(201);
    expect(creada.json().slug).toBe('feria-de-ciencias-nandu');

    const enlace = await getEnlace('duena.feria@example.com', 'invitacion_organizacion');
    expect(enlace).toMatch(/^http:\/\/localhost:8080\/admin\/invitacion\//);
    const token = enlace.split('/').at(-1) ?? '';

    const vista = await pedir('GET', `/auth/invitaciones/${token}`, null);
    expect(vista.json()).toMatchObject({
      tipo: 'organizacion',
      email: 'duena.feria@example.com',
      organizacion: 'Feria de Ciencias Ñandú',
      quienInvita: 'Super Admin',
      tieneCuenta: false,
    });

    const aceptada = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, null, {
      nombre: 'Ana Dueña',
      password: PASSWORD,
      aceptaTerminos: true,
    });
    expect(aceptada.statusCode).toBe(200);
    const cookie = getCookieSesion(aceptada);
    // Es dueña: tiene que configurar el segundo factor antes de nada.
    const yo = await pedir('GET', '/auth/yo', cookie ?? null);
    expect(yo.json().segundoFactor).toMatchObject({ requerido: true, estado: 'por_configurar' });

    const [miembro] = await base.sistema.db
      .select()
      .from(miembrosOrganizacion)
      .where(eq(miembrosOrganizacion.organizacionId, creada.json().id));
    expect(miembro).toMatchObject({ estado: 'activo', rol: 'dueno' });

    // El enlace sirve una sola vez.
    expect((await pedir('GET', `/auth/invitaciones/${token}`, null)).json().code).toBe(
      'ENLACE_YA_USADO',
    );
    // Quedó en la bitácora de la consola.
    const lista = await pedir('GET', '/plataforma/bitacora', soporte);
    expect(lista.json().items.map((i: { accion: string }) => i.accion)).toEqual(
      expect.arrayContaining(['organizacion.create', 'organizacion.dueno.accept']),
    );
  });

  it('con cuenta, la invitación se acepta entrando con ese correo; con otro, falla', async () => {
    const otra = await createPersonaConSesion(base, 'Otra', api.reloj.now(), {
      email: 'otra@example.com',
    });
    const duena = await createPersonaConSesion(base, 'Dueña Con Cuenta', api.reloj.now(), {
      email: 'con.cuenta@example.com',
    });
    const creada = await pedir('POST', '/plataforma/organizaciones', superadmin, {
      nombre: 'Organización con cuenta',
      duenoEmail: 'con.cuenta@example.com',
      duenoNombre: 'Dueña Con Cuenta',
    });
    const token =
      (await getEnlace('con.cuenta@example.com', 'invitacion_organizacion')).split('/').at(-1) ??
      '';
    expect((await pedir('GET', `/auth/invitaciones/${token}`, null)).json().tieneCuenta).toBe(true);
    const sinSesion = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, null, {});
    expect(sinSesion.json().code).toBe('NO_AUTENTICADO');
    const conOtra = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, otra, {});
    expect(conOtra.json()).toMatchObject({ code: 'INVITACION_EQUIPO_OTRO_CORREO' });
    expect(conOtra.json().detail).toContain('c•••@example.com');
    const bien = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, duena, {});
    expect(bien.statusCode).toBe(200);
    expect(creada.statusCode).toBe(201);
  });

  it('soporte lee y no escribe; quien no tiene rol de plataforma recibe 404', async () => {
    expect((await pedir('GET', '/plataforma/organizaciones', soporte)).statusCode).toBe(200);
    const escribe = await pedir('POST', '/plataforma/organizaciones', soporte, {
      nombre: 'No',
      duenoEmail: 'no@example.com',
      duenoNombre: 'No',
    });
    expect(escribe.json().code).toBe('SIN_PERMISO');
    expect((await pedir('GET', '/plataforma/organizaciones', sinRol)).json().code).toBe(
      'NO_ENCONTRADO',
    );
    expect((await pedir('GET', '/plataforma/eventos', sinRol)).statusCode).toBe(404);
  });

  it('suspender y reactivar; la organización demo no se suspende', async () => {
    const { id } = (
      await pedir('POST', '/plataforma/organizaciones', superadmin, {
        nombre: 'Para suspender',
        duenoEmail: 'suspender@example.com',
        duenoNombre: 'Dueña',
      })
    ).json();
    expect(
      (
        await pedir('PATCH', `/plataforma/organizaciones/${id}`, superadmin, {
          estado: 'suspendida',
        })
      ).statusCode,
    ).toBe(204);
    const [fila] = await base.sistema.db
      .select()
      .from(organizaciones)
      .where(eq(organizaciones.id, id));
    expect(fila?.estado).toBe('suspendida');
    await base.sistema.db
      .update(organizaciones)
      .set({ esDemo: true, estado: 'activa' })
      .where(eq(organizaciones.id, id));
    const demo = await pedir('PATCH', `/plataforma/organizaciones/${id}`, superadmin, {
      estado: 'suspendida',
    });
    expect(demo.json()).toMatchObject({ code: 'VALIDACION', errors: [{ field: 'estado' }] });
    const [accion] = await base.sistema.db
      .select({ accion: bitacora.accion })
      .from(bitacora)
      .where(eq(bitacora.objetoId, id))
      .orderBy(desc(bitacora.id));
    expect(accion?.accion).toBe('organizacion.suspend');
  });

  it('solo el superadmin nombra personas de Pasitos; el admin no; el superadmin no se cambia', async () => {
    const invitada = await pedir('POST', '/plataforma/usuarios', superadmin, {
      email: 'nueva.admin@example.com',
      nombre: 'Nueva Admin',
      rol: 'admin',
    });
    expect(invitada.statusCode).toBe(201);
    const enlace = await getEnlace('nueva.admin@example.com', 'invitacion_plataforma');
    expect(enlace).toMatch(/\/plataforma\/invitacion\//);
    const token = enlace.split('/').at(-1) ?? '';
    const aceptada = await pedir('POST', `/auth/invitaciones/${token}/aceptar`, null, {
      nombre: 'Nueva Admin',
      password: PASSWORD,
      aceptaTerminos: true,
    });
    expect(aceptada.json()).toEqual({ app: 'plataforma' });

    const admin = await createPersonaConSesion(base, 'Admin Común', api.reloj.now(), {
      rolPlataforma: 'admin',
    });
    const intento = await pedir('POST', '/plataforma/usuarios', admin, {
      email: 'otra.mas@example.com',
      nombre: 'Otra',
      rol: 'soporte',
    });
    expect(intento.json().code).toBe('SIN_PERMISO');

    const lista = await pedir('GET', '/plataforma/usuarios', admin);
    const principal = lista
      .json()
      .items.find((p: { rolPlataforma: string }) => p.rolPlataforma === 'superadmin');
    const cambiar = await pedir('PATCH', `/plataforma/usuarios/${principal.id}`, superadmin, {
      rol: 'soporte',
      motivo: 'prueba de regla',
    });
    expect(cambiar.json().code).toBe('ROL_NO_PERMITIDO');

    // Quitarle el rol cierra sus sesiones.
    const quitar = await pedir('PATCH', `/plataforma/usuarios/${admin.usuarioId}`, superadmin, {
      rol: null,
      motivo: 'ya no trabaja con nosotros',
    });
    expect(quitar.statusCode).toBe(204);
    expect((await pedir('GET', '/auth/yo', admin)).statusCode).toBe(401);
  });

  it('restablecer el segundo factor exige cómo se verificó, cierra sus sesiones y avisa', async () => {
    const perdida = await createPersonaConSesion(base, 'Perdió el Celular', api.reloj.now(), {
      email: 'perdio@example.com',
    });
    const sinVerificacion = await pedir(
      'POST',
      `/plataforma/usuarios/${perdida.usuarioId}/segundo-factor/restablecer`,
      superadmin,
      { motivo: 'perdió el celular' },
    );
    expect(sinVerificacion.json().code).toBe('VALIDACION');
    const bien = await pedir(
      'POST',
      `/plataforma/usuarios/${perdida.usuarioId}/segundo-factor/restablecer`,
      superadmin,
      { motivo: 'perdió el celular', verificacion: 'Videollamada con su CI, 21/11 15:00' },
    );
    expect(bien.statusCode).toBe(204);
    const abiertas = await base.sistema.db
      .select()
      .from(sessions)
      .where(eq(sessions.usuarioId, perdida.usuarioId));
    expect(abiertas.every((s) => s.revocadaAt !== null)).toBe(true);
    expect(await getEnlace('perdio@example.com', 'segundo_factor_restablecido')).toContain(
      '/admin/entrar',
    );
  });

  it('costo de red vacío con la forma de getCostoRed, en stroops y XLM', async () => {
    const costo = await pedir('GET', '/plataforma/costo-red?mes=2026-11', superadmin);
    expect(costo.json()).toEqual({
      transacciones: 0,
      comisionStroops: '0',
      comisionXlm: '0.0000000',
      porOperacion: {},
    });
  });

  it('la consola pide de nuevo el segundo factor a las 8 h', async () => {
    const admin = await createPersonaConSesion(base, 'Admin Ocho Horas', api.reloj.now(), {
      rolPlataforma: 'admin',
    });
    expect((await pedir('GET', '/plataforma/eventos', admin)).statusCode).toBe(200);
    api.reloj.advance(8 * 60 * 60 * 1000 + 1000);
    const vencido = await pedir('GET', '/plataforma/eventos', admin);
    expect(vencido.json()).toMatchObject({
      code: 'SEGUNDO_FACTOR_REQUERIDO',
      meta: { motivo: 'verificar' },
    });
  });
});
