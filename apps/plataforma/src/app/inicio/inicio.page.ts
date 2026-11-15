import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SesionService } from '@pasitos/panel';
import { AvisoComponent, BotonDirective, EncabezadoComponent } from '@pasitos/ui';

/** Inicio provisional (HU-201): confirma la sesión. Las pantallas reales llegan con sus HU. */
@Component({
  selector: 'plt-inicio-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoComponent, AvisoComponent, BotonDirective, RouterLink],
  template: `
    <px-encabezado />
    <main class="mx-auto flex max-w-xl flex-col gap-4 px-5 pt-6">
      <h1 class="font-display text-3xl font-extrabold">Consola de plataforma</h1>
      <p>Hola, {{ sesion.usuario()?.nombre }}.</p>
      <px-aviso variante="info"
        >Organizaciones, eventos, costo de red y bitácora llegan con la consola (HU-202).</px-aviso
      >
      <div class="flex gap-3">
        <a pxBoton="secundario" routerLink="/cuenta">Mi cuenta</a>
        <button type="button" pxBoton="secundario" (click)="logout()">Salir</button>
      </div>
    </main>
  `,
})
export class InicioPage {
  protected readonly sesion = inject(SesionService);
  private readonly router = inject(Router);

  protected async logout(): Promise<void> {
    await this.sesion.logout();
    await this.router.navigate(['/entrar']);
  }
}
