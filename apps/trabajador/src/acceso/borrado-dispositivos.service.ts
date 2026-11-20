import { and, isNotNull, lt, or } from 'drizzle-orm';
import { dispositivos, mensajesContacto, registrosTecnicos, type Db } from '@pasitos/db';
import type { Reloj } from '../comun/reloj';

/**
 * Trabajo `borrar-dispositivos` (HU-307 §7), cada día a las 03:00 de Bolivia: lo técnico vive
 * 30 días después del cierre. Borra los registros técnicos vencidos y deja a los dispositivos
 * sin llave ni huella (el modelo legible se conserva para el historial del equipo).
 */
export class BorradoDispositivosService {
  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  async deleteVencidos(): Promise<{ registros: number; dispositivos: number; contactos: number }> {
    const ahora = this.reloj.now();
    const registros = await this.db
      .delete(registrosTecnicos)
      .where(lt(registrosTecnicos.borrarAt, ahora))
      .returning({ id: registrosTecnicos.id });
    const limpiados = await this.db
      .update(dispositivos)
      .set({ llavePublica: null, huella: null })
      .where(
        and(
          lt(dispositivos.borrarAt, ahora),
          or(isNotNull(dispositivos.llavePublica), isNotNull(dispositivos.huella)),
        ),
      )
      .returning({ id: dispositivos.id });
    // HU-410: los mensajes del formulario de contacto, a los 12 meses (Política de privacidad §7).
    const contactos = await this.db
      .delete(mensajesContacto)
      .where(lt(mensajesContacto.borrarAt, ahora))
      .returning({ id: mensajesContacto.id });
    return {
      registros: registros.length,
      dispositivos: limpiados.length,
      contactos: contactos.length,
    };
  }
}
