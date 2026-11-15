import { HttpClient, HttpEventType } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injectable,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import {
  describeProposito,
  MIMES_IMAGEN,
  PROPOSITOS_ARCHIVO,
  type PropositoArchivo,
} from '@pasitos/dominio';
import { BotonDirective } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { Observable } from 'rxjs';

export interface ArchivoSubidoApi {
  readonly id: string;
  readonly proposito: PropositoArchivo;
  readonly ancho: number | null;
  readonly alto: number | null;
  readonly variantes: Readonly<Record<string, string>>;
}

export type EventoSubida =
  | { readonly tipo: 'progreso'; readonly porcentaje: number }
  | { readonly tipo: 'listo'; readonly archivo: ArchivoSubidoApi };

/** `POST /eventos/:eventoId/archivos` con el progreso (HU-214). Los componentes no usan HttpClient. */
@Injectable({ providedIn: 'root' })
export class ArchivosApi {
  private readonly http = inject(HttpClient);

  upload(eventoId: string, proposito: PropositoArchivo, archivo: File): Observable<EventoSubida> {
    const datos = new FormData();
    datos.append('archivo', archivo, archivo.name);
    return new Observable<EventoSubida>((suscriptor) => {
      const pedido = this.http
        .post<ArchivoSubidoApi>(`/api/v1/eventos/${eventoId}/archivos`, datos, {
          params: { proposito },
          reportProgress: true,
          observe: 'events',
        })
        .subscribe({
          next: (evento) => {
            if (evento.type === HttpEventType.UploadProgress) {
              suscriptor.next({
                tipo: 'progreso',
                porcentaje: Math.round((100 * evento.loaded) / (evento.total ?? archivo.size)),
              });
            } else if (evento.type === HttpEventType.Response && evento.body) {
              suscriptor.next({ tipo: 'listo', archivo: evento.body });
              suscriptor.complete();
            }
          },
          error: (error: unknown) => suscriptor.error(error),
        });
      return () => pedido.unsubscribe();
    });
  }
}

export function getUrlArchivo(id: string, variante: 'original' | '1200' | '400' = '400'): string {
  return `/api/v1/archivos/${id}/${variante}`;
}

let siguienteId = 0;

/**
 * Subir una imagen (HU-214 §8): arrastrar o elegir, vista previa local antes de subir, progreso y
 * el error del código en el propio campo. El servidor decide; aquí solo se avisa antes lo obvio
 * (tipo y peso) para no subir de más.
 */
@Component({
  selector: 'pnl-subida-imagen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective],
  template: `
    <div class="px-campo" [class.px-campo--invalido]="!!error()">
      <span class="px-campo__etiqueta" [id]="idEtiqueta">{{ etiqueta() }}</span>
      <div
        class="border-line flex flex-col items-center gap-3 rounded-medio border-2 border-dashed p-4 text-center"
        [class.bg-surface2]="arrastrando()"
        (dragover)="onDragOver($event)"
        (dragleave)="arrastrando.set(false)"
        (drop)="onDrop($event)"
      >
        @if (vista(); as url) {
          <img
            [src]="url"
            [alt]="'Vista previa: ' + etiqueta()"
            class="max-h-40 max-w-full rounded-chico"
          />
        }
        @if (subiendo()) {
          <div
            class="w-full"
            role="progressbar"
            [attr.aria-valuenow]="progreso()"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-labelledby]="idEtiqueta"
          >
            <div class="bg-track h-2 w-full rounded-full">
              <div class="bg-points-fill h-2 rounded-full" [style.width.%]="progreso()"></div>
            </div>
            <p class="text-muted mt-1 text-sm">Subiendo… {{ progreso() }} %</p>
          </div>
        } @else {
          <label class="cursor-pointer">
            <span class="px-boton px-boton--secundario px-boton--chico">{{
              valor() ? 'Cambiar la imagen' : 'Elegir una imagen'
            }}</span>
            <input
              class="px-sr-only"
              type="file"
              [accept]="aceptados"
              [attr.aria-labelledby]="idEtiqueta"
              [attr.aria-describedby]="idAyuda"
              (change)="onElegir($event)"
            />
          </label>
          <span class="text-muted text-sm">o arrástrala aquí</span>
        }
      </div>
      <div [id]="idAyuda">
        @if (error(); as mensaje) {
          <span class="px-campo__error" role="alert">{{ mensaje }}</span>
        } @else {
          <span class="px-campo__ayuda">{{ ayuda() }}</span>
        }
      </div>
      @if (valor() && !subiendo()) {
        <button
          type="button"
          pxBoton="secundario"
          [chico]="true"
          class="mt-2 self-start"
          (click)="quitar()"
        >
          Quitar la imagen
        </button>
      }
    </div>
  `,
})
export class SubidaImagenComponent {
  private readonly api = inject(ArchivosApi);

  readonly eventoId = input.required<string>();
  readonly proposito = input.required<PropositoArchivo>();
  readonly etiqueta = input.required<string>();
  /** El id del archivo aprobado (o `null`). */
  readonly valor = model<string | null>(null);
  readonly subido = output<ArchivoSubidoApi>();

  protected readonly idEtiqueta = `pnl-subida-${++siguienteId}`;
  protected readonly idAyuda = `${this.idEtiqueta}-ayuda`;
  protected readonly aceptados = MIMES_IMAGEN.join(',');
  protected readonly arrastrando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly progreso = signal(0);
  protected readonly error = signal<string | null>(null);
  private readonly local = signal<string | null>(null);
  protected readonly vista = computed(() => {
    const id = this.valor();
    return this.local() ?? (id ? getUrlArchivo(id) : null);
  });
  protected readonly ayuda = computed(() => describeProposito(this.proposito()));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokeLocal());
  }

  protected onDragOver(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(true);
  }

  protected onDrop(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando.set(false);
    const archivo = evento.dataTransfer?.files[0];
    if (archivo) {
      this.upload(archivo);
    }
  }

  protected onElegir(evento: Event): void {
    const entrada = evento.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (archivo) {
      this.upload(archivo);
    }
  }

  protected quitar(): void {
    this.revokeLocal();
    this.valor.set(null);
  }

  private upload(archivo: File): void {
    this.error.set(null);
    const definicion = PROPOSITOS_ARCHIVO[this.proposito()];
    if (!(MIMES_IMAGEN as readonly string[]).includes(archivo.type)) {
      this.error.set('Este tipo de archivo no está permitido. Usa PNG, JPEG o WebP.');
      return;
    }
    if (archivo.size > definicion.maxBytes) {
      this.error.set(
        `El archivo supera el tamaño máximo (${definicion.maxBytes / (1024 * 1024)} MB).`,
      );
      return;
    }
    this.revokeLocal();
    this.local.set(URL.createObjectURL(archivo));
    this.subiendo.set(true);
    this.progreso.set(0);
    this.api.upload(this.eventoId(), this.proposito(), archivo).subscribe({
      next: (evento) => {
        if (evento.tipo === 'progreso') {
          this.progreso.set(evento.porcentaje);
        } else {
          this.revokeLocal();
          this.valor.set(evento.archivo.id);
          this.subido.emit(evento.archivo);
        }
      },
      error: (error: unknown) => {
        this.revokeLocal();
        this.subiendo.set(false);
        this.error.set(error instanceof ErrorApi ? error.detail : 'No pudimos subir la imagen.');
      },
      complete: () => this.subiendo.set(false),
    });
  }

  private revokeLocal(): void {
    const url = this.local();
    if (url) {
      URL.revokeObjectURL(url);
      this.local.set(null);
    }
  }
}
