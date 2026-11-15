import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { esquemaPasswordNueva } from '@pasitos/dominio/esquemas';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AuthApi, type PasskeyGuardada, type SesionAbierta } from '../sesion/auth-api.service';
import { SesionService } from '../sesion/sesion.service';
import { getMensajeError, MarcoAccesoComponent, valorDe } from './comun';
import { PasswordNuevaComponent } from './password-nueva.component';

type Carga<T> =
  | { estado: 'cargando' }
  | { estado: 'error'; traceId: string | null }
  | { estado: 'listo'; datos: T };

/** Mi cuenta (HU-201 §7): contraseña, segundo factor y sesiones abiertas. */
@Component({
  selector: 'pnl-cuenta-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MarcoAccesoComponent,
    CampoComponent,
    PasswordNuevaComponent,
    BotonDirective,
    AvisoComponent,
    EstadoComponent,
    TarjetaComponent,
    RouterLink,
    DatePipe,
  ],
  template: `
    <pnl-marco-acceso titulo="Mi cuenta" [bajada]="sesion.usuario()?.email ?? null">
      <!-- Contraseña -->
      <px-tarjeta>
        <h2 class="mb-3 text-xl font-bold">Contraseña</h2>
        <form class="flex flex-col gap-4" (submit)="submitPassword($event)" novalidate>
          <px-campo etiqueta="Contraseña actual" #campoActual="pxCampo">
            <input
              [id]="campoActual.idControl"
              [attr.aria-describedby]="campoActual.idDescripcion"
              type="password"
              name="actual"
              autocomplete="current-password"
              [value]="actual()"
              (input)="actual.set(valorDe($event))"
            />
          </px-campo>
          <pnl-password-nueva [(valor)]="nueva" />
          @if (mensajePassword(); as aviso) {
            <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
          }
          <button
            type="submit"
            pxBoton
            [cargando]="guardandoPassword()"
            [deshabilitado]="!puedeCambiar()"
          >
            {{ guardandoPassword() ? 'Guardando…' : 'Cambiar la contraseña' }}
          </button>
        </form>
      </px-tarjeta>

      <!-- Segundo factor -->
      <px-tarjeta>
        <h2 class="mb-1 text-xl font-bold">Segundo factor</h2>
        <p class="text-muted mb-3 text-sm">
          @if (sesion.yo()?.segundoFactor?.requerido) {
            Tu rol lo necesita: siempre tiene que quedar al menos uno.
          } @else {
            Opcional para tu rol, pero recomendado.
          }
        </p>
        @switch (passkeys().estado) {
          @case ('cargando') {
            <px-estado tipo="cargando" />
          }
          @case ('error') {
            <px-estado tipo="error" titulo="No pudimos cargar tus passkeys" />
          }
          @case ('listo') {
            <ul class="flex flex-col gap-2">
              @for (passkey of listaPasskeys(); track passkey.id) {
                <li class="flex items-center justify-between gap-3">
                  <span>
                    <b>{{ passkey.nombre }}</b>
                    <span class="text-muted block text-sm">
                      Creada el {{ passkey.createdAt | date: 'dd/MM/yyyy' }}
                      @if (passkey.ultimoUsoAt) {
                        · usada el {{ passkey.ultimoUsoAt | date: 'dd/MM/yyyy HH:mm' }}
                      }
                    </span>
                  </span>
                  <button
                    type="button"
                    pxBoton="peligro"
                    [chico]="true"
                    (click)="deletePasskey(passkey)"
                  >
                    Quitar
                  </button>
                </li>
              } @empty {
                <li class="text-muted">No tienes passkeys.</li>
              }
              <li class="flex items-center justify-between gap-3">
                <span>
                  <b>App de códigos</b>
                  <span class="text-muted block text-sm">{{
                    tieneTotp() ? 'Configurada' : 'Sin configurar'
                  }}</span>
                </span>
                @if (tieneTotp()) {
                  <button type="button" pxBoton="peligro" [chico]="true" (click)="removeTotp()">
                    Quitar
                  </button>
                }
              </li>
            </ul>
            <a
              class="mt-4"
              pxBoton="secundario"
              routerLink="/segundo-factor/configurar"
              [queryParams]="{ volver: '/cuenta' }"
            >
              Sumar un método
            </a>
          }
        }
        @if (mensajeSegundoFactor(); as texto) {
          <px-aviso class="mt-3" variante="peligro">{{ texto }}</px-aviso>
        }
      </px-tarjeta>

      <!-- Sesiones -->
      <px-tarjeta>
        <h2 class="mb-3 text-xl font-bold">Sesiones abiertas</h2>
        @switch (sesiones().estado) {
          @case ('cargando') {
            <px-estado tipo="cargando" />
          }
          @case ('error') {
            <px-estado tipo="error" titulo="No pudimos cargar tus sesiones" />
          }
          @case ('listo') {
            <ul class="flex flex-col gap-2">
              @for (abierta of listaSesiones(); track abierta.id) {
                <li class="flex items-center justify-between gap-3">
                  <span>
                    <b>{{ abierta.dispositivo ?? 'Navegador' }}</b>
                    @if (abierta.actual) {
                      <span class="text-success"> · esta</span>
                    }
                    <span class="text-muted block text-sm">
                      Último uso: {{ abierta.ultimoUsoAt | date: 'dd/MM/yyyy HH:mm' }}
                    </span>
                  </span>
                  @if (!abierta.actual) {
                    <button
                      type="button"
                      pxBoton="secundario"
                      [chico]="true"
                      (click)="revokeSession(abierta)"
                    >
                      Cerrar
                    </button>
                  }
                </li>
              }
            </ul>
          }
        }
      </px-tarjeta>

      <button type="button" pxBoton="secundario" (click)="logout()">Salir</button>
    </pnl-marco-acceso>
  `,
})
export class CuentaPage implements OnInit {
  private readonly api = inject(AuthApi);
  private readonly router = inject(Router);
  protected readonly sesion = inject(SesionService);

