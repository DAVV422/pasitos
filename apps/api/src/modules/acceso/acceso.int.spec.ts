import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  alertas,
  asistentes,
  dispositivos,
  invitaciones,
  outbox,
  registrosTecnicos,
  vinculaciones,
  withOrganizacion,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import {
  createParLlaves,
  exportLlavePublica,
  hashCuerpo,
  signPedido,
  type LlavePublicaEc,
} from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import {
  Asistente,
  AsistenteActual,
  Firma,
  type ContextoAsistente,
  type FirmaVerificada,
} from '../../common/sesion/asistente';
import { DbService } from '../../infra/db/db.module';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import { createEventoDePrueba, type EventoDePrueba } from '../../pruebas/equipo-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';
import { runIdempotente } from './idempotencia';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const INSTAGRAM = `${CHROME_ANDROID} Instagram 355.0.0.0`;

/** Una ruta firmada e idempotente de prueba: cuenta cuántas veces se ejecutó de verdad. */
@Controller('prueba-firma')
class PruebaFirmaController {
  private veces = 0;
  constructor(@Inject(DbService) private readonly db: DbService) {}

  @Post()
  @Asistente({ firmado: true, momento: 'reclamo' })
  @HttpCode(201)
  post(
    @AsistenteActual() asistente: ContextoAsistente,
    @Firma() firma: FirmaVerificada,
    @Body() cuerpo: unknown,
  ) {
    return withOrganizacion(this.db.db, asistente.organizacionId, (tx) =>
      runIdempotente(tx, `asistente:${asistente.asistenteId}`, firma, () =>
        Promise.resolve({ vez: ++this.veces, cuerpo }),
      ),
    );
  }
}

/** Un navegador de prueba: su llave (no exportable), su id y su cookie de sesión. */
interface Navegador {
  readonly par: CryptoKeyPair;
  readonly llavePublica: LlavePublicaEc;
  readonly deviceId: string;
  cookie?: string | undefined;
}

async function newNavegador(): Promise<Navegador> {
  const par = await createParLlaves();
  return {
    par,
    llavePublica: await exportLlavePublica(par),
    deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  };
}

