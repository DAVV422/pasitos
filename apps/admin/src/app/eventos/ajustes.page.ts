import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CATEGORIAS_AJUSTE, TIPOS_MOTIVO_AJUSTE, type TipoMotivoAjuste } from '@pasitos/dominio';
import { TIPOS_RETO_MANUALES } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getMensajeError,
  PestanasComponent,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import {
  AjustesApi,
  type CanjeBuscado,
  type CanjeManualHecho,
  type MovimientoAjuste,
  type ResultadoOtorgamiento,
} from './ajustes-api.service';
import { EventoActualService } from './evento.layout';
import { EventosApi, type PremioPanel, type RetoPanel } from './eventos-api.service';
import { PuertaApi, type ResultadoBusqueda } from './puerta-api.service';

type Pestana = 'ajustar' | 'otorgar' | 'canjear' | 'canjes';

const RESULTADOS: Readonly<Record<ResultadoOtorgamiento['resultado'], string>> = {
  ok: 'Otorgado',
  ya_completado: 'Ya lo ganó antes (aunque se haya anulado): si corresponde, usa un ajuste',
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
    PestanasComponent,
    TarjetaComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Ajustes"
      descripcion="Corrige puntos, da por cumplido un reto, canjea un premio a mano o anula un canje. Todo queda en el libro y la bitácora."
    />
    @if (error(); as e) {
      <px-aviso variante="peligro">{{ e }}</px-aviso>
    }

    <pnl-pestanas etiqueta="Tipo de ajuste" [pestanas]="pestanas" [(activa)]="pestana">
      @switch (pestana()) {
        @case ('ajustar') {
          <px-tarjeta>
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
                        class="border-line hover:bg-surface2 w-full rounded-lg border p-2.5 text-left"
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
                <px-campo
                  #cPuntos="pxCampo"
                  etiqueta="Puntos"
                  ayuda="Positivo suma, negativo resta."
                >
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
          </px-tarjeta>
        }
        @case ('otorgar') {
          <px-tarjeta>
            <section class="flex max-w-lg flex-col gap-3">
              <px-campo #cReto="pxCampo" etiqueta="Reto">
                <select [id]="cReto.idControl" (change)="retoId.set($any($event.target).value)">
                  <option value="">Elige un reto</option>
                  @for (r of retosManuales(); track r.id) {
                    <option [value]="r.id">{{ r.nombre }} · +{{ r.puntos }}</option>
                  }
                </select>
              </px-campo>
              @if (pideMotivoReto()) {
                <!-- HU-412: un reto que no es de tipo otorgado se da por cumplido como excepción. -->
                <px-campo
                  #cMotReto="pxCampo"
                  etiqueta="Motivo"
                  ayuda="Por ejemplo: «No le funcionó la cámara; lo hizo frente al equipo». Queda en la bitácora."
                >
                  <input
                    [id]="cMotReto.idControl"
                    [attr.aria-describedby]="cMotReto.idDescripcion"
                    maxlength="300"
                    data-testid="motivo-reto"
                    [value]="motivoReto()"
                    (input)="motivoReto.set($any($event.target).value)"
                  />
                </px-campo>
              }
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
                [deshabilitado]="!otorgarListo()"
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
          </px-tarjeta>
        }
        @case ('canjear') {
          <!-- HU-412: canjear a mano, cuando la persona no puede confirmar con su celular. -->
          <px-tarjeta>
            <section class="flex max-w-lg flex-col gap-3">
              <px-campo #cBuscarC="pxCampo" etiqueta="Persona" ayuda="Nombre, código o correo.">
                <input
                  [id]="cBuscarC.idControl"
                  [attr.aria-describedby]="cBuscarC.idDescripcion"
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
                        class="border-line hover:bg-surface2 w-full rounded-lg border p-2.5 text-left"
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
                <ul class="flex flex-col gap-2" data-testid="premios-manual">
                  @for (p of premiosActivos(); track p.id) {
                    <li
                      class="border-line flex items-center justify-between gap-3 rounded-lg border p-2.5"
                    >
                      <span class="min-w-0">
                        <b class="block truncate">{{ p.nombre }}</b>
                        <span class="text-muted text-sm"
                          >{{ p.puntos === 0 ? 'Gratis' : p.puntos + ' pts' }} · quedan
                          {{ p.disponible }}</span
                        >
                      </span>
                      <span class="flex items-center gap-2">
                        <button
                          type="button"
                          pxBoton="secundario"
                          [chico]="true"
                          [attr.aria-label]="'Quitar ' + p.nombre"
                          [deshabilitado]="cantidad(p.id) === 0"
                          (click)="setCantidad(p.id, -1)"
                        >
                          −
                        </button>
                        <span class="w-6 text-center font-bold tabular-nums">{{
                          cantidad(p.id)
                        }}</span>
                        <button
                          type="button"
                          pxBoton="secundario"
                          [chico]="true"
                          [attr.aria-label]="'Agregar ' + p.nombre"
                          [deshabilitado]="cantidad(p.id) >= p.disponible"
                          (click)="setCantidad(p.id, 1)"
                        >
                          +
                        </button>
                      </span>
                    </li>
                  } @empty {
                    <li class="text-muted text-sm">No hay premios activos.</li>
                  }
                </ul>
                <px-campo
                  #cMotCanje="pxCampo"
                  etiqueta="Motivo"
                  ayuda="Por ejemplo: «Se le apagó el celular en la mesa». Queda en la bitácora."
                >
                  <input
                    [id]="cMotCanje.idControl"
                    [attr.aria-describedby]="cMotCanje.idDescripcion"
                    maxlength="300"
                    data-testid="motivo-canje"
                    [value]="motivoCanje()"
                    (input)="motivoCanje.set($any($event.target).value)"
                  />
                </px-campo>
                <button
                  pxBoton
                  type="button"
                  data-testid="canjear-manual"
                  [deshabilitado]="!canjeListo()"
                  [cargando]="enviando()"
                  (click)="createCanjeManual()"
                >
                  Canjear y descontar {{ totalCanje() }} pts
                </button>
                @if (canjeHecho(); as c) {
                  <px-aviso variante="ok" data-testid="canje-hecho">
                    Comprobante <b>{{ c.comprobante }}</b>: entrega {{ describeItems(c.items) }}. Le
                    quedan {{ c.saldo }} pts.
                  </px-aviso>
                }
              }
            </section>
          </px-tarjeta>
        }
        @case ('canjes') {
          <px-tarjeta>
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
                  (input)="onBuscarCanjes($any($event.target).value)"
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
          </px-tarjeta>
        }
      }
    </pnl-pestanas>

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

  protected readonly pestanas: readonly { clave: Pestana; texto: string }[] = [
    { clave: 'ajustar', texto: 'Ajustar puntos' },
    { clave: 'otorgar', texto: 'Dar por cumplido un reto' },
    { clave: 'canjear', texto: 'Canjear un premio' },
    { clave: 'canjes', texto: 'Anular un canje' },
  ];
  protected readonly tiposMotivo = TIPOS_MOTIVO_AJUSTE;
  protected readonly categorias = CATEGORIAS_AJUSTE;
  protected readonly nombresResultado = RESULTADOS;

  protected readonly pestana = signal<string>('ajustar');
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
  // HU-412: dar por cumplido (todos menos el del carnet, que tiene su flujo).
  protected readonly motivoReto = signal('');
  protected readonly retosManuales = computed(() =>
    this.retos().filter((r) => (TIPOS_RETO_MANUALES as readonly string[]).includes(r.tipo)),
  );
  protected readonly pideMotivoReto = computed(() => {
    const reto = this.retos().find((r) => r.id === this.retoId());
    return reto !== undefined && reto.tipo !== 'otorgado';
  });
  protected readonly otorgarListo = computed(
    () =>
      this.retoId() !== '' &&
      this.listaCodigos().length > 0 &&
      (!this.pideMotivoReto() || this.motivoReto().trim().length >= 5),
  );
  // HU-412: canjear a mano.
  protected readonly premios = signal<readonly PremioPanel[]>([]);
  protected readonly premiosActivos = computed(() =>
    this.premios().filter((p) => p.estado === 'activo'),
  );
  protected readonly cantidades = signal<Readonly<Record<string, number>>>({});
  protected readonly motivoCanje = signal('');
  protected readonly canjeHecho = signal<CanjeManualHecho | null>(null);
  protected readonly totalCanje = computed(() =>
    this.premios().reduce((suma, p) => suma + p.puntos * (this.cantidades()[p.id] ?? 0), 0),
  );
  protected readonly canjeListo = computed(
    () =>
      this.persona() !== null &&
      Object.values(this.cantidades()).some((c) => c > 0) &&
      this.motivoCanje().trim().length >= 5,
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
    void this.loadPremios();
  }

  private async loadPremios(): Promise<void> {
    try {
      this.premios.set(await this.eventos.listPremios(this.eventoId()));
    } catch {
      // Sin la lista, la pestaña muestra «No hay premios activos».
    }
  }

  protected cantidad(premioId: string): number {
    return this.cantidades()[premioId] ?? 0;
  }

  protected setCantidad(premioId: string, cambio: number): void {
    const nueva = Math.max(0, this.cantidad(premioId) + cambio);
    this.cantidades.set({ ...this.cantidades(), [premioId]: nueva });
  }

  protected describeItems(items: CanjeManualHecho['items']): string {
    return items.map((i) => `${i.cantidad} × ${i.nombre}`).join(', ');
  }

  protected async createCanjeManual(): Promise<void> {
    const persona = this.persona();
    if (!persona || !this.canjeListo()) return;
    const items = Object.entries(this.cantidades())
      .filter(([, cantidad]) => cantidad > 0)
      .map(([premioId, cantidad]) => ({ premioId, cantidad }));
    await this.run(async () => {
      const hecho = await this.api.createCanjeManual(this.eventoId(), {
        asistenteId: persona.id,
        items,
        motivo: this.motivoCanje().trim(),
      });
      this.canjeHecho.set(hecho);
      this.avisos.ok(`Canje ${hecho.comprobante}: ${persona.nombre} queda con ${hecho.saldo} pts.`);
      this.cantidades.set({});
      this.motivoCanje.set('');
      await this.loadPremios();
    });
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
      const motivo = this.motivoReto().trim();
      const { resultados } = await this.api.grant(
        this.retoId(),
        this.listaCodigos(),
        motivo || undefined,
      );
      this.motivoReto.set('');
      this.otorgados.set(resultados);
      this.avisos.ok(`Otorgado a ${resultados.filter((r) => r.resultado === 'ok').length}.`);
    });
  }

  protected onBuscarCanjes(q: string): void {
    clearTimeout(this.esperaBusqueda);
    if (q.trim().length < 2) {
      this.canjes.set([]);
      return;
    }
    this.esperaBusqueda = setTimeout(() => void this.searchCanjes(q), 250);
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
