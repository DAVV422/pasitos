import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { CampoComponent } from '@pasitos/ui';
import { getFuerzaPassword, TEXTOS_FUERZA } from '../sesion/fuerza';
import { valorDe } from './comun';

/** Campo de contraseña nueva con el indicador de fuerza (HU-201 §2). */
@Component({
  selector: 'pnl-password-nueva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CampoComponent],
  template: `
    <px-campo [etiqueta]="etiqueta()" [error]="error()" #campo="pxCampo">
      <div class="flex gap-2">
        <input
          class="flex-1"
          [id]="campo.idControl"
          [attr.aria-describedby]="campo.idDescripcion + ' ' + idFuerza"
          [type]="ver() ? 'text' : 'password'"
          name="password-nueva"
          autocomplete="new-password"
          [value]="valor()"
          (input)="valor.set(valorDe($event))"
        />
        <button
          type="button"
          class="px-boton px-boton--secundario px-boton--chico"
          [attr.aria-pressed]="ver()"
          (click)="ver.set(!ver())"
        >
          {{ ver() ? 'Ocultar' : 'Ver' }}
        </button>
      </div>
      <div class="mt-2 flex gap-1" aria-hidden="true">
        @for (barra of [1, 2, 3, 4]; track barra) {
          <span
            class="h-1.5 flex-1 rounded-full"
            [class.bg-line]="barra > nivel()"
            [class.bg-danger]="barra <= nivel() && nivel() <= 2"
            [class.bg-success]="barra <= nivel() && nivel() > 2"
          ></span>
        }
      </div>
      <p class="text-muted mt-1 text-sm" [id]="idFuerza" aria-live="polite">
        {{
          texto() ||
            'Usa al menos 8 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.'
        }}
      </p>
    </px-campo>
  `,
})
export class PasswordNuevaComponent {
  readonly etiqueta = input('Contraseña nueva');
  readonly error = input<string | null>(null);
  readonly valor = model('');

  protected readonly ver = signal(false);
  protected readonly idFuerza = `pnl-fuerza-${Math.random().toString(36).slice(2, 8)}`;
  private readonly fuerza = computed(() => getFuerzaPassword(this.valor()));
  protected readonly nivel = computed(
    () => ({ vacia: 0, corta: 1, debil: 2, buena: 3, muy_buena: 4 })[this.fuerza()],
  );
  protected readonly texto = computed(() => TEXTOS_FUERZA[this.fuerza()]);
  protected readonly valorDe = valorDe;
}
