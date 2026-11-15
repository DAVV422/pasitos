import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createTransport, type Transporter } from 'nodemailer';
import { uuidv7 } from 'uuidv7';
import { CorreoError, type CorreoPort, type MensajeCorreo } from './correo.port';

/**
 * SMTP sin autenticación, para Mailpit en desarrollo (`smtp://localhost:1025`). Los correos no
 * salen de la computadora: se ven en http://localhost:8025.
 */
export class SmtpAdapter implements CorreoPort {
  private readonly transporte: Transporter;

  constructor(url: string) {
    this.transporte = createTransport(url);
  }

  async send(mensaje: MensajeCorreo): Promise<{ proveedorId: string }> {
    try {
      const info = await this.transporte.sendMail({
        from: mensaje.de,
        to: mensaje.para,
        subject: mensaje.asunto,
        html: mensaje.html,
        text: mensaje.texto,
        headers: Object.fromEntries(
          Object.entries(mensaje.etiquetas).map(([clave, valor]) => [`X-Pasitos-${clave}`, valor]),
        ),
      });
      return { proveedorId: info.messageId };
    } catch (error) {
      const codigo = (error as { responseCode?: number }).responseCode;
      // 5xx de SMTP es permanente (dirección rechazada); lo demás (sin conexión, 4xx), temporal.
      throw new CorreoError(
        error instanceof Error ? error.message : String(error),
        codigo === undefined || codigo < 500,
      );
    }
  }
}

/** Guarda cada correo como JSON en una carpeta. Para los tests y el CI. */
export class ArchivoAdapter implements CorreoPort {
  constructor(private readonly carpeta: string) {}

  async send(mensaje: MensajeCorreo): Promise<{ proveedorId: string }> {
    await mkdir(this.carpeta, { recursive: true });
    const proveedorId = `archivo-${uuidv7()}`;
    await writeFile(
      join(this.carpeta, `${proveedorId}.json`),
      JSON.stringify(mensaje, null, 2),
      'utf-8',
    );
    return { proveedorId };
  }

  /** Los correos guardados, del más viejo al más nuevo. */
  async list(): Promise<MensajeCorreo[]> {
    let archivos: string[];
    try {
      archivos = (await readdir(this.carpeta)).filter((a) => a.endsWith('.json')).sort();
    } catch {
      return [];
    }
    return Promise.all(
      archivos.map(
        async (a) => JSON.parse(await readFile(join(this.carpeta, a), 'utf-8')) as MensajeCorreo,
      ),
    );
  }
}
