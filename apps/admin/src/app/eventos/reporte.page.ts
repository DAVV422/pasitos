import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  canDo,
  FORMAS_DE_ENTRAR,
  PASO_TRAMO_MIN,
  UMBRAL_EVENTO_PEQUENO,
  type DatosReporte,
  type ReportePanel,
  type TramoReporte,
} from '@pasitos/dominio';
import { AvisosService, EncabezadoPaginaComponent, getMensajeError } from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  EstadoComponent,
  QrComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { ReportesApi } from './reportes-api.service';

interface Barra {
  readonly nombre: string;
  readonly valor: number;
  readonly detalle?: string;
}

/** Barras simples en CSS (HU-402 §4): sin librería de gráficos. */
@Component({
  selector: 'adm-barras-reporte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col gap-3 sm:gap-2">
      @for (barra of barras(); track barra.nombre) {
        <li
          class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]"
        >
          <span class="sm:truncate" [title]="barra.nombre">{{ barra.nombre }}</span>
          <span
            class="bg-track col-span-2 row-start-2 h-3 rounded-full sm:col-span-1 sm:row-start-auto"
            aria-hidden="true"
          >
            <span
              class="bg-points-fill block h-3 rounded-full"
              [style.width.%]="(barra.valor / maximo()) * 100"
            ></span>
          </span>
          <span class="font-semibold tabular-nums sm:font-normal"
            >{{ barra.valor }}{{ barra.detalle ?? '' }}</span
          >
        </li>
      } @empty {
        <li class="text-muted text-sm">Nada en este tramo.</li>
      }
    </ul>
  `,
})
export class BarrasReporteComponent {
  readonly barras = input.required<readonly Barra[]>();
  protected readonly maximo = computed(() => Math.max(1, ...this.barras().map((b) => b.valor)));
}

interface OpcionHora {
  readonly iso: string;
  readonly etiqueta: string;
}

interface Atajo {
  readonly texto: string;
  readonly tramo: TramoReporte | null;
}

/**
 * El reporte del evento cerrado (HU-402 §4, O8): el selector del tramo, los números grandes, las
 * secciones con barras, Stellar, las descargas y compartir (solo el dueño).
 */
@Component({
  selector: 'adm-reporte-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BarrasReporteComponent,
    BotonDirective,
    EncabezadoPaginaComponent,
    EstadoComponent,
    QrComponent,
    RouterLink,
    TarjetaComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Reporte del evento"
      descripcion="Solo totales: no muestra nombres ni datos de las personas."
    />
    @if (error(); as e) {
      <px-aviso variante="peligro" role="alert">
        {{ e }}
        @if (puedeRegenerar() && !reporte()) {
          <button
            pxAvisoAccion
            type="button"
            pxBoton="secundario"
            [chico]="true"
            (click)="regenerate()"
          >
            Regenerar
          </button>
        }
      </px-aviso>
    }
    @if (reporte(); as r) {
      @if (datos(); as d) {
        @if (r.datos.evento.tipo === 'prueba') {
          <px-aviso variante="info">Evento de prueba</px-aviso>
        }

        <!-- §3.1: el tramo. -->
        <px-tarjeta>
          <h2 class="mb-2 text-lg font-bold">Ver un tramo</h2>
          <div class="mb-3 flex flex-wrap gap-2" data-testid="atajos">
            @for (atajo of atajos(); track atajo.texto) {
              <button
                type="button"
                [pxBoton]="isActual(atajo.tramo) ? 'primario' : 'secundario'"
                [chico]="true"
                (click)="applyTramo(atajo.tramo)"
              >
                {{ atajo.texto }}
              </button>
            }
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <label class="flex flex-col gap-1 text-sm">
              Desde
              <select
                class="bg-surface rounded border px-2 py-1"
                data-testid="desde"
                [value]="desde()"
                (change)="desde.set(valorSelect($event))"
              >
                @for (opcion of horas(); track opcion.iso) {
                  <option [value]="opcion.iso" [selected]="opcion.iso === desde()">
                    {{ opcion.etiqueta }}
                  </option>
                }
              </select>
            </label>
            <label class="flex flex-col gap-1 text-sm">
              Hasta
              <select
                class="bg-surface rounded border px-2 py-1"
                data-testid="hasta"
                [value]="hasta()"
                (change)="hasta.set(valorSelect($event))"
              >
                @for (opcion of horas(); track opcion.iso) {
                  <option [value]="opcion.iso" [selected]="opcion.iso === hasta()">
                    {{ opcion.etiqueta }}
                  </option>
                }
              </select>
            </label>
            <button
              type="button"
              pxBoton="secundario"
              [cargando]="calculando()"
              [deshabilitado]="!tramoValido()"
              (click)="applyTramo({ desde: desde(), hasta: hasta() })"
            >
              Ver
            </button>
          </div>
          @if (!tramoValido()) {
            <p class="text-danger mt-2 text-sm">Hasta tiene que ser después de Desde.</p>
          }
          <p class="text-muted mt-2 text-sm" data-testid="mostrando">
            @if (d.tramo; as t) {
              Mostrando de {{ hora(t.desde) }} a {{ hora(t.hasta) }} · {{ dia(t.desde) }}
            } @else {
              Mostrando el evento completo.
            }
          </p>
        </px-tarjeta>

        @if (d.pequeno) {
          <px-aviso variante="info"
            >Evento con menos de {{ umbralPequeno }} personas: por privacidad se muestran solo los
            totales.</px-aviso
          >
        } @else if (d.soloTotales) {
          <px-aviso variante="info"
            >En este tramo hubo menos de 5 personas activas: por privacidad se muestran solo los
            totales.</px-aviso
          >
        }

        <!-- Los cuatro números grandes. -->
        <section class="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="numeros">
          @for (n of numeros(); track n.etiqueta) {
            <px-tarjeta>
              <p class="text-3xl font-bold tabular-nums">{{ n.valor }}</p>
              <p class="text-muted text-sm">{{ n.etiqueta }}</p>
            </px-tarjeta>
          }
        </section>

        <div class="grid gap-4 lg:grid-cols-2">
          <px-tarjeta>
            <h2 class="mb-2 text-lg font-bold">Asistencia</h2>
            <dl class="mb-3 grid grid-cols-2 gap-1 text-sm">
              <dt class="text-muted">Invitados</dt>
              <dd class="tabular-nums">{{ d.asistencia.invitados }}</dd>
              <dt class="text-muted">Presentes de la lista</dt>
              <dd class="tabular-nums">{{ d.asistencia.presentesDeLista }}</dd>
              <dt class="text-muted">Personas activas</dt>
              <dd class="tabular-nums">{{ d.asistencia.activos }}</dd>
            </dl>
            @if (d.asistencia.porForma.length > 0) {
              <h3 class="mb-1 font-bold">Cómo entraron</h3>
              <adm-barras-reporte [barras]="porForma()" />
            }
            @if (d.asistencia.porRegistrador; as registradores) {
              @if (registradores.length > 0) {
                <h3 class="mt-3 mb-1 font-bold">Registros en la puerta</h3>
                <adm-barras-reporte [barras]="toBarras(registradores, 'total')" />
              }
            }
          </px-tarjeta>

          @if (d.asistencia.franjas; as franjas) {
            <px-tarjeta>
              <h2 class="mb-2 text-lg font-bold">Personas activas por hora</h2>
              <adm-barras-reporte [barras]="porHora()" />
              @if (d.asistencia.retencion; as ret) {
                <p class="mt-3 text-sm" data-testid="retencion">
                  Primera hora: <b>{{ ret.primeraHora }}</b> · última hora:
                  <b>{{ ret.ultimaHora }}</b> personas activas.
                </p>
                @if (ret.apertura && ret.cierre) {
                  <p class="text-muted text-sm">
                    {{ ret.apertura.titulo }}: {{ ret.apertura.participantes }} ·
                    {{ ret.cierre.titulo }}:
                    {{ ret.cierre.participantes }}
                  </p>
                }
              }
            </px-tarjeta>
          }

          <px-tarjeta>
            <h2 class="mb-2 text-lg font-bold">Participación</h2>
            <p class="mb-3 text-sm">
              {{ porcentaje(d.participacion.conReto, d.asistencia.presentes) }} completó al menos un
              reto · {{ porcentaje(d.participacion.conCanje, d.asistencia.presentes) }} canjeó al
              menos un premio.
            </p>
            <h3 class="mb-1 font-bold">Por reto (participaciones / tope)</h3>
            <adm-barras-reporte [barras]="porReto()" />
            @if (d.participacion.porLugar.length > 0) {
              <h3 class="mt-3 mb-1 font-bold">Por lugar</h3>
              <adm-barras-reporte
                [barras]="toBarras(d.participacion.porLugar, 'participaciones')"
              />
            }
            @if (d.participacion.porSponsor.length > 0) {
              <h3 class="mt-3 mb-1 font-bold">Por sponsor</h3>
              <adm-barras-reporte
                [barras]="toBarras(d.participacion.porSponsor, 'participaciones')"
              />
            }
          </px-tarjeta>

          <px-tarjeta>
            <h2 class="mb-2 text-lg font-bold">Fotos y grupos</h2>
            <p class="text-sm">
              {{ d.participacion.fotos.enviadas }} enviadas ·
              {{ d.participacion.fotos.aprobadas }} aprobadas ·
              {{ d.participacion.fotos.rechazadas }} rechazadas ·
              {{ d.participacion.fotos.conAutorizacion }} con autorización de uso
            </p>
            @if (d.participacion.porGrupo; as grupos) {
              @if (grupos.length > 0) {
                <h3 class="mt-3 mb-1 font-bold">Por grupo (presentes)</h3>
                <adm-barras-reporte [barras]="toBarras(grupos, 'presentes')" />
              }
            }
          </px-tarjeta>

          <px-tarjeta>
            <h2 class="mb-2 text-lg font-bold">{{ nombrePuntos() }}</h2>
            <dl class="grid grid-cols-2 gap-1 text-sm" data-testid="puntos">
              <dt class="text-muted">Ganados</dt>
              <dd class="tabular-nums">{{ d.puntos.ganados }}</dd>
              <dt class="text-muted">Canjeados</dt>
              <dd class="tabular-nums">{{ d.puntos.canjeados }}</dd>
              <dt class="text-muted">Ajustados a mano</dt>
              <dd class="tabular-nums">{{ d.puntos.ajustados }}</dd>
              <dt class="text-muted">Vencidos al cierre</dt>
              <dd class="tabular-nums">{{ d.puntos.vencidos }}</dd>
            </dl>
            @if (d.puntos.ajustes.length > 0 || d.puntos.anulaciones > 0) {
              <p class="text-muted mt-2 text-sm">
                @for (a of d.puntos.ajustes; track a.categoria) {
                  {{ a.categoria }}: {{ a.total }} ·
                }
                Anulaciones: {{ d.puntos.anulaciones }}
              </p>
            }
          </px-tarjeta>

          <px-tarjeta>
            <h2 class="mb-2 text-lg font-bold">Premios</h2>
            <p class="mb-2 text-sm">
              {{ d.premios.canjes }} canjes ({{ d.premios.gratuitos }} gratuitos)
            </p>
            <ul class="flex flex-col gap-1 text-sm">
              @for (p of d.premios.porPremio; track p.nombre) {
                <li>
                  <b>{{ p.nombre }}</b>: {{ p.entregados }} entregados
                  @if (p.anulados > 0) {
                    · {{ p.anulados }} anulados
                  }
                  · quedan {{ p.sobrante }}
                </li>
              }
            </ul>
          </px-tarjeta>
        </div>

        <!-- Stellar: siempre del evento completo. -->
        <px-tarjeta data-testid="stellar">
          <h2 class="mb-2 text-lg font-bold">Stellar</h2>
          @if (r.stellar.estado === 'registrado') {
            <p class="text-success">
              Sellado en
              {{
                r.stellar.red === 'testnet'
                  ? 'la red de pruebas de Stellar (testnet)'
                  : 'una red local de Stellar'
              }}
              ✓
            </p>
          } @else {
            <p class="text-muted">El cierre en Stellar todavía está pendiente.</p>
          }
          @if (r.stellar.enlaceContrato; as enlace) {
            <a class="underline" [href]="enlace" target="_blank" rel="noopener"
              >Ver el contrato en stellar.expert</a
            >
          } @else if (r.stellar.contratoId) {
            <p class="text-muted text-sm break-all">{{ r.stellar.contratoId }}</p>
          }
          @if (r.stellar.lotes.length > 0) {
            <ul class="mt-2 flex flex-col gap-1 text-sm">
              @for (lote of r.stellar.lotes; track lote.numero) {
                <li>
                  Lote {{ lote.numero }}:
                  @if (lote.enlace) {
                    <a class="underline" [href]="lote.enlace" target="_blank" rel="noopener">{{
                      corto(lote.txHash)
                    }}</a>
                  } @else {
                    {{ corto(lote.txHash) }}
                  }
                </li>
              }
            </ul>
          }
          @if (r.stellar.huellaFinal) {
            <p class="text-muted mt-2 text-sm break-all">
              Huella final: {{ r.stellar.huellaFinal }}
            </p>
          }
        </px-tarjeta>

        <px-tarjeta>
          <h2 class="mb-2 text-lg font-bold">Descargar</h2>
          <p class="text-muted mb-3 text-sm">
            El PDF es siempre del evento completo. El CSV es de lo que estás viendo.
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" pxBoton="secundario" (click)="download('pdf')">PDF</button>
            <button type="button" pxBoton="secundario" (click)="download('csv')">CSV</button>
            @if (puedeRegenerar()) {
              <button
                type="button"
                pxBoton="fantasma"
                [cargando]="regenerando()"
                (click)="regenerate()"
              >
                Regenerar
              </button>
            }
          </div>
        </px-tarjeta>

        @if (puedeCompartir()) {
          <px-tarjeta data-testid="compartir">
            <h2 class="mb-2 text-lg font-bold">Compartir</h2>
            @if (!r.compartible) {
              <p class="text-muted text-sm">El reporte de un evento demo no se puede compartir.</p>
            } @else if (r.publico && r.enlacePublico) {
              <div class="flex flex-col items-start gap-3">
                <p class="text-sm">Cualquiera con el enlace ve los totales del evento.</p>
                <code class="bg-track rounded px-2 py-1 text-sm break-all" data-testid="enlace">{{
                  r.enlacePublico
                }}</code>
                <px-qr [texto]="r.enlacePublico" [tamano]="160" descripcion="QR del reporte" />
                <div class="flex flex-wrap gap-2">
                  <button type="button" pxBoton="secundario" (click)="copy(r.enlacePublico)">
                    Copiar
                  </button>
                  <button
                    type="button"
                    pxBoton="fantasma"
                    [cargando]="compartiendo()"
                    (click)="share(true, true)"
                  >
                    Cambiar el enlace
                  </button>
                  <button
                    type="button"
                    pxBoton="fantasma"
                    [cargando]="compartiendo()"
                    (click)="share(false)"
                  >
                    Dejar de compartir
                  </button>
                </div>
              </div>
            } @else {
              <p class="text-muted mb-3 text-sm">
                Crea un enlace para tus sponsors. No muestra nombres ni datos de las personas.
              </p>
              <button type="button" pxBoton [cargando]="compartiendo()" (click)="share(true)">
                Crear el enlace público
              </button>
            }
            <p class="mt-3 text-sm">
              O invita a un financiador: lo ve y lo descarga desde el panel.
              <a class="underline" [routerLink]="['/eventos', eventoId(), 'equipo']">Ir a Equipo</a>
            </p>
          </px-tarjeta>
        }
      }
    } @else if (!error()) {
      <px-estado tipo="cargando" titulo="Generando el reporte…" />
    }
  `,
})
export class ReportePage implements OnInit {
  private readonly api = inject(ReportesApi);
  private readonly actual = inject(EventoActualService);
  private readonly avisos = inject(AvisosService);

