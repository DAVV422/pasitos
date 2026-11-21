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
    <div class="border-line bg-surface/80 sticky top-0 z-10 border-b backdrop-blur-sm">
      <nav
        aria-label="Secciones"
        class="text-muted mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 text-sm font-medium"
      >
        <a href="/eventos" class="hover:text-text hover:underline">Eventos</a>
        <a href="/#como-funciona" class="hover:text-text hover:underline">Cómo funciona</a>
        <a href="/#preguntas" class="hover:text-text hover:underline">Preguntas</a>
        <a href="/#contacto" class="hover:text-text hover:underline">Contacto</a>
        <a
          href="/admin/"
          class="border-line bg-surface text-text hover:border-points ml-auto rounded-lg border px-3 py-1 font-semibold transition-colors"
          >Ingresar</a
        >
      </nav>
    </div>
    <main class="mx-auto flex max-w-5xl flex-col gap-16 px-5 py-10 sm:py-14">
      <router-outlet />
    </main>
    <footer class="border-line text-muted mx-auto max-w-5xl border-t px-5 py-8 text-sm">
      <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <nav aria-label="Información legal" class="flex flex-wrap gap-4 font-medium">
          <a href="/terminos" class="hover:text-text underline">Términos</a>
          <a href="/privacidad" class="hover:text-text underline">Privacidad</a>
          <a href="/#contacto" class="hover:text-text underline">Contacto</a>
        </nav>
        <p>{{ pie }}</p>
      </div>
    </footer>
  `,
})
export class AppComponent {
  protected readonly pie = TEXTOS_LANDING.pie;
}
