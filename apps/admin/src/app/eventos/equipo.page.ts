import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { canManageRol, NOMBRES_ROL, ROLES_INVITABLES, type RolEvento } from '@pasitos/dominio';
import { esquemaEmail } from '@pasitos/dominio/esquemas';
import {
  AvisosService,
  EncabezadoPaginaComponent,
  getErrorCampo,
  getMensajeError,
  MenuAccionesComponent,
  PanelLateralComponent,
  valorDe,
} from '@pasitos/panel';
import {
  AvisoComponent,
  BotonDirective,
  CampoComponent,
  ChipComponent,
  EstadoComponent,
  TarjetaComponent,
} from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { EventosApi, type MiembroEquipo, type TerminalPanel } from './eventos-api.service';

type RolInvitable = Exclude<RolEvento, 'dueno'>;

/** Qué puede hacer cada rol, en una línea (de la matriz de Flujos §2.4). */
const QUE_HACE: Readonly<Record<RolInvitable, string>> = {
  coorganizador: 'Configura el evento, los retos, el catálogo y el equipo.',
  registrador: 'Recibe a los asistentes en la puerta.',
  operador_mesa: 'Entrega los premios en la mesa de canje que le asignes.',
  operador_stand: 'Maneja las pantallas de su stand.',
  financiador: 'Ve el evento y su reporte, sin cambiar nada.',
};

const ESTADOS: Readonly<Record<MiembroEquipo['estado'], string>> = {
  invitado: 'Invitación enviada',
  activo: 'Activo',
  vencido: 'Invitación vencida',
  revocado: 'Quitado',
};

