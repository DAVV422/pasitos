import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type VarianteChip = 'testnet' | 'puntos' | 'ok' | 'atenuado' | 'peligro';

/** Chip con texto (nunca solo color). Mínimo 12 px, en mayúsculas. */
@Component({
  selector: 'px-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"px-chip px-chip--" + variante()' },
  template: `<ng-content />`,
})
export class ChipComponent {
  readonly variante = input<VarianteChip>('atenuado');
}