  protected readonly actual = signal('');
  protected readonly nueva = signal('');
  protected readonly guardandoPassword = signal(false);
  protected readonly mensajePassword = signal<{
    variante: 'ok' | 'peligro';
    texto: string;
  } | null>(null);
  protected readonly puedeCambiar = computed(
    () => this.actual().length > 0 && esquemaPasswordNueva.safeParse(this.nueva()).success,
  );

  protected readonly passkeys = signal<Carga<readonly PasskeyGuardada[]>>({ estado: 'cargando' });
  protected readonly sesiones = signal<Carga<readonly SesionAbierta[]>>({ estado: 'cargando' });
  protected readonly listaPasskeys = computed(() => {
    const carga = this.passkeys();
    return carga.estado === 'listo' ? carga.datos : [];
  });
  protected readonly listaSesiones = computed(() => {
    const carga = this.sesiones();
    return carga.estado === 'listo' ? carga.datos : [];
  });
  protected readonly tieneTotp = computed(
    () => this.sesion.yo()?.segundoFactor.metodos.includes('totp') ?? false,
  );
  protected readonly mensajeSegundoFactor = signal<string | null>(null);
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.loadPasskeys();
    void this.loadSesiones();
  }

  protected async submitPassword(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeCambiar() || this.guardandoPassword()) {
      return;
    }
    this.guardandoPassword.set(true);
    this.mensajePassword.set(null);
    try {
      await this.api.changePassword(this.actual(), this.nueva());
      this.actual.set('');
      this.nueva.set('');
      this.mensajePassword.set({
        variante: 'ok',
        texto: 'Listo: cambiaste tu contraseña y cerramos tus otras sesiones.',
      });
      void this.loadSesiones();
    } catch (error) {
      this.mensajePassword.set({ variante: 'peligro', texto: getMensajeError(error) });
    } finally {
      this.guardandoPassword.set(false);
    }
  }

  protected async deletePasskey(passkey: PasskeyGuardada): Promise<void> {
    await this.runSegundoFactor(() => this.api.deletePasskey(passkey.id));
  }

  protected async removeTotp(): Promise<void> {
    await this.runSegundoFactor(() => this.api.removeTotp());
  }

  protected async revokeSession(abierta: SesionAbierta): Promise<void> {
    await this.api.revokeSession(abierta.id);
    await this.loadSesiones();
  }

  protected async logout(): Promise<void> {
    await this.sesion.logout();
    await this.router.navigate(['/entrar']);
  }

  private async runSegundoFactor(paso: () => Promise<void>): Promise<void> {
    this.mensajeSegundoFactor.set(null);
    try {
      await paso();
      await Promise.all([this.sesion.reload(), this.loadPasskeys()]);
    } catch (error) {
      this.mensajeSegundoFactor.set(
        error instanceof ErrorApi && error.errors[0]
          ? error.errors[0].message
          : getMensajeError(error),
      );
    }
  }

  private async loadPasskeys(): Promise<void> {
    try {
      this.passkeys.set({ estado: 'listo', datos: await this.api.listPasskeys() });
    } catch (error) {
      this.passkeys.set({
        estado: 'error',
        traceId: error instanceof ErrorApi ? error.traceId : null,
      });
    }
  }

  private async loadSesiones(): Promise<void> {
    try {
      this.sesiones.set({ estado: 'listo', datos: await this.api.listSessions() });
    } catch (error) {
      this.sesiones.set({
        estado: 'error',
        traceId: error instanceof ErrorApi ? error.traceId : null,
      });
    }
  }
}
