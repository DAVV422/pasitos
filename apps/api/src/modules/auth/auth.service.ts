import { Logger } from '@nestjs/common';
import type { CorreosService } from '@pasitos/correos';
import { AppError } from '@pasitos/dominio';
import { COMUN_CORREOS } from '@pasitos/dominio/correos';
import { MENSAJES_PASSWORD_INSEGURA, type AppEquipo } from '@pasitos/dominio/esquemas';
import type { Tx } from '@pasitos/db';
import { AuthRepository, createTokenAleatorio, hashToken, type Usuario } from './auth.repository';
import { Limitador } from './limitador';
import { hashPassword, verifyPassword } from './password';
import { checkPassword, type PasswordsFiltradasPort } from './passwords-filtradas';
import type { ContextoSesion, Reloj, SesionesService } from './sesiones.service';

/** Espera después del 6.º al 9.º fallo seguido (HU-201 §3, V14). */
const ESPERA_POR_FALLO_S: Readonly<Record<number, number>> = { 6: 2, 7: 4, 8: 8, 9: 16 };
const FALLOS_PARA_BLOQUEO = 10;
const BLOQUEO_MS = 15 * 60 * 1000;
const RESTABLECER_MS = 30 * 60 * 1000;
const MINUTO = 60_000;
const HORA = 60 * MINUTO;

export interface OpcionesAuth {
  readonly publicUrl: string;
}

export interface Dispositivo {
  readonly ip: string;
  readonly descripcion: string;
}

