import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { esquemaCrearOrganizacion } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  FiltrosComponent,
  getErrorCampo,
  getMensajeError,
  PanelLateralComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { usePermisosConsola } from './consola.layout';
import { PlataformaApi, type OrganizacionFila } from './plataforma-api.service';

/** Organizaciones: lista con buscador y *Nueva organización* (HU-202 §2 y §7). */
@Component({
  selector: 'plt-organizaciones-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    EncabezadoPaginaComponent,
    FiltrosComponent,
    PanelLateralComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Organizaciones"
      descripcion="Las que organizan eventos con Pasitos y quién es su dueño."
    >
      @if (permisos.puedeEscribir()) {
        <button type="button" pxBoton (click)="creando.set(true)">Nueva organización</button>
      }
    </pnl-encabezado-pagina>

    <pnl-panel-lateral
      titulo="Nueva organización"
      [abierto]="creando()"
      [guardando]="enviando()"
      textoGuardar="Crear e invitar"
      (guardar)="submit($event)"
      (cerrado)="creando.set(false)"
    >
      @if (creando()) {
        <px-campo
          etiqueta="Nombre de la organización"
          [error]="errores()['nombre'] ?? null"
          #c1="pxCampo"
        >
          <input
            [id]="c1.idControl"
            [attr.aria-describedby]="c1.idDescripcion"
            name="nombre"
            maxlength="120"
            [value]="nombre()"
            (input)="nombre.set(valorDe($event))"
          />
        </px-campo>
        <px-campo
          etiqueta="Nombre de la dueña o el dueño"
          [error]="errores()['duenoNombre'] ?? null"
          #c2="pxCampo"
        >
          <input
            [id]="c2.idControl"
            [attr.aria-describedby]="c2.idDescripcion"
            name="duenoNombre"
            maxlength="80"
            [value]="duenoNombre()"
            (input)="duenoNombre.set(valorDe($event))"
          />
        </px-campo>
        <px-campo
          etiqueta="Su correo"
          ayuda="Le llega la invitación; vale 7 días."
          [error]="errores()['duenoEmail'] ?? null"
          #c3="pxCampo"
        >
          <input
            [id]="c3.idControl"
            [attr.aria-describedby]="c3.idDescripcion"
            name="duenoEmail"
            type="email"
            inputmode="email"
            [value]="duenoEmail()"
            (input)="duenoEmail.set(valorDe($event))"
          />
        </px-campo>
        @if (errorCrear(); as mensaje) {
          <px-aviso variante="peligro">{{ mensaje }}</px-aviso>
        }
      }
    </pnl-panel-lateral>

    <pnl-filtros>
      <input
        pnlBuscador
        type="search"
        name="q"
        aria-label="Buscar"
        placeholder="Buscar por nombre o slug"
        [value]="q()"
        (input)="search(valorDe($event))"
      />
    </pnl-filtros>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar las organizaciones" [traceId]="traceId()">
          <button type="button" pxBoton="secundario" (click)="load()">Reintentar</button>
        </px-estado>
      }
      @default {
        @if (items().length === 0) {
          <px-estado tipo="vacio" titulo="No hay organizaciones">
            @if (q()) {
              Prueba con otro nombre.
            } @else {
              Crea la primera con «Nueva organización».
            }
          </px-estado>
        } @else {
          <table class="pnl-tabla">
            <thead>
              <tr>
                <th scope="col">Organización</th>
                <th scope="col">Slug</th>
                <th scope="col">Dueño</th>
                <th scope="col">Eventos</th>
                <th scope="col"><span class="px-sr-only">Estado</span></th>
              </tr>
            </thead>
            <tbody>
              @for (org of items(); track org.id) {
                <tr>
                  <td>
                    <a class="font-bold hover:underline" [routerLink]="['/organizaciones', org.id]">
                      {{ org.nombre }}
                    </a>
                  </td>
                  <td data-etiqueta="Slug" class="text-muted">{{ org.slug }}</td>
                  <td data-etiqueta="Dueño">
                    @if (org.dueno; as d) {
                      {{ d.nombre ?? d.email }}
                      @if (d.estado === 'invitado') {
                        <span class="text-muted text-sm">(invitación pendiente)</span>
                      }
                    } @else {
                      <span class="text-muted">Sin dueño</span>
                    }
                  </td>
                  <td data-etiqueta="Eventos">{{ contarEventos(org) }}</td>
                  <td>
                    <span class="flex flex-wrap gap-2">
                      @if (org.esDemo) {
                        <px-chip variante="puntos">Demo</px-chip>
                      }
                      @if (org.estado === 'suspendida') {
                        <px-chip variante="peligro">Suspendida</px-chip>
                      }
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
        @if (cursor()) {
          <div>
            <button type="button" pxBoton="secundario" (click)="load(true)">Cargar más</button>
          </div>
        }
      }
    }
  `,
})
export class OrganizacionesPage implements OnInit {
  private readonly api = inject(PlataformaApi);
  private readonly avisos = inject(AvisosService);
  protected readonly permisos = usePermisosConsola();

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly items = signal<readonly OrganizacionFila[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly q = signal('');

  protected readonly creando = signal(false);
  protected readonly nombre = signal('');
  protected readonly duenoNombre = signal('');
  protected readonly duenoEmail = signal('');
  protected readonly enviando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly errorCrear = signal<string | null>(null);
  protected readonly valida = computed(
    () =>
      esquemaCrearOrganizacion.safeParse({
        nombre: this.nombre(),
        duenoNombre: this.duenoNombre(),
        duenoEmail: this.duenoEmail(),
      }).success,
  );
  protected readonly valorDe = valorDe;
  private espera: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    void this.load();
  }

  protected contarEventos(org: OrganizacionFila): number {
    return Object.values(org.eventos).reduce((suma, n) => suma + n, 0);
  }

  protected search(texto: string): void {
    this.q.set(texto);
    clearTimeout(this.espera);
    this.espera = setTimeout(() => void this.load(), 300);
  }

  protected async load(mas = false): Promise<void> {
    if (!mas) {
      this.estado.set('cargando');
    }
    try {
      const pagina = await this.api.listOrganizaciones({
        q: this.q().trim(),
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

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    if (this.enviando()) return;
    if (!this.valida()) {
      // Los textos salen del esquema de libs/dominio.
      const issues = esquemaCrearOrganizacion.safeParse({
        nombre: this.nombre(),
        duenoNombre: this.duenoNombre(),
        duenoEmail: this.duenoEmail(),
      }).error?.issues;
      this.errores.set(
        Object.fromEntries((issues ?? []).map((i) => [String(i.path[0]), i.message])),
      );
      return;
    }
    this.enviando.set(true);
    this.errorCrear.set(null);
    this.errores.set({});
    try {
      await this.api.createOrganizacion({
        nombre: this.nombre().trim(),
        duenoNombre: this.duenoNombre().trim(),
        duenoEmail: this.duenoEmail().trim(),
      });
      this.avisos.ok(
        `Creamos ${this.nombre().trim()} y enviamos la invitación a ${this.duenoEmail().trim()}.`,
        8_000,
      );
      this.creando.set(false);
      this.nombre.set('');
      this.duenoNombre.set('');
      this.duenoEmail.set('');
      await this.load();
    } catch (error) {
      const campos = ['nombre', 'slug', 'duenoNombre', 'duenoEmail'];
      this.errores.set(Object.fromEntries(campos.map((c) => [c, getErrorCampo(error, c)])));
      if (campos.every((c) => !getErrorCampo(error, c))) {
        this.errorCrear.set(getMensajeError(error));
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
