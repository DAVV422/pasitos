import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { getMensajeError } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, CampoComponent, ChipComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';
import { EventoActualService } from './evento.layout';
import { PuertaApi, type FichaPuerta } from './puerta-api.service';

interface Candidato {
  readonly id: string;
  readonly codigo: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly presente: boolean;
}

/**
 * Registrar a alguien nuevo en la puerta (HU-303 §2, mockup PU4): nombre y, si quiere, correo.
 * Con un nombre parecido pregunta *"¿Es alguna de estas personas?"* antes de crear.
 */
@Component({
  selector: 'adm-registro-puerta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, CampoComponent, ChipComponent],
  template: `
    <section class="border-line bg-surface flex flex-col gap-4 rounded-xl border p-5">
      <h2 class="text-xl font-bold">Registrar a alguien nuevo</h2>
      @if (restantes() !== null) {
        <p class="text-muted text-sm" data-testid="restantes">
          Te quedan {{ restantes() }} {{ restantes() === 1 ? 'registro' : 'registros' }}.
        </p>
      }
      @if (candidatos().length > 0) {
        <div class="flex flex-col gap-2" role="group" aria-labelledby="parecidos">
          <p id="parecidos" class="font-semibold">¿Es alguna de estas personas?</p>
          @for (c of candidatos(); track c.id) {
            <button
              type="button"
              class="border-line flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left"
              (click)="elegida.emit(c.id)"
            >
              <span class="flex flex-col">
                <b>{{ c.nombre }}</b>
                <span class="text-muted text-sm"
                  >{{ c.codigo }}{{ c.email ? ' · ' + c.email : '' }}</span
                >
              </span>
              @if (c.presente) {
                <px-chip variante="ok">Presente</px-chip>
              }
            </button>
          }
          <button pxBoton="secundario" type="button" [cargando]="guardando()" (click)="save(true)">
            Es otra persona, registrar
          </button>
        </div>
      } @else {
        <px-campo #campoNombre="pxCampo" etiqueta="Nombre y apellido" [error]="errorNombre()">
          <input
            [id]="campoNombre.idControl"
            [attr.aria-describedby]="campoNombre.idDescripcion"
            autocomplete="off"
            maxlength="80"
            [value]="nombre()"
            (input)="nombre.set($any($event.target).value)"
          />
        </px-campo>
        <px-campo
          #campoEmail="pxCampo"
          etiqueta="Correo"
          [opcional]="true"
          ayuda="Le llega un aviso con su código de asistente."
          [error]="errorEmail()"
        >
          <input
            [id]="campoEmail.idControl"
            [attr.aria-describedby]="campoEmail.idDescripcion"
            type="email"
            autocomplete="off"
            inputmode="email"
            [value]="email()"
            (input)="email.set($any($event.target).value)"
          />
        </px-campo>
        @if (pideCelular() !== 'no') {
          <!-- HU-411. -->
          <px-campo
            #campoCelular="pxCampo"
            etiqueta="Celular"
            [opcional]="pideCelular() === 'opcional'"
            ayuda="Ejemplo: 71234567. De otro país, con el código: +54…"
            [error]="errorCelular()"
          >
            <input
              [id]="campoCelular.idControl"
              [attr.aria-describedby]="campoCelular.idDescripcion"
              type="tel"
              autocomplete="off"
              inputmode="tel"
              maxlength="30"
              data-testid="celular"
              [value]="celular()"
              (input)="celular.set($any($event.target).value)"
            />
          </px-campo>
        }
        <button
          pxBoton
          type="button"
          [deshabilitado]="nombre().trim().length < 2"
          [cargando]="guardando()"
          (click)="save(false)"
        >
          Registrar
        </button>
      }
      @if (error(); as e) {
        <px-aviso variante="peligro">{{ e }}</px-aviso>
      }
      <button pxBoton="secundario" type="button" (click)="cancelado.emit()">Cancelar</button>
    </section>
  `,
})
export class RegistroPuertaComponent {
  private readonly api = inject(PuertaApi);
  private readonly actual = inject(EventoActualService);

  readonly eventoId = input.required<string>();
  readonly restantes = input<number | null>(null);
  /** La persona nueva, ya presente: la página abre su ficha. */
  readonly registrada = output<FichaPuerta>();
  /** Era alguien de la lista: la página abre su ficha. */
  readonly elegida = output<string>();
  readonly cancelado = output<void>();

  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly celular = signal('');
  /** HU-411: `no`, `opcional` u `obligatorio`, según las reglas del evento. */
  protected readonly pideCelular = computed(
    () => this.actual.evento()?.reglas?.pedirCelular ?? 'opcional',
  );
  protected readonly candidatos = signal<readonly Candidato[]>([]);
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly erroresCampo = signal<readonly { field: string; message: string }[]>([]);
  protected readonly errorNombre = computed(
    () => this.erroresCampo().find((e) => e.field === 'nombre')?.message ?? null,
  );
  protected readonly errorEmail = computed(
    () => this.erroresCampo().find((e) => e.field === 'email')?.message ?? null,
  );
  protected readonly errorCelular = computed(
    () => this.erroresCampo().find((e) => e.field === 'celular')?.message ?? null,
  );
  /** La misma clave para "Es otra persona": es el mismo intento. */
  private clave = crypto.randomUUID();

  protected async save(confirmarDuplicado: boolean): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    this.erroresCampo.set([]);
    try {
      const ficha = await this.api.registerNuevo(
        this.eventoId(),
        {
          nombre: this.nombre().trim(),
          ...(this.email().trim() ? { email: this.email().trim() } : {}),
          ...(this.pideCelular() !== 'no' && this.celular().trim()
            ? { celular: this.celular().trim() }
            : {}),
          ...(confirmarDuplicado ? { confirmarDuplicado: true } : {}),
        },
        this.clave,
      );
      this.registrada.emit(ficha);
    } catch (error) {
      this.clave = crypto.randomUUID();
      if (error instanceof ErrorApi && error.code === 'ASISTENTE_POSIBLE_DUPLICADO') {
        this.candidatos.set((error.meta['candidatos'] as Candidato[] | undefined) ?? []);
      } else if (error instanceof ErrorApi && error.errors.length > 0) {
        this.erroresCampo.set(error.errors);
      } else {
        this.candidatos.set([]);
        this.error.set(getMensajeError(error));
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
