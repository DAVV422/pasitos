import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AvisoComponent, EncabezadoComponent } from '@pasitos/ui';

/**
 * Raíz de la app. En la fase 0 muestra solo su nombre; las pantallas llegan con sus HU
 * (Aplicaciones web).
 */
@Component({
  selector: 'plt-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, EncabezadoComponent, AvisoComponent],
  template: `
    <px-encabezado />
    <main class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-6">
      <h1 class="text-3xl font-extrabold">Consola de plataforma</h1>
      <p class="text-muted">Organizaciones, mensajes de contacto y salud del sistema.</p>
      <px-aviso variante="info">Versión en construcción · fase 0.</px-aviso>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
