import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { CorreosService, CUPO_POR_DEFECTO } from '@pasitos/correos';
import { enviosCorreo } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { EJEMPLOS_CORREO } from '@pasitos/dominio/correos';
import type { Reloj } from '../comun/reloj';
import { ArchivoAdapter } from './adaptadores';
import { CorreoError, type CorreoPort, type MensajeCorreo } from './correo.port';
import { EnviosCorreoService, type OpcionesEnvio } from './envios.service';

const OPCIONES: OpcionesEnvio = {
  remitente: 'Pasitos <hola@example.com>',
  correoSoporte: 'soporte@example.com',
  porSegundo: 0,
  maxIntentos: 3,
  porVuelta: 200,
};

/** Proveedor que falla las primeras `n` veces. */
class ProveedorQueFalla implements CorreoPort {
  intentos = 0;
  constructor(
    private readonly fallas: number,
    private readonly temporal: boolean,
  ) {}
  send(): Promise<{ proveedorId: string }> {
    this.intentos += 1;
    if (this.intentos <= this.fallas) {
      return Promise.reject(new CorreoError('el proveedor no responde', this.temporal));
    }
    return Promise.resolve({ proveedorId: `ok-${this.intentos}` });
  }
}

/** Envío de la cola con PostgreSQL real y el adaptador a archivos (T-007 §3). Requiere Docker. */
describe('EnviosCorreoService.processCola', () => {
  let base: BaseDePrueba;
  let carpeta: string;
  let ahora: Date;
  const reloj: Reloj = { now: () => ahora, sleep: () => Promise.resolve() };
  let correos: CorreosService;

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  beforeEach(async () => {
    await base.sistema.db.delete(enviosCorreo);
    carpeta = await mkdtemp(join(tmpdir(), 'pasitos-correos-'));
    ahora = new Date('2026-11-15T15:00:00Z');
    correos = new CorreosService(base.sistema.db, CUPO_POR_DEFECTO, () => ahora);
  });

  afterEach(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  function buildServicio(proveedor: CorreoPort) {
    return new EnviosCorreoService(base.sistema.db, proveedor, CUPO_POR_DEFECTO, reloj, OPCIONES);
  }

  async function enqueueInvitaciones(cantidad: number) {
    for (let i = 0; i < cantidad; i++) {
      await correos.enqueue(base.sistema.db, {
        tipo: 'invitacion_evento',
        destinatario: `invitado${i}@example.com`,
        datos: EJEMPLOS_CORREO.invitacion_evento,
      });
    }
  }

  it('arma el correo desde el catálogo, con HTML, texto y el correo de soporte', async () => {
    const archivo = new ArchivoAdapter(carpeta);
    await correos.enqueue(base.sistema.db, {
      tipo: 'password_cambiada',
      destinatario: 'ana@example.com',
      datos: EJEMPLOS_CORREO.password_cambiada,
    });
    expect(await buildServicio(archivo).processCola()).toEqual({
      enviados: 1,
      fallidos: 0,
      reintentos: 0,
    });

    const [mensaje] = (await archivo.list()) as [MensajeCorreo];
    expect(mensaje).toMatchObject({
      de: 'Pasitos <hola@example.com>',
      para: 'ana@example.com',
      asunto: 'Cambiaste tu contraseña de Pasitos',
      etiquetas: { Tipo: 'password_cambiada' },
    });
    expect(mensaje.html).toContain('<!doctype html>');
    expect(mensaje.html).toContain('soporte@example.com');
    expect(mensaje.texto).toContain('Tu contraseña se cambió el 21/11/2026 a las 15:00.');
    expect(mensaje.texto).toContain('Pasitos · Cada paso cuenta');
    expect(JSON.stringify(mensaje.etiquetas)).not.toContain('ana@');

    const [fila] = await base.sistema.db.select().from(enviosCorreo);
    expect(fila).toMatchObject({ estado: 'enviado', intentos: 1, enviadoAt: ahora });
    expect(fila?.proveedorId).toMatch(/^archivo-/);
  });

  it('100 invitaciones: envía 70 hoy y deja 30 para mañana con su fecha', async () => {
    await enqueueInvitaciones(100);
    const servicio = buildServicio(new ArchivoAdapter(carpeta));
    expect((await servicio.processCola()).enviados).toBe(70);
    // Otra vuelta el mismo día no envía nada más.
    expect((await servicio.processCola()).enviados).toBe(0);

    const pendientes = await base.sistema.db
      .select({ programadoPara: enviosCorreo.programadoPara })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.estado, 'en_cola'));
    expect(pendientes).toHaveLength(30);
    expect(new Set(pendientes.map((p) => p.programadoPara.toISOString()))).toEqual(
      new Set(['2026-11-16T04:00:00.000Z']),
    );

    // Al día siguiente salen los 30.
    ahora = new Date('2026-11-16T12:00:00Z');
    expect((await servicio.processCola()).enviados).toBe(30);
  });

  it('con el cupo de 70 agotado, un correo de seguridad sale igual (reserva)', async () => {
    await enqueueInvitaciones(75);
    const servicio = buildServicio(new ArchivoAdapter(carpeta));
    await servicio.processCola();
    await correos.enqueue(base.sistema.db, {
      tipo: 'cuenta_bloqueada',
      destinatario: 'ana@example.com',
      datos: EJEMPLOS_CORREO.cuenta_bloqueada,
    });
    expect(await servicio.processCola()).toEqual({ enviados: 1, fallidos: 0, reintentos: 0 });
    const [seguridad] = await base.sistema.db
      .select({ estado: enviosCorreo.estado })
      .from(enviosCorreo)
      .where(eq(enviosCorreo.prioridad, 1));
    expect(seguridad?.estado).toBe('enviado');
  });

  it('un error temporal se reintenta con espera creciente; al tercero, fallido', async () => {
    const proveedor = new ProveedorQueFalla(5, true);
    const servicio = buildServicio(proveedor);
    await correos.enqueue(base.sistema.db, {
      tipo: 'cuenta_bloqueada',
      destinatario: 'ana@example.com',
      datos: EJEMPLOS_CORREO.cuenta_bloqueada,
    });
    expect((await servicio.processCola()).reintentos).toBe(1);
    // Antes del minuto de espera no se vuelve a intentar.
    ahora = new Date(ahora.getTime() + 30_000);
    expect(await servicio.processCola()).toEqual({ enviados: 0, fallidos: 0, reintentos: 0 });
    ahora = new Date(ahora.getTime() + 31_000);
    expect((await servicio.processCola()).reintentos).toBe(1);
    // Segunda espera: 2 minutos.
    ahora = new Date(ahora.getTime() + 121_000);
    expect((await servicio.processCola()).fallidos).toBe(1);
    expect(proveedor.intentos).toBe(3);
    const [fila] = await base.sistema.db.select().from(enviosCorreo);
    expect(fila).toMatchObject({ estado: 'fallido', intentos: 3 });
  });

  it('un error permanente marca fallido sin reintentar', async () => {
    const proveedor = new ProveedorQueFalla(1, false);
    await correos.enqueue(base.sistema.db, {
      tipo: 'cuenta_bloqueada',
      destinatario: 'ana@example.com',
      datos: EJEMPLOS_CORREO.cuenta_bloqueada,
    });
    expect((await buildServicio(proveedor).processCola()).fallidos).toBe(1);
    expect(proveedor.intentos).toBe(1);
  });

  it('un correo con datos incompletos en la base queda fallido y no frena la cola', async () => {
    const archivo = new ArchivoAdapter(carpeta);
    await base.sistema.db.insert(enviosCorreo).values({
      id: '01900000-0000-7000-8000-0000000000aa',
      tipo: 'restablecer_password',
      prioridad: 1,
      destinatario: 'roto@example.com',
      datos: { nombre: 'Sin enlace' },
      programadoPara: ahora,
    });
    await correos.enqueue(base.sistema.db, {
      tipo: 'cuenta_bloqueada',
      destinatario: 'ana@example.com',
      datos: EJEMPLOS_CORREO.cuenta_bloqueada,
    });
    expect(await buildServicio(archivo).processCola()).toEqual({
      enviados: 1,
      fallidos: 1,
      reintentos: 0,
    });
  });
});
