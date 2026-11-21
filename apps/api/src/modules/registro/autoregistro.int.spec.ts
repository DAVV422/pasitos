import { PassThrough } from 'node:stream';
import { and, eq } from 'drizzle-orm';
import {
  alertas,
  asistentes,
  bitacora,
  checkIns,
  dispositivos,
  eventos,
  qrRegistro,
  vinculaciones,
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
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { hashDeviceId } from '../acceso/acceso.service';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CARNET = '4567890 LP';

interface Navegador {
  readonly par: CryptoKeyPair;
  readonly llavePublica: LlavePublicaEc;
  readonly deviceId: string;
  permiso?: string;
  cookie?: string;
}

async function newNavegador(): Promise<Navegador> {
  const par = await createParLlaves();
  return {
    par,
    llavePublica: await exportLlavePublica(par),
    deviceId: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
  };
}

/** El autorregistro con un QR (HU-320). Requiere Docker. */
describe('Autorregistro en la app (HU-320)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let duena: PersonaDePrueba;
  let registrador: PersonaDePrueba;
  let ip = 0;
  const logs: string[] = [];

  beforeAll(async () => {
    base = await startBaseDePrueba();
    const destinoLogs = new PassThrough();
    destinoLogs.on('data', (parte: Buffer) => logs.push(parte.toString('utf8')));
    api = await startApiDePrueba(base, { destinoLogs });
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ autoregistroActivo: true, puntosCheckIn: 10 })
      .where(eq(eventos.id, evento.eventoId));
    duena = await createPersonaConSesion(base, 'Dora Duena');
    registrador = await createPersonaConSesion(base, 'Rita Registra');
    await addRol(base, evento, duena, 'dueno');
    await addRol(base, evento, registrador, 'registrador');
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
  }, 60_000);

  function remoto() {
    ip++;
    return `10.7.${Math.floor(ip / 250)}.${(ip % 250) + 1}`;
  }

  async function newQr(extra: object = {}): Promise<string> {
    const respuesta = await api.app.inject({
      method: 'POST',
      url: `/api/v1/eventos/${evento.eventoId}/qr-registro`,
      headers: { cookie: duena.cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({
        tipo: 'rotativo',
        nombre: `Entrada ${uuidv7().slice(-6)}`,
        muestra: 'miembro',
        usuarioId: registrador.usuarioId,
        ...extra,
      }),
    });
    expect(respuesta.statusCode).toBe(201);
    return respuesta.json().id as string;
  }

  /** Escanear el QR: el navegador recibe el permiso de registro. */
  async function abrir(qrId: string, navegador: Navegador): Promise<void> {
    const franja = await api.app.inject({
      method: 'GET',
      url: `/api/v1/qr-registro/${qrId}/franja`,
      headers: { cookie: registrador.cookie },
    });
    const ruta = new URL(franja.json().url as string).pathname.replace('/app/', '/api/v1/app/');
    const abierto = await api.app.inject({ method: 'GET', url: ruta, remoteAddress: remoto() });
    expect(abierto.statusCode).toBe(200);
    const cookie = abierto.cookies.find((c) => c.name === 'px_registro');
    navegador.permiso = `px_registro=${cookie?.value ?? ''}`;
  }

  async function registrar(
    navegador: Navegador,
    datos: { nombre: string; email?: string; ci?: string; celular?: string | null } = {
      nombre: 'Valeria Quispe',
    },
    senales?: Record<string, string | number | boolean>,
  ) {
    const respuesta = await api.app.inject({
      method: 'POST',
      url: '/api/v1/app/registro',
      remoteAddress: remoto(),
      headers: {
        'user-agent': CHROME_ANDROID,
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
        cookie: navegador.permiso ?? '',
      },
      payload: JSON.stringify({
        ...datos,
        deviceId: navegador.deviceId,
        llavePublica: navegador.llavePublica,
        ...(senales ? { senales } : {}),
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
      }),
    });
    const sesion = respuesta.cookies.find((c) => c.name === 'px_asistente');
    if (sesion) navegador.cookie = `px_asistente=${sesion.value}`;
    return respuesta;
  }

  async function getRegistros(qrId: string): Promise<number> {
    const [fila] = await base.sistema.db
      .select({ registros: qrRegistro.registros })
      .from(qrRegistro)
      .where(eq(qrRegistro.id, qrId));
    return fila?.registros ?? -1;
  }

  it('escanear, escribir el nombre y entrar: cuenta, celular y presente en un solo paso', async () => {
    const qrId = await newQr();
    const celular = await newNavegador();
    await abrir(qrId, celular);
    const respuesta = await registrar(celular, {
      nombre: 'Valeria Quispe',
      email: 'valeria@example.com',
      ci: CARNET,
    });
    expect(respuesta.statusCode).toBe(201);
    expect(respuesta.json()).toMatchObject({
      yaRegistrado: false,
      saldo: 10,
      asistente: { nombre: 'Valeria Quispe', estado: 'presente' },
    });
    expect(celular.cookie).toBeDefined();
    expect(respuesta.cookies.find((c) => c.name === 'px_registro')?.value).toBe('');

    const [cuenta] = await base.sistema.db
      .select()
      .from(asistentes)
      .where(and(eq(asistentes.qrRegistroId, qrId), eq(asistentes.nombre, 'Valeria Quispe')));
    expect(cuenta).toMatchObject({
      origen: 'autoregistro',
      registradoPor: registrador.usuarioId,
      ciUltimos: '890',
    });
    expect(cuenta?.ciCifrado?.toString('utf8')).not.toContain('4567890');
    const [checkIn] = await base.sistema.db
      .select({ metodo: checkIns.metodo, qrRegistroId: checkIns.qrRegistroId })
      .from(checkIns)
      .where(eq(checkIns.asistenteId, cuenta?.id ?? ''));
    expect(checkIn).toEqual({ metodo: 'autoregistro_equipo', qrRegistroId: qrId });
    const [vinculacion] = await base.sistema.db
      .select({ metodo: vinculaciones.metodo })
      .from(vinculaciones)
      .where(eq(vinculaciones.asistenteId, cuenta?.id ?? ''));
    expect(vinculacion?.metodo).toBe('autoregistro');
    expect(await getRegistros(qrId)).toBe(1);

    // La app ya funciona con la sesión.
    const estado = await api.app.inject({
      method: 'GET',
      url: '/api/v1/app/estado',
      headers: { cookie: celular.cookie ?? '' },
    });
    expect(estado.statusCode).toBe(200);

    // La bitácora no guarda ni el carnet ni el correo; *Activar cuentas* ve el nombre corto.
    const filas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(
        and(eq(bitacora.objetoId, cuenta?.id ?? ''), eq(bitacora.accion, 'asistente.autoregistro')),
      );
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas)).not.toContain('4567890');
    expect(JSON.stringify(filas)).not.toContain('valeria@example.com');
    const franja = await api.app.inject({
      method: 'GET',
      url: `/api/v1/qr-registro/${qrId}/franja`,
      headers: { cookie: registrador.cookie },
    });
    expect(franja.json().ultimas[0]).toMatchObject({ nombre: 'Valeria Q.' });
  });

  it('el mismo navegador no crea otra cuenta: entra a la que tiene', async () => {
    const qrId = await newQr();
    const celular = await newNavegador();
    await abrir(qrId, celular);
    expect((await registrar(celular, { nombre: 'Pedro Mamani' })).statusCode).toBe(201);
    await abrir(qrId, celular);
    const otra = await registrar(celular, { nombre: 'Pedro Otra Vez' });
    expect(otra.statusCode).toBe(200);
    expect(otra.json()).toMatchObject({
      yaRegistrado: true,
      asistente: { nombre: 'Pedro Mamani' },
    });
    expect(await getRegistros(qrId)).toBe(1);
    expect(await base.sistema.db.$count(asistentes, eq(asistentes.nombre, 'Pedro Otra Vez'))).toBe(
      0,
    );
  });

  it('el tope con dos registros a la vez y 1 cupo: solo uno entra', async () => {
    const qrId = await newQr({ tope: 1 });
    const [uno, dos] = [await newNavegador(), await newNavegador()];
    await abrir(qrId, uno);
    await abrir(qrId, dos);
    const respuestas = await Promise.all([
      registrar(uno, { nombre: 'Ana Uno' }),
      registrar(dos, { nombre: 'Beto Dos' }),
    ]);
    expect(respuestas.map((r) => r.statusCode).sort()).toEqual([201, 422]);
    expect(respuestas.find((r) => r.statusCode === 422)?.json().code).toBe('QR_REGISTRO_INACTIVO');
    expect(await getRegistros(qrId)).toBe(1);
  });

  it('el permiso vence a los 10 minutos; sin permiso, tampoco', async () => {
    const qrId = await newQr();
    const celular = await newNavegador();
    await abrir(qrId, celular);
    api.reloj.advance(11 * 60_000);
    const vencido = await registrar(celular, { nombre: 'Lenta Persona' });
    expect(vencido.statusCode).toBe(422);
    expect(vencido.json().code).toBe('PERMISO_REGISTRO_VENCIDO');
    const sinPermiso = await registrar(await newNavegador(), { nombre: 'Sin Permiso' });
    expect(sinPermiso.json().code).toBe('PERMISO_REGISTRO_VENCIDO');
  });

  it('sin «Quedan presentes», queda registrada; los correos repetidos se aceptan', async () => {
    const qrId = await newQr({ marcaPresente: false });
    const [uno, dos] = [await newNavegador(), await newNavegador()];
    await abrir(qrId, uno);
    await abrir(qrId, dos);
    const primera = await registrar(uno, { nombre: 'Rosa Uno', email: 'misma@example.com' });
    const segunda = await registrar(dos, { nombre: 'Rosa Dos', email: 'misma@example.com' });
    expect([primera.statusCode, segunda.statusCode]).toEqual([201, 201]);
    expect(primera.json()).toMatchObject({ saldo: 0, asistente: { estado: 'registrado' } });
  });

  it('si un paso falla, no queda nada', async () => {
    const qrId = await newQr();
    const celular = await newNavegador();
    // Este navegador ya fue el celular de otra persona del evento (su vinculación anulada).
    const otraId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: otraId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'Otra Persona',
    });
    const dispositivoId = uuidv7();
    await base.sistema.db.insert(dispositivos).values({
      id: dispositivoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      deviceIdHash: hashDeviceId(celular.deviceId),
      llavePublica: Buffer.alloc(65, 4),
      modelo: 'Android',
      borrarAt: new Date('2027-01-01T00:00:00Z'),
    });
    await base.sistema.db.insert(vinculaciones).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      asistenteId: otraId,
      dispositivoId,
      metodo: 'enlace',
      anuladaAt: new Date('2026-11-15T14:00:00Z'),
    });
    await abrir(qrId, celular);
    const respuesta = await registrar(celular, { nombre: 'Nadie Quedo' });
    expect(respuesta.statusCode).toBe(409);
    expect(await base.sistema.db.$count(asistentes, eq(asistentes.nombre, 'Nadie Quedo'))).toBe(0);
    expect(await getRegistros(qrId)).toBe(0);
  });

  it('Mis datos: edita el carnet y el correo; la bitácora no guarda el número', async () => {
    const qrId = await newQr();
    const celular = await newNavegador();
    await abrir(qrId, celular);
    await registrar(celular, { nombre: 'Carla Datos', ci: '1234567 CB' });
    const datos = await api.app.inject({
      method: 'GET',
      url: '/api/v1/app/yo',
      headers: { cookie: celular.cookie ?? '' },
    });
    expect(datos.json()).toEqual({
      nombre: 'Carla Datos',
      email: null,
      ci: '1234567 CB',
      ciVerificado: false,
      celular: null,
      pideCelular: 'opcional',
    });

    const cuerpo = JSON.stringify({ ci: '7654321 SC', email: 'carla@example.com' });
    const pedido = {
      metodo: 'PATCH',
      ruta: '/api/v1/app/yo',
      clave: uuidv7(),
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(cuerpo),
    };
    const editado = await api.app.inject({
      method: 'PATCH',
      url: '/api/v1/app/yo',
      headers: {
        cookie: celular.cookie ?? '',
        'content-type': 'application/json',
        'idempotency-key': pedido.clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(celular.par.privateKey, pedido),
      },
      payload: cuerpo,
    });
    expect(editado.statusCode).toBe(200);
    expect(editado.json()).toMatchObject({ ci: '7654321 SC', email: 'carla@example.com' });
    const [fila] = await base.sistema.db
      .select({ ultimos: asistentes.ciUltimos, id: asistentes.id })
      .from(asistentes)
      .where(eq(asistentes.nombre, 'Carla Datos'));
    expect(fila?.ultimos).toBe('321');
    const cambios = await base.sistema.db
      .select()
      .from(bitacora)
      .where(
        and(eq(bitacora.objetoId, fila?.id ?? ''), eq(bitacora.accion, 'asistente.editar_datos')),
      );
    expect(cambios).toHaveLength(1);
    expect(JSON.stringify(cambios)).not.toContain('7654321');
  });

  async function setPedirCelular(modo: 'no' | 'opcional' | 'obligatorio') {
    await base.sistema.db
      .update(eventos)
      .set({ pedirCelular: modo })
      .where(eq(eventos.id, evento.eventoId));
  }

  async function getCelular(nombre: string) {
    const [fila] = await base.sistema.db
      .select({ celular: asistentes.celular })
      .from(asistentes)
      .where(eq(asistentes.nombre, nombre));
    return fila?.celular;
  }

  /** `PATCH /app/yo` firmado por el celular de la persona. */
  async function editMisDatos(navegador: Navegador, cambios: object) {
    const cuerpo = JSON.stringify(cambios);
    const pedido = {
      metodo: 'PATCH',
      ruta: '/api/v1/app/yo',
      clave: uuidv7(),
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: await hashCuerpo(cuerpo),
    };
    return api.app.inject({
      method: 'PATCH',
      url: '/api/v1/app/yo',
      headers: {
        cookie: navegador.cookie ?? '',
        'content-type': 'application/json',
        'idempotency-key': pedido.clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(navegador.par.privateKey, pedido),
      },
      payload: cuerpo,
    });
  }

  it('celular (HU-411): opcional se guarda normalizado; obligatorio lo exige; con No pedir se ignora', async () => {
    const qrId = await newQr();
    // Opcional (por defecto): sin celular entra; con celular, normalizado.
    const sinCelular = await newNavegador();
    await abrir(qrId, sinCelular);
    expect((await registrar(sinCelular, { nombre: 'Celia Sin' })).statusCode).toBe(201);
    expect(await getCelular('Celia Sin')).toBeNull();
    const conCelular = await newNavegador();
    await abrir(qrId, conCelular);
    expect(
      (await registrar(conCelular, { nombre: 'Celia Con', celular: '7123 4567' })).statusCode,
    ).toBe(201);
    expect(await getCelular('Celia Con')).toBe('+59171234567');
    const malo = await newNavegador();
    await abrir(qrId, malo);
    const invalido = await registrar(malo, { nombre: 'Celia Mal', celular: '123' });
    expect(invalido.statusCode).toBe(400);
    expect(invalido.json().errors[0]).toMatchObject({ field: 'celular' });

    // Obligatorio: sin celular, VALIDACION en el campo.
    await setPedirCelular('obligatorio');
    const falta = await newNavegador();
    await abrir(qrId, falta);
    const sinNumero = await registrar(falta, { nombre: 'Celia Falta' });
    expect(sinNumero.statusCode).toBe(400);
    expect(sinNumero.json().errors[0]).toMatchObject({
      field: 'celular',
      code: 'CELULAR_REQUERIDO',
    });
    expect(
      (await registrar(falta, { nombre: 'Celia Falta', celular: '+54 9 11 2345 6789' })).statusCode,
    ).toBe(201);
    expect(await getCelular('Celia Falta')).toBe('+5491123456789');

    // Mis datos con obligatorio: se cambia, pero no se deja vacío.
    expect((await editMisDatos(falta, { celular: '' })).statusCode).toBe(400);
    const cambiado = await editMisDatos(falta, { celular: '61234567' });
    expect(cambiado.json()).toMatchObject({ celular: '+59161234567', pideCelular: 'obligatorio' });

    // No pedir: el número que llega no se guarda.
    await setPedirCelular('no');
    const ignorado = await newNavegador();
    await abrir(qrId, ignorado);
    expect(
      (await registrar(ignorado, { nombre: 'Celia Ignorada', celular: '71112222' })).statusCode,
    ).toBe(201);
    expect(await getCelular('Celia Ignorada')).toBeNull();
    // ...y quien ya lo tenía lo puede borrar.
    expect((await editMisDatos(conCelular, { celular: null })).json()).toMatchObject({
      celular: null,
    });
    await setPedirCelular('opcional');

    // Nunca en la bitácora.
    const filas = await base.sistema.db
      .select()
      .from(bitacora)
      .where(eq(bitacora.eventoId, evento.eventoId));
    for (const numero of ['71234567', '61234567', '1123456789']) {
      expect(JSON.stringify(filas)).not.toContain(numero);
    }
  });

  it('A9: 3 cuentas con la misma huella desde el mismo QR en 10 minutos (sin bloquear)', async () => {
    const qrId = await newQr();
    const senales = {
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
    for (const nombre of ['Hugo Uno', 'Hugo Dos', 'Hugo Tres']) {
      const celular = await newNavegador();
      await abrir(qrId, celular);
      expect((await registrar(celular, { nombre }, senales)).statusCode).toBe(201);
    }
    const a9 = await base.sistema.db
      .select({ datos: alertas.datos })
      .from(alertas)
      .where(and(eq(alertas.eventoId, evento.eventoId), eq(alertas.tipo, 'A9')));
    expect(a9).toHaveLength(1);
    expect(a9[0]?.datos).toMatchObject({ qrRegistroId: qrId, cuentas: 3 });
  });

  it('el carnet no aparece en los logs', () => {
    const salida = logs.join('');
    expect(salida.length).toBeGreaterThan(0);
    // HU-411: tampoco el celular.
    for (const numero of ['4567890', '1234567', '7654321', '71234567', '61234567']) {
      expect(salida).not.toContain(numero);
    }
  });
});