  protected readonly umbralPequeno = UMBRAL_EVENTO_PEQUENO;
  protected readonly reporte = signal<ReportePanel | null>(null);
  protected readonly tramoDatos = signal<DatosReporte | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly calculando = signal(false);
  protected readonly compartiendo = signal(false);
  protected readonly regenerando = signal(false);

  protected readonly eventoId = computed(() => this.actual.evento()?.id ?? '');
  private readonly rol = computed(() => this.actual.evento()?.miRol ?? null);
  protected readonly puedeCompartir = computed(() => {
    const rol = this.rol();
    return rol !== null && canDo(rol, 'reporte.share');
  });
  protected readonly puedeRegenerar = computed(() => {
    const rol = this.rol();
    return rol !== null && canDo(rol, 'reporte.regenerate');
  });

  protected readonly datos = computed(() => this.tramoDatos() ?? this.reporte()?.datos ?? null);
  private readonly zona = computed(() => this.reporte()?.datos.evento.zonaHoraria ?? 'UTC');
  protected readonly nombrePuntos = computed(() => {
    const nombre = this.reporte()?.datos.evento.nombrePuntos ?? 'puntos';
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  });

  /** De a 15 minutos, del primer al último movimiento, en la hora del evento. */
  protected readonly horas = computed<OpcionHora[]>(() => {
    const limites = this.reporte()?.datos.limites;
    if (!limites) return [];
    const opciones: OpcionHora[] = [];
    const paso = PASO_TRAMO_MIN * 60_000;
    const dias = this.dia(limites.desde) !== this.dia(limites.hasta);
    for (let t = Date.parse(limites.desde); t <= Date.parse(limites.hasta); t += paso) {
      const iso = new Date(t).toISOString();
      opciones.push({
        iso,
        etiqueta: dias ? `${this.hora(iso)} · ${this.dia(iso)}` : this.hora(iso),
      });
    }
    return opciones;
  });

