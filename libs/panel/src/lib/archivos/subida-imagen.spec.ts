import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SubidaImagenComponent } from './subida-imagen.component';

describe('Subida de imágenes en el panel (HU-214 §8)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    globalThis.URL.createObjectURL ??= () => 'blob:vista';
    globalThis.URL.revokeObjectURL ??= () => undefined;
  });

  async function crear() {
    const fixture = TestBed.createComponent(SubidaImagenComponent);
    fixture.componentRef.setInput('eventoId', 'evento-1');
    fixture.componentRef.setInput('proposito', 'logo_evento');
    fixture.componentRef.setInput('etiqueta', 'Logo');
    await fixture.whenStable();
    return fixture;
  }

  function elegir(html: HTMLElement, archivo: File) {
    const entrada = html.querySelector('input[type=file]') as HTMLInputElement;
    Object.defineProperty(entrada, 'files', { value: [archivo], configurable: true });
    entrada.dispatchEvent(new Event('change'));
  }

  it('dice formatos, peso y medidas del propósito', async () => {
    const fixture = await crear();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'PNG, JPEG o WebP · hasta 2 MB · hasta 2000 × 2000 px',
    );
  });

  it('un SVG o uno de más de 2 MB no se sube: el error queda en el campo', async () => {
    const fixture = await crear();
    const html = fixture.nativeElement as HTMLElement;
    elegir(html, new File(['<svg/>'], 'dibujo.svg', { type: 'image/svg+xml' }));
    await fixture.whenStable();
    expect(html.querySelector('[role=alert]')?.textContent).toContain('Usa PNG, JPEG o WebP');
    elegir(html, new File([new Uint8Array(3 * 1024 * 1024)], 'logo.png', { type: 'image/png' }));
    await fixture.whenStable();
    expect(html.querySelector('[role=alert]')?.textContent).toContain('2 MB');
    TestBed.inject(HttpTestingController).verify();
  });

  it('sube al API y deja el id del archivo aprobado', async () => {
    const fixture = await crear();
    const html = fixture.nativeElement as HTMLElement;
    elegir(html, new File([new Uint8Array(10)], 'logo.png', { type: 'image/png' }));
    const pedido = TestBed.inject(HttpTestingController).expectOne(
      (r) =>
        r.url === '/api/v1/eventos/evento-1/archivos' &&
        r.params.get('proposito') === 'logo_evento',
    );
    pedido.flush({ id: 'archivo-1', proposito: 'logo_evento', ancho: 10, alto: 10, variantes: {} });
    await fixture.whenStable();
    expect(fixture.componentInstance.valor()).toBe('archivo-1');
  });
});
