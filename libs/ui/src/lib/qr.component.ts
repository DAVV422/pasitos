import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import qrcode from 'qrcode-generator';

/**
 * QR negro sobre blanco con margen, generado en el dispositivo (nunca se descarga como imagen).
 */
@Component({
  selector: 'px-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'px-qr', role: 'img', '[attr.aria-label]': 'descripcion()' },
  template: `<span [innerHTML]="svg()"></span>`,
})
export class QrComponent {
  readonly texto = input.required<string>();
  readonly tamano = input(250);
  readonly descripcion = input('Código QR');

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly svg = computed(() => {
    const codigo = qrcode(0, 'M');
    codigo.addData(this.texto());
    codigo.make();
    const modulos = codigo.getModuleCount();
    const celda = Math.max(1, Math.floor(this.tamano() / modulos));
    // El SVG lo arma la librería a partir del texto; no incluye contenido del usuario como HTML.
    return this.sanitizer.bypassSecurityTrustHtml(
      codigo.createSvgTag({ cellSize: celda, margin: 0, scalable: true }),
    );
  });
}
