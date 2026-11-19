import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EncabezadoComponent } from '@pasitos/ui';
import { TEXTOS_LANDING } from './landing/textos';

/**
 * Sitio público (D37): el encabezado con las secciones, la página y el pie con los términos y la
 * privacidad. Los enlaces son normales (sin router): cada página llega prerenderizada.
 */
@Component({
  selector: 'sit-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EncabezadoComponent],
  template: `
    <px-encabezado />
    <nav
      aria-label="Secciones"
      class="text-muted mx-auto flex max-w-5xl flex-wrap gap-x-5 gap-y-1 px-5 pt-3 text-sm"
    >
      <a href="/#como-funciona" class="hover:underline">Cómo funciona</a>
      <a href="/#preguntas" class="hover:underline">Preguntas</a>
      <a href="/#contacto" class="hover:underline">Contacto</a>
      <a href="/admin/" class="hover:underline">Ingresar</a>
    </nav>
    <main class="mx-auto flex max-w-5xl flex-col gap-14 px-5 py-10">
      <router-outlet />
    </main>
    <footer class="border-line text-muted mx-auto max-w-5xl border-t px-5 py-6 text-sm">
      <nav aria-label="Información legal" class="flex flex-wrap gap-4">
        <a href="/terminos" class="underline">Términos</a>
        <a href="/privacidad" class="underline">Privacidad</a>
        <a href="/#contacto" class="underline">Contacto</a>
      </nav>
      <p class="mt-2">{{ pie }}</p>
    </footer>
  `,
})
export class AppComponent {
  protected readonly pie = TEXTOS_LANDING.pie;
}
