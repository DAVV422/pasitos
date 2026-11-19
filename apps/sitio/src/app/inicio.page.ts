import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BotonDirective } from '@pasitos/ui';

/** La portada mínima de la fase 0. La landing completa llega con HU-404. */
@Component({
  selector: 'sit-inicio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective],
  template: `
    <h1 class="text-5xl font-extrabold tracking-tight">Cada paso cuenta.</h1>
    <p class="text-xl text-muted">Puntos por quedarse, reportes que se pueden comprobar.</p>
    <div><a pxBoton="secundario" [chico]="true" href="/app/">Ir a la app del asistente</a></div>
  `,
})
export class InicioPage {}
