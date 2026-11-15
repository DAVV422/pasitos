import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnInit,
  signal,
} from '@angular/core';
import { esquemaEditarEvento } from '@pasitos/dominio/esquemas';
import { getErrorCampo, getMensajeError, valorDe } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, CampoComponent, TarjetaComponent } from '@pasitos/ui';
import { EventoActualService } from './evento.layout';
import { EventosApi, type MiembroEquipo, type ReglasEvento } from './eventos-api.service';

const EN_MARCHA = new Set(['en_curso', 'pausado']);
const CAMPOS = ['topeRegistrosPuerta', 'puntosCheckIn', 'topePuntosPersona', 'topeAjuste'] as const;

interface Formulario {
  registroPuertaActivo: boolean;
  topeRegistrosPuerta: string;
  puntosCheckIn: string;
  retosRequierenCheckIn: boolean;
  topePuntosPersona: string;
  topeAjuste: string;
}

const toTexto = (n: number | null) => (n === null ? '' : String(n));
const toNumero = (t: string) => (t.trim() === '' ? null : Number(t));

/** Reglas y puerta (HU-212 §2), dentro de la configuración del evento. */
@Component({
  selector: 'adm-reglas-puerta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, CampoComponent, TarjetaComponent],
  template: `
    @if (mensaje(); as aviso) {
      <px-aviso [variante]="aviso.variante">{{ aviso.texto }}</px-aviso>
    }
    <px-tarjeta>
      <form class="flex flex-col gap-4" (submit)="save($event)" novalidate>
        <h2 class="text-xl font-bold">Registro en la puerta</h2>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            role="switch"
            [checked]="form().registroPuertaActivo"
            (change)="set('registroPuertaActivo', !form().registroPuertaActivo)"
          />
          Se puede registrar a personas nuevas en la puerta
        </label>
        <px-campo
          etiqueta="Tope de registros del evento"
          [opcional]="true"
          ayuda="Vacío: sin límite. De 1 a 10 000."
          [error]="errores()['topeRegistrosPuerta'] ?? null"
          #c1="pxCampo"
        >
          <input
            [id]="c1.idControl"
            [attr.aria-describedby]="c1.idDescripcion"
            type="number"
            min="1"
            max="10000"
            [value]="form().topeRegistrosPuerta"
            (input)="set('topeRegistrosPuerta', valorDe($event))"
          />
        </px-campo>
        @if (registrosPuerta() > 0) {
          <p class="text-muted text-sm">
            Ya hay {{ registrosPuerta() }} registros en la puerta. Un tope menor solo frena los
            siguientes.
          </p>
        }

        <h2 class="mt-2 text-xl font-bold">Puntos</h2>
        <px-campo
          etiqueta="Puntos de bienvenida"
          ayuda="Se suman cuando la persona pasa por la puerta. De 0 a 1000."
          [error]="errores()['puntosCheckIn'] ?? null"
          #c2="pxCampo"
        >
          <input
            [id]="c2.idControl"
            [attr.aria-describedby]="c2.idDescripcion"
            type="number"
            min="0"
            max="1000"
            [value]="form().puntosCheckIn"
            (input)="set('puntosCheckIn', valorDe($event))"
          />
        </px-campo>
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            [checked]="form().retosRequierenCheckIn"
            (change)="set('retosRequierenCheckIn', !form().retosRequierenCheckIn)"
          />
          Los retos requieren check-in (haber pasado por la puerta)
        </label>
        <div class="grid gap-4 md:grid-cols-2">
          <px-campo
            etiqueta="Tope de puntos por persona"
            [opcional]="true"
            ayuda="Lo máximo que puede ganar una persona. Vacío: sin tope."
            [error]="errores()['topePuntosPersona'] ?? null"
            #c3="pxCampo"
          >
            <input
              [id]="c3.idControl"
              [attr.aria-describedby]="c3.idDescripcion"
              type="number"
              min="1"
              max="1000000"
              [value]="form().topePuntosPersona"
              (input)="set('topePuntosPersona', valorDe($event))"
            />
          </px-campo>
          <px-campo
            etiqueta="Tope por ajuste manual"
            ayuda="Lo máximo que se suma o resta en un ajuste. De 1 a 10 000."
            [error]="errores()['topeAjuste'] ?? null"
            #c4="pxCampo"
          >
            <input
              [id]="c4.idControl"
              [attr.aria-describedby]="c4.idDescripcion"
              type="number"
              min="1"
              max="10000"
              [value]="form().topeAjuste"
              (input)="set('topeAjuste', valorDe($event))"
            />
          </px-campo>
        </div>
        <button type="submit" pxBoton [cargando]="guardando()" class="self-start">Guardar</button>
      </form>
    </px-tarjeta>

    <px-tarjeta>
      <h2 class="mb-2 text-xl font-bold">Tope por registrador</h2>
      <p class="text-muted mb-3 text-sm">
        Vacío: solo cuenta el del evento. Si hay los dos, frena el primero que se alcance.
      </p>
      @for (r of registradores(); track r.id) {
        <div class="flex flex-wrap items-end gap-3 py-2">
          <span class="min-w-40 grow">{{ r.nombre ?? r.email }}</span>
          <label class="flex flex-col text-sm">
            Tope
            <input
              type="number"
              min="1"
              max="100000"
              class="w-28"
              [attr.aria-label]="'Tope de ' + (r.nombre ?? r.email)"
              [value]="r.topeRegistrosPuerta ?? ''"
              (change)="saveTopeRegistrador(r, valorDe($event))"
            />
          </label>
        </div>
      } @empty {
        <p class="text-muted text-sm">Todavía no hay registradores en el equipo.</p>
      }
    </px-tarjeta>
  `,
})
export class ReglasPuertaComponent implements OnInit {
  private readonly api = inject(EventosApi);
  private readonly actual = inject(EventoActualService);

