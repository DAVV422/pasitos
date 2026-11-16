import { randomBytes } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { CorreosService, CUPO_POR_DEFECTO } from '@pasitos/correos';
import { asistentes, Cifrador, eventos, invitaciones, organizaciones } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../comun/reloj';
import { ArchivoAdapter } from '../correos/adaptadores';
import { EnviosCorreoService } from '../correos/envios.service';
import { InvitacionesCorreoGancho } from './invitaciones-correo';

/** El correo de invitación con su enlace descifrado al enviar (HU-211 §2). Requiere Docker. */
describe('invitacion_evento en send-correos', () => {
  let base: BaseDePrueba;
  let carpeta: string;
  const ahora = new Date('2026-11-15T15:00:00Z');
  const reloj: Reloj = { now: () => ahora, sleep: () => Promise.resolve() };
  const cifrador = new Cifrador({ version: 1, llave: randomBytes(32) });
  let organizacionId: string;
  let eventoId: string;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    carpeta = await mkdtemp(join(tmpdir(), 'pasitos-invitaciones-'));
    organizacionId = uuidv7();
    eventoId = uuidv7();
    await base.sistema.db
      .insert(organizaciones)
      .values({ id: organizacionId, nombre: 'Org', slug: `org-${organizacionId}` });
    await base.sistema.db.insert(eventos).values({
      id: eventoId,
      organizacionId,
      slug: `evento-${eventoId}`,
      nombre: 'Evento',
      inicioAt: new Date('2026-12-01T13:00:00Z'),
      finAt: new Date('2026-12-01T21:00:00Z'),
    });
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
    await rm(carpeta, { recursive: true, force: true });
  });

  /** Lo que hace el API al enviar: invitación con el token cifrado y el correo sin el token. */
  async function encolar(email: string) {
    const asistenteId = uuidv7();
    await base.sistema.db.insert(asistentes).values({
      id: asistenteId,
      organizacionId,
      eventoId,
      nombre: 'Ana Prueba',
      email,
      emailEstado: 'en_cola',
    });
    const token = randomBytes(32).toString('base64url');
    const invitacionId = uuidv7();
    await base.sistema.db.insert(invitaciones).values({
      id: invitacionId,
      organizacionId,
      eventoId,
      asistenteId,
      tokenHash: randomBytes(32),
      tokenCifrado: cifrador.encrypt(token),
    });
    const correos = new CorreosService(base.sistema.db, CUPO_POR_DEFECTO, () => ahora);
    const envioId = await correos.enqueue(base.sistema.db, {
      tipo: 'invitacion_evento',
      destinatario: email,
      refId: invitacionId,
      datos: {
        nombre: 'Ana Prueba',
        evento: 'Evento',
        fecha: '01/12/2026',
        lugar: 'Sala',
        nombrePuntos: 'pasos',
        codigo: 'A-0001',
        organizacion: 'Org',
        enlace: 'http://localhost:8080/app/acceso/invitacion',
      },
    });
    await base.sistema.db
      .update(invitaciones)
      .set({ envioCorreoId: envioId })
      .where(eq(invitaciones.id, invitacionId));
    return { asistenteId, invitacionId, token };
  }

  function procesar() {
    return new EnviosCorreoService(
      base.sistema.db,
      new ArchivoAdapter(carpeta),
      CUPO_POR_DEFECTO,
      reloj,
      {
        remitente: 'Pasitos <hola@example.com>',
        correoSoporte: 'soporte@example.com',
        porSegundo: 0,
        maxIntentos: 3,
        porVuelta: 50,
      },
      { invitacion_evento: new InvitacionesCorreoGancho(base.sistema.db, cifrador) },
    ).processCola();
  }

  it('sale con el enlace completo y la invitación queda Enviada', async () => {
    const { asistenteId, invitacionId, token } = await encolar('ana@example.com');
    expect((await procesar()).enviados).toBe(1);
    const [archivo] = await readdir(carpeta);
    const mensaje = JSON.parse(await readFile(join(carpeta, archivo ?? ''), 'utf-8'));
    expect(mensaje.texto).toContain(`/app/acceso/invitacion/${token}`);
    const [invitacion] = await base.sistema.db
      .select()
      .from(invitaciones)
      .where(eq(invitaciones.id, invitacionId));
    expect(invitacion).toMatchObject({ estado: 'enviada', enviadaAt: ahora });
    const [asistente] = await base.sistema.db
      .select()
      .from(asistentes)
      .where(eq(asistentes.id, asistenteId));
    expect(asistente?.emailEstado).toBe('enviado');
  });

  it('el rebote simulado (rebota@example.com) la deja Rebotó', async () => {
    const { asistenteId, invitacionId } = await encolar('rebota@example.com');
    expect((await procesar()).fallidos).toBe(1);
    const [invitacion] = await base.sistema.db
      .select()
      .from(invitaciones)
      .where(eq(invitaciones.id, invitacionId));
    expect(invitacion?.estado).toBe('rebotada');
    const [asistente] = await base.sistema.db
      .select()
      .from(asistentes)
      .where(eq(asistentes.id, asistenteId));
    expect(asistente?.emailEstado).toBe('rebotado');
  });
});
