import { eq } from 'drizzle-orm';
import { asistentes, type Db } from '@pasitos/db';
import type { FilaEnvio, GanchoCorreo } from '../correos/envios.service';

/**
 * El aviso *Te registraste* (HU-303, V22): al terminar, el correo del asistente queda *Enviado*
 * o *Rebotó* en la lista. `refId` es el asistente.
 */
export class RegistroPuertaCorreoGancho implements GanchoCorreo {
  constructor(private readonly db: Db) {}

  async onEnviado(envio: FilaEnvio, ahora: Date): Promise<void> {
    await this.setEstado(envio, 'enviado', ahora);
  }

  async onFallido(envio: FilaEnvio, ahora: Date): Promise<void> {
    await this.setEstado(envio, 'rebotado', ahora);
  }

  private async setEstado(envio: FilaEnvio, emailEstado: 'enviado' | 'rebotado', ahora: Date) {
    if (!envio.refId) return;
    await this.db
      .update(asistentes)
      .set({ emailEstado, updatedAt: ahora })
      .where(eq(asistentes.id, envio.refId));
  }
}
