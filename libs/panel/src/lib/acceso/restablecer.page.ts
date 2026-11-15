import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { esquemaPasswordNueva } from '@pasitos/dominio/esquemas';
import { AvisoComponent, BotonDirective, EstadoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AuthApi } from '../sesion/auth-api.service';
import { getMensajeError, MarcoAccesoComponent } from './comun';
import { PasswordNuevaComponent } from './password-nueva.component';

/** Elegir la contraseña nueva con el enlace del correo (HU-201 §5; E1 si el enlace no sirve). */
@Component({
  selector: 'pnl-restablecer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MarcoAccesoComponent,
    PasswordNuevaComponent,
    BotonDirective,
    AvisoComponent,
    EstadoComponent,
    RouterLink,
  ],
  template: `
    <pnl-marco-acceso titulo="Elige una contraseña nueva">
      @if (listo()) {
        <px-aviso variante="ok">
          Listo: cambiaste tu contraseña y cerramos tus sesiones abiertas.
        </px-aviso>
        <a pxBoton routerLink="/entrar">Entrar</a>
      } @else if (vencido()) {
        <px-estado tipo="error" titulo="Este enlace ya no sirve">
          Vence a los 30 minutos y sirve una sola vez. Pide uno nuevo.
        </px-estado>
        <a pxBoton routerLink="/recuperar">Pedir otro enlace</a>
      } @else {
        <form class="flex flex-col gap-4" (submit)="submit($event)" novalidate>
          <pnl-password-nueva [(valor)]="password" [error]="error()" />
          <button type="submit" pxBoton [cargando]="enviando()" [deshabilitado]="!puedeEnviar()">
            {{ enviando() ? 'Guardando…' : 'Guardar la contraseña' }}
          </button>
        </form>
      }
    </pnl-marco-acceso>
  `,
})
export class RestablecerPage {
  private readonly api = inject(AuthApi);

  /** `:token` de la ruta. */
  readonly token = input.required<string>();

  protected readonly password = signal('');
  protected readonly enviando = signal(false);
  protected readonly listo = signal(false);
  protected readonly vencido = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly puedeEnviar = computed(
    () => esquemaPasswordNueva.safeParse(this.password()).success,
  );

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    if (!this.puedeEnviar() || this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    try {
      await this.api.restablecer(this.token(), this.password());
      this.listo.set(true);
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'ENLACE_VENCIDO') {
        this.vencido.set(true);
      } else {
        this.error.set(getMensajeError(error));
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
