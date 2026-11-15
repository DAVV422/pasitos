import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { esquemaEmail } from '@pasitos/dominio/esquemas';
import { AvisoComponent, BotonDirective, CampoComponent } from '@pasitos/ui';
import { AuthApi } from '../sesion/auth-api.service';
import { APP_EQUIPO } from '../sesion/sesion.service';
import { getMensajeError, MarcoAccesoComponent, valorDe } from './comun';

const ESPERA_REENVIO_S = 60;

/** Pedir el enlace para elegir otra contraseña (HU-201 §5). La respuesta no dice si el correo existe. */
@Component({
  selector: 'pnl-recuperar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarcoAccesoComponent, CampoComponent, BotonDirective, AvisoComponent, RouterLink],
  template: `
    <pnl-marco-acceso
      titulo="Recuperar la contraseña"
      bajada="Te mandamos un enlace para elegir una contraseña nueva."
    >
      <form class="flex flex-col gap-4" (submit)="submit($event)" novalidate>
        <px-campo etiqueta="Correo" #campo="pxCampo">
          <input
            [id]="campo.idControl"
            [attr.aria-describedby]="campo.idDescripcion"
            type="email"
            name="email"
            autocomplete="username"
            inputmode="email"
            [value]="email()"
            (input)="email.set(valorDe($event))"
          />
        </px-campo>
        @if (enviado()) {
          <px-aviso variante="ok">
            Si el correo está registrado, te llegará un enlace en unos minutos. Revisa también la
            carpeta de spam. El enlace vale 30 minutos.
          </px-aviso>
        }
        @if (error(); as mensaje) {
          <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
        }
        <button type="submit" pxBoton [cargando]="enviando()" [disabled]="!puedeEnviar()">
          @if (espera() > 0) {
            Reenviar en {{ espera() }} s
          } @else {
            {{ enviado() ? 'Reenviar el enlace' : 'Enviar el enlace' }}
          }
        </button>
        <a class="text-center underline" routerLink="/entrar">Volver a entrar</a>
      </form>
    </pnl-marco-acceso>
  `,
})
export class RecuperarPage {
  private readonly api = inject(AuthApi);
  private readonly app = inject(APP_EQUIPO);

  protected readonly email = signal('');
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly espera = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly puedeEnviar = computed(
    () => esquemaEmail.safeParse(this.email()).success && this.espera() === 0,
  );
  protected readonly valorDe = valorDe;
  private temporizador: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.temporizador));
  }

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeEnviar() || this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.api.requestRestablecer(this.email(), this.app);
      this.enviado.set(true);
      this.espera.set(ESPERA_REENVIO_S);
      clearInterval(this.temporizador);
      this.temporizador = setInterval(() => {
        this.espera.set(Math.max(0, this.espera() - 1));
        if (this.espera() === 0) {
          clearInterval(this.temporizador);
        }
      }, 1000);
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.enviando.set(false);
    }
  }
}
