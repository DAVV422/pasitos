import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvisoComponent, BotonDirective, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type MiFoto } from '../asistente-api.service';

const TEXTO_ESTADO: Readonly<Record<string, string>> = {
  recibida: 'Por revisar',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  rechazada_sistema: 'Rechazada',
  anulada: 'Deshecha',
};

/**
 * *Mi cuenta → Mis fotos* (HU-324 §1): las fotos que mandó, con su estado. Puede retirar la
 * autorización de uso cuando quiera (firmado): la foto sale de las descargas siguientes y los
 * puntos no cambian.
 */
@Component({
  selector: 'app-mis-fotos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent, IconoComponent, RouterLink],
  template: `
    <a
      routerLink="/cuenta"
      class="text-muted inline-flex min-h-11 items-center gap-1 font-semibold"
    >
      <px-icono nombre="back" [tamano]="18" />Mi cuenta
    </a>
    <h1 class="text-2xl font-extrabold">Mis fotos</h1>
    @if (mensaje(); as m) {
      <px-aviso [variante]="m.variante">{{ m.texto }}</px-aviso>
    }
    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" titulo="Cargando tus fotos…" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar tus fotos">
          <button type="button" pxBoton="secundario" (click)="load()">Reintentar</button>
        </px-estado>
      }
      @case ('vacio') {
        <px-estado tipo="vacio" titulo="Todavía no mandaste fotos">
          Las de los retos con foto aparecen aquí.
        </px-estado>
      }
      @default {
        <ul class="flex flex-col gap-3" data-testid="mis-fotos">
          @for (f of fotos(); track f.id) {
            <li class="border-line bg-surface flex gap-3 rounded-xl border p-3">
              @if (f.miniatura) {
                <img
                  [src]="f.miniatura"
                  alt="Tu foto"
                  loading="lazy"
                  class="h-20 w-20 shrink-0 rounded-lg object-cover"
                />
              }
              <div class="flex min-w-0 flex-col gap-1">
                <p class="font-bold">{{ f.reto }}</p>
                <p class="text-muted text-sm">
                  {{ textoEstado(f.estado) }}
                  @if (f.motivo && f.estado !== 'aprobada') {
                    · {{ f.motivo }}
                  }
                </p>
                @if (f.autorizaUso) {
                  <p class="text-sm">Autorizaste que la usen en redes.</p>
                  <button
                    type="button"
                    pxBoton="secundario"
                    [cargando]="retirando() === f.id"
                    (click)="withdraw(f)"
                  >
                    Retirar autorización
                  </button>
                } @else {
                  <p class="text-muted text-sm">No se usa en redes.</p>
                }
              </div>
            </li>
          }
        </ul>
      }
    }
  `,
})
export class MisFotosPage implements OnInit {
  private readonly api = inject(AsistenteApi);

  protected readonly estado = signal<'cargando' | 'error' | 'vacio' | 'listo'>('cargando');
  protected readonly fotos = signal<readonly MiFoto[]>([]);
  protected readonly retirando = signal<string | null>(null);
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected textoEstado(estado: string): string {
    return TEXTO_ESTADO[estado] ?? estado;
  }

  async load(): Promise<void> {
    try {
      const { items } = await this.api.listMisFotos();
      this.fotos.set(items);
      this.estado.set(items.length > 0 ? 'listo' : 'vacio');
    } catch {
      this.estado.set('error');
    }
  }

  protected async withdraw(foto: MiFoto): Promise<void> {
    if (
      !window.confirm(
        'Ya no se va a usar en redes. Tus puntos no cambian. Si ya se descargó, avisamos al organizador para que no la publique. ¿Retirar la autorización?',
      )
    ) {
      return;
    }
    this.retirando.set(foto.id);
    this.mensaje.set(null);
    try {
      await this.api.withdrawAutorizacionFoto(foto.id);
      this.fotos.update((fotos) =>
        fotos.map((f) => (f.id === foto.id ? { ...f, autorizaUso: false } : f)),
      );
      this.mensaje.set({ variante: 'ok', texto: 'Retiramos tu autorización.' });
    } catch (error) {
      this.mensaje.set({
        variante: 'peligro',
        texto: error instanceof ErrorApi ? error.detail : 'No pudimos retirarla. Intenta de nuevo.',
      });
    } finally {
      this.retirando.set(null);
    }
  }
}
