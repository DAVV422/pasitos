import { createHash, createPublicKey } from 'node:crypto';
import { and, eq, isNull, ne } from 'drizzle-orm';
import {
  aceptacionesTerminos,
  asistentes,
  dispositivos,
  eventos,
  invitaciones,
  outbox,
  tokens,
  usuarios,
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
  toMotivoAnulacion,
  type MotivoRevincular,
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
import { normalizeCodigoCorto, PROPOSITO_CORTO, PROPOSITO_QR } from '../puerta/accesos-puerta';
import { BitacoraService } from '../bitacora/bitacora.service';
import { closeAlertaRevincular } from '../puerta/alertas-puerta';
import type { CheckInService } from '../puerta/check-in.service';
import type { AccesoSistema } from './acceso-sistema';
import { getEstadoApp, type EstadoApp } from './estado-app';
import { checkA3, checkA4 } from './reglas-alertas';
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

/**
 * De dónde viene el acceso: el enlace de la invitación (HU-306) o el QR de asistente y el enlace
 * corto que genera la puerta (HU-302). Los tres siguen el mismo camino al vincular.
 */
interface FuenteAcceso {
  readonly tipo: TipoAcceso;
  /** La invitación o el token. */
  readonly id: string;
  readonly asistenteId: string;
  readonly eventoId: string;
  readonly usada: boolean;
  readonly metodo: 'enlace' | 'qr_puerta' | 'enlace_corto';
  /** En la puerta: el id del acceso (el QR) y quién lo generó. */
  readonly grupo: string | null;
  readonly registradorId: string | null;
  /** HU-304: por qué se le dio un acceso nuevo (viaja en el token). */
  readonly motivo: MotivoRevincular | null;
}

/** Usada en otro celular: la invitación lo dice; el QR de la puerta responde como vencido. */
function getErrorUsada(tipo: TipoAcceso): AppError {
  return new AppError(tipo === 'invitacion' ? 'INVITACION_YA_USADA' : 'QR_ASISTENTE_VENCIDO');
}

/** Cómo se guarda el hash de cada tipo de token. */
function hashAcceso(tipo: TipoAcceso, token: string): Buffer {
  return hashToken(tipo === 'corto' ? normalizeCodigoCorto(token) : token);
}

/**
 * Vincular el celular del asistente (HU-306 §2 y §3): con el enlace de la invitación, el QR de
 * asistente o el enlace corto de la puerta (HU-302).
 */
export class AccesoService {
  private readonly porIp: Limitador;
  private readonly porToken: Limitador;
  /** S8: 5 códigos cortos fallidos por minuto por IP. */
  private readonly cortosFallidos: Limitador;
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly sistema: AccesoSistema,
    private readonly sesiones: SesionesAsistenteService,
    private readonly registro: RegistroTecnicoService,
    private readonly checkIn: CheckInService,
    private readonly reloj: Reloj,
  ) {
    const ahora = () => this.reloj.now().getTime();
    this.porIp = new Limitador([{ maximo: 10, ms: 60_000 }], ahora);
    this.porToken = new Limitador([{ maximo: 10, ms: 60_000 }], ahora);
    this.cortosFallidos = new Limitador([{ maximo: 5, ms: 60_000 }], ahora);
  }

  async describe(
    tipo: TipoAcceso,
    token: string,
    ip: string,
    deviceId: string | undefined,
  ): Promise<DescripcionAcceso> {
    this.checkLimite(tipo, ip, token);
    const organizacionId = await this.findOrganizacion(tipo, token, ip);
    return withOrganizacion(this.db, organizacionId, async (tx) => {
      const fuente = await this.lockFuente(tx, tipo, token, false);
      const { evento, asistente } = await this.getEventoYAsistente(tx, fuente);
      let yaVinculado = false;
      if (fuente.usada) {
        yaVinculado = await this.isMismoNavegador(tx, fuente, deviceId);
        if (!yaVinculado) {
          throw getErrorUsada(tipo);
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
    this.checkLimite(datos.tipo, ip, datos.token);
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
    const organizacionId = await this.findOrganizacion(datos.tipo, datos.token, ip);
    const ahora = this.reloj.now();
    const senales = datos.senales ?? null;
    const modelo = describeModelo(datos.senales, describeDispositivo(userAgent));
    const huella = getHuella(datos.senales);
    const tecnico = { ip, userAgent, senales };
    // Lo que se sabe antes de fallar, para registrar el rechazo aparte (HU-307 §4).
    const visto: { eventoId?: string; asistenteId?: string; dispositivoId?: string } = {};

    try {
      return await withOrganizacion(this.db, organizacionId, async (tx) => {
        const fuente = await this.lockFuente(tx, datos.tipo, datos.token, true);
        visto.eventoId = fuente.eventoId;
        visto.asistenteId = fuente.asistenteId;
        const resultado = await this.link(tx, {
          datos,
          fuente,
          organizacionId,
          ahora,
          modelo,
          huella,
          visto,
        });
        await this.registro.record(tx, organizacionId, {
          ...tecnico,
          eventoId: fuente.eventoId,
          asistenteId: fuente.asistenteId,
          dispositivoId: resultado.dispositivoId,
          momento: 'vinculacion',
          resultado: 'aceptado',
        });
        await this.raiseAlertasDeVinculacion(tx, {
          organizacionId,
          eventoId: fuente.eventoId,
          asistenteId: fuente.asistenteId,
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
      fuente: FuenteAcceso;
      organizacionId: string;
      ahora: Date;
      modelo: string;
      huella: Buffer | null;
      visto: { dispositivoId?: string };
    },
  ): Promise<{ vinculado: Vinculado; dispositivoId: string }> {
    const { datos, fuente, organizacionId, ahora, modelo } = paso;
    const llave = Buffer.from(toLlaveCruda(datos.llavePublica));
    {
      const { evento, asistente } = await this.getEventoYAsistente(tx, fuente);
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
      if (fuente.usada && (!existente || activa?.dispositivoId !== existente.id)) {
        throw getErrorUsada(fuente.tipo);
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
          // Un dispositivo por invitado (V17, V18): el anterior queda anulado al instante, con
          // el motivo y quién dio el acceso nuevo.
          await tx
            .update(vinculaciones)
            .set({
              anuladaAt: ahora,
              anuladaPor: fuente.registradorId,
              motivoAnulacion: toMotivoAnulacion(fuente.motivo),
            })
            .where(eq(vinculaciones.id, activa.id));
          if (fuente.registradorId) {
            // HU-318: A4 si se revincula demasiado.
            await checkA4(tx, {
              organizacionId,
              eventoId: evento.id,
              registradorId: fuente.registradorId,
              asistenteId: asistente.id,
              ahora,
            });
            await this.recordRevincular(tx, {
              organizacionId,
              eventoId: evento.id,
              asistente,
              anteriorId: activa.dispositivoId,
              modeloNuevo: modelo,
              fuente,
            });
          }
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
          metodo: fuente.metodo,
          invitacionId: fuente.tipo === 'invitacion' ? fuente.id : null,
          tokenId: fuente.tipo === 'invitacion' ? null : fuente.id,
          registradorId: fuente.registradorId,
        });
      }

      if (!fuente.usada) {
        await this.markUsada(tx, fuente, ahora);
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

      if (fuente.tipo !== 'invitacion') {
        await this.completePuerta(tx, { fuente, organizacionId, modelo, ahora, asistente });
      }

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

  /** HU-304 §1: la bitácora del cambio de celular, con el anterior, el nuevo y el motivo. */
  private async recordRevincular(
    tx: Tx,
    datos: {
      organizacionId: string;
      eventoId: string;
      asistente: { id: string; nombre: string };
      anteriorId: string;
      modeloNuevo: string;
      fuente: FuenteAcceso;
    },
  ): Promise<void> {
    const [anterior] = await tx
      .select({ modelo: dispositivos.modelo })
      .from(dispositivos)
      .where(eq(dispositivos.id, datos.anteriorId));
    const [registrador] = await tx
      .select({ nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.id, datos.fuente.registradorId ?? ''));
    await this.bitacora.record(tx, {
      actor: registrador
        ? {
            tipo: 'usuario',
            id: datos.fuente.registradorId ?? '',
            nombre: registrador.nombre,
            rol: null,
          }
        : { tipo: 'sistema', nombre: 'QR de asistente' },
      accion: 'asistente.revincular',
      organizacionId: datos.organizacionId,
      eventoId: datos.eventoId,
      objeto: { tipo: 'asistente', id: datos.asistente.id, nombre: datos.asistente.nombre },
      antes: { dispositivo: anterior?.modelo ?? null },
      despues: {
        dispositivo: datos.modeloNuevo,
        motivo: datos.fuente.motivo?.tipo ?? null,
        ...(datos.fuente.motivo?.texto ? { detalle: datos.fuente.motivo.texto } : {}),
      },
    });
  }

  /** El acceso queda usado. En la puerta, usar el QR anula el enlace corto y al revés. */
  private async markUsada(tx: Tx, fuente: FuenteAcceso, ahora: Date): Promise<void> {
    if (fuente.tipo === 'invitacion') {
      await tx
        .update(invitaciones)
        .set({ estado: 'usada', usadaAt: ahora, updatedAt: ahora })
        .where(eq(invitaciones.id, fuente.id));
      return;
    }
    await tx.update(tokens).set({ usadoAt: ahora }).where(eq(tokens.id, fuente.id));
    if (fuente.grupo) {
      await tx
        .update(tokens)
        .set({ revocadoAt: ahora })
        .where(
          and(eq(tokens.grupo, fuente.grupo), ne(tokens.id, fuente.id), isNull(tokens.usadoAt)),
        );
    }
  }

  /**
   * Vincular en la puerta (HU-302 §2): la persona queda presente (`vinculacion_puerta`) si no lo
   * estaba, y quien generó el QR ve **Vinculado ✓** con el modelo (`acceso.vinculado`).
   */
  private async completePuerta(
    tx: Tx,
    datos: {
      fuente: FuenteAcceso;
      organizacionId: string;
      modelo: string;
      ahora: Date;
      asistente: { id: string };
    },
  ): Promise<void> {
    const { fuente } = datos;
    if (!(await this.checkIn.findActivo(tx, fuente.asistenteId))) {
      const [registrador] = fuente.registradorId
        ? await tx
            .select({ nombre: usuarios.nombre })
            .from(usuarios)
            .where(eq(usuarios.id, fuente.registradorId))
        : [];
      await this.checkIn.register(tx, {
        organizacionId: datos.organizacionId,
        eventoId: fuente.eventoId,
        asistenteId: fuente.asistenteId,
        metodo: 'vinculacion_puerta',
        registradorId: fuente.registradorId,
        actor: registrador
          ? {
              tipo: 'usuario',
              id: fuente.registradorId ?? '',
              nombre: registrador.nombre,
              rol: null,
            }
          : { tipo: 'sistema', nombre: 'QR de asistente' },
      });
    }
    // HU-318: A3 si el registrador vincula demasiadas personas seguidas.
    if (fuente.registradorId) {
      await checkA3(tx, {
        organizacionId: datos.organizacionId,
        eventoId: fuente.eventoId,
        registradorId: fuente.registradorId,
        ahora: new Date(),
      });
    }
    // HU-305: el *No fui yo* que pidió este acceso se cierra al vincular.
    if (fuente.motivo?.alertaId) {
      await closeAlertaRevincular(tx, {
        alertaId: fuente.motivo.alertaId,
        eventoId: fuente.eventoId,
        ahora: datos.ahora,
      });
    }
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'acceso.vinculado',
      eventoId: fuente.eventoId,
      payload: {
        eventoId: fuente.eventoId,
        accesoId: fuente.grupo,
        creadoPor: fuente.registradorId,
        modelo: datos.modelo,
        hora: datos.ahora.toISOString(),
      },
    });
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
        momento:
          codigo === 'INVITACION_YA_USADA' || codigo === 'QR_ASISTENTE_VENCIDO'
            ? 'intento_fallido'
            : 'vinculacion',
        resultado: 'rechazado',
        motivo: codigo,
      },
      a2,
    );
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  private checkLimite(tipo: TipoAcceso, ip: string, token: string): void {
    const espera = Math.max(
      tipo === 'corto' ? this.cortosFallidos.check(ip) : 0,
      this.porIp.hit(ip),
      this.porToken.hit(hashToken(token).toString('hex')),
    );
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
  }

  /** De qué organización es el token. Uno que no existe responde igual que uno vencido. */
  private async findOrganizacion(tipo: TipoAcceso, token: string, ip: string): Promise<string> {
    if (tipo === 'invitacion') {
      const organizacionId = await this.sistema.findOrganizacionDeInvitacion(hashToken(token));
      if (!organizacionId) {
        throw new AppError('ENLACE_VENCIDO');
      }
      return organizacionId;
    }
    const organizacionId = await this.sistema.findOrganizacionDeToken(
      hashAcceso(tipo, token),
      tipo === 'qr' ? PROPOSITO_QR : PROPOSITO_CORTO,
    );
    if (!organizacionId) {
      // Un código corto inventado cuenta para el límite (S8).
      if (tipo === 'corto') this.cortosFallidos.hit(ip);
      throw new AppError('QR_ASISTENTE_VENCIDO');
    }
    return organizacionId;
  }

  private async lockFuente(
    tx: Tx,
    tipo: TipoAcceso,
    token: string,
    bloquear: boolean,
  ): Promise<FuenteAcceso> {
    if (tipo === 'invitacion') {
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
      return {
        tipo,
        id: invitacion.id,
        asistenteId: invitacion.asistenteId,
        eventoId: invitacion.eventoId,
        usada: invitacion.estado === 'usada',
        metodo: 'enlace',
        grupo: null,
        registradorId: null,
        motivo: null,
      };
    }
    const consulta = tx
      .select({
        id: tokens.id,
        refId: tokens.refId,
        eventoId: tokens.eventoId,
        grupo: tokens.grupo,
        creadoPor: tokens.creadoPor,
        motivo: tokens.motivo,
        expiraAt: tokens.expiraAt,
        usadoAt: tokens.usadoAt,
        revocadoAt: tokens.revocadoAt,
      })
      .from(tokens)
      .where(
        and(
          eq(tokens.tokenHash, hashAcceso(tipo, token)),
          eq(tokens.proposito, tipo === 'qr' ? PROPOSITO_QR : PROPOSITO_CORTO),
        ),
      );
    const [fila] = bloquear ? await consulta.for('update') : await consulta;
    const vencido =
      !fila ||
      !fila.refId ||
      !fila.eventoId ||
      fila.revocadoAt !== null ||
      (fila.usadoAt === null && fila.expiraAt.getTime() <= this.reloj.now().getTime());
    if (vencido) {
      throw new AppError('QR_ASISTENTE_VENCIDO');
    }
    return {
      tipo,
      id: fila.id,
      asistenteId: fila.refId as string,
      eventoId: fila.eventoId as string,
      usada: fila.usadoAt !== null,
      metodo: tipo === 'qr' ? 'qr_puerta' : 'enlace_corto',
      grupo: fila.grupo,
      registradorId: fila.creadoPor,
      motivo: parseMotivo(fila.motivo),
    };
  }

  /** El enlace vence al cierre del evento; un asistente quitado de la lista ya no entra. */
  private async getEventoYAsistente(tx: Tx, fuente: FuenteAcceso) {
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
      .where(eq(eventos.id, fuente.eventoId));
    const [asistente] = await tx
      .select({ id: asistentes.id, nombre: asistentes.nombre, estado: asistentes.estado })
      .from(asistentes)
      .where(eq(asistentes.id, fuente.asistenteId));
    if (!evento || !asistente || evento.estado === 'cerrado' || asistente.estado === 'cancelado') {
      throw new AppError('ENLACE_VENCIDO');
    }
    return { evento, asistente };
  }

  private async isMismoNavegador(
    tx: Tx,
    fuente: FuenteAcceso,
    deviceId: string | undefined,
  ): Promise<boolean> {
    if (!deviceId) return false;
    const [fila] = await tx
      .select({ id: vinculaciones.id })
      .from(vinculaciones)
      .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
      .where(
        and(
          eq(vinculaciones.asistenteId, fuente.asistenteId),
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

/** El motivo guardado en el token (JSON); uno ilegible cuenta como sin motivo. */
function parseMotivo(texto: string | null): MotivoRevincular | null {
  if (!texto) return null;
  try {
    const motivo = JSON.parse(texto) as MotivoRevincular;
    return typeof motivo.tipo === 'string' ? motivo : null;
  } catch {
    return null;
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
