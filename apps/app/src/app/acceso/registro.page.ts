import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { isCelular, isNavegadorDeOtraApp, isNavegadorSoportado } from '@pasitos/dominio';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  EstadoComponent,
  QrComponent,
} from '@pasitos/ui';
import {
  ErrorApi,
  getDeviceId,
  getLlavePublicaAsistente,
  getSenales,
  isPosibleIncognito,
  requestPersistencia,
} from '@pasitos/web-core';
import { AsistenteApi, type DatosRegistro, type RegistroVisto } from '../asistente-api.service';
import { loadCopia, saveCopia } from '../copia-local';
import { SesionAsistente } from '../sesion-asistente';

type Paso = 'revisando' | 'otra_app' | 'computadora' | 'viejo' | 'formulario' | 'error';

/** El intento guardado sin red: se reintenta con la misma clave mientras el permiso sirva. */
interface Pendiente {
  readonly datos: DatosRegistro;
  readonly clave: string;
  readonly hasta: string;
}

const PENDIENTE = 'registro-pendiente';

/** Los demás textos salen del catálogo de `libs/dominio` (llegan en `detail`). */
const TEXTOS_ERROR: Readonly<Record<string, string>> = {
  DISPOSITIVO_YA_VINCULADO:
    'Este navegador ya tiene otra entrada en este evento. Usa otro navegador o pide ayuda en la puerta.',
};

/**
 * El autorregistro (HU-320 §3, D60): la persona escaneó un QR de registro, escribe su nombre y
 * entra. Va en el paquete inicial de la app (es lo primero que ve), sin el lector de QR.
 */
