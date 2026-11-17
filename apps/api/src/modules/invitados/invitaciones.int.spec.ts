import { createHash } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { asistentes, bitacora, enviosCorreo, invitaciones } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';

/** Invitaciones por correo con PostgreSQL real (HU-211). Requiere Docker. */
describe('Invitaciones por correo (HU-211)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let dueno: PersonaDePrueba;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base);
    dueno = await createPersonaConSesion(base, 'Dueña');
    await addRol(base, evento, dueno, 'dueno');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  function pedir(method: 'GET' | 'POST' | 'PATCH', url: string, body?: object) {
    return api.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { cookie: dueno.cookie },
      ...(body ? { payload: body } : {}),
    });
  }

  async function agregar(nombre: string, email: string | null) {
    const respuesta = await pedir('POST', `/eventos/${evento.eventoId}/asistentes`, {
      nombre,
      email,
      confirmarDuplicado: true,
    });
    return respuesta.json() as { id: string; codigo: string };
  }

  const token = (enlace: string) => enlace.split('/').pop() ?? '';
  const hash = (texto: string) => createHash('sha256').update(texto, 'utf8').digest();

  async function getVigente(asistenteId: string) {
    const [fila] = await base.sistema.db
      .select()
      .from(invitaciones)
      .where(and(eq(invitaciones.asistenteId, asistenteId), ne(invitaciones.estado, 'revocada')));
    return fila;
  }

  it('envía a los pendientes: estima los días, encola y la lista dice En cola', async () => {
    const conCorreo: { id: string; codigo: string }[] = [];
    for (let i = 1; i <= 3; i++) {
      conCorreo.push(await agregar(`Invitado Número ${i}`, `invitado${i}@example.com`));
    }
    await agregar('Sin Correo Alguno', null);

    const estimacion = (
      await pedir('GET', `/eventos/${evento.eventoId}/invitaciones/envios/estimacion`)
    ).json();
    expect(estimacion).toMatchObject({ pendientes: 3, diasEstimados: 1 });

    const envio = await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {});
    expect(envio.statusCode).toBe(202);
    expect(envio.json()).toMatchObject({ encoladas: 3, diasEstimados: 1 });
    expect(envio.json().saleUltimaEl).toBeTruthy();

    const correos = await base.sistema.db
      .select()
      .from(enviosCorreo)
      .where(eq(enviosCorreo.tipo, 'invitacion_evento'));
    expect(correos).toHaveLength(3);
    // En la cola, el enlace va sin el token.
    for (const correo of correos) {
      expect((correo.datos as { enlace: string }).enlace).toMatch(/\/app\/acceso\/invitacion$/);
      expect(correo.prioridad).toBe(4);
    }
    const lista = (await pedir('GET', `/eventos/${evento.eventoId}/asistentes?q=Invitado`)).json();
    const primero = lista.items.find((a: { id: string }) => a.id === conCorreo[0]?.id);
    expect(primero).toMatchObject({
      emailEstado: 'en_cola',
      invitacion: { estado: 'creada', saleEl: expect.any(String) },
    });
    // Ya no quedan pendientes; volver a enviar no repite.
    const otraVez = await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {});
    expect(otraVez.json().encoladas).toBe(0);
    const [registro] = await base.sistema.db
      .select()
      .from(bitacora)
      .where(and(eq(bitacora.eventoId, evento.eventoId), eq(bitacora.accion, 'invitaciones.send')));
    expect(registro?.despues).toEqual({ cantidad: 3 });
  });

  it('los enlaces descargados son los mismos que se mandaron (descifrados) y quedan en la bitácora', async () => {
    const asistente = await agregar('Enlace Fijo Prueba', 'enlace@example.com');
    await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {
      asistenteIds: [asistente.id],
    });
    const url = `/eventos/${evento.eventoId}/invitaciones/enlaces?asistenteIds=${asistente.id}`;
    const primera = (await pedir('GET', url)).json().items[0];
    const segunda = (await pedir('GET', url)).json().items[0];
    expect(primera).toMatchObject({ codigo: asistente.codigo, nombre: 'Enlace Fijo Prueba' });
    expect(segunda.enlace).toBe(primera.enlace);
    const vigente = await getVigente(asistente.id);
    // En la base, solo el hash y la versión cifrada.
    expect(vigente?.tokenHash.equals(hash(token(primera.enlace)))).toBe(true);
    expect(vigente?.tokenCifrado.toString('utf-8')).not.toContain(token(primera.enlace));

    const csv = await pedir('GET', `${url}&formato=csv`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain(primera.enlace);

    const vistas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(
        and(
          eq(bitacora.eventoId, evento.eventoId),
          eq(bitacora.accion, 'invitaciones.enlaces.view'),
        ),
      );
    expect(vistas.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(vistas)).not.toContain(token(primera.enlace));
  });

  it('quien no tiene invitación recibe una al pedir su enlace, sin correo', async () => {
    const asistente = await agregar('Solo Por WhatsApp', null);
    const enlaces = (
      await pedir(
        'GET',
        `/eventos/${evento.eventoId}/invitaciones/enlaces?asistenteIds=${asistente.id}`,
      )
    ).json().items;
    expect(enlaces).toHaveLength(1);
    expect(await getVigente(asistente.id)).toMatchObject({ estado: 'creada', envioCorreoId: null });
  });

  it('reenviar con el correo en cola lo cancela y anula el enlace anterior', async () => {
    const asistente = await agregar('Reenvio En Cola', 'reenvio@example.com');
    await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {
      asistenteIds: [asistente.id],
    });
    const anterior = await getVigente(asistente.id);
    const reenvio = await pedir('POST', `/asistentes/${asistente.id}/invitacion/reenviar`);
    expect(reenvio.statusCode).toBe(202);
    const [revocada] = await base.sistema.db
      .select()
      .from(invitaciones)
      .where(eq(invitaciones.id, anterior?.id ?? ''));
    expect(revocada?.estado).toBe('revocada');
    const [correoAnterior] = await base.sistema.db
      .select()
      .from(enviosCorreo)
      .where(eq(enviosCorreo.id, anterior?.envioCorreoId ?? ''));
    expect(correoAnterior?.estado).toBe('cancelado');
    const nueva = await getVigente(asistente.id);
    expect(nueva?.id).not.toBe(anterior?.id);
    expect(nueva?.tokenHash.equals(anterior?.tokenHash ?? Buffer.alloc(0))).toBe(false);
  });

  it('una invitación usada no se reenvía (INVITACION_YA_USADA)', async () => {
    const asistente = await agregar('Ya Abrio Su Enlace', 'usada@example.com');
    await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {
      asistenteIds: [asistente.id],
    });
    await base.sistema.db
      .update(invitaciones)
      .set({ estado: 'usada', usadaAt: new Date() })
      .where(eq(invitaciones.asistenteId, asistente.id));
    const reenvio = await pedir('POST', `/asistentes/${asistente.id}/invitacion/reenviar`);
    expect(reenvio.statusCode).toBe(409);
    expect(reenvio.json().code).toBe('INVITACION_YA_USADA');
  });

  it('cambiar el correo revoca la invitación sin usar y lo deja pendiente otra vez', async () => {
    const asistente = await agregar('Correo Rebotado Antes', 'rebota@example.com');
    await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {
      asistenteIds: [asistente.id],
    });
    // Lo que haría el trabajador con el rebote.
    await base.sistema.db
      .update(asistentes)
      .set({ emailEstado: 'rebotado' })
      .where(eq(asistentes.id, asistente.id));
    const corregido = await pedir('PATCH', `/asistentes/${asistente.id}`, {
      email: 'corregido@example.com',
    });
    expect(corregido.json()).toMatchObject({ emailEstado: 'pendiente', invitacion: null });
    const envio = await pedir('POST', `/eventos/${evento.eventoId}/invitaciones/envios`, {
      asistenteIds: [asistente.id],
    });
    expect(envio.json().encoladas).toBe(1);
  });
});
