import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EncabezadoComponent } from '@pasitos/ui';

/** Raíz de la app del asistente: el encabezado y la pantalla de la ruta (Aplicaciones web §2). */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EncabezadoComponent],
  template: `
    <px-encabezado />
    <main class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-6 pb-10">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
