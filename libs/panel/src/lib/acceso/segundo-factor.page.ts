import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AvisoComponent, BotonDirective, CampoComponent } from '@pasitos/ui';
import { AuthApi } from '../sesion/auth-api.service';
import { SesionService } from '../sesion/sesion.service';
import { getEspera, getMensajeError, MarcoAccesoComponent, toVolverSeguro, valorDe } from './comun';
import {
  isNavegadorDeOtraApp,
  isPasskeyDisponible,
  PasskeyError,
  PasskeyPreparada,
} from './passkeys';

/** Pasar el segundo factor al entrar: passkey (si tiene) o código de 6 números (HU-201 §7). */
@Component({
  selector: 'pnl-segundo-factor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarcoAccesoComponent, CampoComponent, BotonDirective, AvisoComponent],
  template: `
    <pnl-marco-acceso titulo="Confirma que eres tú" [bajada]="bajada()">
      @if (metodo() === 'passkey') {
        @if (otraApp) {
          <px-aviso variante="advertencia">
            Estás dentro de otra app (Gmail, WhatsApp…): ahí las passkeys suelen fallar. Abre esta
            página en Safari o Chrome.
          </px-aviso>
        }
        <button type="button" pxBoton [cargando]="enviando()" (click)="usePasskey()">
          {{ enviando() ? 'Esperando la passkey…' : 'Usar mi passkey' }}
        </button>
        <p class="text-muted text-sm">
          ¿Tu passkey está en otro celular? Cuando se abra, elige «Usar un teléfono o tablet» (u
          «Otro dispositivo») y escanea el QR con ese celular.
        </p>
      } @else {
        <form class="flex flex-col gap-4" (submit)="submitCodigo($event)" novalidate>
          <px-campo
            etiqueta="Código de 6 números"
            ayuda="El que muestra tu app de códigos ahora."
            #campo="pxCampo"
          >
            <input
              [id]="campo.idControl"
              [attr.aria-describedby]="campo.idDescripcion"
              name="codigo"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              pattern="[0-9]*"
              [value]="codigo()"
              (input)="setCodigo($event)"
            />
          </px-campo>
          <button
            type="submit"
            pxBoton
            [cargando]="enviando()"
            [deshabilitado]="codigo().length !== 6"
          >
            {{ enviando() ? 'Confirmando…' : 'Confirmar' }}
          </button>
        </form>
      }

      @if (error(); as mensaje) {
        <px-aviso [variante]="cancelada() ? 'advertencia' : 'peligro'">{{ mensaje }}</px-aviso>
      }

      @if (tieneLosDos()) {
        <button type="button" pxBoton="secundario" (click)="switchMetodo()">
          {{ metodo() === 'passkey' ? 'Usar el código de mi app' : 'Usar mi passkey' }}
        </button>
      }
      <button type="button" class="underline" (click)="logout()">
        Salir y entrar con otra cuenta
      </button>
    </pnl-marco-acceso>
  `,
})
export class SegundoFactorPage {
  private readonly api = inject(AuthApi);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  readonly volver = input<string | undefined>();

  private readonly metodos = computed(() => this.sesion.yo()?.segundoFactor.metodos ?? []);
  protected readonly tieneLosDos = computed(
    () => this.metodos().includes('totp') && this.metodos().includes('passkey'),
  );
  protected readonly metodo = signal<'passkey' | 'totp'>(
    this.metodos().includes('passkey') && isPasskeyDisponible() ? 'passkey' : 'totp',
  );
  protected readonly bajada = computed(() =>
    this.metodo() === 'passkey'
      ? 'Usa la passkey que guardaste en este equipo o en tu celular.'
      : 'Escribe el código de 6 números de tu app de códigos.',
  );
  protected readonly codigo = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelada = signal(false);
  protected readonly otraApp = isNavegadorDeOtraApp();
  private readonly passkey = new PasskeyPreparada(() => this.api.startVerificacionPasskey());

  constructor() {
    // El desafío y la librería, antes del toque (Safari en iPhone, ver passkeys.ts).
    if (this.metodo() === 'passkey') {
      void this.passkey.prepare().catch(() => undefined);
    }
  }

  protected setCodigo(evento: Event): void {
    this.codigo.set(valorDe(evento).replace(/\D/g, '').slice(0, 6));
  }

  protected switchMetodo(): void {
    this.metodo.set(this.metodo() === 'passkey' ? 'totp' : 'passkey');
    this.error.set(null);
    if (this.metodo() === 'passkey') {
      void this.passkey.prepare().catch(() => undefined);
    }
  }

  protected async submitCodigo(evento: Event): Promise<void> {
    evento.preventDefault();
    await this.run(() => this.api.verifyTotp(this.codigo()));
  }

  protected async usePasskey(): Promise<void> {
    await this.run(async () => {
      // `use()` primero, sin esperas antes: así la passkey se abre dentro del toque.
      const respuesta = this.passkey.use();
      await this.api.verifyPasskey(await respuesta);
    });
  }

  protected async logout(): Promise<void> {
    await this.sesion.logout();
    await this.router.navigate(['/entrar']);
  }

  private async run(paso: () => Promise<void>): Promise<void> {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.cancelada.set(false);
    try {
      await paso();
      await this.sesion.reload();
      await this.router.navigateByUrl(toVolverSeguro(this.volver()));
    } catch (error) {
      this.codigo.set('');
      this.cancelada.set(error instanceof PasskeyError && error.motivo === 'cancelada');
      if (error instanceof PasskeyError) {
        this.api.reportPasskey('verificacion', error.original);
      }
      if (this.metodo() === 'passkey') {
        void this.passkey.prepare().catch(() => undefined);
      }
      const espera = getEspera(error);
      this.error.set(
        espera
          ? `Demasiados intentos. Espera ${Math.ceil(espera / 60)} minutos y prueba de nuevo.`
          : error instanceof PasskeyError
            ? error.message
            : getMensajeError(error),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