  protected readonly atajos = computed<Atajo[]>(() => {
    const datos = this.reporte()?.datos;
    if (!datos) return [];
    const { limites } = datos;
    const atajos: Atajo[] = [{ texto: 'Evento completo', tramo: null }];
    const mediodia = this.horas().find((h) => this.hora(h.iso) === '12:00')?.iso;
    if (mediodia && mediodia > limites.desde && mediodia < limites.hasta) {
      atajos.push({ texto: 'Hasta el mediodía', tramo: { desde: limites.desde, hasta: mediodia } });
      atajos.push({ texto: 'Por la tarde', tramo: { desde: mediodia, hasta: limites.hasta } });
    }
    const paso = PASO_TRAMO_MIN * 60_000;
    for (const actividad of datos.evento.agenda) {
      const desde = Math.max(
        Math.floor(Date.parse(actividad.inicioAt) / paso) * paso,
        Date.parse(limites.desde),
      );
      const hasta = Math.min(
        Math.ceil(Date.parse(actividad.finAt) / paso) * paso,
        Date.parse(limites.hasta),
      );
      if (hasta <= desde) continue;
      const tramo = { desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString() };
      atajos.push({
        texto: `${actividad.titulo} · ${this.hora(tramo.desde)} a ${this.hora(tramo.hasta)}`,
        tramo,
      });
    }
    return atajos;
  });

