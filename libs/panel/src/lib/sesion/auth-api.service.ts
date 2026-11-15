import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { AppEquipo } from '@pasitos/dominio/esquemas';
import { firstValueFrom } from 'rxjs';

export type EstadoSegundoFactor = 'no_aplica' | 'por_configurar' | 'por_verificar' | 'ok';
export type MetodoSegundoFactor = 'totp' | 'passkey';

export interface Yo {
  readonly usuario: {
    readonly id: string;
    readonly email: string;
    readonly nombre: string;
    readonly rolPlataforma: 'superadmin' | 'admin' | 'soporte' | null;
  };
  readonly segundoFactor: {
    readonly requerido: boolean;
    readonly configurado: boolean;
    readonly metodos: readonly MetodoSegundoFactor[];
    readonly estado: EstadoSegundoFactor;
    readonly verificadoAt: string | null;
  };
}

export interface SesionAbierta {
  readonly id: string;
  readonly dispositivo: string | null;
  readonly createdAt: string;
  readonly ultimoUsoAt: string;
  readonly actual: boolean;
}

export interface PasskeyGuardada {
  readonly id: string;
  readonly nombre: string;
  readonly createdAt: string;
  readonly ultimoUsoAt: string | null;
}

interface Lista<T> {
  readonly items: readonly T[];
}

const BASE = '/api/v1/auth';

/** `/auth` del API (HU-201). Los componentes no usan HttpClient: usan este servicio. */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(email: string, password: string): Promise<Yo> {
    return firstValueFrom(this.http.post<Yo>(`${BASE}/login`, { email, password }));
  }

  logout(): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${BASE}/logout`, {}));
  }

  getYo(): Promise<Yo> {
    return firstValueFrom(this.http.get<Yo>(`${BASE}/yo`));
  }

  requestRestablecer(email: string, app: AppEquipo): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${BASE}/password/olvide`, { email, app }));
  }

  restablecer(token: string, password: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${BASE}/password/restablecer`, { token, password }),
    );
  }

  changePassword(actual: string, nueva: string): Promise<void> {
    return firstValueFrom(this.http.put<void>(`${BASE}/password`, { actual, nueva }));
  }

  async listSessions(): Promise<readonly SesionAbierta[]> {
    return (await firstValueFrom(this.http.get<Lista<SesionAbierta>>(`${BASE}/sessions`))).items;
  }

  revokeSession(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/sessions/${id}`));
  }

  startTotp(): Promise<{ otpauthUrl: string; secreto: string }> {
    return firstValueFrom(
      this.http.post<{ otpauthUrl: string; secreto: string }>(
        `${BASE}/segundo-factor/totp/configurar`,
        {},
      ),
    );
  }

  confirmTotp(codigo: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${BASE}/segundo-factor/totp/confirmar`, { codigo }),
    );
  }

  verifyTotp(codigo: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${BASE}/segundo-factor/totp`, { codigo }));
  }

  removeTotp(): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/segundo-factor/totp`));
  }

  async listPasskeys(): Promise<readonly PasskeyGuardada[]> {
    return (await firstValueFrom(this.http.get<Lista<PasskeyGuardada>>(`${BASE}/passkeys`))).items;
  }

  // Las opciones y respuestas de WebAuthn van tal cual entre el navegador y el servidor.
  startRegistroPasskey(): Promise<Record<string, unknown>> {
    return firstValueFrom(this.http.post<Record<string, unknown>>(`${BASE}/passkeys/opciones`, {}));
  }

  registerPasskey(respuesta: unknown, nombre: string): Promise<{ id: string }> {
    return firstValueFrom(
      this.http.post<{ id: string }>(`${BASE}/passkeys`, { respuesta, nombre }),
    );
  }

  deletePasskey(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${BASE}/passkeys/${id}`));
  }

  startVerificacionPasskey(): Promise<Record<string, unknown>> {
    return firstValueFrom(
      this.http.post<Record<string, unknown>>(`${BASE}/segundo-factor/passkey/opciones`, {}),
    );
  }

  verifyPasskey(respuesta: unknown): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${BASE}/segundo-factor/passkey`, respuesta));
  }
}
