import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EncabezadoComponent } from '@pasitos/ui';
import { ErrorApi } from '@pasitos/web-core';

/** Marco de las pantallas de acceso: encabezado y una columna angosta centrada. */
@Component({
  selector: 'pnl-marco-acceso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoComponent],
  template: `
    <px-encabezado />
    <!-- Pantallas de una sola acción (Entrar, Confirmar): los botones van de punta a punta. -->
    <main
      class="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pt-8 pb-12"
      style="--boton-ancho: 100%; --boton-alinear: stretch"
    >
      <header class="flex flex-col gap-1">
        <h1 class="font-display text-3xl font-extrabold">{{ titulo() }}</h1>
        @if (bajada(); as texto) {
          <p class="text-muted">{{ texto }}</p>
        }
      </header>
      <ng-content />
    </main>
  `,
})
export class MarcoAccesoComponent {
  readonly titulo = input.required<string>();
  readonly bajada = input<string | null>(null);
}

/** El texto para la persona: el del API (que sale del catálogo de libs/dominio). */
export function getMensajeError(error: unknown): string {
  return error instanceof ErrorApi ? error.detail : 'Algo salió mal. Intenta de nuevo.';
}

/** Error de un campo de VALIDACION, si lo hay. */
export function getErrorCampo(error: unknown, campo: string): string | null {
  return error instanceof ErrorApi
    ? (error.errors.find((e) => e.field === campo)?.message ?? null)
    : null;
}

/** Segundos de espera de DEMASIADOS_INTENTOS. */
export function getEspera(error: unknown): number | null {
  if (!(error instanceof ErrorApi) || error.code !== 'DEMASIADOS_INTENTOS') {
    return null;
  }
  const segundos = error.meta['reintentarEnSegundos'];
  return typeof segundos === 'number' ? segundos : 60;
}

/** Solo rutas internas del panel (nada de `//otro-sitio` ni `https://…`). */
export function toVolverSeguro(volver: string | null | undefined): string {
  return volver && volver.startsWith('/') && !volver.startsWith('//') ? volver : '/';
}

/** Lee el valor de un `<input>` desde su evento. */
export function valorDe(evento: Event): string {
  return (evento.target as HTMLInputElement).value;
}