/** Equipo del evento (O11, HU-203 §4). */
@Component({
  selector: 'adm-equipo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    BotonDirective,
    CampoComponent,
    ChipComponent,
    EstadoComponent,
    TarjetaComponent,
    EncabezadoPaginaComponent,
    MenuAccionesComponent,
    PanelLateralComponent,
  ],
  template: `
    <pnl-encabezado-pagina
      titulo="Equipo"
      descripcion="Quién te ayuda con el evento y qué puede hacer cada uno."
    >
      <button type="button" pxBoton (click)="invitando.set(true)">Invitar</button>
    </pnl-encabezado-pagina>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    <pnl-panel-lateral
      titulo="Invitar al equipo"
      [abierto]="invitando()"
      [guardando]="enviando()"
      textoGuardar="Enviar la invitación"
      (guardar)="submit($event)"
      (cerrado)="invitando.set(false)"
    >
      @if (invitando()) {
        <px-campo etiqueta="Correo" [error]="errorEmail()" #ce="pxCampo">
          <input
            [id]="ce.idControl"
            [attr.aria-describedby]="ce.idDescripcion"
            type="email"
            inputmode="email"
            [value]="email()"
            (input)="email.set(valorDe($event))"
          />
        </px-campo>
        <px-campo etiqueta="Nombre" [opcional]="true" #cn="pxCampo">
          <input
            [id]="cn.idControl"
            [attr.aria-describedby]="cn.idDescripcion"
            maxlength="80"
            [value]="nombre()"
            (input)="nombre.set(valorDe($event))"
          />
        </px-campo>
        <px-campo etiqueta="Rol" [ayuda]="queHace(rol())" #cr="pxCampo">
          <select
            [id]="cr.idControl"
            [attr.aria-describedby]="cr.idDescripcion"
            (change)="setRol(valorDe($event))"
          >
            @for (opcion of rolesDisponibles(); track opcion) {
              <option [value]="opcion" [selected]="rol() === opcion">
                {{ nombreRol(opcion) }}
              </option>
            }
          </select>
        </px-campo>
        @if (rol() === 'registrador') {
          <px-campo
            etiqueta="Tope de registros en la puerta"
            [opcional]="true"
            ayuda="Sin tope propio, usa el del evento."
            #ct="pxCampo"
          >
            <input
              [id]="ct.idControl"
              [attr.aria-describedby]="ct.idDescripcion"
              type="number"
              min="1"
              max="100000"
              [value]="tope()"
              (input)="tope.set(valorDe($event))"
            />
          </px-campo>
        }
        @if (rol() === 'operador_stand' || rol() === 'operador_mesa') {
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 font-bold">
              {{ rol() === 'operador_stand' ? 'Sus pantallas' : 'Sus mesas' }}
            </legend>
            @for (t of opcionesTerminal(rol()); track t.id) {
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  [checked]="asignadas().includes(t.id)"
                  (change)="toggleAsignada(t.id)"
                />
                {{ t.nombre }}
              </label>
            } @empty {
              <p class="text-muted text-sm">
                Todavía no hay {{ rol() === 'operador_stand' ? 'pantallas' : 'mesas' }}: las asignas
                después, desde esta lista.
              </p>
            }
          </fieldset>
        }
      }
    </pnl-panel-lateral>

    @switch (estado()) {
      @case ('cargando') {
        <px-estado tipo="cargando" />
      }
      @case ('error') {
        <px-estado tipo="error" titulo="No pudimos cargar el equipo" [traceId]="traceId()" />
      }
      @default {
        @for (miembro of miembros(); track miembro.id) {
          <px-tarjeta>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{{ miembro.nombre ?? miembro.email }}</b> · {{ nombreRol(miembro.rol) }}
                <span class="text-muted block text-sm">
                  {{ miembro.email
                  }}{{ miembro.invitadoPor ? ' · invitó ' + miembro.invitadoPor : '' }}
                  {{
                    miembro.topeRegistrosPuerta
                      ? ' · tope de puerta ' + miembro.topeRegistrosPuerta
                      : ''
                  }}
                </span>
              </span>
              <span class="flex items-center gap-2">
                <px-chip
                  [variante]="
                    miembro.estado === 'activo'
                      ? 'ok'
                      : miembro.estado === 'vencido'
                        ? 'peligro'
                        : 'atenuado'
                  "
                >
                  {{ nombreEstado(miembro.estado) }}
                </px-chip>
                @if (canManage(miembro)) {
                  <pnl-menu-acciones
                    [etiqueta]="'Acciones de ' + (miembro.nombre ?? miembro.email)"
                  >
                    @if (miembro.estado !== 'activo') {
                      <button type="button" (click)="resend(miembro)">
                        Reenviar la invitación
                      </button>
                      <hr />
                    }
                    <button type="button" class="pnl-acciones__peligro" (click)="remove(miembro)">
                      Quitar del equipo
                    </button>
                  </pnl-menu-acciones>
                }
              </span>
            </div>
            @if (canManage(miembro)) {
              <div class="mt-3 flex flex-wrap gap-2">
                <label class="flex items-center gap-2 text-sm">
                  Rol
                  <select
                    [attr.aria-label]="'Rol de ' + (miembro.nombre ?? miembro.email)"
                    (change)="updateRol(miembro, valorDe($event))"
                  >
                    @for (opcion of rolesDisponibles(); track opcion) {
                      <option [value]="opcion" [selected]="opcion === miembro.rol">
                        {{ nombreRol(opcion) }}
                      </option>
                    }
                  </select>
                </label>
              </div>
              @if (miembro.rol === 'operador_stand' || miembro.rol === 'operador_mesa') {
                <fieldset class="mt-3 flex flex-wrap gap-3">
                  <legend class="mb-1 text-sm font-bold">
                    {{ miembro.rol === 'operador_stand' ? 'Sus pantallas' : 'Sus mesas' }}
                  </legend>
                  @for (t of opcionesTerminal(miembro.rol); track t.id) {
                    <label class="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        [checked]="getAsignadas(miembro).includes(t.id)"
                        (change)="updateTerminales(miembro, t.id)"
                      />
                      {{ t.nombre }}
                    </label>
                  } @empty {
                    <span class="text-muted text-sm">
                      Crea {{ miembro.rol === 'operador_stand' ? 'pantallas' : 'mesas' }} para
                      asignarlas.
                    </span>
                  }
                </fieldset>
              }
            }
          </px-tarjeta>
        } @empty {
          <px-estado tipo="vacio" titulo="Todavía no invitaste a nadie">
            Invita a quien te ayuda con la puerta, las mesas, los stands o el reporte.
          </px-estado>
        }
      }
    }
  `,
})
export class EquipoPage implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly avisos = inject(AvisosService);
  private readonly actual = inject(EventoActualService);

  protected readonly estado = signal<'cargando' | 'error' | 'listo'>('cargando');
  protected readonly traceId = signal<string | null>(null);
  protected readonly miembros = signal<readonly MiembroEquipo[]>([]);
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);

  protected readonly invitando = signal(false);
  protected readonly email = signal('');
  protected readonly nombre = signal('');
  protected readonly rol = signal<RolInvitable>('registrador');
  protected readonly tope = signal('');
  protected readonly enviando = signal(false);
  protected readonly errorEmail = signal<string | null>(null);
  protected readonly asignadas = signal<readonly string[]>([]);
  private readonly pantallas = signal<readonly TerminalPanel[]>([]);
  private readonly mesas = signal<readonly TerminalPanel[]>([]);

  private readonly miRol = computed(() => this.actual.evento()?.miRol ?? null);
  /** El coorganizador no ve *Coorganizador* (¹). */
  protected readonly rolesDisponibles = computed(() => {
    const miRol = this.miRol();
    return ROLES_INVITABLES.filter((r) => miRol !== null && canManageRol(miRol, r));
  });
  protected readonly valido = computed(() => esquemaEmail.safeParse(this.email()).success);
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    void this.load();
  }

  protected setRol(rol: string): void {
    this.rol.set(rol as RolInvitable);
    this.asignadas.set([]);
  }

  protected opcionesTerminal(rol: RolEvento): readonly TerminalPanel[] {
    const lista = rol === 'operador_stand' ? this.pantallas() : this.mesas();
    return lista.filter((t) => !t.reemplazadaPor);
  }

  protected toggleAsignada(id: string): void {
    const actuales = this.asignadas();
    this.asignadas.set(
      actuales.includes(id) ? actuales.filter((a) => a !== id) : [...actuales, id],
    );
  }

  protected getAsignadas(miembro: MiembroEquipo): readonly string[] {
    return miembro.rol === 'operador_stand'
      ? miembro.terminales.pantallas
      : miembro.terminales.mesas;
  }

  protected async updateTerminales(miembro: MiembroEquipo, id: string): Promise<void> {
    const actuales = this.getAsignadas(miembro);
    const nuevas = actuales.includes(id) ? actuales.filter((a) => a !== id) : [...actuales, id];
    await this.run(
      () =>
        this.api.updateMiembro(miembro.id, {
          terminales: miembro.rol === 'operador_stand' ? { pantallas: nuevas } : { mesas: nuevas },
        }),
      'Guardamos sus terminales.',
    );
  }

  protected nombreRol(rol: RolEvento): string {
    return NOMBRES_ROL[rol];
  }

  protected queHace(rol: RolInvitable): string {
    return QUE_HACE[rol];
  }

  protected nombreEstado(estado: MiembroEquipo['estado']): string {
    return ESTADOS[estado];
  }

  protected canManage(miembro: MiembroEquipo): boolean {
    const miRol = this.miRol();
    return miRol !== null && canManageRol(miRol, miembro.rol);
  }

  protected async submit(evento: Event): Promise<void> {
    evento.preventDefault();
    const actual = this.actual.evento();
    if (!actual || this.enviando()) return;
    if (!this.valido()) {
      // El texto sale del esquema de libs/dominio.
      const issue = esquemaEmail.safeParse(this.email()).error?.issues[0];
      this.errorEmail.set(issue?.message ?? null);
      return;
    }
    this.enviando.set(true);
    this.errorEmail.set(null);
    this.mensaje.set(null);
    try {
      const tope = this.rol() === 'registrador' && this.tope() ? Number(this.tope()) : null;
      await this.api.inviteMiembro(actual.id, {
        email: this.email().trim(),
        ...(this.nombre().trim() ? { nombre: this.nombre().trim() } : {}),
        rol: this.rol(),
        ...(tope ? { topeRegistrosPuerta: tope } : {}),
        ...(this.rol() === 'operador_stand'
          ? { terminales: { pantallas: this.asignadas() } }
          : this.rol() === 'operador_mesa'
            ? { terminales: { mesas: this.asignadas() } }
            : {}),
      });
      this.asignadas.set([]);
      this.avisos.ok(`Enviamos la invitación a ${this.email().trim()}. Vale 7 días.`);
      this.invitando.set(false);
      this.email.set('');
      this.nombre.set('');
      this.tope.set('');
      await this.load();
    } catch (error) {
      this.errorEmail.set(getErrorCampo(error, 'email'));
      if (!this.errorEmail()) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
      }
    } finally {
      this.enviando.set(false);
    }
  }

  protected async resend(miembro: MiembroEquipo): Promise<void> {
    await this.run(
      () => this.api.resendMiembro(miembro.id),
      `Reenviamos la invitación a ${miembro.email}.`,
    );
  }

  protected async updateRol(miembro: MiembroEquipo, rol: string): Promise<void> {
    if (rol === miembro.rol) {
      return;
    }
    await this.run(
      () => this.api.updateMiembro(miembro.id, { rol }),
      `Ahora ${miembro.nombre ?? miembro.email} es ${NOMBRES_ROL[rol as RolEvento].toLowerCase()}.`,
    );
  }

  protected async remove(miembro: MiembroEquipo): Promise<void> {
    const quien = miembro.nombre ?? miembro.email;
    if (!window.confirm(`${quien} va a perder el acceso a este evento al instante. ¿Quitar?`)) {
      return;
    }
    await this.run(() => this.api.removeMiembro(miembro.id), `Quitamos a ${quien} del equipo.`);
  }

  private async run(paso: () => Promise<void>, exito: string): Promise<void> {
    this.mensaje.set(null);
    try {
      await paso();
      this.avisos.ok(exito);
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const actual = this.actual.evento();
    if (!actual) return;
    try {
      const [miembros, pantallas, mesas] = await Promise.all([
        this.api.listMiembros(actual.id),
        this.api.listTerminales(actual.id, 'pantalla'),
        this.api.listTerminales(actual.id, 'mesa'),
      ]);
      this.miembros.set(miembros);
      this.pantallas.set(pantallas);
      this.mesas.set(mesas);
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
