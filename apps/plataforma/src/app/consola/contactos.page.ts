import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, type OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ASISTENTES_CONTACTO, TIPOS_EVENTO_CONTACTO } from '@pasitos/dominio/esquemas';
import { valorDe } from '@pasitos/panel';
import { BotonDirective, ChipComponent, EstadoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { PlataformaApi, type ContactoFila } from './plataforma-api.service';

export const TEXTO_ESTADO_CONTACTO: Readonly<Record<ContactoFila['estado'], string>> = {
  nuevo: 'Nuevo',
  respondido: 'Respondido',
  descartado: 'Descartado',
};

export function textoTipoEvento(tipo: string | null): string {
  return tipo ? (TIPOS_EVENTO_CONTACTO[tipo as keyof typeof TIPOS_EVENTO_CONTACTO] ?? tipo) : '—';
}

export function textoAsistentes(valor: string | null): string {
  return valor ? (ASISTENTES_CONTACTO[valor as keyof typeof ASISTENTES_CONTACTO] ?? valor) : '—';
}

/** La bandeja del formulario de contacto (HU-410 §5): los más nuevos primero. */
@Component({
  selector: 'plt-contactos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, BotonDirective, ChipComponent, EstadoComponent],
  template: `
    <h1 class="font-display text-3xl font-extrabold">Contactos</h1>
    <p class="text-muted">Los mensajes del formulario de la landing. Se borran a los 12 meses.</p>
    <select aria-label="Estado" (change)="setEstado(valorDe($event))">
      <option value="">Todos</option>
      <option value="nuevo">Nuevos</option>
      <option value="respondido">Respondidos</option>
      <option value="descartado">Descartados</option>
    </select>
    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar los contactos" [traceId]="traceId()" />
      }
      @default {
        <ul class="flex flex-col gap-2" data-testid="contactos">
          @for (c of items(); track c.id) {
            <li>
              <a
                [routerLink]="['/contactos', c.id]"
                class="border-line bg-surface flex flex-wrap items-center justify-between gap-2 rounded-xl border p-4"
              >
                <span class="flex flex-col">
                  <span [class.font-bold]="c.estado === 'nuevo'">
                    {{ c.organizacion ?? c.nombre }}
                  </span>
                  <span class="text-muted text-sm">
                    {{ c.nombre }} · {{ textoTipoEvento(c.tipoEvento) }} ·
                    {{ textoAsistentes(c.asistentesAprox) }}
                  </span>
                </span>
                <span class="flex items-center gap-2">
                  <span class="text-muted text-sm">{{
                    c.createdAt | date: 'dd/MM/yyyy HH:mm'
                  }}</span>
                  <px-chip [variante]="c.estado === 'nuevo' ? 'puntos' : 'atenuado'">{{
                    textoEstado[c.estado]
                  }}</px-chip>
                </span>
              </a>
            </li>
          } @empty {
            <px-estado tipo="vacio" titulo="No hay mensajes" />
          }
        </ul>
        @if (cursor()) {
          <button type="button" pxBoton="secundario" (click)="load(true)">Cargar más</button>
        }
      }
    }
  `,
})
export class ContactosPage implements OnInit {
  private readonly api = inject(PlataformaApi);

  protected readonly valorDe = valorDe;
  protected readonly textoEstado = TEXTO_ESTADO_CONTACTO;
  protected readonly textoTipoEvento = textoTipoEvento;
  protected readonly textoAsistentes = textoAsistentes;
  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly items = signal<readonly ContactoFila[]>([]);
  protected readonly cursor = signal<string | null>(null);
  private filtro: string | null = null;

  ngOnInit(): void {
    void this.load();
  }

  protected async setEstado(valor: string): Promise<void> {
    this.filtro = valor || null;
    await this.load();
  }

  protected async load(mas = false): Promise<void> {
    try {
      const pagina = await this.api.listContactos({
        estado: this.filtro,
        cursor: mas ? this.cursor() : null,
      });
      this.items.set(mas ? [...this.items(), ...pagina.items] : pagina.items);
      this.cursor.set(pagina.pagination.nextCursor);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
