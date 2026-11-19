import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BotonDirective } from '@pasitos/ui';

/** Una dirección que no existe: responde 404 (ver `app.routes.server.ts`). */
@Component({
  selector: 'sit-no-encontrado-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-5' },
  imports: [BotonDirective],
  template: `
    <h1 class="text-4xl font-extrabold">Página no encontrada</h1>
    <p class="text-muted text-lg">La dirección no existe o cambió.</p>
    <div><a pxBoton="secundario" href="/">Ir al inicio</a></div>
  `,
})
export class NoEncontradoPage {}
