import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FotosApi, type FotoPanel } from './fotos-api.service';

const TEXTO_ESTADO: Readonly<Record<string, string>> = {
  recibida: 'Por revisar',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  rechazada_sistema: 'Rechazada por el sistema',
  anulada: 'Deshecha',
};

/**
 * La sección *Fotos* de la ficha del asistente (HU-324 §1): cada foto que mandó, con su estado,
 * quién la revisó y si autoriza el uso. Solo dueño y coorganizador (`bitacora.read`).
 */
@Component({
  selector: 'adm-fotos-asistente',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (fotos(); as lista) {
      @if (lista.length > 0) {
        <details class="text-sm" data-testid="fotos-asistente">
          <summary class="cursor-pointer font-semibold">Fotos ({{ lista.length }})</summary>
          <ul class="mt-2 flex flex-col gap-2">
            @for (f of lista; track f.id) {
              <li class="flex items-center gap-3">
                @if (f.miniatura) {
                  <img
                    [src]="f.miniatura"
                    alt="Foto del reto"
                    loading="lazy"
                    class="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                }
                <span class="flex flex-col">
                  <b>{{ f.reto.nombre }}</b>
                  <span class="text-muted">
                    {{ texto(f.estado) }}
                    @if (f.motivo && f.estado !== 'aprobada') {
                      ({{ f.motivo }})
                    }
                    @if (f.revisor) {
                      · {{ f.revisor }}
                    }
                    · {{ f.autorizaUso ? 'Autoriza el uso' : 'No autoriza' }}
                  </span>
                </span>
              </li>
            }
          </ul>
        </details>
      }
    }
  `,
})
export class FotosAsistenteComponent {
  private readonly api = inject(FotosApi);
  readonly asistenteId = input.required<string>();
  protected readonly fotos = signal<readonly FotoPanel[] | null>(null);

  constructor() {
    effect(() => {
      const id = this.asistenteId();
      this.fotos.set(null);
      void this.api.listDeAsistente(id).then(
        ({ items }) => this.fotos.set(items),
        () => this.fotos.set([]),
      );
    });
  }

  protected texto(estado: string): string {
    return TEXTO_ESTADO[estado] ?? estado;
  }
}