  protected readonly tramoValido = computed(() => this.hasta() > this.desde());

  protected readonly numeros = computed(() => {
    const d = this.datos();
    if (!d) return [];
    return [
      { etiqueta: 'Presentes', valor: String(d.asistencia.presentes) },
      {
        etiqueta: 'Tasa de asistencia',
        valor: d.asistencia.tasa === null ? '—' : `${Math.round(d.asistencia.tasa * 100)} %`,
      },
      { etiqueta: 'Participaciones', valor: String(d.participacion.participaciones) },
      { etiqueta: 'Premios entregados', valor: String(d.premios.entregados) },
    ];
  });

  protected readonly porForma = computed<Barra[]>(
    () =>
      this.datos()?.asistencia.porForma.map((f) => ({
        nombre: FORMAS_DE_ENTRAR[f.forma],
        valor: f.total,
      })) ?? [],
  );
  protected readonly porHora = computed<Barra[]>(
    () =>
      this.datos()?.asistencia.franjas?.map((f) => ({
        nombre: this.hora(f.hora),
        valor: f.activos,
        detalle: ` (${f.checkIns} check-ins)`,
      })) ?? [],
  );
  protected readonly porReto = computed<Barra[]>(
    () =>
      this.datos()?.participacion.porReto.map((r) => ({
        nombre: r.nombre,
        valor: r.participaciones,
        detalle: ` / ${r.tope}`,
      })) ?? [],
  );

