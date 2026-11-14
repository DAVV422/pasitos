import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconoComponent } from './icono.component';
import type { NombreIcono } from './iconos';

export type VarianteAviso = 'info' | 'advertencia' | 'ok' | 'peligro';

const ICONO_POR_VARIANTE: Record<VarianteAviso, NombreIcono> = {
  info: 'info',
  advertencia: 'alert',
  ok: 'check',
  peligro: 'alert',
};

/**
 * Aviso con ícono + texto. Los avisos de error o importancia se anuncian
 * a los lectores de pantalla (role="alert"); los demás, como estado.
 */
@Component({
  selector: 'px-aviso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  host: {
    '[class]': '"px-aviso px-aviso--" + variante()',
    '[attr.role]': 'variante() === "peligro" ? "alert" : "status"',
  },
  template: `
    <px-icono [nombre]="icono()" [tamano]="20" />
    <span style="flex: 1"><ng-content /></span>
    <ng-content select="[pxAvisoAccion]" />
  `,
})
export class AvisoComponent {
  readonly variante = input<VarianteAviso>('info');
  protected readonly icono = computed(() => ICONO_POR_VARIANTE[this.variante()]);
}
