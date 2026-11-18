import { and, eq } from 'drizzle-orm';
import {
  asistentes,
  escaneos,
  eventos,
  invitaciones,
  lugares,
  outbox,
  bitacora,
  pantallas,
  qrEmitidos,
  retos,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import {
  buildQrReto,
  createParLlaves,
  exportLlavePublica,
  getFranjaQr,
  hashCuerpo,
  signPedido,
  toLlaveCruda,
} from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { hashPassword } from '../auth/password';
import { createTokenAleatorio } from '../auth/auth.repository';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

interface Celular {
  readonly asistenteId: string;
  readonly par: CryptoKeyPair;
  readonly cookie: string;
}

/** La pantalla de sala (HU-314) y ganar puntos con su QR (HU-310). Requiere Docker. */
describe('Pantalla de sala y reclamos (HU-314, HU-310)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let tablet: CryptoKeyPair;
  let pantallaId: string;
  let pantallaNumero: number;
  let cookieTablet: string;
  let lugarId: string;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    api = await startApiDePrueba(base);
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ retosRequierenCheckIn: true })
      .where(eq(eventos.id, evento.eventoId));
    lugarId = uuidv7();
    await base.sistema.db.insert(lugares).values({
      id: lugarId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      tipo: 'sala',
      nombre: 'Auditorio',
    });
    tablet = await createParLlaves();
    const { token, hash } = createTokenAleatorio();
    pantallaId = uuidv7();
    await base.sistema.db.insert(pantallas).values({
      id: pantallaId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Tablet Auditorio',
      lugarId,
      estado: 'activa',
      llavePublica: Buffer.from(toLlaveCruda(await exportLlavePublica(tablet))),
      sessionTokenHash: hash,
      pinHash: await hashPassword('4821'),
    });
    cookieTablet = `px_terminal=${token}`;
    const [fila] = await base.sistema.db
      .select({ numero: pantallas.numero })
      .from(pantallas)
      .where(eq(pantallas.id, pantallaId));
    pantallaNumero = fila?.numero ?? 0;
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  });

  async function newReto(datos: Partial<typeof retos.$inferInsert> = {}) {
    const id = uuidv7();
    await base.sistema.db.insert(retos).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Reto ${id.slice(-4)}`,
      puntos: 20,
      topeTotal: 100,
      lugarId: null,
      ...datos,
    });
    const [fila] = await base.sistema.db
      .select({ numero: retos.numero })
      .from(retos)
      .where(eq(retos.id, id));
    return { id, numero: fila?.numero ?? 0 };
  }

  async function newCelular(presente = true): Promise<Celular> {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${asistenteId.slice(-6)}`,
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
      remoteAddress: `10.5.${Math.floor(ip / 250)}.${(ip % 250) + 1}`,
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
    if (presente) {
      await base.sistema.db
        .update(asistentes)
        .set({ estado: 'presente' })
        .where(eq(asistentes.id, asistenteId));
    }
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? '';
    return { asistenteId, par, cookie: `px_asistente=${cookie}` };
  }

  async function reclamar(celular: Celular, qr: string, clave = uuidv7()) {
    const texto = JSON.stringify({ qr });
    const pedido = {
      metodo: 'POST',
      ruta: '/api/v1/app/reclamos',
      clave,
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(texto),
    };
    return api.app.inject({
      method: 'POST',
      url: '/api/v1/app/reclamos',
      headers: {
        cookie: celular.cookie,
        'content-type': 'application/json',
        'idempotency-key': clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(celular.par.privateKey, pedido),
      },
      payload: texto,
    });
  }

  function qrPorTiempo(
    numero: number,
    opciones: { franja?: number; epoca?: number; llave?: CryptoKey } = {},
  ) {
    return buildQrReto(opciones.llave ?? tablet.privateKey, {
      p: pantallaNumero,
      r: numero,
      e: opciones.epoca ?? 0,
      f: opciones.franja ?? getFranjaQr(api.reloj.now().getTime(), 30),
    });
  }

  function getResultados(asistenteId: string) {
    return base.sistema.db
      .select({ resultado: escaneos.resultado })
      .from(escaneos)
      .where(eq(escaneos.asistenteId, asistenteId))
      .then((filas) => filas.map((f) => f.resultado));
  }

  describe('GET /sala/estado y qr-emitidos (HU-314)', () => {
    it('muestra el reto en horario de su lugar, con la hora del servidor y la época', async () => {
      const ahora = api.reloj.now().getTime();
      await newReto({
        lugarId,
        nombre: 'Charla de apertura',
        disponibleDesde: new Date(ahora - 3_600_000),
        disponibleHasta: new Date(ahora + 3_600_000),
      });
      const respuesta = await api.app.inject({
        method: 'GET',
        url: '/api/v1/sala/estado',
        headers: { cookie: cookieTablet },
      });
      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.json()).toMatchObject({
        pantalla: { id: pantallaId, numero: pantallaNumero, lugar: 'Auditorio' },
        estado: 'activa',
        reto: { nombre: 'Charla de apertura', modo: 'por_tiempo', rotacionSegundos: 30 },
        epoca: 0,
        horaServidor: ahora,
        evento: { estado: 'en_curso' },
      });
    });

    it('guarda en tandas lo que mostró, solo con retos del evento', async () => {
      const { id } = await newReto();
      const respuesta = await api.app.inject({
        method: 'POST',
        url: '/api/v1/sala/qr-emitidos',
        headers: { cookie: cookieTablet },
        payload: {
          items: [
            {
              reto: id,
              modo: 'por_tiempo',
              epoca: 0,
              franja: 10,
              inicioAt: new Date().toISOString(),
            },
            {
              reto: id,
              modo: 'un_uso',
              epoca: 0,
              nonce: 'aB3dE5fG7hJ9kL1mN3pQ5r',
              inicioAt: new Date().toISOString(),
              finMotivo: 'usado',
            },
            {
              reto: uuidv7(),
              modo: 'por_tiempo',
              epoca: 0,
              franja: 11,
              inicioAt: new Date().toISOString(),
            },
          ],
        },
      });
      expect(respuesta.json()).toEqual({ guardados: 2 });
      const filas = await base.sistema.db
        .select()
        .from(qrEmitidos)
        .where(eq(qrEmitidos.retoId, id));
      expect(filas).toHaveLength(2);
    });

    it('sin la sesión de la tablet, no responde', async () => {
      const respuesta = await api.app.inject({ method: 'GET', url: '/api/v1/sala/estado' });
      expect(respuesta.json().code).toBe('TERMINAL_DESCONECTADA');
    });
  });

  describe('POST /app/reclamos (HU-310)', () => {
    it('gana los puntos al instante y la pantalla recibe el contador', async () => {
      const reto = await newReto({ puntos: 20 });
      const celular = await newCelular();
      const respuesta = await reclamar(
        celular,
        `https://pasitos.example.com/r/${await qrPorTiempo(reto.numero)}`,
      );
      expect(respuesta.statusCode).toBe(201);
      expect(respuesta.json()).toMatchObject({ reto: { id: reto.id }, puntos: 20, saldo: 20 });
      expect(await getResultados(celular.asistenteId)).toEqual(['aceptado']);
      const avisos = await base.sistema.db
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.tipo, 'contador.actualizado'));
      expect(avisos.map((a) => a.payload)).toContainEqual(
        expect.objectContaining({ pantallaId, retoId: reto.id, entregados: 1 }),
      );
    });

    it('V1: el mismo QR dos veces da los puntos una vez; la misma clave devuelve lo mismo', async () => {
      const reto = await newReto();
      const celular = await newCelular();
      const qr = await qrPorTiempo(reto.numero);
      const clave = uuidv7();
      const primero = await reclamar(celular, qr, clave);
      expect((await reclamar(celular, qr, clave)).json()).toEqual(primero.json());
      const segundo = await reclamar(celular, qr);
      expect(segundo.statusCode).toBe(409);
      expect(segundo.json()).toMatchObject({
        code: 'RETO_YA_COMPLETADO',
        meta: { completadoAt: expect.any(String) },
      });
      expect(await getResultados(celular.asistenteId)).toEqual(['aceptado', 'ya_completado']);
    });

    it('V2: una franja vieja da QR_VENCIDO; dentro de los 5 s de gracia, entra', async () => {
      const reto = await newReto();
      const celular = await newCelular();
      const ahora = api.reloj.now().getTime();
      const actual = getFranjaQr(ahora, 30);
      // Al inicio de una franja, la anterior todavía vale.
      api.reloj.advance(actual * 30_000 + 30_000 + 2_000 - ahora);
      const enGracia = await reclamar(celular, await qrPorTiempo(reto.numero, { franja: actual }));
      expect(enGracia.statusCode).toBe(201);
      const otroReto = await newReto();
      api.reloj.advance(10_000);
      const vieja = await reclamar(celular, await qrPorTiempo(otroReto.numero, { franja: actual }));
      expect(vieja.json().code).toBe('QR_VENCIDO');
      // La época vieja tampoco sirve.
      const otraEpoca = await reclamar(celular, await qrPorTiempo(otroReto.numero, { epoca: 9 }));
      expect(otraEpoca.json().code).toBe('QR_VENCIDO');
    });

    it('V3: un QR de un solo uso lo gana uno solo, aunque lo escaneen a la vez', async () => {
      const reto = await newReto({ modoQr: 'un_uso' });
      const qr = await buildQrReto(tablet.privateKey, {
        p: pantallaNumero,
        r: reto.numero,
        e: 0,
        u: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
      });
      const celulares = await Promise.all([newCelular(), newCelular(), newCelular()]);
      const respuestas = await Promise.all(celulares.map((c) => reclamar(c, qr)));
      const estados = respuestas.map((r) => r.statusCode).sort();
      expect(estados).toEqual([201, 409, 409]);
      expect(
        respuestas
          .filter((r) => r.statusCode === 409)
          .every((r) => r.json().code === 'QR_YA_USADO'),
      ).toBe(true);
      const avisos = await base.sistema.db
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.tipo, 'contador.actualizado'));
      expect(
        avisos.map((a) => a.payload as { retoId: string; nonceUsado?: string }),
      ).toContainEqual(
        expect.objectContaining({ retoId: reto.id, nonceUsado: expect.any(String) }),
      );
    });

    it('V4: con 1 cupo y muchos reclamos a la vez, gana uno solo', async () => {
      const reto = await newReto({ topeTotal: 1 });
      const qr = await qrPorTiempo(reto.numero);
      const celulares = await Promise.all(Array.from({ length: 10 }, () => newCelular()));
      const respuestas = await Promise.all(celulares.map((c) => reclamar(c, qr)));
      expect(respuestas.filter((r) => r.statusCode === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.json().code === 'TOPE_ALCANZADO')).toHaveLength(9);
      const [fila] = await base.sistema.db
        .select({ entregados: retos.entregados })
        .from(retos)
        .where(eq(retos.id, reto.id));
      expect(fila?.entregados).toBe(1);
    });

    it('V5: sin check-in, SIN_CHECK_IN', async () => {
      const reto = await newReto();
      const celular = await newCelular(false);
      expect((await reclamar(celular, await qrPorTiempo(reto.numero))).json().code).toBe(
        'SIN_CHECK_IN',
      );
      expect(await getResultados(celular.asistenteId)).toEqual(['sin_check_in']);
    });

    it('V6: un QR armado sin la llave de la pantalla da QR_INVALIDO; otro texto también', async () => {
      const reto = await newReto();
      const celular = await newCelular();
      const otra = await createParLlaves();
      const falso = await qrPorTiempo(reto.numero, { llave: otra.privateKey });
      expect((await reclamar(celular, falso)).json().code).toBe('QR_INVALIDO');
      expect((await reclamar(celular, 'https://otra-cosa.example.com')).json().code).toBe(
        'QR_INVALIDO',
      );
      expect(await getResultados(celular.asistenteId)).toEqual([
        'firma_invalida',
        'firma_invalida',
      ]);
    });

    it('fuera de horario, con desde; con el evento pausado, EVENTO_NO_ACTIVO', async () => {
      const desde = new Date(api.reloj.now().getTime() + 3_600_000);
      const reto = await newReto({ disponibleDesde: desde });
      const celular = await newCelular();
      const tarde = await reclamar(celular, await qrPorTiempo(reto.numero));
      expect(tarde.json()).toMatchObject({
        code: 'RETO_NO_DISPONIBLE',
        meta: { desde: desde.toISOString() },
      });
      await base.sistema.db
        .update(eventos)
        .set({ estado: 'pausado' })
        .where(eq(eventos.id, evento.eventoId));
      const otro = await newReto();
      const pausado = await reclamar(celular, await qrPorTiempo(otro.numero));
      expect(pausado.json()).toMatchObject({
        code: 'EVENTO_NO_ACTIVO',
        detail: 'Pausamos un momento. Tus puntos están seguros.',
      });
      await base.sistema.db
        .update(eventos)
        .set({ estado: 'en_curso' })
        .where(eq(eventos.id, evento.eventoId));
      const filas = await base.sistema.db
        .select({ resultado: escaneos.resultado })
        .from(escaneos)
        .where(
          and(
            eq(escaneos.asistenteId, celular.asistenteId),
            eq(escaneos.resultado, 'evento_no_activo'),
          ),
        );
      expect(filas).toHaveLength(1);
    });
  });
  describe('controles de la pantalla (HU-315)', () => {
    function controlar(cuerpo: object) {
      return api.app.inject({
        method: 'POST',
        url: '/api/v1/sala/controles',
        headers: { cookie: cookieTablet },
        payload: cuerpo,
      });
    }

    async function getEpoca() {
      const [fila] = await base.sistema.db
        .select({ epoca: pantallas.epoca, estado: pantallas.estado })
        .from(pantallas)
        .where(eq(pantallas.id, pantallaId));
      return fila;
    }

    it('Generar otro invalida el QR al instante, aun dentro de la gracia', async () => {
      const reto = await newReto();
      const celular = await newCelular();
      const antes = await getEpoca();
      const qr = await qrPorTiempo(reto.numero, { epoca: antes?.epoca ?? 0 });
      const respuesta = await controlar({ accion: 'generar_otro', pin: '4821' });
      expect(respuesta.statusCode).toBe(200);
      expect(respuesta.json().epoca).toBe((antes?.epoca ?? 0) + 1);
      expect((await reclamar(celular, qr)).json().code).toBe('QR_VENCIDO');
      const avisos = await base.sistema.db
        .select({ payload: outbox.payload })
        .from(outbox)
        .where(eq(outbox.tipo, 'pantalla.epoca'));
      expect(avisos.map((a) => (a.payload as { pantallaId: string }).pantallaId)).toContain(
        pantallaId,
      );
      const [fila] = await base.sistema.db
        .select({ actor: bitacora.actorNombre, despues: bitacora.despues })
        .from(bitacora)
        .where(and(eq(bitacora.objetoId, pantallaId), eq(bitacora.accion, 'pantalla.control')));
      expect(fila).toMatchObject({
        actor: 'PIN en la tablet',
        despues: { accion: 'generar_otro' },
      });
    });

    it('pausar y reanudar cambian el estado y la época; la pantalla dice En pausa', async () => {
      expect((await controlar({ accion: 'pausar', pin: '4821' })).json()).toMatchObject({
        estado: 'pausada',
      });
      const estado = await api.app.inject({
        method: 'GET',
        url: '/api/v1/sala/estado',
        headers: { cookie: cookieTablet },
      });
      expect(estado.json().estado).toBe('pausada');
      expect((await controlar({ accion: 'reanudar', pin: '4821' })).json()).toMatchObject({
        estado: 'activa',
      });
    });

    it('cambiar de reto: solo los del lugar en horario; sin elegir, vuelve a la agenda', async () => {
      const otroLugar = await newReto({ lugarId: null });
      const malo = await controlar({ accion: 'cambiar_reto', pin: '4821', retoId: otroLugar.id });
      expect(malo.json().code).toBe('VALIDACION');
      const ahora = api.reloj.now().getTime();
      const delLugar = await newReto({
        lugarId,
        nombre: 'Taller del lugar',
        disponibleDesde: new Date(ahora - 60_000),
        disponibleHasta: new Date(ahora + 3_600_000),
      });
      const estadoAntes = (
        await api.app.inject({
          method: 'GET',
          url: '/api/v1/sala/estado',
          headers: { cookie: cookieTablet },
        })
      ).json();
      expect(estadoAntes.opciones).toContainEqual({ id: delLugar.id, nombre: 'Taller del lugar' });
      expect(
        (await controlar({ accion: 'cambiar_reto', pin: '4821', retoId: delLugar.id })).statusCode,
      ).toBe(200);
      const fijado = (
        await api.app.inject({
          method: 'GET',
          url: '/api/v1/sala/estado',
          headers: { cookie: cookieTablet },
        })
      ).json();
      expect(fijado).toMatchObject({ reto: { id: delLugar.id }, fijado: true });
      expect(
        (await controlar({ accion: 'cambiar_reto', pin: '4821', retoId: null })).statusCode,
      ).toBe(200);
    });

    it('cinco PIN incorrectos bloquean los controles 5 minutos', async () => {
      for (let i = 0; i < 5; i++) {
        expect((await controlar({ accion: 'generar_otro', pin: '0000' })).json().code).toBe(
          'PIN_INVALIDO',
        );
      }
      const bloqueado = await controlar({ accion: 'generar_otro', pin: '4821' });
      expect(bloqueado.statusCode).toBe(429);
      api.reloj.advance(5 * 60_000 + 1_000);
      expect((await controlar({ accion: 'generar_otro', pin: '4821' })).statusCode).toBe(200);
    });

    it('el operador controla sus pantallas desde el panel y no las de otros; el historial', async () => {
      const operador = await createPersonaConSesion(base, 'Olga Stand', api.reloj.now());
      const otraPantalla = evento.pantallaId;
      await addRol(base, evento, operador, 'operador_stand', { pantallas: [pantallaId] });
      const suya = await api.app.inject({
        method: 'POST',
        url: `/api/v1/pantallas/${pantallaId}/controles`,
        headers: { cookie: operador.cookie },
        payload: { accion: 'generar_otro' },
      });
      expect(suya.statusCode).toBe(200);
      const ajena = await api.app.inject({
        method: 'POST',
        url: `/api/v1/pantallas/${otraPantalla}/controles`,
        headers: { cookie: operador.cookie },
        payload: { accion: 'generar_otro' },
      });
      expect(ajena.statusCode).toBe(404);

      const mias = await api.app.inject({
        method: 'GET',
        url: `/api/v1/eventos/${evento.eventoId}/mis-pantallas`,
        headers: { cookie: operador.cookie },
      });
      expect((mias.json().items as { id: string }[]).map((p) => p.id)).toEqual([pantallaId]);

      const historial = await api.app.inject({
        method: 'GET',
        url: `/api/v1/pantallas/${pantallaId}/historial`,
        headers: { cookie: operador.cookie },
      });
      expect(historial.statusCode).toBe(200);
      const cuerpo = historial.json();
      expect(cuerpo.aceptados).toBeGreaterThan(0);
      expect(cuerpo.rechazos).toContainEqual(expect.objectContaining({ resultado: 'vencido' }));
      expect(cuerpo.qr.length).toBeGreaterThan(0);
    });
  });
});
