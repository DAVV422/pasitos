import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BotonDirective, EncabezadoComponent } from '@pasitos/ui';

/** Sitio público (D37). En la fase 0, solo la portada; la landing completa es HU-404. */
@Component({
  selector: 'sit-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EncabezadoComponent, BotonDirective],
  template: `
    <px-encabezado />
    <main class="mx-auto flex max-w-3xl flex-col gap-5 px-5 py-12">
      <h1 class="text-5xl font-extrabold tracking-tight">Cada paso cuenta.</h1>
      <p class="text-xl text-muted">Puntos por quedarse, reportes que se pueden comprobar.</p>
      <div><a pxBoton="secundario" [chico]="true" href="/app/">Ir a la app del asistente</a></div>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
