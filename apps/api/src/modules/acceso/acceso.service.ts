import { createHash, createPublicKey } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  aceptacionesTerminos,
  asistentes,
  dispositivos,
  eventos,
  invitaciones,
  outbox,
  vinculaciones,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import {
  AppError,
  describeModelo,
  getMotivosAutomatizado,
  isNavegadorSoportado,
  type SenalesDispositivo,
  VERSION_TERMINOS,
} from '@pasitos/dominio';
import type { TipoAcceso } from '@pasitos/dominio';
import type { DatosVincular } from '@pasitos/dominio/esquemas';
import { toLlaveCruda } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import { hashToken } from '../auth/auth.repository';
import { describeDispositivo } from '../auth/dispositivo';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';
import { getUrlArchivo } from '../archivos/archivos.service';
import type { AccesoSistema } from './acceso-sistema';
import { getEstadoApp, type EstadoApp } from './estado-app';
import { getHuella, type RegistroTecnicoService } from './registro-tecnico';
import { getVencimientoSesion, type SesionesAsistenteService } from './sesiones-asistente';

/** Lo que muestra la bienvenida antes de tocar *Entrar* (`GET /acceso/:tipo/:token`). */
export interface DescripcionAcceso {
  readonly evento: {
    readonly nombre: string;
    readonly inicioAt: string;
    readonly finAt: string;
    readonly logoUrl: string | null;
  };
  readonly asistente: { readonly nombre: string };
  readonly terminos: { readonly version: string; readonly privacidad: string };
  /** Este navegador ya tiene la entrada: la app va directo a *Inicio*. */
  readonly yaVinculado: boolean;
}

export interface Vinculado {
  readonly sesion: string;
  readonly expiraAt: Date;
  readonly estado: EstadoApp;
}

/** El hash del id del navegador: el id nunca se guarda. */
export function hashDeviceId(deviceId: string): Buffer {
  return createHash('sha256').update(deviceId, 'utf8').digest();
}

interface InvitacionBloqueada {
  readonly id: string;
  readonly asistenteId: string;
  readonly eventoId: string;
  readonly estado: string;
}

/**
 * Vincular el celular del asistente (HU-306 §2 y §3). Por ahora con el enlace de la invitación;
 * el QR de la puerta y el enlace corto llegan con HU-302 y usan el mismo camino.
 */
export class AccesoService {
  private readonly porIp: Limitador;
  private readonly porToken: Limitador;

  constructor(
    private readonly db: Db,
    private readonly sistema: AccesoSistema,
    private readonly sesiones: SesionesAsistenteService,
    private readonly registro: RegistroTecnicoService,
    private readonly reloj: Reloj,
  ) {
    const ahora = () => this.reloj.now().getTime();
    this.porIp = new Limitador([{ maximo: 10, ms: 60_000 }], ahora);
    this.porToken = new Limitador([{ maximo: 10, ms: 60_000 }], ahora);
  }

  async describe(
    tipo: TipoAcceso,
    token: string,
    ip: string,
    deviceId: string | undefined,
  ): Promise<DescripcionAcceso> {
    this.checkLimite(ip, token);
    const organizacionId = await this.findOrganizacion(tipo, token);
    return withOrganizacion(this.db, organizacionId, async (tx) => {
      const invitacion = await this.lockInvitacion(tx, token, false);
      const { evento, asistente } = await this.getEventoYAsistente(tx, invitacion);
      let yaVinculado = false;
      if (invitacion.estado === 'usada') {
        yaVinculado = await this.isMismoNavegador(tx, invitacion, deviceId);
        if (!yaVinculado) {
          throw new AppError('INVITACION_YA_USADA');
        }
      }
      return {
        evento: {
          nombre: evento.nombre,
          inicioAt: evento.inicioAt.toISOString(),
          finAt: evento.finAt.toISOString(),
          logoUrl: evento.logoArchivoId ? getUrlArchivo(evento.logoArchivoId, '400') : null,
        },
        asistente: { nombre: asistente.nombre },
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
        yaVinculado,
      };
    });
  }