/** Vincular el celular (HU-306) con PostgreSQL real. Requiere Docker. */
describe('Vincular el celular (HU-306)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base, { controladores: [PruebaFirmaController] });
    evento = await createEventoDePrueba(base, { estado: 'publicado' });
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  /** Un invitado con su enlace de invitación. */
  async function newInvitado(nombre = 'Valeria Quispe') {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre,
    });
    return { asistenteId, token: await newInvitacion(asistenteId) };
  }

  async function newInvitacion(asistenteId: string): Promise<string> {
    const { token, hash } = createTokenAleatorio();
    await base.sistema.db
      .update(invitaciones)
      .set({ estado: 'revocada' })
      .where(eq(invitaciones.asistenteId, asistenteId));
    await base.sistema.db.insert(invitaciones).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId,
      tokenHash: hash,
      tokenCifrado: Buffer.from('cifrado-de-prueba'),
      estado: 'enviada',
    });
    return token;
  }

  /** Cada pedido desde otra IP: el límite es de 10 por minuto por IP. */
  function remoto() {
    ip++;
    return `10.8.${Math.floor(ip / 250)}.${(ip % 250) + 1}`;
  }

  function describir(token: string, navegador?: Navegador) {
    return api.app.inject({
      method: 'GET',
      url: `/api/v1/acceso/invitacion/${token}`,
      remoteAddress: remoto(),
      headers: navegador ? { cookie: `px_device=${navegador.deviceId}` } : {},
    });
  }

  async function vincular(
    token: string,
    navegador: Navegador,
    agente = CHROME_ANDROID,
    senales?: Record<string, string | number | boolean | null>,
  ) {
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: remoto(),
      headers: { 'user-agent': agente },
      payload: {
        tipo: 'invitacion',
        token,
        llavePublica: navegador.llavePublica,
        deviceId: navegador.deviceId,
        ...(senales ? { senales } : {}),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      },
    });
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente');
    if (cookie) navegador.cookie = `px_asistente=${cookie.value}`;
    return respuesta;
  }

  async function firmado(
    navegador: Navegador,
    cuerpo: object,
    opciones: { clave?: string; timestamp?: number; firmarCon?: CryptoKey; ruta?: string } = {},
  ) {
    const texto = JSON.stringify(cuerpo);
    const ruta = opciones.ruta ?? '/api/v1/prueba-firma';
    const pedido = {
      metodo: 'POST',
      ruta,
      clave: opciones.clave ?? uuidv7(),
      timestamp: opciones.timestamp ?? api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(texto),
    };
    const firma = await signPedido(opciones.firmarCon ?? navegador.par.privateKey, pedido);
    return api.app.inject({
      method: 'POST',
      url: ruta,
      headers: {
        cookie: navegador.cookie ?? '',
        'content-type': 'application/json',
        'idempotency-key': pedido.clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': firma,
      },
      payload: texto,
    });
  }

  it('el enlace muestra el evento y el nombre sin consumirse', async () => {
    const { token } = await newInvitado();
    const respuesta = await describir(token);
    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toMatchObject({
      evento: { nombre: 'Evento de prueba' },
      asistente: { nombre: 'Valeria Quispe' },
      terminos: { version: VERSION_TERMINOS },
      yaVinculado: false,
    });
    expect((await describir(token)).statusCode).toBe(200);
  });

  it('vincula el celular: cookie de sesión, invitación usada, asistente registrado y términos', async () => {
    const { asistenteId, token } = await newInvitado('Luis Mamani');
    const celular = await newNavegador();
    const respuesta = await vincular(token, celular);
    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json()).toMatchObject({
      asistente: { nombre: 'Luis Mamani', estado: 'registrado' },
      saldo: 0,
      evento: { id: evento.eventoId, requiereCheckIn: true },
    });
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api' });
    // D43: hasta 30 días después del fin del evento.
    expect(new Date(cookie?.expires ?? 0).toISOString()).toBe('2026-12-31T21:00:00.000Z');

    const estado = await api.app.inject({
      method: 'GET',
      url: '/api/v1/app/estado',
      headers: { cookie: celular.cookie ?? '' },
    });
    expect(estado.statusCode).toBe(200);
    expect(estado.json().asistente.nombre).toBe('Luis Mamani');

    const [invitacion] = await base.sistema.db
      .select({ estado: invitaciones.estado })
      .from(invitaciones)
      .where(eq(invitaciones.asistenteId, asistenteId));
    expect(invitacion?.estado).toBe('usada');
  });

  it('el enlace usado en otro navegador da INVITACION_YA_USADA; el mismo navegador vuelve a entrar', async () => {
    const { token } = await newInvitado('Carla Rojas');
    const celular = await newNavegador();
    expect((await vincular(token, celular)).statusCode).toBe(201);

    const otro = await newNavegador();
    expect((await describir(token, otro)).json().code).toBe('INVITACION_YA_USADA');
    expect((await vincular(token, otro)).statusCode).toBe(409);

    // El mismo navegador perdió la cookie: el enlace lo deja volver a entrar.
    expect((await describir(token, celular)).json().yaVinculado).toBe(true);
    const deNuevo = await vincular(token, { ...celular, cookie: undefined });
    expect(deNuevo.statusCode).toBe(201);
  });

  it('V19: un navegador no puede ser la entrada de dos personas del evento', async () => {
    const primera = await newInvitado('Ana Primera');
    const segunda = await newInvitado('Beto Segundo');
    const celular = await newNavegador();
    expect((await vincular(primera.token, celular)).statusCode).toBe(201);
    const respuesta = await vincular(segunda.token, celular);
    expect(respuesta.statusCode).toBe(409);
    expect(respuesta.json().code).toBe('DISPOSITIVO_YA_VINCULADO');
  });

  it('V17: vincular otro celular anula el anterior, revoca su sesión y lo avisa en vivo', async () => {
    const { asistenteId, token } = await newInvitado('Dora Cambio');
    const viejo = await newNavegador();
    expect((await vincular(token, viejo)).statusCode).toBe(201);

    const nuevo = await newNavegador();
    expect((await vincular(await newInvitacion(asistenteId), nuevo)).statusCode).toBe(201);

    const rechazo = await api.app.inject({
      method: 'GET',
      url: '/api/v1/app/estado',
      headers: { cookie: viejo.cookie ?? '' },
    });
    expect(rechazo.statusCode).toBe(403);
    expect(rechazo.json()).toMatchObject({
      code: 'DISPOSITIVO_NO_VINCULADO',
      meta: { metodo: 'enlace' },
    });
    expect(rechazo.json().meta.anuladaAt).toBeDefined();

    const activas = await base.sistema.db
      .select()
      .from(vinculaciones)
      .where(eq(vinculaciones.asistenteId, asistenteId));
    expect(activas.filter((v) => v.anuladaAt === null)).toHaveLength(1);
    expect(activas.find((v) => v.anuladaAt !== null)?.motivoAnulacion).toBe('nueva_vinculacion');
    const avisos = await base.sistema.db
      .select()
      .from(outbox)
      .where(and(eq(outbox.tipo, 'dispositivo.anulado'), eq(outbox.eventoId, evento.eventoId)));
    expect(avisos.length).toBeGreaterThan(0);
  });

  it('no vincula dentro de otra app (Instagram) ni con términos viejos', async () => {
    const { token } = await newInvitado('Eva Instagram');
    const celular = await newNavegador();
    const dentro = await vincular(token, celular, INSTAGRAM);
    expect(dentro.json().code).toBe('NAVEGADOR_NO_SOPORTADO');
    const viejos = await api.app.inject({
      method: 'POST',
      url: '/api/v1/acceso/vincular',
      remoteAddress: remoto(),
      headers: { 'user-agent': CHROME_ANDROID },
      payload: {
        tipo: 'invitacion',
        token,
        llavePublica: celular.llavePublica,
        deviceId: celular.deviceId,
        terminos: { version: 'vieja', privacidad: 'vieja' },
      },
    });
    expect(viejos.json().code).toBe('VALIDACION');
  });

  it('un enlace inventado o revocado responde como vencido', async () => {
    expect((await describir('no-existe-este-token')).json().code).toBe('ENLACE_VENCIDO');
    const { asistenteId, token } = await newInvitado('Fabi Revocada');
    await newInvitacion(asistenteId);
    expect((await describir(token)).json().code).toBe('ENLACE_VENCIDO');
  });

  it('sin sesión, /app responde 401', async () => {
    const respuesta = await api.app.inject({ method: 'GET', url: '/api/v1/app/estado' });
    expect(respuesta.statusCode).toBe(401);
  });

  describe('firma del dispositivo e idempotencia (HU-306 §4)', () => {
    let celular: Navegador;

    beforeAll(async () => {
      const { token } = await newInvitado('Gina Firma');
      celular = await newNavegador();
      expect((await vincular(token, celular)).statusCode).toBe(201);
    });

    it('acepta la firma correcta y repite la respuesta con la misma clave y el mismo cuerpo', async () => {
      const clave = uuidv7();
      const primera = await firmado(celular, { qr: 'PX1.abc' }, { clave });
      expect(primera.statusCode).toBe(201);
      const segunda = await firmado(celular, { qr: 'PX1.abc' }, { clave });
      expect(segunda.statusCode).toBe(201);
      expect(segunda.json()).toEqual(primera.json());
    });

    it('la misma clave con otro cuerpo da IDEMPOTENCIA_CONFLICTO', async () => {
      const clave = uuidv7();
      expect((await firmado(celular, { qr: 'PX1.uno' }, { clave })).statusCode).toBe(201);
      const otra = await firmado(celular, { qr: 'PX1.dos' }, { clave });
      expect(otra.json().code).toBe('IDEMPOTENCIA_CONFLICTO');
    });

    it('rechaza la firma de otro dispositivo y una hora del celular de más de 5 minutos', async () => {
      const ajeno = await newNavegador();
      const otraLlave = await firmado(celular, { qr: 'x' }, { firmarCon: ajeno.par.privateKey });
      expect(otraLlave.json().code).toBe('FIRMA_INVALIDA');
      const vieja = await firmado(
        celular,
        { qr: 'x' },
        { timestamp: api.reloj.now().getTime() - 6 * 60_000 },
      );
      expect(vieja.json().code).toBe('FIRMA_INVALIDA');
    });

    it('sin Idempotency-Key no pasa', async () => {
      const respuesta = await api.app.inject({
        method: 'POST',
        url: '/api/v1/prueba-firma',
        headers: { cookie: celular.cookie ?? '', 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(respuesta.json().code).toBe('VALIDACION');
    });
  });

  describe('registro técnico y alertas (HU-307)', () => {
    const SENALES = {
      plataforma: 'Android',
      modelo: 'SM-A145M',
      pantalla: '412x915@2.63',
      zonaHoraria: 'America/La_Paz',
      idioma: 'es-BO',
      nucleos: 8,
      memoria: 4,
      tactil: true,
      navegador: 'chrome',
      webdriver: false,
    };

    function getRegistros(asistenteId: string) {
      return base.sistema.db
        .select()
        .from(registrosTecnicos)
        .where(eq(registrosTecnicos.asistenteId, asistenteId))
        .orderBy(registrosTecnicos.id);
    }

    function getAlertas(tipo: string) {
      return base.sistema.db
        .select()
        .from(alertas)
        .where(and(eq(alertas.eventoId, evento.eventoId), eq(alertas.tipo, tipo)))
        .orderBy(alertas.id);
    }

    it('vincular guarda las señales, la huella y el modelo legible; la respuesta no los trae', async () => {
      const { asistenteId, token } = await newInvitado('Rosa Señales');
      const celular = await newNavegador();
      const respuesta = await vincular(token, celular, CHROME_ANDROID, SENALES);
      expect(respuesta.statusCode).toBe(201);
      expect(respuesta.body).not.toMatch(/huella|senales|"ip"|10\.8\./);

      const [registro] = await getRegistros(asistenteId);
      expect(registro).toMatchObject({
        momento: 'vinculacion',
        resultado: 'aceptado',
        senales: SENALES,
        userAgent: CHROME_ANDROID,
      });
      expect(registro?.ip).toMatch(/^10\.8\./);
      const [dispositivo] = await base.sistema.db
        .select()
        .from(dispositivos)
        .where(eq(dispositivos.id, registro?.dispositivoId ?? ''));
      expect(dispositivo?.modelo).toBe('SM-A145M · Chrome');
      expect(dispositivo?.huella).toHaveLength(32);
    });

    it('A1: dos navegadores del mismo celular en dos asistentes, una sola alerta por par', async () => {
      const antes = (await getAlertas('A1')).length;
      const primera = await newInvitado('Ana Huella');
      const segunda = await newInvitado('Beto Huella');
      const senales = { ...SENALES, modelo: 'SM-A556E', pantalla: '384x854@2.81' };
      const uno = await vincular(primera.token, await newNavegador(), CHROME_ANDROID, senales);
      expect(uno.statusCode).toBe(201);
      const dos = await vincular(segunda.token, await newNavegador(), CHROME_ANDROID, senales);
      expect(dos.statusCode).toBe(201);
      // El segundo vuelve a vincular con otro navegador: el par ya tiene su alerta.
      const otraVez = await newInvitacion(segunda.asistenteId);
      const tres = await vincular(otraVez, await newNavegador(), CHROME_ANDROID, senales);
      expect(tres.statusCode).toBe(201);

      const nuevas = (await getAlertas('A1')).slice(antes);
      expect(nuevas).toHaveLength(1);
      expect(nuevas[0]).toMatchObject({
        asistenteId: segunda.asistenteId,
        datos: { otroAsistenteId: primera.asistenteId },
        estado: 'abierta',
      });
      const avisos = await base.sistema.db
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.tipo, 'alerta.creada'));
      expect(avisos.map((a) => (a.payload as { alertaId: string }).alertaId)).toContain(
        nuevas[0]?.id,
      );
    });

    it('A2: el mismo navegador intentando otra inscripción queda registrado y alerta', async () => {
      const mio = await newInvitado('Caro Navegador');
      const ajeno = await newInvitado('Dani Navegador');
      const celular = await newNavegador();
      expect((await vincular(mio.token, celular, CHROME_ANDROID, SENALES)).statusCode).toBe(201);
      const rechazo = await vincular(ajeno.token, celular, CHROME_ANDROID, SENALES);
      expect(rechazo.json().code).toBe('DISPOSITIVO_YA_VINCULADO');

      const [registro] = await getRegistros(ajeno.asistenteId);
      expect(registro).toMatchObject({
        momento: 'vinculacion',
        resultado: 'rechazado',
        motivo: 'DISPOSITIVO_YA_VINCULADO',
      });
      const a2 = (await getAlertas('A2')).filter((a) => a.asistenteId === ajeno.asistenteId);
      expect(a2).toHaveLength(1);
      expect(a2[0]?.dispositivoId).toBe(registro?.dispositivoId);
    });

    it('el enlace usado en otro celular queda como intento fallido', async () => {
      const { asistenteId, token } = await newInvitado('Eva Intento');
      expect((await vincular(token, await newNavegador())).statusCode).toBe(201);
      expect((await vincular(token, await newNavegador())).json().code).toBe('INVITACION_YA_USADA');
      const registros = await getRegistros(asistenteId);
      expect(registros.map((r) => [r.momento, r.resultado, r.motivo])).toEqual([
        ['vinculacion', 'aceptado', null],
        ['intento_fallido', 'rechazado', 'INVITACION_YA_USADA'],
      ]);
    });

    it('A8: un navegador automatizado alerta pero vincula', async () => {
      const { asistenteId, token } = await newInvitado('Fede Robot');
      const respuesta = await vincular(token, await newNavegador(), CHROME_ANDROID, {
        ...SENALES,
        webdriver: true,
      });
      expect(respuesta.statusCode).toBe(201);
      const [a8] = (await getAlertas('A8')).filter((a) => a.asistenteId === asistenteId);
      expect(a8?.datos).toEqual({ motivos: ['webdriver'] });
    });

    it('cada pedido firmado deja su registro con la diferencia de reloj y la latencia, también si falla', async () => {
      const { asistenteId, token } = await newInvitado('Gabi Reclamo');
      const celular = await newNavegador();
      expect((await vincular(token, celular)).statusCode).toBe(201);
      const ok = await firmado(
        celular,
        { qr: 'a' },
        { timestamp: api.reloj.now().getTime() - 1_500 },
      );
      expect(ok.statusCode).toBe(201);
      const otro = await newNavegador();
      const mala = await firmado(celular, { qr: 'b' }, { firmarCon: otro.par.privateKey });
      expect(mala.json().code).toBe('FIRMA_INVALIDA');

      const reclamos = (await getRegistros(asistenteId)).filter((r) => r.momento === 'reclamo');
      expect(reclamos.map((r) => [r.resultado, r.motivo])).toEqual([
        ['aceptado', null],
        ['rechazado', 'FIRMA_INVALIDA'],
      ]);
      expect(reclamos[0]?.diferenciaRelojMs).toBe(1_500);
      expect(reclamos[0]?.latenciaMs).toBeGreaterThanOrEqual(0);
      expect(reclamos[1]?.latenciaMs).toBeNull();
    });
  });

  describe('Mi dispositivo y No fui yo (HU-312)', () => {
    function getApp(url: string, navegador: Navegador) {
      return api.app.inject({
        method: 'GET',
        url: `/api/v1/app/${url}`,
        headers: { cookie: navegador.cookie ?? '' },
      });
    }

    function noFuiYo(
      navegador: Navegador,
      cuerpo: object = { sobre: 'dispositivo' },
      firmarCon?: CryptoKey,
    ) {
      return firmado(navegador, cuerpo, {
        ruta: '/api/v1/app/no-fui-yo',
        ...(firmarCon ? { firmarCon } : {}),
      });
    }

    it('el actual, el historial y los intentos de otro dispositivo, sin IP ni huella', async () => {
      const { asistenteId, token } = await newInvitado('Nora Historial');
      const viejo = await newNavegador();
      expect((await vincular(token, viejo)).statusCode).toBe(201);
      // Un enlace nuevo (como al cambiar de celular) abre la entrada en otro.
      const nuevoToken = await newInvitacion(asistenteId);
      const nuevo = await newNavegador();
      expect((await vincular(nuevoToken, nuevo)).statusCode).toBe(201);
      // Alguien más intenta abrir el mismo enlace.
      expect((await vincular(nuevoToken, await newNavegador())).json().code).toBe(
        'INVITACION_YA_USADA',
      );

      const respuesta = await getApp('dispositivo', nuevo);
      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.body).not.toMatch(/huella|"ip"|10\.8\./);
      expect(respuesta.json()).toMatchObject({
        actual: { modelo: 'Chrome en Android', metodo: 'enlace', puesto: 'Enlace de invitación' },
        historial: [{ modelo: 'Chrome en Android', motivo: 'nueva_vinculacion' }],
        intentos: [{ modelo: 'Chrome en Android', que: 'abrir_enlace' }],
        avisos: [],
      });
    });

    it('el celular anulado ve cuándo se anuló y queda registrado si sigue intentando', async () => {
      const { asistenteId, token } = await newInvitado('Olga Anulada');
      const viejo = await newNavegador();
      await vincular(token, viejo);
      await vincular(await newInvitacion(asistenteId), await newNavegador());
      const rechazo = await getApp('estado', viejo);
      expect(rechazo.json()).toMatchObject({
        code: 'DISPOSITIVO_NO_VINCULADO',
        meta: { metodo: 'enlace' },
      });
      const registros = await base.sistema.db
        .select({ momento: registrosTecnicos.momento, motivo: registrosTecnicos.motivo })
        .from(registrosTecnicos)
        .where(eq(registrosTecnicos.asistenteId, asistenteId));
      expect(registros).toContainEqual({
        momento: 'intento_fallido',
        motivo: 'DISPOSITIVO_NO_VINCULADO',
      });
      // Ninguna otra ruta del celular anulado responde.
      expect((await firmado(viejo, { qr: 'x' })).json().code).toBe('DISPOSITIVO_NO_VINCULADO');
    });

    it('No fui yo desde el celular anulado y desde el actual: un solo aviso abierto', async () => {
      const { asistenteId, token } = await newInvitado('Paula Aviso');
      const viejo = await newNavegador();
      await vincular(token, viejo);
      const nuevo = await newNavegador();
      await vincular(await newInvitacion(asistenteId), nuevo);

      const desdeAnulado = await noFuiYo(viejo);
      expect(desdeAnulado.statusCode).toBe(201);
      expect(desdeAnulado.json()).toMatchObject({
        estado: 'abierta',
        yaExistia: false,
        mensaje: 'Avisamos a la puerta. Acércate con este celular.',
      });
      const desdeActual = await noFuiYo(nuevo);
      expect(desdeActual.json()).toMatchObject({
        alertaId: desdeAnulado.json().alertaId,
        yaExistia: true,
      });
      const filas = await base.sistema.db
        .select()
        .from(alertas)
        .where(and(eq(alertas.asistenteId, asistenteId), eq(alertas.tipo, 'no_fui_yo')));
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({
        prioridad: 'alta',
        datos: { desde: 'anulado', sobre: 'dispositivo' },
      });
      expect((await getApp('dispositivo', nuevo)).json().avisos).toHaveLength(1);
    });

    it('No fui yo no se firma con la llave de otro celular', async () => {
      const { token } = await newInvitado('Rita Firma');
      const celular = await newNavegador();
      await vincular(token, celular);
      const ajeno = await newNavegador();
      expect(
        (await noFuiYo(celular, { sobre: 'dispositivo' }, ajeno.par.privateKey)).json().code,
      ).toBe('FIRMA_INVALIDA');
    });
  });

  it('la sesión vence 30 días después del fin del evento', async () => {
    const { token } = await newInvitado('Hugo Vence');
    const celular = await newNavegador();
    expect((await vincular(token, celular)).statusCode).toBe(201);
    api.reloj.advance(60 * 24 * 60 * 60 * 1000);
    const vencida = await api.app.inject({
      method: 'GET',
      url: '/api/v1/app/estado',
      headers: { cookie: celular.cookie ?? '' },
    });
    expect(vencida.json().code).toBe('SESION_VENCIDA');
  });
});
