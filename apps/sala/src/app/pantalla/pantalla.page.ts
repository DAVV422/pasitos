import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { buildQrReto, getFranjaQr, toBase64Url } from '@pasitos/firmas';
import { AvisoComponent, IconoComponent, QrComponent } from '@pasitos/ui';
import { EnVivoService, ErrorApi } from '@pasitos/web-core';
import { getParLlaves } from '../conectar/llave-local';
import { SalaApi, type EstadoSala, type QrEmitido } from '../sala-api.service';

type Emitido = QrEmitido;

const TICK_MS = 250;
const ESTADO_CADA_MS = 60_000;
const INFORMAR_CADA_MS = 30_000;
const DESTELLO_MS = 700;

function newNonce(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * La pantalla de sala (HU-314, mockups S1–S3): el QR del reto que toca, firmado aquí mismo con la
 * llave de la tablet, y el contador en vivo. Sin red sigue mostrando un QR válido (lo genera la
 * tablet con la hora del servidor) y avisa *"Contador sin conexión"*.
 */
@Component({
  selector: 'sala-pantalla-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, IconoComponent, QrComponent],
  host: { class: 'bg-bg fixed inset-0 z-20 flex flex-col', '(click)': 'onToque()' },
  template: `
    @if (sinRed()) {
      <div class="px-6 pt-3">
        <px-aviso variante="advertencia">Contador sin conexión. El QR sigue funcionando.</px-aviso>
      </div>
    }
    @if (estado(); as e) {
      @switch (e.estado) {
        @case ('activa') {
          @if (e.reto; as r) {
            <header class="flex items-baseline justify-between gap-4 px-8 pt-6">
              <h1 class="font-display text-4xl font-extrabold">{{ r.nombre }}</h1>
              <p class="text-points font-display text-4xl font-extrabold whitespace-nowrap">
                +{{ r.puntos }} puntos
              </p>
            </header>
            <section class="flex flex-1 items-center justify-center p-4">
              @if (qr(); as texto) {
                <px-qr [texto]="texto" [tamano]="tamanoQr()" descripcion="QR del reto" />
              }
            </section>
            <footer class="flex items-center justify-between gap-6 px-8 pb-6">
              @if (r.modo === 'por_tiempo') {
                <div class="flex flex-1 flex-col gap-1" aria-hidden="true">
                  <div class="bg-surface2 h-3 w-full overflow-hidden rounded-full">
                    <div
                      class="bg-points h-full transition-[width] duration-200"
                      [style.width.%]="avance()"
                    ></div>
                  </div>
                  <p class="text-muted text-sm">Cambia en {{ restantes() }} s</p>
                </div>
              } @else {
                <p class="text-muted text-lg">Un solo uso: cambia al escanearlo</p>
              }
              <p
                class="font-display text-3xl font-extrabold transition-transform duration-300"
                [class.scale-125]="destello()"
                [class.text-success]="destello()"
                aria-live="polite"
                data-testid="contador"
              >
                {{ contador() }} {{ contador() === 1 ? 'persona' : 'personas' }}
              </p>
            </footer>
          }
        }
        @case ('espera') {
          <section class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <px-icono nombre="clock" [tamano]="80" />
            <h1 class="font-display text-5xl font-extrabold">En espera</h1>
            @if (e.proximo; as p) {
              <p class="text-2xl">
                El próximo reto empieza a las {{ hora(p.desde) }}: {{ p.nombre }}
              </p>
            }
          </section>
        }
        @case ('pausada') {
          <section class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 class="font-display text-5xl font-extrabold">En pausa</h1>
            <p class="text-2xl">Volvemos en un momento.</p>
          </section>
        }
        @case ('agotado') {
          <section class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 class="font-display text-4xl font-extrabold">{{ e.reto?.nombre }}</h1>
            <p class="text-2xl">Este reto ya entregó todos sus premios.</p>
          </section>
        }
        @default {
          <section class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 class="font-display text-4xl font-extrabold">{{ e.pantalla.nombre }}</h1>
            <p class="text-2xl">
              {{
                e.evento.estado === 'pausado'
                  ? 'Pausamos un momento.'
                  : 'El evento no está en curso.'
              }}
            </p>
          </section>
        }
      }
    } @else {
      <section class="flex flex-1 items-center justify-center">
        <p class="text-2xl">Cargando…</p>
      </section>
    }
  `,
})
export class PantallaPage {
  private readonly api = inject(SalaApi);
  private readonly router = inject(Router);

  protected readonly estado = signal<EstadoSala | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly contador = signal(0);
  protected readonly destello = signal(false);
  protected readonly sinRed = signal(false);
  private readonly ahora = signal(Date.now());
  /** Hora del servidor menos la de la tablet (HU-314 §3.1). */
  private desfase = 0;
  private llave: CryptoKey | null = null;
  private actual: Emitido | null = null;
  private pendientes: Emitido[] = [];
  private nonce: string | null = null;
  private candado: WakeLockSentinel | null = null;
  private firmando = false;

  protected readonly tamanoQr = signal(Math.round(Math.min(innerHeight * 0.62, innerWidth * 0.7)));
  protected readonly avance = computed(() => {
    const reto = this.estado()?.reto;
    if (!reto) return 0;
    const periodo = reto.rotacionSegundos * 1000;
    return ((periodo - ((this.ahora() + this.desfase) % periodo)) / periodo) * 100;
  });
  protected readonly restantes = computed(() => {
    const reto = this.estado()?.reto;
    if (!reto) return 0;
    const periodo = reto.rotacionSegundos * 1000;
    return Math.ceil((periodo - ((this.ahora() + this.desfase) % periodo)) / 1000);
  });

  constructor() {
    const destroy = inject(DestroyRef);
    void this.start();
    const tick = setInterval(() => {
      this.ahora.set(Date.now());
      void this.refreshQr();
    }, TICK_MS);
    const sondeo = setInterval(() => void this.loadEstado(), ESTADO_CADA_MS);
    const informe = setInterval(() => void this.flush(), INFORMAR_CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') {
        void this.keepEncendida();
        void this.loadEstado();
      }
    };
    const alRedimensionar = () =>
      this.tamanoQr.set(Math.round(Math.min(innerHeight * 0.62, innerWidth * 0.7)));
    document.addEventListener('visibilitychange', alVolver);
    addEventListener('online', alVolver);
    addEventListener('resize', alRedimensionar);
    destroy.onDestroy(() => {
      clearInterval(tick);
      clearInterval(sondeo);
      clearInterval(informe);
      document.removeEventListener('visibilitychange', alVolver);
      removeEventListener('online', alVolver);
      removeEventListener('resize', alRedimensionar);
      void this.candado?.release().catch(() => undefined);
    });

    const canal = inject(EnVivoService).connect(
      '/api/v1/sala/en-vivo',
      [
        'contador.actualizado',
        'pantalla.epoca',
        'pantalla.pausada',
        'pantalla.reanudada',
        'pantalla.reto',
        'evento.pausado',
        'evento.reanudado',
        'evento.cerrado',
        'evento.abierto',
        'terminal.desconectada',
      ],
      destroy,
    );
    canal.on('contador.actualizado', (aviso) => {
      const datos = aviso.datos as {
        retoId?: string;
        entregados?: number;
        nonceUsado?: string;
      } | null;
      if (!datos || datos.retoId !== this.estado()?.reto?.id) return;
      if (typeof datos.entregados === 'number' && datos.entregados > this.contador()) {
        this.contador.set(datos.entregados);
        this.flash();
      }
      // Un solo uso: el QR cambia apenas alguien lo usa.
      if (datos.nonceUsado && datos.nonceUsado === this.nonce) {
        this.closeActual('usado');
        this.nonce = newNonce();
        void this.refreshQr();
      }
    });
    for (const tipo of [
      'pantalla.epoca',
      'pantalla.pausada',
      'pantalla.reanudada',
      'pantalla.reto',
      'evento.pausado',
      'evento.reanudado',
      'evento.cerrado',
      'evento.abierto',
      'reiniciar',
    ]) {
      canal.on(tipo, () => void this.loadEstado());
    }
    canal.on('terminal.desconectada', () => void this.router.navigate(['/']));
  }

  /** Un toque: pantalla completa (el navegador lo pide con un gesto). */
  protected onToque(): void {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    void this.keepEncendida();
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/La_Paz',
    }).format(new Date(iso));
  }

  private async start(): Promise<void> {
    this.llave = (await getParLlaves()).privateKey;
    await this.loadEstado();
    void this.keepEncendida();
  }

  private async loadEstado(): Promise<void> {
    try {
      const antes = Date.now();
      const estado = await this.api.getEstado();
      // La mitad del viaje: la hora del servidor llegó un poco después de calcularse.
      this.desfase = estado.horaServidor + (Date.now() - antes) / 2 - Date.now();
      const anterior = this.estado();
      if (
        anterior?.reto?.id !== estado.reto?.id ||
        anterior?.epoca !== estado.epoca ||
        estado.estado !== 'activa'
      ) {
        this.closeActual(estado.estado === 'pausada' ? 'pausa' : 'invalidado');
        this.nonce = estado.reto?.modo === 'un_uso' ? newNonce() : null;
        this.qr.set(null);
      }
      this.estado.set(estado);
      this.contador.set(estado.reto?.entregados ?? 0);
      this.sinRed.set(false);
      void this.refreshQr();
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'TERMINAL_DESCONECTADA') {
        await this.router.navigate(['/']);
        return;
      }
      // Sin red: el QR sigue (lo firma la tablet con el último desfase conocido).
      this.sinRed.set(true);
    }
  }

  /** Firma el QR de la franja (o del nonce) actual, si cambió. */
  private async refreshQr(): Promise<void> {
    const estado = this.estado();
    const reto = estado?.reto;
    if (!estado || !reto || estado.estado !== 'activa' || !this.llave || this.firmando) return;
    const porTiempo = reto.modo === 'por_tiempo';
    const franja = porTiempo
      ? getFranjaQr(Date.now() + this.desfase, reto.rotacionSegundos)
      : undefined;
    if (!this.nonce && !porTiempo) this.nonce = newNonce();
    const mismo =
      this.actual?.reto === reto.id &&
      this.actual.epoca === estado.epoca &&
      this.actual.franja === franja &&
      this.actual.nonce === (porTiempo ? undefined : (this.nonce ?? undefined));
    if (mismo && this.qr()) return;
    this.firmando = true;
    try {
      const texto = await buildQrReto(this.llave, {
        p: estado.pantalla.numero,
        r: reto.numero,
        e: estado.epoca,
        ...(porTiempo ? { f: franja ?? 0 } : { u: this.nonce ?? newNonce() }),
      });
      this.closeActual('vencio');
      this.actual = {
        reto: reto.id,
        modo: reto.modo,
        epoca: estado.epoca,
        ...(porTiempo ? { franja } : { nonce: this.nonce ?? undefined }),
        inicioAt: new Date(Date.now() + this.desfase).toISOString(),
      } as Emitido;
      // El QR dibujado es el enlace: también lo abre la cámara del sistema (HU-310 §3).
      this.qr.set(`${location.origin}/r/${texto}`);
    } finally {
      this.firmando = false;
    }
  }

  private closeActual(motivo: NonNullable<Emitido['finMotivo']>): void {
    if (!this.actual) return;
    this.pendientes.push({
      ...this.actual,
      finAt: new Date(Date.now() + this.desfase).toISOString(),
      finMotivo: motivo,
    });
    this.actual = null;
  }

  /** Lo mostrado, en tandas (HU-314 §3.6). Sin red, se guarda para la próxima. */
  private async flush(): Promise<void> {
    if (this.pendientes.length === 0) return;
    const tanda = this.pendientes.slice(0, 100);
    try {
      await this.api.recordEmitidos(tanda);
      this.pendientes = this.pendientes.slice(tanda.length);
    } catch {
      // Se reintenta en la próxima vuelta; sin crecer sin límite.
      if (this.pendientes.length > 1_000) this.pendientes = this.pendientes.slice(-500);
    }
  }

  /** Que la tablet no se apague; se vuelve a pedir al volver a la pestaña. */
  private async keepEncendida(): Promise<void> {
    if (this.candado && !this.candado.released) return;
    try {
      this.candado = await navigator.wakeLock.request('screen');
    } catch {
      // Sin permiso: la pantalla sigue funcionando igual.
    }
  }

  private flash(): void {
    this.destello.set(true);
    setTimeout(() => this.destello.set(false), DESTELLO_MS);
  }
}
