import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BotonDirective, IconoComponent } from '@pasitos/ui';

/**
 * Las pantallas que llegan en las siguientes historias de la fase 3 (escanear, HU-310; canjear,
 * HU-313). Así la navegación ya tiene su lugar y nada falla al tocarla.
 */
@Component({
  selector: 'app-pendiente-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BotonDirective, IconoComponent, RouterLink],
  template: `
    <section class="flex flex-col items-center gap-4 pt-10 text-center">
      <px-icono nombre="clock" [tamano]="56" />
      <h1 class="text-2xl font-extrabold">{{ titulo }}</h1>
      <p class="text-muted">Esta parte de Pasitos llega muy pronto.</p>
      <a pxBoton="secundario" routerLink="/inicio">Volver a Inicio</a>
    </section>
  `,
})
export class PendientePage {
  protected readonly titulo: string =
    (inject(ActivatedRoute).snapshot.data['titulo'] as string | undefined) ?? 'Muy pronto';
}
