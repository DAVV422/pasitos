import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AppError } from '@pasitos/dominio';
import type { Cifrador } from '../../common/cifrado';
import { AuthRepository, createTokenAleatorio } from './auth.repository';
import type { ContextoSesion, Reloj } from './sesiones.service';
import { buildOtpauthUrl, createSecretoTotp, verifyCodigoTotp } from './totp';

const CONFIGURAR_TOTP_MS = 10 * 60 * 1000;
const DESAFIO_MS = 5 * 60 * 1000;
const FALLOS_CODIGO = 5;
const ESPERA_CODIGO_MS = 5 * 60 * 1000;

export interface OpcionesWebAuthn {
  readonly rpId: string;
  readonly rpNombre: string;
  /** Origen de las apps (`PUBLIC_URL`). */
  readonly origen: string;
}

/**
 * Segundo factor (HU-201 §4, D43): app de códigos (TOTP) y passkeys (WebAuthn). Los secretos y
 * desafíos pendientes viven cifrados en `tokens`; el secreto de TOTP confirmado, en `usuarios`.
 * Pasarlo marca la sesión (`segundo_factor_at`); configurarlo también, porque prueba lo mismo.
 */
export class SegundoFactorService {
  /** 5 códigos mal seguidos: 5 minutos de espera, por usuario. */
  private readonly fallos = new Map<string, { cantidad: number; hasta: number }>();

  constructor(
    private readonly repositorio: AuthRepository,
    private readonly cifrador: Cifrador,
    private readonly reloj: Reloj,
    private readonly webauthn: OpcionesWebAuthn,
  ) {}

  // ── App de códigos ─────────────────────────────────────────────────────────

  async startTotp(contexto: ContextoSesion): Promise<{ otpauthUrl: string; secreto: string }> {
    const secreto = createSecretoTotp();
    const ahora = this.reloj.now();
    await this.repositorio.insertToken(
      {
        proposito: 'configurar_totp',
        refId: contexto.usuario.id,
        tokenHash: createTokenAleatorio().hash,
        expiraAt: new Date(ahora.getTime() + CONFIGURAR_TOTP_MS),
        secretoCifrado: this.cifrador.encrypt(secreto),
      },
      ahora,
    );
    return {
      otpauthUrl: buildOtpauthUrl(secreto, contexto.usuario.email, this.webauthn.rpNombre),
      secreto,
    };
  }

  async confirmTotp(contexto: ContextoSesion, codigo: string): Promise<void> {
    this.checkEspera(contexto.usuario.id);
    const ahora = this.reloj.now();
    const ok = await this.repositorio.transaction(async (tx) => {
      const pendiente = await this.repositorio.findTokenVigenteForUpdate(
        tx,
        'configurar_totp',
        contexto.usuario.id,
        ahora,
      );
      if (!pendiente?.secretoCifrado) {
        throw new AppError('ENLACE_VENCIDO', {
          detail: 'Pasaron más de 10 minutos. Empieza de nuevo para ver otro código QR.',
        });
      }
      const secreto = this.cifrador.decryptTexto(pendiente.secretoCifrado);
      const paso = verifyCodigoTotp(secreto, codigo, ahora, null);
      if (paso === null) {
        return false;
      }
      await this.repositorio.markTokenUsado(tx, pendiente.id, ahora);
      await this.repositorio.setTotp(tx, contexto.usuario.id, this.cifrador.encrypt(secreto), paso);
      await this.repositorio.markSegundoFactor(contexto.sessionId, ahora, tx);
      return true;
    });
    this.recordResultado(contexto.usuario.id, ok);
  }

  async verifyTotp(contexto: ContextoSesion, codigo: string): Promise<void> {
    this.checkEspera(contexto.usuario.id);
    const usuario = await this.repositorio.findUsuario(contexto.usuario.id);
    if (!usuario?.totpSecretCifrado) {
      throw new AppError('CODIGO_INVALIDO');
    }
    const secreto = this.cifrador.decryptTexto(usuario.totpSecretCifrado);
    const paso = verifyCodigoTotp(secreto, codigo, this.reloj.now(), usuario.totpUltimoPaso);
    // Si dos pedidos traen el mismo código a la vez, solo uno se queda con el paso.
    const ok = paso !== null && (await this.repositorio.claimPasoTotp(usuario.id, paso));
    if (ok) {
      await this.repositorio.markSegundoFactor(contexto.sessionId, this.reloj.now());
    }
    this.recordResultado(contexto.usuario.id, ok);
  }

