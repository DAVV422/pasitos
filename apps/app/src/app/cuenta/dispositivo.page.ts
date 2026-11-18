import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AvisoComponent, BotonDirective, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type DispositivoApp } from '../asistente-api.service';
import { formatHora } from '../formato';
import { NoFuiYoService } from '../no-fui-yo.service';
import { SesionAsistente } from '../sesion-asistente';

const QUE: Readonly<Record<string, string>> = {
  abrir_enlace: 'intentó abrir tu enlace',
  abrir_qr: 'intentó usar un QR de tu entrada',
  usar_anulado: 'intentó usar tu entrada anterior',
  otro: 'intentó entrar con tu entrada',
};

/**
 * *Mi dispositivo* (HU-312 §2, mockups A20–A23): este celular, el historial y los intentos de
 * otros dispositivos, con **No fui yo**. Nunca la IP ni la huella: solo el modelo y la hora.
 */
@Component({
  selector: 'app-dispositivo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent, IconoComponent],
  template: `
    <h1 class="text-2xl font-extrabold">Mi dispositivo</h1>
    @if (datos(); as d) {
      @if (d.actual; as a) {
        <section class="border-line bg-surface flex flex-col gap-1 rounded-xl border p-4">
          <h2 class="text-muted text-sm font-bold uppercase">Este celular</h2>
          <p class="text-lg font-bold">{{ a.modelo }}</p>
          <p class="text-muted text-sm">Desde el {{ fecha(a.desde) }} · {{ a.puesto }}</p>
        </section>
      }

      @if (d.historial.length > 0) {
        <section class="flex flex-col gap-2">
          <h2 class="text-muted text-sm font-bold uppercase">Celulares anteriores</h2>
          @for (h of d.historial; track h.anuladaAt) {
            <div class="border-line bg-surface rounded-xl border p-4">
              <p class="font-semibold">{{ h.modelo }}</p>
              <p class="text-muted text-sm">
                Hasta el {{ fecha(h.anuladaAt) }} · lo reemplazó {{ h.por }}
              </p>
            </div>
          }
        </section>
      }

      @if (d.intentos.length > 0) {
        <section class="flex flex-col gap-2">
          <h2 class="text-muted text-sm font-bold uppercase">Intentos de otro dispositivo</h2>
          @for (i of d.intentos; track i.at) {
            <p class="border-line bg-surface rounded-xl border p-4">
              El {{ fecha(i.at) }} alguien {{ que(i.que) }} en un {{ i.modelo }}.
            </p>
          }
        </section>
      }

      @if (avisoAbierto()) {
        <px-aviso variante="info">Avisamos a la puerta. Acércate con este celular.</px-aviso>
      } @else {
        <section class="flex flex-col gap-2">
          <p>¿No reconoces algo de esto?</p>
          <button
            pxBoton="peligro-contorno"
            type="button"
            [cargando]="noFuiYo.enviando()"
            (click)="report()"
          >
            <px-icono nombre="alert" [tamano]="18" />No fui yo
          </button>
        </section>
      }
      @if (noFuiYo.error(); as e) {
        <px-aviso variante="peligro">{{ e }}</px-aviso>
      }
    } @else if (error()) {
      <px-estado tipo="error" titulo="No pudimos cargar tu dispositivo." [traceId]="error()" />
    } @else {
      <px-estado tipo="cargando" titulo="Cargando…" />
    }
  `,
})
export class DispositivoPage {
  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);
  protected readonly noFuiYo = inject(NoFuiYoService);
  protected readonly datos = signal<DispositivoApp | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly avisoAbierto = computed(
    () =>
      this.noFuiYo.enviado() ||
      (this.datos()?.avisos ?? []).some((a) => a.estado === 'abierta' || a.estado === 'atendiendo'),
  );

  constructor() {
    void this.load();
  }

  protected fecha(iso: string): string {
    const zona = this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz';
    const dia = new Intl.DateTimeFormat('es-BO', {
      day: '2-digit',
      month: '2-digit',
      timeZone: zona,
    }).format(new Date(iso));
    return `${dia} a las ${formatHora(iso, zona)}`;
  }

  protected que(clave: string): string {
    return QUE[clave] ?? QUE['otro'] ?? '';
  }

  protected async report(): Promise<void> {
    await this.noFuiYo.send('dispositivo');
  }

  private async load(): Promise<void> {
    try {
      this.datos.set(await this.api.getDispositivo());
    } catch (error) {
      this.error.set(error instanceof ErrorApi ? (error.traceId ?? '') : '');
    }
  }
}
