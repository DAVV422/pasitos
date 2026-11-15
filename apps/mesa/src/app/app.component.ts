import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EncabezadoComponent } from '@pasitos/ui';

/** Raíz de la app: el encabezado y la pantalla que toca (HU-209: conectar). */
@Component({
  selector: 'mesa-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EncabezadoComponent],
  template: `
    <px-encabezado />
    <main class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-6">
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
