import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvisoComponent, BotonDirective, EstadoComponent, IconoComponent } from '@pasitos/ui';
import { SesionAsistente } from '../sesion-asistente';
import { ReclamoService } from './reclamo.service';

/** A7 (*Verificando…*), A3 (*+20 puntos*) y A8 (el error con su acción). */
@Component({
  selector: 'app-resultado-reclamo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, BotonDirective, EstadoComponent, IconoComponent, RouterLink],
  template: `
    @switch (reclamos.resultado()?.tipo) {
      @case ('verificando') {
        <px-estado tipo="cargando" titulo="Verificando…" />
      }
      @case ('ganado') {
        @if (ganado(); as g) {
          <section class="flex flex-col items-center gap-3 pt-6 text-center" role="status">
            <px-icono nombre="check" [tamano]="64" />
            <p class="text-points font-display text-6xl font-extrabold" data-testid="ganados">
              +{{ g.puntos }}
            </p>
            <p class="text-xl font-bold">{{ g.reto.nombre }}</p>
            <p class="text-muted">
              Ahora tienes <b class="text-text">{{ g.saldo }}</b>
              {{ sesion.estado()?.evento?.nombrePuntos ?? 'puntos' }}.
            </p>
            <button pxBoton type="button" (click)="otro.emit()">Escanear otro</button>
            <a pxBoton="secundario" routerLink="/inicio">Volver a Inicio</a>
          </section>
        }
      }
      @case ('error') {
        @if (error(); as e) {
          <section class="flex flex-col gap-4 pt-6" data-testid="error-reclamo">
            <px-aviso variante="advertencia">{{ e.mensaje }}</px-aviso>
            @if (e.accion === 'escanear') {
              <button pxBoton type="button" (click)="otro.emit()">Escanear de nuevo</button>
            } @else if (e.accion === 'mi_entrada') {
              <a pxBoton routerLink="/mi-entrada">Mi entrada</a>
            }
            <a pxBoton="secundario" routerLink="/inicio">Volver a Inicio</a>
          </section>
        }
      }
    }
  `,
})
export class ResultadoReclamoComponent {
  protected readonly reclamos = inject(ReclamoService);
  protected readonly sesion = inject(SesionAsistente);
  readonly otro = output<void>();

  protected ganado() {
    const r = this.reclamos.resultado();
    return r?.tipo === 'ganado' ? r.reclamo : null;
  }

  protected error() {
    const r = this.reclamos.resultado();
    return r?.tipo === 'error' ? r : null;
  }
}
