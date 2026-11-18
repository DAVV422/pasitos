import type { Provider } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { invitaciones, type Db } from '@pasitos/db';
import { DbSistemaService } from '../../infra/db/db.module';

/**
 * Lo único que el acceso del asistente hace con la conexión de sistema (HU-306): saber de qué
 * organización es un token, para abrir `withOrganizacion`. Llega sin sesión y el token no lo dice.
 * Todo lo demás va con RLS.
 */
export class AccesoSistema {
  constructor(private readonly sistema: Db) {}

  async findOrganizacionDeInvitacion(tokenHash: Buffer): Promise<string | null> {
    const [fila] = await this.sistema
      .select({ organizacionId: invitaciones.organizacionId })
      .from(invitaciones)
      .where(eq(invitaciones.tokenHash, tokenHash));
    return fila?.organizacionId ?? null;
  }
}

/** El proveedor, aquí: la conexión de sistema queda solo en este archivo. */
export const PROVEEDOR_ACCESO_SISTEMA: Provider = {
  provide: AccesoSistema,
  inject: [DbSistemaService],
  useFactory: (db: DbSistemaService) => new AccesoSistema(db.db),
};