  async removeTotp(contexto: ContextoSesion): Promise<void> {
    await this.repositorio.transaction(async (tx) => {
      const usuario = await this.repositorio.findUsuarioForUpdate(tx, contexto.usuario.id);
      if (!usuario?.totpSecretCifrado) {
        throw new AppError('NO_ENCONTRADO');
      }
      const quedan = await this.repositorio.countPasskeys(usuario.id, tx);
      this.checkQuedaUnMetodo(contexto, quedan);
      await this.repositorio.setTotp(tx, usuario.id, null, null);
    });
  }

  // ── Passkeys ───────────────────────────────────────────────────────────────

  async startRegistroPasskey(contexto: ContextoSesion) {
    const existentes = await this.repositorio.listPasskeys(contexto.usuario.id);
    const opciones = await generateRegistrationOptions({
      rpName: this.webauthn.rpNombre,
      rpID: this.webauthn.rpId,
      userName: contexto.usuario.email,
      userDisplayName: contexto.usuario.nombre,
      userID: new Uint8Array(Buffer.from(contexto.usuario.id.replaceAll('-', ''), 'hex')),
      attestationType: 'none',
      excludeCredentials: existentes.map((p) => ({
        id: p.credentialId.toString('base64url'),
        transports: p.transports,
      })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    await this.saveDesafio(contexto.sessionId, opciones.challenge);
    return opciones;
  }

  async registerPasskey(
    contexto: ContextoSesion,
    respuesta: RegistrationResponseJSON,
    nombre: string,
  ): Promise<{ id: string }> {
    const desafio = await this.takeDesafio(contexto.sessionId);
    let verificada;
    try {
      verificada = await verifyRegistrationResponse({
        response: respuesta,
        expectedChallenge: desafio,
        expectedOrigin: this.webauthn.origen,
        expectedRPID: this.webauthn.rpId,
        requireUserVerification: true,
      });
    } catch {
      verificada = { verified: false as const };
    }
    if (!verificada.verified) {
      throw new AppError('CODIGO_INVALIDO', {
        detail: 'No pudimos registrar la passkey. Prueba de nuevo.',
      });
    }
    const { credential } = verificada.registrationInfo;
    const ahora = this.reloj.now();
    return this.repositorio.transaction(async (tx) => {
      const id = await this.repositorio.insertPasskey(tx, {
        usuarioId: contexto.usuario.id,
        credentialId: Buffer.from(credential.id, 'base64url'),
        publicKey: Buffer.from(credential.publicKey),
        contador: credential.counter,
        transports: credential.transports ?? [],
        nombre,
      });
      await this.repositorio.markSegundoFactor(contexto.sessionId, ahora, tx);
      return { id };
    });
  }

  async startVerificacionPasskey(contexto: ContextoSesion) {
    const existentes = await this.repositorio.listPasskeys(contexto.usuario.id);
    if (existentes.length === 0) {
      throw new AppError('NO_ENCONTRADO');
    }
    const opciones = await generateAuthenticationOptions({
      rpID: this.webauthn.rpId,
      userVerification: 'required',
      allowCredentials: existentes.map((p) => ({
        id: p.credentialId.toString('base64url'),
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
    });
    await this.saveDesafio(contexto.sessionId, opciones.challenge);
    return opciones;
  }

  async verifyPasskey(
    contexto: ContextoSesion,
    respuesta: AuthenticationResponseJSON,
  ): Promise<void> {
    this.checkEspera(contexto.usuario.id);
    const desafio = await this.takeDesafio(contexto.sessionId);
    const passkey = await this.repositorio.findPasskeyByCredential(
      contexto.usuario.id,
      Buffer.from(respuesta.id, 'base64url'),
    );
    let ok = false;
    if (passkey) {
      try {
        const verificada = await verifyAuthenticationResponse({
          response: respuesta,
          expectedChallenge: desafio,
          expectedOrigin: this.webauthn.origen,
          expectedRPID: this.webauthn.rpId,
          credential: {
            id: passkey.credentialId.toString('base64url'),
            publicKey: new Uint8Array(passkey.publicKey),
            counter: passkey.contador,
            transports: passkey.transports as AuthenticatorTransportFuture[],
          },
          requireUserVerification: true,
        });
        ok =
          verificada.verified &&
          (await this.repositorio.updateContadorPasskey(
            passkey.id,
            verificada.authenticationInfo.newCounter,
            this.reloj.now(),
          ));
      } catch {
        ok = false;
      }
    }
    if (ok) {
      await this.repositorio.markSegundoFactor(contexto.sessionId, this.reloj.now());
    }
    this.recordResultado(contexto.usuario.id, ok, 'No pudimos verificar la passkey.');
  }

  listPasskeys(usuarioId: string) {
    return this.repositorio.listPasskeys(usuarioId).then((lista) =>
      lista.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        createdAt: p.createdAt,
        ultimoUsoAt: p.ultimoUsoAt,
      })),
    );
  }

  async deletePasskey(contexto: ContextoSesion, id: string): Promise<void> {
    await this.repositorio.transaction(async (tx) => {
      const usuario = await this.repositorio.findUsuarioForUpdate(tx, contexto.usuario.id);
      const quedan =
        (await this.repositorio.countPasskeys(contexto.usuario.id, tx)) -
        1 +
        (usuario?.totpSecretCifrado ? 1 : 0);
      if (!(await this.repositorio.deletePasskey(tx, id, contexto.usuario.id))) {
        throw new AppError('NO_ENCONTRADO');
      }
      this.checkQuedaUnMetodo(contexto, quedan);
    });
  }

  // ── Comunes ────────────────────────────────────────────────────────────────

  /** Si es obligatorio, no se puede borrar el último método (HU-201 §4). */
  private checkQuedaUnMetodo(contexto: ContextoSesion, quedan: number): void {
    if (contexto.segundoFactor.requerido && quedan < 1) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'metodo',
            code: 'ULTIMO_METODO',
            message: 'Necesitas al menos un segundo factor.',
          },
        ],
      });
    }
  }

  private async saveDesafio(sessionId: string, desafio: string): Promise<void> {
    const ahora = this.reloj.now();
    await this.repositorio.insertToken(
      {
        proposito: 'desafio_webauthn',
        refId: sessionId,
        tokenHash: createTokenAleatorio().hash,
        expiraAt: new Date(ahora.getTime() + DESAFIO_MS),
        secretoCifrado: this.cifrador.encrypt(desafio),
      },
      ahora,
    );
  }

  /** El desafío vigente de la sesión, que se usa una sola vez. */
  private async takeDesafio(sessionId: string): Promise<string> {
    const ahora = this.reloj.now();
    return this.repositorio.transaction(async (tx) => {
      const fila = await this.repositorio.findTokenVigenteForUpdate(
        tx,
        'desafio_webauthn',
        sessionId,
        ahora,
      );
      if (!fila?.secretoCifrado) {
        throw new AppError('ENLACE_VENCIDO', {
          detail: 'Pasaron más de 5 minutos. Prueba de nuevo.',
        });
      }
      await this.repositorio.markTokenUsado(tx, fila.id, ahora);
      return this.cifrador.decryptTexto(fila.secretoCifrado);
    });
  }

  private checkEspera(usuarioId: string): void {
    const estado = this.fallos.get(usuarioId);
    const ahora = this.reloj.now().getTime();
    if (estado && estado.hasta > ahora) {
      throw new AppError('DEMASIADOS_INTENTOS', {
        meta: { reintentarEnSegundos: Math.ceil((estado.hasta - ahora) / 1000) },
      });
    }
  }

  private recordResultado(usuarioId: string, ok: boolean, detalle?: string): void {
    if (ok) {
      this.fallos.delete(usuarioId);
      return;
    }
    const cantidad = (this.fallos.get(usuarioId)?.cantidad ?? 0) + 1;
    this.fallos.set(usuarioId, {
      cantidad: cantidad >= FALLOS_CODIGO ? 0 : cantidad,
      hasta: cantidad >= FALLOS_CODIGO ? this.reloj.now().getTime() + ESPERA_CODIGO_MS : 0,
    });
    throw new AppError('CODIGO_INVALIDO', detalle ? { detail: detalle } : {});
  }
}

type AuthenticatorTransportFuture =
  'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';
