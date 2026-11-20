import { ChangeDetectionStrategy, Component, type OnInit, signal } from '@angular/core';
import { BotonDirective } from '@pasitos/ui';
import { ASISTENTES, sendContacto, TIPOS_EVENTO, TURNSTILE_LLAVE_SITIO } from './contacto';

/**
 * El formulario de contacto de la landing (HU-410 §2). Liviano a propósito (el sitio tiene 80 KB):
 * los campos son HTML y al enviar se leen del propio formulario. Lleva un campo trampa oculto para
 * los robots y, si hay llave, Turnstile (que se descarga solo en ese caso).
 */
@Component({
  selector: 'sit-contacto-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective],
  template: `
    @if (enviado()) {
      <p class="text-success text-lg font-bold" role="status" data-testid="contacto-enviado">
        Gracias, te escribiremos pronto.
      </p>
    } @else {
      <form class="flex flex-col gap-4" (submit)="send($event)" data-testid="contacto-form">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1"
            ><b>Nombre</b>
            <input name="nombre" required minlength="2" maxlength="100" autocomplete="name" />
            <span class="text-danger text-sm">{{ errores()['nombre'] }}</span>
          </label>
          <label class="flex flex-col gap-1"
            ><b>Correo</b>
            <input name="email" type="email" required maxlength="254" autocomplete="email" />
            <span class="text-danger text-sm">{{ errores()['email'] }}</span>
          </label>
          <label class="flex flex-col gap-1"
            ><b>Organización <span class="text-muted font-normal">(opcional)</span></b>
            <input name="organizacion" maxlength="120" autocomplete="organization" />
          </label>
          <label class="flex flex-col gap-1"
            ><b>Tipo de evento <span class="text-muted font-normal">(opcional)</span></b>
            <select name="tipoEvento">
              <option value="">Elige uno</option>
              @for (t of tipos; track t.valor) {
                <option [value]="t.valor">{{ t.texto }}</option>
              }
            </select>
          </label>
          <label class="flex flex-col gap-1"
            ><b>Asistentes aproximados <span class="text-muted font-normal">(opcional)</span></b>
            <select name="asistentesAprox">
              <option value="">Elige uno</option>
              @for (a of cantidades; track a.valor) {
                <option [value]="a.valor">{{ a.texto }}</option>
              }
            </select>
          </label>
        </div>
        <label class="flex flex-col gap-1"
          ><b>Cuéntanos de tu evento</b>
          <textarea name="mensaje" required minlength="10" maxlength="2000" rows="4"></textarea>
          <span class="text-danger text-sm">{{ errores()['mensaje'] }}</span>
        </label>
        <!-- La trampa: fuera de la vista de las personas; los robots la llenan. -->
        <input
          name="sitioWeb"
          class="sit-trampa"
          tabindex="-1"
          autocomplete="off"
          aria-hidden="true"
        />
        <label class="flex items-start gap-2">
          <input type="checkbox" name="aceptaPrivacidad" required class="mt-1 h-5 w-5" />
          <span
            >Acepto la
            <a href="/privacidad" target="_blank" rel="noopener" class="underline"
              >política de privacidad</a
            >.</span
          >
        </label>
        <div id="sit-turnstile"></div>
        @if (error(); as e) {
          <p class="text-danger" role="alert">{{ e }}</p>
        }
        <div>
          <button type="submit" pxBoton [cargando]="enviando()">Enviar</button>
        </div>
      </form>
    }
  `,
  styles: `
    sit-contacto-form input:not([type='checkbox']),
    sit-contacto-form select,
    sit-contacto-form textarea {
      padding: 0.75rem;
      border: 1px solid var(--line);
      border-radius: 0.5rem;
      background: var(--surface);
    }
    .sit-trampa {
      position: absolute;
      left: -9999px;
    }
  `,
})
export class ContactoFormComponent implements OnInit {
  protected readonly tipos = TIPOS_EVENTO;
  protected readonly cantidades = ASISTENTES;
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errores = signal<Readonly<Record<string, string>>>({});

  ngOnInit(): void {
    // Solo con llave, y solo en el navegador: el código de Turnstile ni se descarga si no.
    if (TURNSTILE_LLAVE_SITIO && typeof document !== 'undefined') {
      void import('./turnstile-widget').then((m) => m.renderTurnstile(TURNSTILE_LLAVE_SITIO));
    }
  }

  protected async send(evento: Event): Promise<void> {
    evento.preventDefault();
    const formulario = evento.target as HTMLFormElement;
    if (this.enviando() || !formulario.reportValidity()) return;
    const datos = Object.fromEntries(new FormData(formulario)) as Record<string, unknown>;
    datos['aceptaPrivacidad'] = datos['aceptaPrivacidad'] === 'on';
    if (datos['cf-turnstile-response']) datos['turnstile'] = datos['cf-turnstile-response'];
    delete datos['cf-turnstile-response'];
    this.enviando.set(true);
    this.error.set(null);
    this.errores.set({});
    const resultado = await sendContacto(datos);
    this.enviando.set(false);
    if (resultado.ok) {
      this.enviado.set(true);
      return;
    }
    this.errores.set(resultado.campos ?? {});
    this.error.set(resultado.mensaje ?? null);
  }
}