  async vincular(datos: DatosVincular, ip: string, userAgent: string): Promise<Vinculado> {
    this.checkLimite(ip, datos.token);
    if (!isNavegadorSoportado(userAgent)) {
      throw new AppError('NAVEGADOR_NO_SOPORTADO');
    }
    if (
      datos.terminos.version !== VERSION_TERMINOS ||
      datos.terminos.privacidad !== VERSION_TERMINOS
    ) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'terminos',
            code: 'DESACTUALIZADOS',
            message: 'Los términos cambiaron. Vuelve a cargar la página.',
          },
        ],
      });
    }
    checkPuntoP256(datos.llavePublica);
    const organizacionId = await this.findOrganizacion(datos.tipo, datos.token);
    const ahora = this.reloj.now();
    const senales = datos.senales ?? null;
    const modelo = describeModelo(datos.senales, describeDispositivo(userAgent));
    const huella = getHuella(datos.senales);
    const tecnico = { ip, userAgent, senales };
    // Lo que se sabe antes de fallar, para registrar el rechazo aparte (HU-307 §4).
    const visto: { eventoId?: string; asistenteId?: string; dispositivoId?: string } = {};

    try {
      return await withOrganizacion(this.db, organizacionId, async (tx) => {
        const invitacion = await this.lockInvitacion(tx, datos.token, true);
        visto.eventoId = invitacion.eventoId;
        visto.asistenteId = invitacion.asistenteId;
        const resultado = await this.link(tx, {
          datos,
          invitacion,
          organizacionId,
          ahora,
          modelo,
          huella,
          visto,
        });
        await this.registro.record(tx, organizacionId, {
          ...tecnico,
          eventoId: invitacion.eventoId,
          asistenteId: invitacion.asistenteId,
          dispositivoId: resultado.dispositivoId,
          momento: 'vinculacion',
          resultado: 'aceptado',
        });
        await this.raiseAlertasDeVinculacion(tx, {
          organizacionId,
          eventoId: invitacion.eventoId,
          asistenteId: invitacion.asistenteId,
          dispositivoId: resultado.dispositivoId,
          huella,
          motivosA8: getMotivosAutomatizado(datos.senales),
        });
        return resultado.vinculado;
      });
    } catch (error) {
      if (error instanceof AppError && visto.eventoId) {
        await this.recordRechazo(organizacionId, error.code, { ...tecnico, ...visto });
      }
      throw error;
    }
  }

  /** Los pasos de vincular, dentro de la transacción. */
  private async link(
    tx: Tx,
    paso: {
      datos: DatosVincular;
      invitacion: InvitacionBloqueada;
      organizacionId: string;
      ahora: Date;
      modelo: string;
      huella: Buffer | null;
      visto: { dispositivoId?: string };
    },
  ): Promise<{ vinculado: Vinculado; dispositivoId: string }> {
    const { datos, invitacion, organizacionId, ahora, modelo } = paso;
    const llave = Buffer.from(toLlaveCruda(datos.llavePublica));
    {
      const { evento, asistente } = await this.getEventoYAsistente(tx, invitacion);
      const deviceIdHash = hashDeviceId(datos.deviceId);

      const [activa] = await tx
        .select({ id: vinculaciones.id, dispositivoId: vinculaciones.dispositivoId })
        .from(vinculaciones)
        .where(and(eq(vinculaciones.asistenteId, asistente.id), isNull(vinculaciones.anuladaAt)))
        .for('update');
      const [existente] = await tx
        .select({ id: dispositivos.id })
        .from(dispositivos)
        .where(
          and(eq(dispositivos.eventoId, evento.id), eq(dispositivos.deviceIdHash, deviceIdHash)),
        )
        .for('update');
      if (existente) {
        paso.visto.dispositivoId = existente.id;
      }

      // El enlace ya se usó: solo vuelve a entrar el mismo navegador (perdió la cookie).
      if (invitacion.estado === 'usada' && (!existente || activa?.dispositivoId !== existente.id)) {
        throw new AppError('INVITACION_YA_USADA');
      }

      const dispositivoId = await this.upsertDispositivo(tx, {
        existente: existente?.id ?? null,
        asistenteId: asistente.id,
        eventoId: evento.id,
        organizacionId,
        deviceIdHash,
        llave,
        modelo,
        huella: paso.huella,
        borrarAt: getVencimientoSesion(evento.finAt),
      });

      let vinculacionId = activa?.dispositivoId === dispositivoId ? activa.id : null;
      if (!vinculacionId) {
        if (activa) {
          // Un dispositivo por invitado (V17): el anterior queda anulado al instante.
          await tx
            .update(vinculaciones)
            .set({ anuladaAt: ahora, motivoAnulacion: 'nueva_vinculacion' })
            .where(eq(vinculaciones.id, activa.id));
          await this.sesiones.revokeDeVinculacion(tx, activa.id);
          await tx.insert(outbox).values({
            id: uuidv7(),
            tipo: 'dispositivo.anulado',
            eventoId: evento.id,
            payload: { eventoId: evento.id, dispositivoId: activa.dispositivoId },
          });
        }
        vinculacionId = uuidv7();
        await tx.insert(vinculaciones).values({
          id: vinculacionId,
          organizacionId,
          eventoId: evento.id,
          asistenteId: asistente.id,
          dispositivoId,
          metodo: 'enlace',
          invitacionId: invitacion.id,
        });
      }

      if (invitacion.estado !== 'usada') {
        await tx
          .update(invitaciones)
          .set({ estado: 'usada', usadaAt: ahora, updatedAt: ahora })
          .where(eq(invitaciones.id, invitacion.id));
      }
      if (asistente.estado === 'invitado') {
        await tx
          .update(asistentes)
          .set({ estado: 'registrado', updatedAt: ahora })
          .where(eq(asistentes.id, asistente.id));
      }
      await tx.insert(aceptacionesTerminos).values([
        {
          id: uuidv7(),
          asistenteId: asistente.id,
          documento: 'terminos',
          version: VERSION_TERMINOS,
        },
        {
          id: uuidv7(),
          asistenteId: asistente.id,
          documento: 'privacidad',
          version: VERSION_TERMINOS,
        },
      ]);

      const expiraAt = getVencimientoSesion(evento.finAt);
      const sesion = await this.sesiones.create(tx, {
        vinculacionId,
        organizacionId,
        expiraAt,
        modelo,
      });
      return {
        vinculado: { sesion, expiraAt, estado: await getEstadoApp(tx, asistente.id, ahora) },
        dispositivoId,
      };
    }
  }

  /** A1 y A8 al vincular (HU-307 §5). Solo avisan: la vinculación sigue. */
  private async raiseAlertasDeVinculacion(
    tx: Tx,
    datos: {
      organizacionId: string;
      eventoId: string;
      asistenteId: string;
      dispositivoId: string;
      huella: Buffer | null;
      motivosA8: string[];
    },
  ): Promise<void> {
    const { organizacionId, huella, motivosA8, ...ids } = datos;
    if (huella) {
      await this.registro.checkHuellaRepetida(tx, organizacionId, { ...ids, huella });
    }
    if (motivosA8.length > 0) {
      await this.registro.raiseAlerta(tx, organizacionId, {
        ...ids,
        tipo: 'A8',
        datos: { motivos: motivosA8 },
        clave: `A8:${ids.dispositivoId}`,
      });
    }
  }

  /**
   * El rechazo queda registrado aunque la transacción se deshaga. El enlace usado en otro
   * celular es un *intento fallido*; el navegador que ya fue de otra persona crea una A2.
   */
  private async recordRechazo(
    organizacionId: string,
    codigo: string,
    datos: {
      eventoId?: string;
      asistenteId?: string;
      dispositivoId?: string;
      ip: string;
      userAgent: string;
      senales: SenalesDispositivo | null;
    },
  ): Promise<void> {
    const { eventoId, ...resto } = datos;
    if (!eventoId) return;
    const a2 =
      codigo === 'DISPOSITIVO_YA_VINCULADO' && datos.dispositivoId && datos.asistenteId
        ? {
            eventoId,
            tipo: 'A2' as const,
            asistenteId: datos.asistenteId,
            dispositivoId: datos.dispositivoId,
            clave: `A2:${datos.dispositivoId}:${datos.asistenteId}`,
          }
        : undefined;
    await this.registro.recordAparte(
      organizacionId,
      {
        ...resto,
        eventoId,
        momento: codigo === 'INVITACION_YA_USADA' ? 'intento_fallido' : 'vinculacion',
        resultado: 'rechazado',
        motivo: codigo,
      },
      a2,
    );
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  private checkLimite(ip: string, token: string): void {
    const espera = Math.max(
      this.porIp.hit(ip),
      this.porToken.hit(hashToken(token).toString('hex')),
    );
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
  }

  /** De qué organización es el token. Uno que no existe responde igual que uno vencido. */
  private async findOrganizacion(tipo: TipoAcceso, token: string): Promise<string> {
    if (tipo !== 'invitacion') {
      // HU-302: el QR de asistente y el enlace corto.
      throw new AppError('QR_ASISTENTE_VENCIDO');
    }
    const organizacionId = await this.sistema.findOrganizacionDeInvitacion(hashToken(token));
    if (!organizacionId) {
      throw new AppError('ENLACE_VENCIDO');
    }
    return organizacionId;
  }

  private async lockInvitacion(
    tx: Tx,
    token: string,
    bloquear: boolean,
  ): Promise<InvitacionBloqueada> {
    const consulta = tx
      .select({
        id: invitaciones.id,
        asistenteId: invitaciones.asistenteId,
        eventoId: invitaciones.eventoId,
        estado: invitaciones.estado,
      })
      .from(invitaciones)
      .where(eq(invitaciones.tokenHash, hashToken(token)));
    const [invitacion] = bloquear ? await consulta.for('update') : await consulta;
    if (!invitacion || invitacion.estado === 'revocada') {
      throw new AppError('ENLACE_VENCIDO');
    }
    return invitacion;
  }

  /** El enlace vence al cierre del evento; un asistente quitado de la lista ya no entra. */
  private async getEventoYAsistente(tx: Tx, invitacion: InvitacionBloqueada) {
    const [evento] = await tx
      .select({
        id: eventos.id,
        nombre: eventos.nombre,
        estado: eventos.estado,
        inicioAt: eventos.inicioAt,
        finAt: eventos.finAt,
        logoArchivoId: eventos.logoArchivoId,
      })
      .from(eventos)
      .where(eq(eventos.id, invitacion.eventoId));
    const [asistente] = await tx
      .select({ id: asistentes.id, nombre: asistentes.nombre, estado: asistentes.estado })
      .from(asistentes)
      .where(eq(asistentes.id, invitacion.asistenteId));
    if (!evento || !asistente || evento.estado === 'cerrado' || asistente.estado === 'cancelado') {
      throw new AppError('ENLACE_VENCIDO');
    }
    return { evento, asistente };
  }

  private async isMismoNavegador(
    tx: Tx,
    invitacion: InvitacionBloqueada,
    deviceId: string | undefined,
  ): Promise<boolean> {
    if (!deviceId) return false;
    const [fila] = await tx
      .select({ id: vinculaciones.id })
      .from(vinculaciones)
      .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
      .where(
        and(
          eq(vinculaciones.asistenteId, invitacion.asistenteId),
          isNull(vinculaciones.anuladaAt),
          eq(dispositivos.deviceIdHash, hashDeviceId(deviceId)),
        ),
      );
    return fila !== undefined;
  }

  /**
   * Una identidad por navegador (V19): si este navegador ya fue la entrada de **otra** persona
   * del evento, no se vincula. Si es el suyo, se actualiza la llave (borró los datos y la creó de
   * nuevo con el mismo id).
   */
  private async upsertDispositivo(
    tx: Tx,
    datos: {
      existente: string | null;
      asistenteId: string;
      eventoId: string;
      organizacionId: string;
      deviceIdHash: Buffer;
      llave: Buffer;
      modelo: string;
      huella: Buffer | null;
      borrarAt: Date;
    },
  ): Promise<string> {
    if (datos.existente) {
      const [deOtro] = await tx
        .select({ id: vinculaciones.id })
        .from(vinculaciones)
        .where(
          and(
            eq(vinculaciones.dispositivoId, datos.existente),
            ne(vinculaciones.asistenteId, datos.asistenteId),
          ),
        )
        .limit(1);
      if (deOtro) {
        throw new AppError('DISPOSITIVO_YA_VINCULADO');
      }
      await tx
        .update(dispositivos)
        .set({ llavePublica: datos.llave, modelo: datos.modelo, huella: datos.huella })
        .where(eq(dispositivos.id, datos.existente));
      return datos.existente;
    }
    const id = uuidv7();
    await tx.insert(dispositivos).values({
      id,
      organizacionId: datos.organizacionId,
      eventoId: datos.eventoId,
      deviceIdHash: datos.deviceIdHash,
      llavePublica: datos.llave,
      huella: datos.huella,
      modelo: datos.modelo,
      borrarAt: datos.borrarAt,
    });
    return id;
  }
}

/** Que la llave sea un punto de la curva (`createPublicKey` lo comprueba). */
function checkPuntoP256(jwk: DatosVincular['llavePublica']): DatosVincular['llavePublica'] {
  try {
    createPublicKey({ key: { ...jwk }, format: 'jwk' });
  } catch {
    throw new AppError('VALIDACION', {
      errors: [
        { field: 'llavePublica', code: 'NO_VALIDO', message: 'La llave del celular no es válida.' },
      ],
    });
  }
  return jwk;
}
