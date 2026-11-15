import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AvisoComponent, BotonDirective, CampoComponent, QrComponent } from '@pasitos/ui';
import { AuthApi } from '../sesion/auth-api.service';
import { SesionService } from '../sesion/sesion.service';
import { getMensajeError, MarcoAccesoComponent, toVolverSeguro, valorDe } from './comun';
import {
  createPasskey,
  getNombrePasskeyPorDefecto,
  isPasskeyDisponible,
  PasskeyCanceladaError,
} from './passkeys';

type Paso = 'elegir' | 'passkey' | 'totp';

/**
 * Dar de alta el segundo factor (HU-201 §4 y §7). Si es obligatorio, no hay *Después*: no se puede
 * usar el panel sin él. Desde *Mi cuenta* sirve para sumar otro método.
 */
@Component({
  selector: 'pnl-configurar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarcoAccesoComponent, CampoComponent, BotonDirective, AvisoComponent, QrComponent],
  template: `
    <pnl-marco-acceso titulo="Configura tu segundo factor" [bajada]="bajada()">
      @switch (paso()) {
        @case ('elegir') {
          <div class="flex flex-col gap-3">
            @if (passkeyDisponible) {
              <button type="button" pxBoton (click)="paso.set('passkey')">
                Usar una passkey (recomendado)
              </button>
              <p class="text-muted text-sm">
                Entras con la huella, la cara o el PIN de este equipo o de tu celular. Nada que
                copiar.
              </p>
            }
            <button
              type="button"
              pxBoton="secundario"
              (click)="startTotp()"
              [cargando]="enviando()"
            >
              Usar una app de códigos
            </button>
            <p class="text-muted text-sm">
              Google Authenticator, Microsoft Authenticator o similar: te da un código nuevo cada 30
              segundos.
            </p>
          </div>
        }
        @case ('passkey') {
          <form class="flex flex-col gap-4" (submit)="submitPasskey($event)" novalidate>
            <px-campo
              etiqueta="Nombre de la passkey"
              ayuda="Para reconocerla en Mi cuenta."
              #campo="pxCampo"
            >
              <input
                [id]="campo.idControl"
                [attr.aria-describedby]="campo.idDescripcion"
                name="nombre"
                maxlength="50"
                [value]="nombrePasskey()"
                (input)="nombrePasskey.set(valorDe($event))"
              />
            </px-campo>
            <button
              type="submit"
              pxBoton
              [cargando]="enviando()"
              [disabled]="!nombrePasskey().trim()"
            >
              {{ enviando() ? 'Esperando la passkey…' : 'Crear la passkey' }}
            </button>
            <button type="button" pxBoton="secundario" (click)="paso.set('elegir')">
              Elegir otro método
            </button>
          </form>
        }
        @case ('totp') {
          @if (totp(); as datos) {
            <ol class="flex list-decimal flex-col gap-3 pl-5">
              <li>Abre tu app de códigos y elige agregar una cuenta.</li>
              <li>
                Escanea este código QR.
                <div class="mt-3 flex justify-center">
                  <px-qr
                    [texto]="datos.otpauthUrl"
                    [tamano]="220"
                    descripcion="Código QR para la app de códigos"
                  />
                </div>
                <p class="text-muted mt-2 text-sm">
                  ¿No puedes escanear? Escribe esta clave en la app:
                  <code class="px-codigo break-all">{{ datos.secreto }}</code>
                </p>
              </li>
              <li>Escribe el código de 6 números que te muestra.</li>
            </ol>
            <form class="flex flex-col gap-4" (submit)="submitTotp($event)" novalidate>
              <px-campo etiqueta="Código de 6 números" #campoCodigo="pxCampo">
                <input
                  [id]="campoCodigo.idControl"
                  [attr.aria-describedby]="campoCodigo.idDescripcion"
                  name="codigo"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  [value]="codigo()"
                  (input)="setCodigo($event)"
                />
              </px-campo>
              <button
                type="submit"
                pxBoton
                [cargando]="enviando()"
                [disabled]="codigo().length !== 6"
              >
                {{ enviando() ? 'Confirmando…' : 'Confirmar' }}
              </button>
              <button type="button" pxBoton="secundario" (click)="paso.set('elegir')">
                Elegir otro método
              </button>
            </form>
          }
        }
      }

      @if (error(); as mensaje) {
        <px-aviso [variante]="cancelada() ? 'advertencia' : 'peligro'">{{ mensaje }}</px-aviso>
      }

      @if (!obligatorio()) {
        <button type="button" class="underline" (click)="salir()">Ahora no</button>
      } @else {
        <px-aviso variante="info">
          Tu rol necesita un segundo factor para cuidar los datos del evento. Si pierdes el celular,
          soporte de Pasitos puede restablecerlo.
        </px-aviso>
      }
    </pnl-marco-acceso>
  `,
})
export class ConfigurarPage {
  private readonly api = inject(AuthApi);
  private readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  readonly volver = input<string | undefined>();

  protected readonly passkeyDisponible = isPasskeyDisponible();
  protected readonly paso = signal<Paso>('elegir');
  protected readonly obligatorio = computed(
    () => this.sesion.yo()?.segundoFactor.estado === 'por_configurar',
  );
  protected readonly bajada = computed(() =>
    this.obligatorio()
      ? 'Además de tu contraseña, vas a confirmar que eres tú con algo que solo tú tienes.'
      : 'Suma otra forma de confirmar que eres tú.',
  );
  protected readonly nombrePasskey = signal(getNombrePasskeyPorDefecto());
  protected readonly totp = signal<{ otpauthUrl: string; secreto: string } | null>(null);
  protected readonly codigo = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly cancelada = signal(false);
  protected readonly valorDe = valorDe;

  protected setCodigo(evento: Event): void {
    this.codigo.set(valorDe(evento).replace(/\D/g, '').slice(0, 6));
  }

  protected async startTotp(): Promise<void> {
    await this.run(async () => {
      this.totp.set(await this.api.startTotp());
      this.paso.set('totp');
    }, false);
  }

  protected async submitTotp(evento: Event): Promise<void> {
    evento.preventDefault();
    await this.run(() => this.api.confirmTotp(this.codigo()));
  }

  protected async submitPasskey(evento: Event): Promise<void> {
    evento.preventDefault();
    await this.run(async () => {
      const opciones = await this.api.startRegistroPasskey();
      await this.api.registerPasskey(await createPasskey(opciones), this.nombrePasskey().trim());
    });
  }

  protected async salir(): Promise<void> {
    await this.router.navigateByUrl(toVolverSeguro(this.volver()));
  }

  private async run(paso: () => Promise<void>, terminar = true): Promise<void> {
    if (this.enviando()) {
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.cancelada.set(false);
    try {
      await paso();
      if (terminar) {
        await this.sesion.reload();
        await this.router.navigateByUrl(toVolverSeguro(this.volver()));
      }
    } catch (error) {
      this.codigo.set('');
      this.cancelada.set(error instanceof PasskeyCanceladaError);
      this.error.set(
        error instanceof PasskeyCanceladaError ? error.message : getMensajeError(error),
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
