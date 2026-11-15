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
import { getErrorCampo, getMensajeError, valorDe } from '@pasitos/panel';
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
import { EventosApi, type MiembroEquipo } from './eventos-api.service';

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
  ],
  template: `
    <header class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="font-display text-3xl font-extrabold">Equipo</h1>
      @if (!invitando()) {
        <button type="button" pxBoton (click)="invitando.set(true)">Invitar</button>
      }
    </header>
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }

    @if (invitando()) {
      <px-tarjeta>
        <h2 class="mb-3 text-xl font-bold">Invitar al equipo</h2>
        <form class="flex flex-col gap-4" (submit)="submit($event)" novalidate>
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
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1 font-bold">Rol</legend>
            @for (opcion of rolesDisponibles(); track opcion) {
              <label class="px-opcion">
                <input
                  type="radio"
                  name="rol"
                  [value]="opcion"
                  [checked]="rol() === opcion"
                  (change)="rol.set(opcion)"
                />
                <span>
                  <span class="px-opcion__titulo">{{ nombreRol(opcion) }}</span>
                  <span class="px-opcion__detalle">{{ queHace(opcion) }}</span>
                </span>
              </label>
            }
          </fieldset>
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
            <px-aviso variante="info"
              >Las pantallas y mesas se asignan cuando existan (pantallas y mesas del
              evento).</px-aviso
            >
          }
          <div class="flex gap-3">
            <button type="submit" pxBoton [cargando]="enviando()" [deshabilitado]="!valido()">
              {{ enviando() ? 'Invitando…' : 'Enviar la invitación' }}
            </button>
            <button type="button" pxBoton="secundario" (click)="invitando.set(false)">
              Cancelar
            </button>
          </div>
        </form>
      </px-tarjeta>
    }

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
            </div>
            @if (canManage(miembro)) {
              <div class="mt-3 flex flex-wrap gap-2">
                @if (miembro.estado !== 'activo') {
                  <button
                    type="button"
                    pxBoton="secundario"
                    [chico]="true"
                    (click)="resend(miembro)"
                  >
                    Reenviar
                  </button>
                }
                <label class="flex items-center gap-2 text-sm">
                  Cambiar rol
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
                <button type="button" pxBoton="peligro" [chico]="true" (click)="remove(miembro)">
                  Quitar
                </button>
              </div>
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
    if (!actual || !this.valido() || this.enviando()) {
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
      });
      this.mensaje.set({
        variante: 'ok',
        texto: `Enviamos la invitación a ${this.email().trim()}. Vale 7 días.`,
      });
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
      this.mensaje.set({ variante: 'ok', texto: exito });
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.load();
  }

  private async load(): Promise<void> {
    const actual = this.actual.evento();
    if (!actual) return;
    try {
      this.miembros.set(await this.api.listMiembros(actual.id));
      this.estado.set('listo');
    } catch (error) {
      this.traceId.set(error instanceof ErrorApi ? error.traceId : null);
      this.estado.set('error');
    }
  }
}