@Component({
  selector: 'app-registro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, CampoComponent, EstadoComponent, QrComponent],
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
        </section>
      }
      @case ('error') {
        <section class="flex flex-col gap-4">
          <h1 class="text-2xl font-extrabold">No pudimos abrir el registro</h1>
          <px-aviso variante="peligro">{{ error() }}</px-aviso>
        </section>
      }
      @case ('formulario') {
        @if (registro(); as r) {
          <form class="flex flex-col gap-4" (submit)="enter($event)" novalidate>
            @if (r.evento.logoUrl) {
              <img [src]="r.evento.logoUrl" alt="" class="h-16 w-16 rounded-xl object-contain" />
            }
            <p class="text-muted">{{ r.evento.nombre }}</p>
            <h1 class="text-3xl font-extrabold">Entra al evento</h1>
            <p>Escribe tu nombre. Con eso ya ganas puntos y los canjeas por premios.</p>
            @if (incognito()) {
              <px-aviso variante="advertencia">
                Parece que estás en modo incógnito: si cierras esta pestaña, pierdes tu entrada.
                Mejor ábrelo en una pestaña normal.
              </px-aviso>
            }
            <px-campo etiqueta="Nombre" [error]="errores()['nombre'] ?? null" #c1="pxCampo">
              <input
                [id]="c1.idControl"
                [attr.aria-describedby]="c1.idDescripcion"
                autocomplete="name"
                maxlength="80"
                [value]="nombre()"
                (input)="nombre.set($any($event.target).value)"
              />
            </px-campo>
            <px-campo
              etiqueta="Correo"
              [opcional]="true"
              [error]="errores()['email'] ?? null"
              #c2="pxCampo"
            >
              <input
                [id]="c2.idControl"
                [attr.aria-describedby]="c2.idDescripcion"
                type="email"
                autocomplete="email"
                maxlength="254"
                [value]="email()"
                (input)="email.set($any($event.target).value)"
              />
            </px-campo>
            @if (r.pideCarnet) {
              <px-campo
                etiqueta="Carnet de identidad"
                [opcional]="true"
                ayuda="Si lo verificas con el equipo del evento, ganas puntos."
                [error]="errores()['ci'] ?? null"
                #c3="pxCampo"
              >
                <input
                  [id]="c3.idControl"
                  [attr.aria-describedby]="c3.idDescripcion"
                  maxlength="20"
                  [value]="ci()"
                  (input)="ci.set($any($event.target).value)"
                />
              </px-campo>
            }
            @if (error(); as mensaje) {
              <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
            }
            @if (esperandoRed()) {
              <px-aviso variante="advertencia">
                Sin conexión. Lo intentamos de nuevo apenas vuelva la señal.
              </px-aviso>
            }
            <p class="text-muted text-sm">
              Al entrar aceptas los términos del piloto de Pasitos y su política de privacidad. Para
              evitar trampas registramos datos técnicos de este celular; no se comparten ni van a
              Stellar.
            </p>
            <button type="submit" pxBoton [bloque]="true" [cargando]="entrando()">Entrar</button>
          </form>
        }
      }
    }
  `,
})
export class RegistroPage implements OnInit {
  readonly tipo = input.required<string>();
  readonly codigo = input.required<string>();

  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);
  private readonly router = inject(Router);

  protected readonly paso = signal<Paso>('revisando');
  protected readonly registro = signal<RegistroVisto | null>(null);
  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly ci = signal('');
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly entrando = signal(false);
  protected readonly esperandoRed = signal(false);
  protected readonly incognito = signal(false);
  protected readonly copiado = signal(false);
  protected readonly enlace = location.href;

  constructor() {
    const alVolver = () => void this.retry();
    addEventListener('online', alVolver);
    inject(DestroyRef).onDestroy(() => removeEventListener('online', alVolver));
  }

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
    await getDeviceId().catch(() => undefined);
    // Un intento que quedó sin red: se reintenta antes de abrir el QR de nuevo.
    if (await this.retry()) return;
    try {
      this.registro.set(await this.api.openRegistro(this.tipo(), this.codigo()));
      this.paso.set('formulario');
      this.incognito.set(await isPosibleIncognito());
    } catch (error) {
      this.error.set(this.getTexto(error));
      this.paso.set('error');
    }
  }

  protected async enter(evento: Event): Promise<void> {
    evento.preventDefault();
    const registro = this.registro();
    if (!registro || this.entrando()) return;
    const nombre = this.nombre().trim();
    const email = this.email().trim();
    const errores: Record<string, string | null> = {};
    if (nombre.length < 2) errores['nombre'] = 'Escribe tu nombre (al menos 2 letras).';
    if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) {
      errores['email'] = 'Escribe un correo como nombre@dominio.';
    }
    this.errores.set(errores);
    if (Object.keys(errores).length > 0) return;
    this.entrando.set(true);
    this.error.set(null);
    try {
      void requestPersistencia();
      const [deviceId, llavePublica, senales] = await Promise.all([
        getDeviceId(),
        getLlavePublicaAsistente(),
        getSenales().catch(() => undefined),
      ]);
      const pendiente: Pendiente = {
        datos: {
          nombre,
          email: email || null,
          ci: this.ci().trim() || null,
          deviceId,
          llavePublica,
          ...(senales ? { senales } : {}),
          terminos: registro.terminos,
        },
        clave: crypto.randomUUID(),
        hasta: registro.permisoHasta,
      };
      await this.send(pendiente);
    } finally {
      this.entrando.set(false);
    }
  }

  /** Manda el registro; sin red, lo guarda para reintentarlo con la misma clave. */
  private async send(pendiente: Pendiente): Promise<boolean> {
    try {
      const estado = await this.api.register(pendiente.datos, pendiente.clave);
      await saveCopia<Pendiente | null>(PENDIENTE, null);
      this.esperandoRed.set(false);
      this.sesion.set(estado);
      this.sesion.bienvenida.set(
        estado.yaRegistrado
          ? null
          : `¡Listo, ${pendiente.datos.nombre.split(' ')[0] ?? ''}! Ya estás en el evento.`,
      );
      await this.router.navigate(['/inicio'], { replaceUrl: true });
      return true;
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'SIN_CONEXION') {
        await saveCopia(PENDIENTE, pendiente);
        this.esperandoRed.set(true);
        return false;
      }
      await saveCopia<Pendiente | null>(PENDIENTE, null);
      this.esperandoRed.set(false);
      if (error instanceof ErrorApi && error.code === 'VALIDACION') {
        this.errores.set(
          Object.fromEntries(error.errors.map((e) => [e.field, e.message] as const)),
        );
      }
      this.error.set(this.getTexto(error));
      if (this.paso() !== 'formulario') this.paso.set('error');
      return false;
    }
  }

  /** Al volver la red (o al abrir de nuevo), el intento guardado si el permiso sigue vigente. */
  private async retry(): Promise<boolean> {
    const copia = await loadCopia<Pendiente | null>(PENDIENTE);
    const pendiente = copia?.valor;
    if (!pendiente) return false;
    if (Date.parse(pendiente.hasta) <= Date.now()) {
      await saveCopia<Pendiente | null>(PENDIENTE, null);
      return false;
    }
    return this.send(pendiente);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace);
      this.copiado.set(true);
    } catch {
      this.copiado.set(false);
    }
  }

  private getTexto(error: unknown): string {
    const codigo = error instanceof ErrorApi ? error.code : null;
    return (
      (codigo ? TEXTOS_ERROR[codigo] : undefined) ??
      (error instanceof ErrorApi ? error.detail : 'Algo salió mal. Intenta de nuevo.')
    );
  }
}
