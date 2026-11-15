import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContextoEventoService, SiPuedeDirective } from './permisos';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiPuedeDirective],
  template: `
    <button *pnlSiPuede="'contenido.update'" id="editar">Editar</button>
    <span *pnlSiPuede="'puerta.use'" id="puerta">Puerta</span>
  `,
})
class PruebaComponent {}

describe('Permisos en el panel (HU-204 §5)', () => {
  it('muestra solo lo que el rol puede, y cambia al cambiar el rol', async () => {
    const fixture = TestBed.createComponent(PruebaComponent);
    const contexto = TestBed.inject(ContextoEventoService);
    const html = fixture.nativeElement as HTMLElement;

    await fixture.whenStable();
    expect(html.querySelector('#editar')).toBeNull();

    contexto.set('evento-1', 'registrador');
    await fixture.whenStable();
    expect(html.querySelector('#editar')).toBeNull();
    expect(html.querySelector('#puerta')).not.toBeNull();

    contexto.set('evento-1', 'coorganizador');
    await fixture.whenStable();
    expect(html.querySelector('#editar')).not.toBeNull();
  });
});
