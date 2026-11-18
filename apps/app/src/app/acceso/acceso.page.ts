import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  isCelular,
  isNavegadorDeOtraApp,
  isNavegadorSoportado,
  TIPOS_ACCESO,
  type TipoAcceso,
} from '@pasitos/dominio';
import { AvisoComponent, BotonDirective, EstadoComponent, QrComponent } from '@pasitos/ui';
import {
  ErrorApi,
  getDeviceId,
  getLlavePublicaAsistente,
  getSenales,
  isPosibleIncognito,
  requestPersistencia,
} from '@pasitos/web-core';
import { AsistenteApi, type AccesoVisto } from '../asistente-api.service';
import { SesionAsistente } from '../sesion-asistente';

type Paso = 'revisando' | 'otra_app' | 'computadora' | 'viejo' | 'bienvenida' | 'error';

/** Los textos de los errores de esta pantalla, desde el lado del asistente (Acceso §4.1). */
const TEXTOS_ERROR: Readonly<Record<string, string>> = {
  INVITACION_YA_USADA:
    'Este enlace ya se usó en otro celular. Si cambiaste de celular, pide un acceso nuevo en la puerta.',
  ENLACE_VENCIDO: 'Este enlace ya no sirve. Pide un acceso nuevo en la puerta.',
  QR_ASISTENTE_VENCIDO: 'El código venció. Pide al registrador que lo genere de nuevo.',
  DISPOSITIVO_YA_VINCULADO:
    'Este navegador ya tiene otra entrada en este evento. Para esta, usa otro navegador (por ejemplo, Firefox) o pide ayuda en la puerta.',
};

/**
 * Bienvenida y vinculación del celular (HU-306 §5, mockups A1 y A14). Antes de pedir nada mira el
 * navegador: dentro de otra app, en una computadora o muy viejo, no vincula y dice cómo seguir.
 */