/**
 * Contraseña: entrar, intentos y bloqueo, recuperar y cambiar (HU-201 §2, §3 y §5).
 * Ni la contraseña ni los tokens van a los logs: solo ids.
 */
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly porIp: Limitador;
  private readonly porCorreo: Limitador;
  private readonly olvidePorCorreo: Limitador;
  /** Hash de una contraseña falsa: con un correo que no existe se calcula igual un Argon2. */
  private hashFalso: Promise<string> | undefined;

  constructor(
    private readonly repositorio: AuthRepository,
    private readonly sesiones: SesionesService,
    private readonly correos: CorreosService,
    private readonly filtradas: PasswordsFiltradasPort,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesAuth,
  ) {
    const ahora = () => this.reloj.now().getTime();
    const entrar = [
      { maximo: 5, ms: MINUTO },
      { maximo: 20, ms: HORA },
    ];
    this.porIp = new Limitador(entrar, ahora);
    this.porCorreo = new Limitador(entrar, ahora);
    this.olvidePorCorreo = new Limitador([{ maximo: 3, ms: HORA }], ahora);
  }

  async login(
    email: string,
    password: string,
    dispositivo: Dispositivo,
  ): Promise<{ token: string; contexto: ContextoSesion }> {
    this.checkLimite(this.porIp.hit(dispositivo.ip));
    this.checkLimite(this.porCorreo.hit(email));

    const usuario = await this.repositorio.findUsuarioByEmail(email);
    this.checkBloqueo(usuario);
    const correcta =
      usuario?.passwordHash && usuario.estado === 'activo'
        ? await verifyPassword(usuario.passwordHash, password)
        : await verifyPassword(await this.getHashFalso(), password).then(() => false);

    if (!usuario || !correcta) {
      if (usuario) {
        await this.recordFallo(usuario);
      }
      throw new AppError('CREDENCIALES_INVALIDAS');
    }
    if (usuario.intentosFallidos > 0 || usuario.bloqueadoHasta) {
      await this.repositorio.updateIntentos(usuario.id, 0, null);
    }
    const token = await this.sesiones.create(usuario.id, dispositivo.descripcion);
    const sesion = await this.sesiones.authenticate(token);
    return { token, contexto: sesion };
  }

  /** Siempre responde igual, exista o no el correo (HU-201 §5). */
  async requestRestablecer(email: string, app: AppEquipo): Promise<void> {
    if (this.olvidePorCorreo.hit(email) > 0) {
      return;
    }
    const usuario = await this.repositorio.findUsuarioByEmail(email);
    if (!usuario || usuario.estado !== 'activo') {
      return;
    }
    const ahora = this.reloj.now();
    const { token, hash } = createTokenAleatorio();
    await this.repositorio.transaction(async (tx) => {
      await this.repositorio.insertToken(
        {
          proposito: 'restablecer_password',
          refId: usuario.id,
          tokenHash: hash,
          expiraAt: new Date(ahora.getTime() + RESTABLECER_MS),
        },
        ahora,
        tx,
      );
      await this.correos.enqueue(tx, {
        tipo: 'restablecer_password',
        destinatario: usuario.email,
        datos: {
          nombre: usuario.nombre,
          enlace: `${this.opciones.publicUrl}/${app}/restablecer/${token}`,
        },
        refId: usuario.id,
      });
    });
  }

  /**
   * Cambia la contraseña con el enlace del correo. Usado, revocado o vencido: ENLACE_VENCIDO (V15).
   * El token se marca usado en la misma transacción, con la fila bloqueada: si llegan dos a la
   * vez, el segundo falla. Quita el bloqueo y cierra todas las sesiones. No inicia sesión.
   */
  async restablecer(token: string, password: string): Promise<void> {
    await this.checkPasswordNueva(password);
    const passwordHash = await hashPassword(password);
    const ahora = this.reloj.now();
    const email = await this.repositorio.transaction(async (tx) => {
      const fila = await this.repositorio.findTokenForUpdate(
        tx,
        hashToken(token),
        'restablecer_password',
      );
      if (!fila || fila.usadoAt || fila.revocadoAt || fila.expiraAt <= ahora || !fila.refId) {
        throw new AppError('ENLACE_VENCIDO');
      }
      const usuario = await this.repositorio.findUsuarioForUpdate(tx, fila.refId);
      if (!usuario || usuario.estado !== 'activo') {
        throw new AppError('ENLACE_VENCIDO');
      }
      await this.repositorio.markTokenUsado(tx, fila.id, ahora);
      await this.repositorio.updatePassword(tx, usuario.id, passwordHash, ahora);
      await this.repositorio.revokeSessions(usuario.id, ahora, null, tx);
      await this.enqueuePasswordCambiada(tx, usuario, ahora);
      return usuario.email;
    });
    // Con la contraseña nueva puede entrar enseguida, aunque antes haya llegado al límite.
    this.porCorreo.reset(email);
  }

  /** Con la sesión abierta: pide la actual, cierra las demás sesiones y avisa por correo. */
  async changePassword(contexto: ContextoSesion, actual: string, nueva: string): Promise<void> {
    const usuario = await this.repositorio.findUsuario(contexto.usuario.id);
    if (!usuario) {
      throw new AppError('NO_AUTENTICADO');
    }
    this.checkBloqueo(usuario);
    if (!usuario.passwordHash || !(await verifyPassword(usuario.passwordHash, actual))) {
      await this.recordFallo(usuario);
      throw new AppError('CREDENCIALES_INVALIDAS');
    }
    await this.checkPasswordNueva(nueva);
    const passwordHash = await hashPassword(nueva);
    const ahora = this.reloj.now();
    await this.repositorio.transaction(async (tx) => {
      await this.repositorio.updatePassword(tx, usuario.id, passwordHash, ahora);
      await this.repositorio.revokeSessions(usuario.id, ahora, contexto.sessionId, tx);
      await this.enqueuePasswordCambiada(tx, usuario, ahora);
    });
  }

  private async checkPasswordNueva(password: string): Promise<void> {
    const motivo = await checkPassword(password, this.filtradas);
    if (motivo) {
      throw new AppError('PASSWORD_INSEGURA', {
        meta: { motivo },
        detail: MENSAJES_PASSWORD_INSEGURA[motivo],
      });
    }
  }

  /** En espera o bloqueado: el mismo 429 que el límite por IP, para no revelar que existe. */
  private checkBloqueo(usuario: Usuario | undefined): void {
    const hasta = usuario?.bloqueadoHasta;
    if (hasta && hasta > this.reloj.now()) {
      this.checkLimite((hasta.getTime() - this.reloj.now().getTime()) / 1000);
    }
  }

  private checkLimite(segundos: number): void {
    if (segundos > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', {
        meta: { reintentarEnSegundos: Math.ceil(segundos) },
      });
    }
  }

  private async recordFallo(usuario: Usuario): Promise<void> {
    const ahora = this.reloj.now();
    const intentos = usuario.intentosFallidos + 1;
    if (intentos >= FALLOS_PARA_BLOQUEO) {
      await this.repositorio.transaction(async (tx) => {
        await this.repositorio.updateIntentos(
          usuario.id,
          intentos,
          new Date(ahora.getTime() + BLOQUEO_MS),
          tx,
        );
        // Un solo correo por bloqueo, al llegar al décimo.
        if (intentos === FALLOS_PARA_BLOQUEO) {
          await this.correos.enqueue(tx, {
            tipo: 'cuenta_bloqueada',
            destinatario: usuario.email,
            datos: {
              nombre: usuario.nombre,
              enlace: `${this.opciones.publicUrl}/${usuario.rolPlataforma ? 'plataforma' : 'admin'}/recuperar`,
            },
            refId: usuario.id,
          });
        }
      });
      this.logger.warn({ usuarioId: usuario.id }, 'Cuenta bloqueada 15 minutos por intentos');
      return;
    }
    const espera = ESPERA_POR_FALLO_S[intentos];
    await this.repositorio.updateIntentos(
      usuario.id,
      intentos,
      espera ? new Date(ahora.getTime() + espera * 1000) : null,
    );
  }

  private async enqueuePasswordCambiada(tx: Tx, usuario: Usuario, ahora: Date): Promise<void> {
    await this.correos.enqueue(tx, {
      tipo: 'password_cambiada',
      destinatario: usuario.email,
      datos: { nombre: usuario.nombre, ...formatFechaHora(ahora) },
      refId: usuario.id,
    });
  }

  private getHashFalso(): Promise<string> {
    this.hashFalso ??= hashPassword('una contraseña que nadie tiene');
    return this.hashFalso;
  }
}

/** "21/11/2026" y "15:00", en hora de Bolivia. */
export function formatFechaHora(fecha: Date): { fecha: string; hora: string } {
  const zona = { timeZone: COMUN_CORREOS.zonaHoraria };
  return {
    fecha: new Intl.DateTimeFormat('es-BO', {
      ...zona,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(fecha),
    hora: new Intl.DateTimeFormat('es-BO', {
      ...zona,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(fecha),
  };
}
