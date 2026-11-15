import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { CorreosService } from '@pasitos/correos';
import { passkeys, sessions, usuarios, type Db } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { NOMBRES_ROL_PLATAFORMA } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { RolesCache } from '../../common/permisos/roles.repository';
import type { Reloj } from '../auth/sesiones.service';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';
import type { InvitacionesService } from '../invitaciones/invitaciones.service';

type ActorConsola = ActorBitacora & { tipo: 'usuario' };
type RolNombrable = 'admin' | 'soporte';

/**
 * Personas de Pasitos y ayuda a cualquier persona desde la consola (HU-202 §4 y §5). Solo el
 * `superadmin` nombra administradores y soporte; el `superadmin` no se cambia desde aquí.
 */
export class PersonasPlataformaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly sistema: Db,
    private readonly correos: CorreosService,
    private readonly invitaciones: InvitacionesService,
    private readonly roles: RolesCache,
    private readonly reloj: Reloj,
    private readonly publicUrl: string,
  ) {}

  /** Con `email`: cualquier persona (búsqueda exacta). Sin él: las de Pasitos. */
  list(filtros: { email?: string | undefined }) {
    return this.sistema
      .select({
        id: usuarios.id,
        email: usuarios.email,
        nombre: usuarios.nombre,
        rolPlataforma: usuarios.rolPlataforma,
        estado: usuarios.estado,
        aceptado: isNotNull(usuarios.passwordHash),
        segundoFactor: sql<boolean>`(${usuarios.totpSecretCifrado} is not null or exists (
          select 1 from passkeys p where p.usuario_id = "usuarios"."id"))`,
      })
      .from(usuarios)
      .where(filtros.email ? eq(usuarios.email, filtros.email) : isNotNull(usuarios.rolPlataforma))
      .orderBy(asc(usuarios.nombre))
      .limit(200);
  }

  async invite(
    actor: ActorConsola,
    datos: { email: string; nombre: string; rol: RolNombrable },
  ): Promise<{ id: string }> {
    return this.sistema.transaction(async (tx) => {
      const [existente] = await tx
        .select()
        .from(usuarios)
        .where(eq(usuarios.email, datos.email))
        .for('update');
      if (existente?.rolPlataforma) {
        throw new AppError('VALIDACION', {
          errors: [
            { field: 'email', code: 'YA_EXISTE', message: 'Esa persona ya está en la consola.' },
          ],
        });
      }
      const rol = NOMBRES_ROL_PLATAFORMA[datos.rol].toLowerCase();
      let id: string;
      if (existente?.passwordHash) {
        // Ya tiene cuenta: se le suma el rol y se le avisa.
        id = existente.id;
        await tx
          .update(usuarios)
          .set({ rolPlataforma: datos.rol, updatedAt: this.reloj.now() })
          .where(eq(usuarios.id, id));
        await this.correos.enqueue(tx, {
          tipo: 'rol_plataforma_asignado',
          destinatario: existente.email,
          datos: {
            nombre: existente.nombre,
            quienInvita: actor.nombre,
            rol,
            enlace: `${this.publicUrl}/plataforma/entrar`,
          },
          refId: id,
        });
      } else {
        id = existente?.id ?? uuidv7();
        if (existente) {
          await tx
            .update(usuarios)
            .set({ rolPlataforma: datos.rol, nombre: datos.nombre, updatedAt: this.reloj.now() })
            .where(eq(usuarios.id, id));
        } else {
          await tx
            .insert(usuarios)
            .values({ id, email: datos.email, nombre: datos.nombre, rolPlataforma: datos.rol });
        }
        const token = await this.invitaciones.createToken(tx, 'invitacion_plataforma', id);
        await this.correos.enqueue(tx, {
          tipo: 'invitacion_plataforma',
          destinatario: datos.email,
          datos: {
            nombre: datos.nombre,
            quienInvita: actor.nombre,
            rol,
            enlace: `${this.publicUrl}/plataforma/invitacion/${token}`,
          },
          refId: id,
        });
      }
      await this.bitacora.record(tx, {
        actor,
        accion: 'plataforma.usuario.create',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'usuario', id, nombre: existente?.nombre ?? datos.nombre },
        despues: { rolPlataforma: datos.rol },
      });
      return { id };
    });
  }

  /** `null` le quita el acceso a la consola y cierra sus sesiones. */
  async updateRol(
    actor: ActorConsola,
    id: string,
    datos: { rol: RolNombrable | null; motivo: string },
  ): Promise<void> {
    if (id === actor.id) {
      throw new AppError('ROL_NO_PERMITIDO', { detail: 'No puedes cambiar tu propio rol.' });
    }
    await this.sistema.transaction(async (tx) => {
      const [persona] = await tx.select().from(usuarios).where(eq(usuarios.id, id)).for('update');
      if (!persona?.rolPlataforma) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (persona.rolPlataforma === 'superadmin') {
        throw new AppError('ROL_NO_PERMITIDO', {
          detail: 'El administrador principal no se cambia desde la consola.',
        });
      }
      if (persona.rolPlataforma === datos.rol) {
        return;
      }
      const ahora = this.reloj.now();
      await tx
        .update(usuarios)
        .set({ rolPlataforma: datos.rol, updatedAt: ahora })
        .where(eq(usuarios.id, id));
      if (datos.rol === null) {
        await tx
          .update(sessions)
          .set({ revocadaAt: ahora })
          .where(and(eq(sessions.usuarioId, id), isNull(sessions.revocadaAt)));
      }
      await this.bitacora.record(tx, {
        actor,
        accion: 'plataforma.usuario.update',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'usuario', id, nombre: persona.nombre },
        antes: { rolPlataforma: persona.rolPlataforma },
        despues: { rolPlataforma: datos.rol, motivo: datos.motivo },
      });
    });
    this.roles.invalidate(id);
  }

  /**
   * Restablecer el segundo factor de alguien que lo perdió (HU-202 §5, ajuste 5). Exige el texto
   * de cómo se comprobó la identidad; borra la app de códigos y las passkeys y cierra sus sesiones.
   */
  async resetSegundoFactor(
    actor: ActorConsola,
    id: string,
    datos: { motivo: string; verificacion: string },
  ): Promise<void> {
    await this.sistema.transaction(async (tx) => {
      const [persona] = await tx.select().from(usuarios).where(eq(usuarios.id, id)).for('update');
      if (!persona) {
        throw new AppError('NO_ENCONTRADO');
      }
      const ahora = this.reloj.now();
      const borradas = await tx
        .delete(passkeys)
        .where(eq(passkeys.usuarioId, id))
        .returning({ id: passkeys.id });
      await tx
        .update(usuarios)
        .set({ totpSecretCifrado: null, totpUltimoPaso: null, updatedAt: ahora })
        .where(eq(usuarios.id, id));
      await tx
        .update(sessions)
        .set({ revocadaAt: ahora })
        .where(and(eq(sessions.usuarioId, id), isNull(sessions.revocadaAt)));
      await this.correos.enqueue(tx, {
        tipo: 'segundo_factor_restablecido',
        destinatario: persona.email,
        datos: {
          nombre: persona.nombre,
          enlace: `${this.publicUrl}/${persona.rolPlataforma ? 'plataforma' : 'admin'}/entrar`,
        },
        refId: id,
      });
      await this.bitacora.record(tx, {
        actor,
        accion: 'usuario.segundo_factor.reset',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'usuario', id, nombre: persona.nombre },
        antes: { appDeCodigos: persona.totpSecretCifrado !== null, passkeys: borradas.length },
        despues: { motivo: datos.motivo, verificacion: datos.verificacion },
      });
    });
    this.roles.invalidate(id);
  }
}