  async ngOnInit(): Promise<void> {
    try {
      this.setReporte(await this.api.get(this.eventoId()));
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  private setReporte(reporte: ReportePanel): void {
    this.reporte.set(reporte);
    if (!this.tramoDatos()) {
      this.desde.set(reporte.datos.limites.desde);
      this.hasta.set(reporte.datos.limites.hasta);
    }
  }

  protected toBarras<T extends { nombre: string }>(filas: readonly T[], clave: keyof T): Barra[] {
    return filas.map((f) => ({ nombre: f.nombre, valor: Number(f[clave]) }));
  }

  protected valorSelect(evento: Event): string {
    return (evento.target as HTMLSelectElement).value;
  }

  protected hora(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: this.zona(),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(iso));
  }

  protected dia(iso: string): string {
    return new Intl.DateTimeFormat('es-BO', {
      timeZone: this.zona(),
      day: 'numeric',
      month: 'numeric',
    }).format(new Date(iso));
  }

  protected porcentaje(parte: number, total: number): string {
    return total > 0 ? `${Math.round((parte / total) * 100)} %` : '0 %';
  }

  protected corto(hash: string | null): string {
    return hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : 'sin transacción';
  }

  protected isActual(tramo: TramoReporte | null): boolean {
    const actual = this.tramoDatos()?.tramo ?? null;
    if (!tramo || !actual) return tramo === actual;
    return tramo.desde === actual.desde && tramo.hasta === actual.hasta;
  }

  protected async applyTramo(tramo: TramoReporte | null): Promise<void> {
    const reporte = this.reporte();
    if (!reporte) return;
    this.error.set(null);
    if (!tramo) {
      this.tramoDatos.set(null);
      this.desde.set(reporte.datos.limites.desde);
      this.hasta.set(reporte.datos.limites.hasta);
      return;
    }
    this.desde.set(tramo.desde);
    this.hasta.set(tramo.hasta);
    this.calculando.set(true);
    try {
      this.tramoDatos.set(await this.api.getTramo(this.eventoId(), tramo));
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.calculando.set(false);
    }
  }

  protected async download(formato: 'pdf' | 'csv'): Promise<void> {
    try {
      const archivo = await this.api.download(
        this.eventoId(),
        formato,
        this.tramoDatos()?.tramo ?? null,
      );
      const url = URL.createObjectURL(archivo);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `reporte-${this.actual.evento()?.slug ?? 'evento'}.${formato}`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      this.error.set(getMensajeError(error));
    }
  }

  protected async share(publico: boolean, cambiarEnlace = false): Promise<void> {
    if (
      publico &&
      !cambiarEnlace &&
      !window.confirm(
        'Cualquiera con el enlace va a ver los totales del evento. No muestra nombres ni datos de las personas.',
      )
    ) {
      return;
    }
    if (
      cambiarEnlace &&
      !window.confirm('El enlace anterior va a dejar de funcionar. ¿Cambiarlo?')
    ) {
      return;
    }
    this.compartiendo.set(true);
    this.error.set(null);
    try {
      this.setReporte(await this.api.share(this.eventoId(), publico, cambiarEnlace));
      this.avisos.ok(
        !publico
          ? 'Dejamos de compartir el reporte.'
          : cambiarEnlace
            ? 'Cambiamos el enlace.'
            : 'Creamos el enlace público.',
      );
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.compartiendo.set(false);
    }
  }

  protected async copy(enlace: string): Promise<void> {
    await navigator.clipboard.writeText(enlace);
    this.avisos.ok('Copiamos el enlace.');
  }

  protected async regenerate(): Promise<void> {
    this.regenerando.set(true);
    this.error.set(null);
    try {
      this.tramoDatos.set(null);
      this.setReporte(await this.api.regenerate(this.eventoId()));
      this.avisos.ok('Regeneramos el reporte.');
    } catch (error) {
      this.error.set(getMensajeError(error));
    } finally {
      this.regenerando.set(false);
    }
  }
}