@Component({
  selector: 'app-acceso-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent, QrComponent],
  template: `
    @switch (paso()) {
      @case ('revisando') {
        <px-estado tipo="cargando" />
      }
      @case ('otra_app') {
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl font-extrabold">Ábrelo en Chrome o Safari</h1>
          <p>
            Estás dentro de otra app. Ahí Pasitos no puede guardar tu entrada: copia el enlace y
            ábrelo en el navegador de tu celular.
          </p>
          <button type="button" pxBoton [bloque]="true" (click)="copy()">
            {{ copiado() ? 'Enlace copiado' : 'Copiar enlace' }}
          </button>
          @if (esAndroid) {
            <a pxBoton="secundario" [bloque]="true" [href]="enlaceChrome">Abrir en Chrome</a>
          }
        </section>
      }
      @case ('computadora') {
        <section class="flex flex-col items-center gap-4 text-center">
          <h1 class="text-2xl font-extrabold">Sigue en tu celular</h1>
          <p>Tu entrada vive en tu celular. Escanea este código con la cámara del celular.</p>
          <px-qr [texto]="enlace" [tamano]="220" descripcion="Código QR de tu enlace" />
        </section>
      }
      @case ('viejo') {
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl font-extrabold">Actualiza tu navegador</h1>
          <p>
            Tu navegador es muy antiguo para Pasitos. Actualiza Chrome o Safari, o abre el enlace en
            otro navegador del celular.
          </p>
          <button type="button" pxBoton="secundario" [bloque]="true" (click)="copy()">
            {{ copiado() ? 'Enlace copiado' : 'Copiar enlace' }}
          </button>
        </section>
      }
      @case ('error') {
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl font-extrabold">No pudimos abrir tu entrada</h1>
          <px-aviso variante="peligro">{{ error() }}</px-aviso>
        </section>
      }
      @case ('bienvenida') {
        @if (acceso(); as a) {
          <section class="flex flex-col gap-4">
            <p class="text-muted">{{ a.evento.nombre }}</p>
            <h1 class="text-3xl font-extrabold">Hola, {{ primerNombre(a.asistente.nombre) }}</h1>
            <p>Desde este celular vas a ganar puntos en el evento y canjearlos por premios.</p>
            @if (incognito()) {
              <px-aviso variante="advertencia">
                Parece que estás en modo incógnito: si cierras esta pestaña, pierdes tu entrada.
                Mejor ábrelo en una pestaña normal.
              </px-aviso>
            }
            @if (error(); as mensaje) {
              <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
            }
            <p class="text-muted text-sm">
              Al entrar aceptas los términos del piloto de Pasitos y su política de privacidad. Para
              evitar trampas registramos datos técnicos de este celular; no se comparten ni van a
              Stellar.
            </p>
            <button type="button" pxBoton [bloque]="true" [cargando]="entrando()" (click)="enter()">
              Entrar
            </button>
          </section>
        }
      }
    }
  `,
})
export class AccesoPage implements OnInit {
  readonly tipo = input.required<string>();
  readonly token = input.required<string>();

  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);
  private readonly router = inject(Router);

  protected readonly paso = signal<Paso>('revisando');
  protected readonly acceso = signal<AccesoVisto | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly entrando = signal(false);
  protected readonly incognito = signal(false);
  protected readonly copiado = signal(false);

  protected readonly enlace = location.href;
  protected readonly esAndroid = /Android/.test(navigator.userAgent);
  protected readonly enlaceChrome = `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;

  async ngOnInit(): Promise<void> {
    const agente = navigator.userAgent;
    if (isNavegadorDeOtraApp(agente)) {
      this.paso.set('otra_app');
      return;
    }
    if (!isCelular(agente, navigator.maxTouchPoints)) {
      this.paso.set('computadora');
      return;
    }
    if (!isNavegadorSoportado(agente)) {
      this.paso.set('viejo');
      return;
    }
    const tipo = this.toTipo();
    if (!tipo) {
      this.showError('ENLACE_VENCIDO');
      return;
    }
    // Cuenta el id de este navegador en la cookie, para reconocerlo si ya tiene la entrada.
    await getDeviceId().catch(() => undefined);
    try {
      const acceso = await this.api.describeAcceso(tipo, this.token());
      if (acceso.yaVinculado && (await this.sesion.load().catch(() => null)) === 'ok') {
        await this.router.navigate(['/inicio'], { replaceUrl: true });
        return;
      }
      this.acceso.set(acceso);
      this.paso.set('bienvenida');
      this.incognito.set(await isPosibleIncognito());
    } catch (error) {
      this.showError(error instanceof ErrorApi ? error.code : null, error);
    }
  }

  protected primerNombre(nombre: string): string {
    return nombre.split(' ')[0] ?? nombre;
  }

  protected async enter(): Promise<void> {
    const tipo = this.toTipo();
    const acceso = this.acceso();
    if (!tipo || !acceso || this.entrando()) return;
    this.entrando.set(true);
    this.error.set(null);
    try {
      void requestPersistencia();
      const [deviceId, llavePublica, senales] = await Promise.all([
        getDeviceId(),
        getLlavePublicaAsistente(),
        getSenales().catch(() => undefined),
      ]);
      const estado = await this.api.vincular({
        tipo,
        token: this.token(),
        deviceId,
        llavePublica,
        ...(senales ? { senales } : {}),
        terminos: acceso.terminos,
      });
      this.sesion.set(estado);
      await this.router.navigate(['/inicio'], { replaceUrl: true });
    } catch (error) {
      const codigo = error instanceof ErrorApi ? error.code : null;
      if (codigo === 'NAVEGADOR_NO_SOPORTADO') {
        this.paso.set('otra_app');
      } else {
        this.error.set(this.getTexto(codigo, error));
      }
    } finally {
      this.entrando.set(false);
    }
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace);
      this.copiado.set(true);
    } catch {
      this.copiado.set(false);
    }
  }

  private toTipo(): TipoAcceso | null {
    const tipo = this.tipo();
    return (TIPOS_ACCESO as readonly string[]).includes(tipo) ? (tipo as TipoAcceso) : null;
  }

  private showError(codigo: string | null, error?: unknown): void {
    this.error.set(this.getTexto(codigo, error));
    this.paso.set('error');
  }

  private getTexto(codigo: string | null, error?: unknown): string {
    return (
      (codigo ? TEXTOS_ERROR[codigo] : undefined) ??
      (error instanceof ErrorApi ? error.detail : 'Algo salió mal. Intenta de nuevo.')
    );
  }
}
