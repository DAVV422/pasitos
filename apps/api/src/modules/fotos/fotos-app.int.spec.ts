import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import {
  archivos,
  asistenteGrupos,
  asistentes,
  enviosFoto,
  eventos,
  grupos,
  invitaciones,
  retos,
} from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { VERSION_TERMINOS } from '@pasitos/dominio';
import { createParLlaves, exportLlavePublica, hashCuerpo, signPedido } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { startApiDePrueba, type ApiDePrueba } from '../../pruebas/api-de-prueba';
import {
  addRol,
  createEventoDePrueba,
  createPersonaConSesion,
  type EventoDePrueba,
  type PersonaDePrueba,
} from '../../pruebas/equipo-de-prueba';
import { createImagen } from '../archivos/pruebas/archivos-de-prueba';
import { createTokenAleatorio } from '../auth/auth.repository';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

interface Celular {
  readonly asistenteId: string;
  readonly par: CryptoKeyPair;
  readonly cookie: string;
}

/** Enviar la foto de un reto (HU-322). Requiere Docker. */
describe('Retos con foto: enviar (HU-322)', () => {
  let base: BaseDePrueba;
  let api: ApiDePrueba;
  let evento: EventoDePrueba;
  let duena: PersonaDePrueba;
  let archivosDir: string;
  let foto: Buffer;
  let ip = 0;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    archivosDir = await mkdtemp(join(tmpdir(), 'pasitos-fotos-'));
    api = await startApiDePrueba(base, { archivosDir });
    evento = await createEventoDePrueba(base, { estado: 'en_curso' });
    await base.sistema.db
      .update(eventos)
      .set({ retosRequierenCheckIn: false })
      .where(eq(eventos.id, evento.eventoId));
    duena = await createPersonaConSesion(base, 'Dora Duena');
    await addRol(base, evento, duena, 'dueno');
    foto = await createImagen('jpeg', 1200, 900);
  }, 180_000);

  afterAll(async () => {
    await api?.close();
    await base?.stop();
    await rm(archivosDir, { recursive: true, force: true });
  }, 60_000);

  function panel(metodo: 'POST' | 'PATCH', url: string, cuerpo: object) {
    return api.app.inject({
      method: metodo,
      url: `/api/v1${url}`,
      headers: { cookie: duena.cookie, 'content-type': 'application/json' },
      payload: JSON.stringify(cuerpo),
    });
  }

  async function newReto(extra: Partial<typeof retos.$inferInsert> = {}): Promise<string> {
    const id = uuidv7();
    await base.sistema.db.insert(retos).values({
      id,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Foto ${id.slice(-4)}`,
      tipo: 'foto',
      puntos: 20,
      topeTotal: 100,
      instruccionFoto: 'Una foto con la mascota del stand',
      ...extra,
    });
    return id;
  }

  async function newCelular(): Promise<Celular> {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: `Persona ${asistenteId.slice(-5)}`,
      estado: 'registrado',
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
    const cookie = respuesta.cookies.find((c) => c.name === 'px_asistente')?.value ?? '';
    return { asistenteId, par, cookie: `px_asistente=${cookie}` };
  }

  /** Arma el multipart y lo firma sobre el SHA-256 del archivo (HU-322 §3). */
  async function enviar(
    celular: Celular,
    retoId: string,
    opciones: {
      origen?: string;
      autorizaUso?: boolean;
      clave?: string;
      datos?: Buffer;
      hashFirmado?: string;
    } = {},
  ) {
    const datos = opciones.datos ?? foto;
    const limite = '----pasitos-foto';
    const campo = (nombre: string, valor: string) =>
      `--${limite}\r\nContent-Disposition: form-data; name="${nombre}"\r\n\r\n${valor}\r\n`;
    const payload = Buffer.concat([
      Buffer.from(campo('origen', opciones.origen ?? 'camara')),
      Buffer.from(campo('autorizaUso', String(opciones.autorizaUso ?? false))),
      Buffer.from(
        `--${limite}\r\nContent-Disposition: form-data; name="foto"; filename="foto.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      datos,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const ruta = `/api/v1/app/retos/${retoId}/fotos`;
    const pedido = {
      metodo: 'POST',
      ruta,
      clave: opciones.clave ?? uuidv7(),
      timestamp: api.reloj.now().getTime(),
      hashCuerpo: opciones.hashFirmado ?? (await hashCuerpo(new Uint8Array(datos))),
    };
    return api.app.inject({
      method: 'POST',
      url: ruta,
      headers: {
        cookie: celular.cookie,
        'content-type': `multipart/form-data; boundary=${limite}`,
        'idempotency-key': pedido.clave,
        'x-pasitos-timestamp': String(pedido.timestamp),
        'x-pasitos-firma': await signPedido(celular.par.privateKey, pedido),
      },
      payload,
    });
  }

  it('el panel crea un reto con foto: pide la instrucción y responsables del equipo', async () => {
    const base = {
      nombre: 'Foto con la mascota',
      tipo: 'foto',
      puntos: 20,
      topeTotal: 50,
      intentosMax: 2,
      autorizacionUso: 'requerida',
      permiteGaleria: false,
    };
    const sinInstruccion = await panel('POST', `/eventos/${evento.eventoId}/retos`, base);
    expect(sinInstruccion.json().errors[0].field).toBe('instruccionFoto');
    const ajeno = await panel('POST', `/eventos/${evento.eventoId}/retos`, {
      ...base,
      instruccionFoto: 'Una foto con la mascota',
      responsables: [uuidv7()],
    });
    expect(ajeno.json().errors[0].field).toBe('responsables');
    const ok = await panel('POST', `/eventos/${evento.eventoId}/retos`, {
      ...base,
      instruccionFoto: 'Una foto con la mascota',
      responsables: [evento.recursos.miembros ?? ''].filter(Boolean),
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({
      tipo: 'foto',
      instruccionFoto: 'Una foto con la mascota',
      autorizacionUso: 'requerida',
      permiteGaleria: false,
      intentosMax: 2,
    });
  });

  it('enviar: 202 «recibida», la foto en cuarentena; la misma clave no la repite; otra, «en revisión»', async () => {
    const retoId = await newReto();
    const celular = await newCelular();
    const clave = uuidv7();
    const primera = await enviar(celular, retoId, { clave });
    expect(primera.statusCode).toBe(202);
    expect(primera.json()).toMatchObject({ estado: 'recibida' });
    const repetida = await enviar(celular, retoId, { clave });
    expect(repetida.json()).toEqual(primera.json());
    const filas = await base.sistema.db
      .select()
      .from(enviosFoto)
      .where(and(eq(enviosFoto.retoId, retoId), eq(enviosFoto.asistenteId, celular.asistenteId)));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ intento: 1, origen: 'camara', estado: 'recibida' });
    expect(await readdir(join(archivosDir, 'cuarentena'))).toContain(filas[0]?.archivoId);
    const otra = await enviar(celular, retoId);
    expect(otra.statusCode).toBe(409);
    expect(otra.json().code).toBe('FOTO_EN_REVISION');
    // La app ve el estado.
    const estado = await api.app.inject({
      method: 'GET',
      url: '/api/v1/app/estado',
      headers: { cookie: celular.cookie },
    });
    expect(estado.json().retos.find((r: { id: string }) => r.id === retoId)).toMatchObject({
      foto: { estado: 'recibida', intentosRestantes: 3 },
    });
  });

  it('la firma es sobre el archivo: con otro hash, FIRMA_INVALIDA', async () => {
    const retoId = await newReto();
    const respuesta = await enviar(await newCelular(), retoId, {
      hashFirmado: await hashCuerpo('otra cosa'),
    });
    expect(respuesta.json().code).toBe('FIRMA_INVALIDA');
  });

  it('la autorización requerida, la galería, los intentos, lo aprobado y el tope', async () => {
    const celular = await newCelular();
    const requerida = await newReto({ autorizacionUso: 'requerida' });
    expect((await enviar(celular, requerida)).json().code).toBe('AUTORIZACION_REQUERIDA');
    expect((await enviar(celular, requerida, { autorizaUso: true })).statusCode).toBe(202);

    const soloCamara = await newReto({ permiteGaleria: false });
    expect((await enviar(celular, soloCamara, { origen: 'galeria' })).json().errors[0].field).toBe(
      'origen',
    );

    const conIntentos = await newReto({ intentosMax: 2 });
    for (const intento of [1, 2]) {
      await insertEnvio(conIntentos, celular.asistenteId, intento, 'rechazada');
    }
    // Un rechazo del sistema (la imagen dañada) no cuenta.
    await insertEnvio(conIntentos, celular.asistenteId, 3, 'rechazada_sistema');
    expect((await enviar(celular, conIntentos)).json().code).toBe('INTENTOS_AGOTADOS');

    const yaAprobado = await newReto();
    await insertEnvio(yaAprobado, celular.asistenteId, 1, 'aprobada');
    expect((await enviar(celular, yaAprobado)).json().code).toBe('RETO_YA_COMPLETADO');

    const agotado = await newReto({ topeTotal: 1, entregados: 1 });
    expect((await enviar(celular, agotado)).json().code).toBe('TOPE_ALCANZADO');
  });

  it('el horario, el grupo, el check-in y el evento en curso', async () => {
    const celular = await newCelular();
    const mas = new Date(api.reloj.now().getTime() + 3_600_000);
    expect((await enviar(celular, await newReto({ disponibleDesde: mas }))).json().code).toBe(
      'RETO_NO_DISPONIBLE',
    );
    const grupoId = uuidv7();
    await base.sistema.db.insert(grupos).values({
      id: grupoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      nombre: 'VIP fotos',
    });
    const vip = await newReto({ grupoId });
    expect((await enviar(celular, vip)).json().code).toBe('SOLO_PARA_GRUPO');
    await base.sistema.db.insert(asistenteGrupos).values({
      asistenteId: celular.asistenteId,
      grupoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      via: 'manual',
    });
    expect((await enviar(celular, vip)).statusCode).toBe(202);

    await base.sistema.db
      .update(eventos)
      .set({ retosRequierenCheckIn: true })
      .where(eq(eventos.id, evento.eventoId));
    expect((await enviar(celular, await newReto())).json().code).toBe('SIN_CHECK_IN');
    await base.sistema.db
      .update(eventos)
      .set({ retosRequierenCheckIn: false, estado: 'pausado' })
      .where(eq(eventos.id, evento.eventoId));
    expect((await enviar(celular, await newReto())).json().code).toBe('EVENTO_NO_ACTIVO');
    await base.sistema.db
      .update(eventos)
      .set({ estado: 'en_curso' })
      .where(eq(eventos.id, evento.eventoId));
  });

  it('la foto no se sirve por la ruta de archivos, ni con sesión del equipo', async () => {
    const retoId = await newReto();
    const celular = await newCelular();
    await enviar(celular, retoId);
    const [envio] = await base.sistema.db
      .select({ archivoId: enviosFoto.archivoId })
      .from(enviosFoto)
      .where(eq(enviosFoto.retoId, retoId));
    // Como si ya la hubiera procesado el trabajador.
    await base.sistema.db
      .update(archivos)
      .set({ estado: 'aprobado', variantes: { '400': 'eventos/x/400.webp' } })
      .where(eq(archivos.id, envio?.archivoId ?? ''));
    for (const cookie of ['', duena.cookie, celular.cookie]) {
      const respuesta = await api.app.inject({
        method: 'GET',
        url: `/api/v1/archivos/${envio?.archivoId ?? ''}/400`,
        headers: cookie ? { cookie } : {},
      });
      expect(respuesta.statusCode).toBe(404);
    }
  });

  async function insertEnvio(retoId: string, asistenteId: string, intento: number, estado: string) {
    const archivoId = uuidv7();
    await base.sistema.db.insert(archivos).values({
      id: archivoId,
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      proposito: 'foto_reto',
      nombreOriginal: 'foto',
      tamanoBytes: 1,
    });
    await base.sistema.db.insert(enviosFoto).values({
      id: uuidv7(),
      organizacionId: evento.organizacionId,
      eventoId: evento.eventoId,
      retoId,
      asistenteId,
      intento,
      archivoId,
      origen: 'camara',
      estado,
    });
  }
});
