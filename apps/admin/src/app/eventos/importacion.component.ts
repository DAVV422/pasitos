import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { getMensajeError } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, TarjetaComponent } from '@pasitos/ui';
import {
  EventosApi,
  type FilaImportada,
  type Operacion,
  type VistaPreviaImportacion,
} from './eventos-api.service';

type Pestana = 'validas' | 'invalidas' | 'duplicadas' | 'revisar';

const PLANTILLA = '\uFEFFnombre,correo,codigo\r\nValeria Quispe,valeria@example.com,T-001\r\n';

/** Importar un CSV en dos pasos (HU-210 §4 y §6): subir → revisar → importar. */
@Component({
  selector: 'adm-importacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, TarjetaComponent],
  template: `
    <px-tarjeta>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-xl font-bold">Importar un CSV</h2>
        <button type="button" pxBoton="secundario" [chico]="true" (click)="downloadPlantilla()">
          Descargar la plantilla
        </button>
      </div>
      <p class="text-muted mt-1 text-sm">
        Columnas: nombre (o nombres y apellidos), correo y código. Separado por comas o punto y
        coma, hasta 5 000 filas.
      </p>
      @if (error(); as texto) {
        <px-aviso class="mt-3" variante="peligro">{{ texto }}</px-aviso>
      }
      @switch (paso()) {
        @case ('elegir') {
          <label
            class="border-line hover:bg-surface2 mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors"
          >
            <span class="px-boton px-boton--secundario px-boton--chico">Elegir archivo .csv</span>
            <span class="text-muted text-sm">Separado por comas o punto y coma</span>
            <input
              type="file"
              accept=".csv,text/csv"
              class="px-sr-only"
              (change)="upload($event)"
            />
          </label>
        }
        @case ('revisando') {
          <div class="mt-3" aria-live="polite">
            <p>Revisando el archivo…</p>
            <div class="bg-track mt-2 h-2 w-full rounded-full">
              <div class="bg-points-fill h-2 rounded-full" [style.width.%]="progreso()"></div>
            </div>
          </div>
        }
        @case ('vista') {
          @if (vista(); as v) {
            @if (v.columnas.ignoradas.length > 0) {
              <p class="text-muted mt-3 text-sm">
                Columnas que no usamos: {{ v.columnas.ignoradas.join(', ') }}.
              </p>
            }
            <div class="mt-3 flex flex-wrap gap-2" role="tablist">
              @for (p of pestanas(); track p.clave) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="pestana() === p.clave"
                  [pxBoton]="pestana() === p.clave ? 'primario' : 'secundario'"
                  [chico]="true"
                  (click)="pestana.set(p.clave)"
                >
                  {{ p.texto }} ({{ p.total }})
                </button>
              }
            </div>
            <ul class="mt-3 flex max-h-80 flex-col gap-1 overflow-y-auto">
              @for (f of filasPestana(); track f.fila) {
                <li class="flex flex-wrap items-center gap-2 text-sm">
                  @if (pestana() === 'revisar') {
                    <input
                      type="checkbox"
                      [attr.aria-label]="'Incluir la fila ' + f.fila"
                      [checked]="incluidas().includes(f.fila)"
                      (change)="toggle(f.fila)"
                    />
                  }
                  <span class="text-muted">Fila {{ f.fila }}</span>
                  <b>{{ f.nombre || '(sin nombre)' }}</b>
                  @if (f.email) {
                    <span>{{ f.email }}</span>
                  }
                  @if (f.motivo) {
                    <span class="text-muted">· {{ f.motivo }}</span>
                  }
                  @if (f.parecidoA) {
                    <span class="text-muted"
                      >· se parece a {{ f.parecidoA.codigo }} {{ f.parecidoA.nombre }}</span
                    >
                  }
                </li>
              } @empty {
                <li class="text-muted text-sm">Nada en esta pestaña.</li>
              }
              @if (pestana() === 'validas' && v.totales.validas > v.validas.length) {
                <li class="text-muted text-sm">
                  … y {{ v.totales.validas - v.validas.length }} más.
                </li>
              }
            </ul>
            <div class="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                pxBoton
                [cargando]="importando()"
                [deshabilitado]="aImportar() === 0"
                (click)="confirm()"
              >
                Importar {{ aImportar() }} invitados
              </button>
              <button type="button" pxBoton="secundario" (click)="reset()">
                Elegir otro archivo
              </button>
            </div>
          }
        }
      }
    </px-tarjeta>
  `,
})
export class ImportacionComponent {
  readonly eventoId = input.required<string>();
  readonly importados = output<number>();
  private readonly api = inject(EventosApi);

