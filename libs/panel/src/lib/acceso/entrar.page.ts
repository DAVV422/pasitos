import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { esquemaLogin } from '@pasitos/dominio/esquemas';
import { AvisoComponent, BotonDirective, CampoComponent } from '@pasitos/ui';
import { getDestinoPendiente } from '../sesion/guards';
import { AuthApi } from '../sesion/auth-api.service';
import { SesionService } from '../sesion/sesion.service';
import { getEspera, getMensajeError, MarcoAccesoComponent, toVolverSeguro, valorDe } from './comun';

/** Entrar con correo y contraseña (HU-201 §3 y §7). */
@Component({
  selector: 'pnl-entrar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarcoAccesoComponent, CampoComponent, BotonDirective, AvisoComponent, RouterLink],
  template: `
    <pnl-marco-acceso
      titulo="Entrar"
      bajada="Con el correo y la contraseña de tu cuenta de Pasitos."
    >
      <form class="flex flex-col gap-4" (submit)="submit($event)" novalidate>
        <px-campo etiqueta="Correo" #campoEmail="pxCampo">
          <input
            [id]="campoEmail.idControl"
            [attr.aria-describedby]="campoEmail.idDescripcion"
            type="email"
            name="email"
            autocomplete="username"
            inputmode="email"
            required
            [value]="email()"
            (input)="email.set(valorDe($event))"
          />
        </px-campo>
        <px-campo etiqueta="Contraseña" #campoPassword="pxCampo">
          <div class="flex gap-2">
            <input
              class="flex-1"
              [id]="campoPassword.idControl"
              [attr.aria-describedby]="campoPassword.idDescripcion"
              [type]="verPassword() ? 'text' : 'password'"
              name="password"
              autocomplete="current-password"
              required
              [value]="password()"
              (input)="password.set(valorDe($event))"
            />
            <button
              type="button"
              pxBoton="secundario"
              [chico]="true"
              [attr.aria-pressed]="verPassword()"
              (click)="verPassword.set(!verPassword())"
            >
              {{ verPassword() ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
        </px-campo>

        @if (espera(); as segundos) {
          <px-aviso variante="advertencia">
            Demasiados intentos. Espera {{ segundos }} segundos y prueba de nuevo.
          </px-aviso>
        } @else if (error(); as mensaje) {
          <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
        }

        <button type="submit" pxBoton [cargando]="enviando()" [deshabilitado]="!puedeEnviar()">
          {{ enviando() ? 'Entrando…' : 'Entrar' }}
        </button>
        <a class="text-center underline" routerLink="/recuperar">Olvidé mi contraseña</a>
      </form>
    </pnl-marco-acceso>
  `,
})
export class EntrarPage {
  private readonly api = inject(AuthApi);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  /** `?volver=` de la ruta (withComponentInputBinding). */
  readonly volver = input<string | undefined>();

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly verPassword = signal(false);
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly espera = signal<number | null>(null);
  protected readonly puedeEnviar = computed(
    () => esquemaLogin.safeParse({ email: this.email(), password: this.password() }).success,
  );
  protected readonly valorDe = valorDe;

  private temporizador: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.temporizador));
  }

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeEnviar() || this.enviando() || this.espera()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      const yo = this.sesion.set(await this.api.login(this.email(), this.password()));
      const pendiente = getDestinoPendiente(yo);
      const volver = toVolverSeguro(this.volver());
      await this.router.navigate([pendiente ?? volver], {
        queryParams: pendiente && volver !== '/' ? { volver } : {},
      });
    } catch (error) {
      const segundos = getEspera(error);
      if (segundos) {
        this.startEspera(segundos);
      } else {
        this.error.set(getMensajeError(error));
      }
    } finally {
      this.enviando.set(false);
    }
  }

  private startEspera(segundos: number): void {
    clearInterval(this.temporizador);
    this.espera.set(segundos);
    this.temporizador = setInterval(() => {
      const quedan = (this.espera() ?? 1) - 1;
      this.espera.set(quedan > 0 ? quedan : null);
      if (quedan <= 0) {
        clearInterval(this.temporizador);
      }
    }, 1000);
  }
}
