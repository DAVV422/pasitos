import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EncabezadoComponent } from '@pasitos/ui';

/** Sitio público (D37): el encabezado, la página y el pie con los términos y la privacidad. */
@Component({
  selector: 'sit-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EncabezadoComponent],
  template: `
    <px-encabezado />
    <main class="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-12">
      <router-outlet />
    </main>
    <footer class="border-line text-muted mx-auto max-w-3xl border-t px-5 py-6 text-sm">
      <nav aria-label="Información legal" class="flex flex-wrap gap-4">
        <a href="/terminos" class="underline">Términos</a>
        <a href="/privacidad" class="underline">Privacidad</a>
      </nav>
      <p class="mt-2">Piloto en la red de pruebas de Stellar.</p>
    </footer>
  `,
})
export class AppComponent {}
