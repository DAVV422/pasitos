import { and, eq } from 'drizzle-orm';
import { asistentes, withOrganizacion, type Cifrador, type Db } from '@pasitos/db';
import { AppError, getCiUltimos } from '@pasitos/dominio';
import type { MisDatos } from '@pasitos/dominio/esquemas';
import type { ContextoAsistente } from '../../common/sesion/asistente';
import type { Reloj } from '../auth/sesiones.service';
import { BitacoraService } from '../bitacora/bitacora.service';

/** *Mis datos* (HU-320 §4): lo que ve y edita la persona. El carnet completo, solo ella. */
export interface MisDatosApi {
  readonly nombre: string;
  readonly email: string | null;
  readonly ci: string | null;
  /** HU-321: un carnet verificado ya no se edita. */
  readonly ciVerificado: boolean;
}

/** *Mis datos* en *Mi cuenta*: ver y editar el nombre, el correo y el carnet. */
export class MisDatosService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly cifrador: Cifrador,
    private readonly reloj: Reloj,
  ) {}

  get(asistente: ContextoAsistente): Promise<MisDatosApi> {
    return withOrganizacion(this.db, asistente.organizacionId, async (tx) => {
      const [fila] = await tx
        .select({ nombre: asistentes.nombre, email: asistentes.email, ci: asistentes.ciCifrado })
        .from(asistentes)
        .where(eq(asistentes.id, asistente.asistenteId));
      if (!fila) throw new AppError('NO_ENCONTRADO');
      return this.toApi(fila);
    });
  }

  update(asistente: ContextoAsistente, datos: MisDatos): Promise<MisDatosApi> {
    return withOrganizacion(this.db, asistente.organizacionId, async (tx) => {
      const [actual] = await tx
        .select({
          nombre: asistentes.nombre,
          email: asistentes.email,
          ci: asistentes.ciCifrado,
          origen: asistentes.origen,
        })
        .from(asistentes)
        .where(
          and(
            eq(asistentes.id, asistente.asistenteId),
            eq(asistentes.eventoId, asistente.eventoId),
          ),
        )
        .for('update');
      if (!actual) throw new AppError('NO_ENCONTRADO');
      // El correo de los invitados de la lista es el de la invitación: no se cambia desde aquí.
      if (datos.email !== undefined && actual.origen !== 'autoregistro') {
        throw new AppError('VALIDACION', {
          errors: [
            {
              field: 'email',
              code: 'NO_EDITABLE',
              message: 'Tu correo es el de la invitación. Para cambiarlo, habla con el equipo.',
            },
          ],
        });
      }
      const ciAntes = actual.ci ? this.cifrador.decryptTexto(actual.ci) : null;
      const cambios = {
        ...(datos.nombre !== undefined && datos.nombre !== actual.nombre
          ? { nombre: datos.nombre }
          : {}),
        ...(datos.email !== undefined && datos.email !== actual.email
          ? { email: datos.email }
          : {}),
        ...(datos.ci !== undefined && datos.ci !== ciAntes
          ? {
              ciCifrado: datos.ci ? this.cifrador.encrypt(datos.ci) : null,
              ciUltimos: datos.ci ? getCiUltimos(datos.ci) : null,
            }
          : {}),
      };
      if (Object.keys(cambios).length > 0) {
        await tx
          .update(asistentes)
          .set({ ...cambios, updatedAt: this.reloj.now() })
          .where(eq(asistentes.id, asistente.asistenteId));
        // En la bitácora: qué cambió, nunca el carnet completo ni el correo.
        await this.bitacora.record(tx, {
          actor: { tipo: 'sistema', nombre: 'La persona, desde la app' },
          accion: 'asistente.editar_datos',
          organizacionId: asistente.organizacionId,
          eventoId: asistente.eventoId,
          objeto: {
            tipo: 'asistente',
            id: asistente.asistenteId,
            nombre: 'nombre' in cambios ? cambios.nombre : actual.nombre,
          },
          antes: 'nombre' in cambios ? { nombre: actual.nombre } : {},
          despues: {
            ...('nombre' in cambios ? { nombre: cambios.nombre } : {}),
            ...('email' in cambios ? { correo: 'cambiado' } : {}),
            ...('ciCifrado' in cambios ? { carnet: 'cambiado' } : {}),
          },
        });
      }
      const [despues] = await tx
        .select({ nombre: asistentes.nombre, email: asistentes.email, ci: asistentes.ciCifrado })
        .from(asistentes)
        .where(eq(asistentes.id, asistente.asistenteId));
      if (!despues) throw new AppError('NO_ENCONTRADO');
      return this.toApi(despues);
    });
  }

  private toApi(fila: { nombre: string; email: string | null; ci: Buffer | null }): MisDatosApi {
    return {
      nombre: fila.nombre,
      email: fila.email,
      ci: fila.ci ? this.cifrador.decryptTexto(fila.ci) : null,
      ciVerificado: false,
    };
  }
}