  protected readonly form = signal<Formulario>(this.toFormulario(null));
  protected readonly registradores = signal<readonly MiembroEquipo[]>([]);
  protected readonly guardando = signal(false);
  protected readonly errores = signal<Record<string, string | null>>({});
  protected readonly mensaje = signal<{ variante: 'ok' | 'peligro'; texto: string } | null>(null);
  protected readonly registrosPuerta = computed(
    () => this.actual.evento()?.contadores.registrosPuerta ?? 0,
  );
  private readonly enMarcha = computed(() => EN_MARCHA.has(this.actual.evento()?.estado ?? ''));
  protected readonly valorDe = valorDe;

  ngOnInit(): void {
    this.form.set(this.toFormulario(this.actual.evento()?.reglas ?? null));
    void this.loadRegistradores();
  }

  protected set<K extends keyof Formulario>(campo: K, valor: Formulario[K]): void {
    this.form.set({ ...this.form(), [campo]: valor });
  }

  protected async save(evento: Event): Promise<void> {
    evento.preventDefault();
    const e = this.actual.evento();
    if (!e) return;
    const f = this.form();
    const cambios = {
      registroPuertaActivo: f.registroPuertaActivo,
      topeRegistrosPuerta: toNumero(f.topeRegistrosPuerta),
      puntosCheckIn: Number(f.puntosCheckIn),
      retosRequierenCheckIn: f.retosRequierenCheckIn,
      topePuntosPersona: toNumero(f.topePuntosPersona),
      topeAjuste: Number(f.topeAjuste),
    };
    const validado = esquemaEditarEvento.safeParse(cambios);
    if (!validado.success) {
      this.errores.set(
        Object.fromEntries(validado.error.issues.map((i) => [String(i.path[0]), i.message])),
      );
      return;
    }
    if (
      this.enMarcha() &&
      !window.confirm('El evento está en curso: el cambio vale desde ahora.')
    ) {
      return;
    }
    this.guardando.set(true);
    this.errores.set({});
    this.mensaje.set(null);
    try {
      const actualizado = await this.api.updateEvento(e.id, cambios);
      this.actual.set(actualizado);
      this.form.set(this.toFormulario(actualizado.reglas));
      this.mensaje.set({ variante: 'ok', texto: 'Guardado.' });
    } catch (error) {
      this.errores.set(Object.fromEntries(CAMPOS.map((c) => [c, getErrorCampo(error, c)])));
      if (CAMPOS.every((c) => !getErrorCampo(error, c))) {
        this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
      }
    } finally {
      this.guardando.set(false);
    }
  }

  protected async saveTopeRegistrador(miembro: MiembroEquipo, valor: string): Promise<void> {
    const tope = toNumero(valor);
    if (tope === miembro.topeRegistrosPuerta) return;
    if (
      this.enMarcha() &&
      !window.confirm('El evento está en curso: el cambio vale desde ahora.')
    ) {
      await this.loadRegistradores();
      return;
    }
    this.mensaje.set(null);
    try {
      await this.api.updateMiembro(miembro.id, { topeRegistrosPuerta: tope });
      this.mensaje.set({
        variante: 'ok',
        texto: `Guardamos el tope de ${miembro.nombre ?? miembro.email}.`,
      });
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
    await this.loadRegistradores();
  }

  private async loadRegistradores(): Promise<void> {
    const e = this.actual.evento();
    if (!e) return;
    try {
      const miembros = await this.api.listMiembros(e.id);
      this.registradores.set(
        miembros.filter((m) => m.rol === 'registrador' && m.estado !== 'revocado'),
      );
    } catch (error) {
      this.mensaje.set({ variante: 'peligro', texto: getMensajeError(error) });
    }
  }

  private toFormulario(reglas: ReglasEvento | null): Formulario {
    return {
      registroPuertaActivo: reglas?.registroPuertaActivo ?? true,
      topeRegistrosPuerta: toTexto(reglas?.topeRegistrosPuerta ?? null),
      puntosCheckIn: String(reglas?.puntosCheckIn ?? 0),
      retosRequierenCheckIn: reglas?.retosRequierenCheckIn ?? true,
      topePuntosPersona: toTexto(reglas?.topePuntosPersona ?? null),
      topeAjuste: String(reglas?.topeAjuste ?? 100),
    };
  }
}
