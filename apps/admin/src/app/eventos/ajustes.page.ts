import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CATEGORIAS_AJUSTE, TIPOS_MOTIVO_AJUSTE, type TipoMotivoAjuste } from '@pasitos/dominio';
import { AvisosService, EncabezadoPaginaComponent, getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
} from '@pasitos/ui';
import {
  AjustesApi,
  type CanjeBuscado,
  type MovimientoAjuste,
  type ResultadoOtorgamiento,
} from './ajustes-api.service';
import { EventoActualService } from './evento.layout';
import { EventosApi, type RetoPanel } from './eventos-api.service';
import { PuertaApi, type ResultadoBusqueda } from './puerta-api.service';

type Pestana = 'ajustar' | 'otorgar' | 'canjes';

const RESULTADOS: Readonly<Record<ResultadoOtorgamiento['resultado'], string>> = {
  ok: 'Otorgado',
  ya_completado: 'Ya lo tenía',
  tope: 'Sin cupo',
  sin_check_in: 'Sin check-in',
  no_encontrado: 'No encontrado',
};

/**
 * *Ajustes* (HU-317 §2): corregir puntos, otorgar un reto a varias personas y anular un canje,
 * con el historial de todo. Solo dueño y coorganizador.
 */
@Component({
  selector: 'adm-ajustes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EncabezadoPaginaComponent,
    EstadoComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Ajustes"
      descripcion="Corrige puntos, otorga un reto o anula un canje. Todo queda en el libro y la bitácora."
    />
    <div class="flex flex-wrap gap-2" role="tablist">
      @for (p of pestanas; track p.id) {
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="pestana() === p.id"
          [pxBoton]="pestana() === p.id ? 'primario' : 'secundario'"
          (click)="pestana.set(p.id)"
        >
          {{ p.texto }}
        </button>
      }
    </div>
    @if (error(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    }

    @switch (pestana()) {
      @case ('ajustar') {
        <section class="flex max-w-lg flex-col gap-3">
          <px-campo #cBuscar="pxCampo" etiqueta="Persona" ayuda="Nombre, código o correo.">
            <input
              [id]="cBuscar.idControl"
              [attr.aria-describedby]="cBuscar.idDescripcion"
              type="search"
              [value]="q()"
              (input)="onBuscar($any($event.target).value)"
            />
          </px-campo>
          @if (!persona()) {
            <ul class="flex flex-col gap-1">
              @for (r of resultados(); track r.id) {
                <li>
                  <button
                    type="button"
                    class="border-line w-full rounded-lg border p-2 text-left"
                    (click)="persona.set(r)"
                  >
                    <b>{{ r.nombre }}</b> · {{ r.codigo }}
                  </button>
                </li>
              }
            </ul>
          } @else {
            <p>
              <b>{{ persona()?.nombre }}</b> · {{ persona()?.codigo }}
              <button type="button" class="text-points underline" (click)="persona.set(null)">
                cambiar
              </button>
            </p>
            <px-campo #cPuntos="pxCampo" etiqueta="Puntos" ayuda="Positivo suma, negativo resta.">
              <input
                [id]="cPuntos.idControl"
                [attr.aria-describedby]="cPuntos.idDescripcion"
                type="number"
                [value]="puntos()"
                (input)="puntos.set(+$any($event.target).value)"
              />
            </px-campo>
            <px-campo #cMotivo="pxCampo" etiqueta="Motivo">
              <select [id]="cMotivo.idControl" (change)="motivo.set($any($event.target).value)">
                @for (t of tiposMotivo; track t) {
                  <option [value]="t" [selected]="motivo() === t">{{ categorias[t] }}</option>
                }
              </select>
            </px-campo>
            @if (motivo() === 'otro') {
              <px-campo
                #cTexto="pxCampo"
                etiqueta="Cuéntalo"
                ayuda="Queda para el equipo; no se publica."
              >
                <input
                  [id]="cTexto.idControl"
                  [attr.aria-describedby]="cTexto.idDescripcion"
                  maxlength="300"
                  [value]="texto()"
                  (input)="texto.set($any($event.target).value)"
                />
              </px-campo>
            }
            <button
              pxBoton
              type="button"
              [deshabilitado]="!ajusteListo()"
              [cargando]="enviando()"
              (click)="adjust()"
            >
              Ajustar
            </button>
          }
        </section>
      }
      @case ('otorgar') {
        <section class="flex max-w-lg flex-col gap-3">
          <px-campo #cReto="pxCampo" etiqueta="Reto">
            <select [id]="cReto.idControl" (change)="retoId.set($any($event.target).value)">
              <option value="">Elige un reto</option>
              @for (r of retos(); track r.id) {
                <option [value]="r.id">{{ r.nombre }} · +{{ r.puntos }}</option>
              }
            </select>
          </px-campo>
          <px-campo
            #cCodigos="pxCampo"
            etiqueta="Códigos de asistente"
            ayuda="Pega los códigos, separados por espacios, comas o líneas (hasta 200)."
          >
            <textarea
              [id]="cCodigos.idControl"
              [attr.aria-describedby]="cCodigos.idDescripcion"
              rows="4"
              [value]="codigos()"
              (input)="codigos.set($any($event.target).value)"
            ></textarea>
          </px-campo>
          <button
            pxBoton
            type="button"
            [deshabilitado]="!retoId() || listaCodigos().length === 0"
            [cargando]="enviando()"
            (click)="grant()"
          >
            Otorgar a {{ listaCodigos().length }}
          </button>
          @if (otorgados().length > 0) {
            <ul class="flex flex-col gap-1">
              @for (r of otorgados(); track r.codigo) {
                <li class="flex justify-between">
                  <span>{{ r.codigo }}</span>
                  <px-chip [variante]="r.resultado === 'ok' ? 'ok' : 'atenuado'">{{
                    nombresResultado[r.resultado]
                  }}</px-chip>
                </li>
              }
            </ul>
          }
        </section>
      }
      @case ('canjes') {
        <section class="flex max-w-lg flex-col gap-3">
          <px-campo
            #cCanje="pxCampo"
            etiqueta="Comprobante o código de asistente"
            ayuda="Por ejemplo C-4821 o A-0231."
          >
            <input
              [id]="cCanje.idControl"
              [attr.aria-describedby]="cCanje.idDescripcion"
              type="search"
              (change)="searchCanjes($any($event.target).value)"
            />
          </px-campo>
          <ul class="flex flex-col gap-2">
            @for (c of canjes(); track c.id) {
              <li class="border-line flex flex-col gap-2 rounded-lg border p-3">
                <p class="flex justify-between">
                  <b>{{ c.comprobante }}</b>
                  <px-chip [variante]="c.estado === 'anulado' ? 'atenuado' : 'ok'">{{
                    c.estado
                  }}</px-chip>
                </p>
                <p class="text-muted text-sm">
                  {{ c.asistente?.nombre }} · {{ c.asistente?.codigo }} · {{ c.total }} pts
                </p>
                @if (c.estado === 'confirmado') {
                  <px-campo #cMot="pxCampo" etiqueta="Motivo">
                    <input
                      [id]="cMot.idControl"
                      maxlength="300"
                      [value]="motivoAnulacion()"
                      (input)="motivoAnulacion.set($any($event.target).value)"
                    />
                  </px-campo>
                  <button
                    pxBoton="peligro"
                    type="button"
                    [deshabilitado]="motivoAnulacion().trim().length < 5"
                    [cargando]="enviando()"
                    (click)="cancelCanje(c)"
                  >
                    Anular y devolver {{ c.total }} pts
                  </button>
                }
              </li>
            }
          </ul>
        </section>
      }
    }

    <section class="flex flex-col gap-2">
      <h2 class="mt-4 text-xl font-bold">Historial</h2>
      @if (historial(); as lista) {
        @if (lista.length === 0) {
          <px-estado tipo="vacio" titulo="Todavía no hay ajustes." />
        }
        <ul class="flex flex-col gap-1 text-sm">
          @for (m of lista; track m.id) {
            <li class="border-line flex flex-wrap justify-between gap-2 border-b py-2">
              <span
                ><b>{{ m.puntos > 0 ? '+' : '' }}{{ m.puntos }}</b> · {{ m.asistente.nombre }} ({{
                  m.asistente.codigo
                }}) · {{ tipoDe(m.tipo) }}: {{ m.motivo
                }}{{ m.detalle ? ' — ' + m.detalle : '' }}</span
              >
              <span class="text-muted">{{ m.autor?.nombre }} · {{ hora(m.hora) }}</span>
            </li>
          }
        </ul>
      } @else {
        <px-estado tipo="cargando" />
      }
    </section>
  `,
})
export class AjustesPage {
  private readonly api = inject(AjustesApi);
  private readonly puerta = inject(PuertaApi);
  private readonly eventos = inject(EventosApi);
  private readonly actual = inject(EventoActualService);
  private readonly avisos = inject(AvisosService);
  private readonly eventoId = computed(() => this.actual.evento()?.id ?? '');

  protected readonly pestanas = [
    { id: 'ajustar', texto: 'Ajustar puntos' },
    { id: 'otorgar', texto: 'Otorgar un reto' },
    { id: 'canjes', texto: 'Canjes' },
  ] as const;
  protected readonly tiposMotivo = TIPOS_MOTIVO_AJUSTE;
  protected readonly categorias = CATEGORIAS_AJUSTE;
  protected readonly nombresResultado = RESULTADOS;

  protected readonly pestana = signal<Pestana>('ajustar');
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly historial = signal<readonly MovimientoAjuste[] | null>(null);
  // Ajustar.
  protected readonly q = signal('');
  protected readonly resultados = signal<readonly ResultadoBusqueda[]>([]);
  protected readonly persona = signal<ResultadoBusqueda | null>(null);
  protected readonly puntos = signal(0);
  protected readonly motivo = signal<TipoMotivoAjuste>('falla_qr');
  protected readonly texto = signal('');
  protected readonly ajusteListo = computed(
    () =>
      this.persona() !== null &&
      Number.isInteger(this.puntos()) &&
      this.puntos() !== 0 &&
      (this.motivo() !== 'otro' || this.texto().trim().length >= 5),
  );
  // Otorgar.
  protected readonly retos = signal<readonly RetoPanel[]>([]);
  protected readonly retoId = signal('');
  protected readonly codigos = signal('');
  protected readonly otorgados = signal<readonly ResultadoOtorgamiento[]>([]);
  protected readonly listaCodigos = computed(() =>
    [
      ...new Set(
        this.codigos()
          .toUpperCase()
          .split(/[\s,;]+/)
          .filter(Boolean),
      ),
    ].slice(0, 200),
  );
  // Canjes.
  protected readonly canjes = signal<readonly CanjeBuscado[]>([]);
  protected readonly motivoAnulacion = signal('');
  private esperaBusqueda: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void this.loadHistorial();
    void this.eventos.listRetos(this.eventoId()).then(
      (lista) => this.retos.set(lista),
      () => undefined,
    );
  }

  protected tipoDe(tipo: MovimientoAjuste['tipo']): string {
    return { ajuste: 'Ajuste', otorgado: 'Reto otorgado', anulacion: 'Anulación' }[tipo];
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: this.actual.evento()?.zonaHoraria ?? 'America/La_Paz',
    }).format(new Date(iso));
  }

  protected onBuscar(valor: string): void {
    this.q.set(valor);
    clearTimeout(this.esperaBusqueda);
    if (valor.trim().length < 3) {
      this.resultados.set([]);
      return;
    }
    this.esperaBusqueda = setTimeout(() => {
      void this.puerta.search(this.eventoId(), valor.trim()).then((r) => this.resultados.set(r));
    }, 250);
  }

  protected async adjust(): Promise<void> {
    const persona = this.persona();
    if (!persona) return;
    await this.run(async () => {
      const { saldo } = await this.api.adjust(persona.id, this.puntos(), {
        tipo: this.motivo(),
        ...(this.motivo() === 'otro' ? { texto: this.texto().trim() } : {}),
      });
      this.avisos.ok(`Listo: ${persona.nombre} queda con ${saldo} puntos.`);
      this.persona.set(null);
      this.puntos.set(0);
      this.texto.set('');
    });
  }

  protected async grant(): Promise<void> {
    await this.run(async () => {
      const { resultados } = await this.api.grant(this.retoId(), this.listaCodigos());
      this.otorgados.set(resultados);
      this.avisos.ok(`Otorgado a ${resultados.filter((r) => r.resultado === 'ok').length}.`);
    });
  }

  protected async searchCanjes(q: string): Promise<void> {
    if (q.trim().length < 2) return;
    await this.run(async () => this.canjes.set(await this.api.searchCanjes(this.eventoId(), q)));
  }

  protected async cancelCanje(canje: CanjeBuscado): Promise<void> {
    await this.run(async () => {
      await this.api.cancelCanje(canje.id, this.motivoAnulacion().trim());
      this.avisos.ok(`Anulamos ${canje.comprobante}: se devolvieron ${canje.total} puntos.`);
      this.motivoAnulacion.set('');
      this.canjes.set(
        this.canjes().map((c) => (c.id === canje.id ? { ...c, estado: 'anulado' } : c)),
      );
    });
  }

  private async run(trabajo: () => Promise<void>): Promise<void> {
    this.enviando.set(true);
    this.error.set(null);
    try {
      await trabajo();
      await this.loadHistorial();
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.enviando.set(false);
    }
  }

  private async loadHistorial(): Promise<void> {
    if (!this.eventoId()) return;
    this.historial.set(await this.api.list(this.eventoId()).catch(() => []));
  }
}
