import { eq } from 'drizzle-orm';
import { asistentes, invitaciones, type Cifrador, type Db } from '@pasitos/db';
import type { FilaEnvio, GanchoCorreo } from '../correos/envios.service';

/**
 * El correo `invitacion_evento` (HU-211 §2). En la cola, el enlace va sin el token (solo su
 * comienzo): el token está cifrado en la invitación y se arma aquí, justo antes de mandarlo.
 * Al terminar, la invitación y el asistente pasan a *Enviada* o *Rebotó*.
 */
export class InvitacionesCorreoGancho implements GanchoCorreo {
  constructor(
    private readonly db: Db,
    private readonly cifrador: Cifrador | null,
  ) {}

  async prepare(envio: FilaEnvio): Promise<Record<string, unknown>> {
    const invitacion = await this.getInvitacion(envio);
    if (!invitacion || invitacion.estado === 'revocada') {
      throw new Error('La invitación ya no está vigente');
    }
    if (!this.cifrador) {
      throw new Error('Falta LLAVE_CIFRADO_DATOS en el trabajador');
    }
    const datos = envio.datos as Record<string, unknown>;
    const token = this.cifrador.decryptTexto(Buffer.from(invitacion.tokenCifrado));
    return { ...datos, enlace: `${String(datos['enlace'])}/${token}` };
  }

  async onEnviado(envio: FilaEnvio, ahora: Date): Promise<void> {
    await this.setEstado(envio, 'enviada', 'enviado', ahora);
  }

  async onFallido(envio: FilaEnvio, ahora: Date): Promise<void> {
    await this.setEstado(envio, 'rebotada', 'rebotado', ahora);
  }

  private async getInvitacion(envio: FilaEnvio) {
    if (!envio.refId) return null;
    const [invitacion] = await this.db
      .select()
      .from(invitaciones)
      .where(eq(invitaciones.id, envio.refId));
    return invitacion ?? null;
  }

  private async setEstado(
    envio: FilaEnvio,
    estado: 'enviada' | 'rebotada',
    emailEstado: 'enviado' | 'rebotado',
    ahora: Date,
  ): Promise<void> {
    const invitacion = await this.getInvitacion(envio);
    // Si la reemplazó un reenvío, el estado del asistente lo maneja la nueva.
    if (!invitacion || invitacion.estado === 'revocada' || invitacion.envioCorreoId !== envio.id) {
      return;
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(invitaciones)
        .set({ estado, ...(estado === 'enviada' ? { enviadaAt: ahora } : {}), updatedAt: ahora })
        .where(eq(invitaciones.id, invitacion.id));
      await tx
        .update(asistentes)
        .set({ emailEstado, updatedAt: ahora })
        .where(eq(asistentes.id, invitacion.asistenteId));
    });
  }
}