  protected readonly paso = signal<'elegir' | 'revisando' | 'vista'>('elegir');
  protected readonly progreso = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly vista = signal<VistaPreviaImportacion | null>(null);
  protected readonly pestana = signal<Pestana>('validas');
  protected readonly incluidas = signal<readonly number[]>([]);
  protected readonly importando = signal(false);
  private operacionId: string | null = null;
  private espera: ReturnType<typeof setTimeout> | null = null;

  protected readonly pestanas = computed(() => {
    const t = this.vista()?.totales;
    return [
      { clave: 'validas' as const, texto: 'Válidas', total: t?.validas ?? 0 },
      { clave: 'invalidas' as const, texto: 'Inválidas', total: t?.invalidas ?? 0 },
      { clave: 'duplicadas' as const, texto: 'Duplicadas', total: t?.duplicadas ?? 0 },
      { clave: 'revisar' as const, texto: 'Para revisar', total: t?.posiblesDuplicadas ?? 0 },
    ];
  });
  protected readonly filasPestana = computed((): readonly FilaImportada[] => {
    const v = this.vista();
    if (!v) return [];
    const porPestana: Record<Pestana, readonly FilaImportada[]> = {
      validas: v.validas,
      invalidas: v.invalidas,
      duplicadas: v.duplicadas,
      revisar: v.posiblesDuplicadas,
    };
    return porPestana[this.pestana()];
  });
  protected readonly aImportar = computed(
    () => (this.vista()?.totales.validas ?? 0) + this.incluidas().length,
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.espera) clearTimeout(this.espera);
    });
  }

  protected toggle(fila: number): void {
    const actuales = this.incluidas();
    this.incluidas.set(
      actuales.includes(fila) ? actuales.filter((f) => f !== fila) : [...actuales, fila],
    );
  }

  protected async upload(evento: Event): Promise<void> {
    const archivo = (evento.target as HTMLInputElement).files?.[0];
    if (!archivo) return;
    this.error.set(null);
    this.paso.set('revisando');
    this.progreso.set(0);
    try {
      const { operacionId } = await this.api.createImportacion(this.eventoId(), archivo);
      this.operacionId = operacionId;
      await this.poll();
    } catch (error) {
      this.error.set(getMensajeError(error));
      this.paso.set('elegir');
    }
  }

  /** Cada segundo, hasta que el trabajador termine de revisar el archivo. */
  private async poll(): Promise<void> {
    if (!this.operacionId) return;
    const operacion: Operacion = await this.api.getOperacion(this.operacionId);
    this.progreso.set(operacion.progreso);
    if (operacion.estado === 'lista') {
      this.vista.set(operacion.resultado as VistaPreviaImportacion);
      this.incluidas.set([]);
      this.pestana.set('validas');
      this.paso.set('vista');
    } else if (operacion.estado === 'fallida') {
      this.error.set(operacion.error ?? 'No pudimos leer el archivo.');
      this.paso.set('elegir');
    } else {
      this.espera = setTimeout(() => {
        this.poll().catch((error: unknown) => {
          this.error.set(getMensajeError(error));
          this.paso.set('elegir');
        });
      }, 1_000);
    }
  }

  protected async confirm(): Promise<void> {
    if (!this.operacionId) return;
    this.importando.set(true);
    this.error.set(null);
    try {
      const { importadas } = await this.api.confirmImportacion(this.operacionId, this.incluidas());
      this.importados.emit(importadas);
      this.reset();
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.importando.set(false);
    }
  }

  protected reset(): void {
    this.operacionId = null;
    this.vista.set(null);
    this.paso.set('elegir');
  }

  protected downloadPlantilla(): void {
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([PLANTILLA], { type: 'text/csv;charset=utf-8' }));
    enlace.download = 'plantilla-invitados.csv';
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }
}
