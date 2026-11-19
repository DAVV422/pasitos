import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { makeStateKey, TransferState } from '@angular/core';
import {
  CORREO_POR_PUBLICAR,
  getDocumentoLegal,
  type DocumentoLegal,
} from '@pasitos/dominio/legal';
import { AppComponent } from './app.component';
import { appRoutes } from './app.routes';
import { FUENTE_LEGAL } from './fuente-legal';

describe('sitio', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      // Como en el prerender: el texto sale de la fuente del servidor.
      providers: [provideRouter(appRoutes), { provide: FUENTE_LEGAL, useValue: getDocumentoLegal }],
    });
  });

  it('muestra el chip de testnet y el pie con los términos y la privacidad', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Testnet');
    const enlaces = [...html.querySelectorAll('footer a')].map((a) => a.getAttribute('href'));
    expect(enlaces).toEqual(['/terminos', '/privacidad']);
  });

  it('la portada', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain(
      'Cada paso cuenta.',
    );
  });

  it('los términos, con su versión, su fecha y el correo por publicar', async () => {
    const harness = await RouterTestingHarness.create('/terminos');
    const pagina = harness.routeNativeElement as HTMLElement;
    expect(pagina.querySelector('h1')?.textContent).toContain('Términos y condiciones de Pasitos');
    expect(pagina.querySelector('[data-testid="version"]')?.textContent).toMatch(
      /Versión piloto 1\.1 · vigente desde el \d{2}\/\d{2}\/\d{4}/,
    );
    expect(pagina.querySelector('[id="13-si-pasitos-se-constituye-como-empresa"]')).not.toBeNull();
    expect(pagina.textContent).toContain(CORREO_POR_PUBLICAR);
  });

  it('la privacidad, con las secciones del carnet y las fotos', async () => {
    const harness = await RouterTestingHarness.create('/privacidad');
    const pagina = harness.routeNativeElement as HTMLElement;
    expect(pagina.querySelector('h1')?.textContent).toContain('Política de privacidad de Pasitos');
    expect(pagina.querySelector('[id="el-carnet-de-identidad"]')).not.toBeNull();
    expect(pagina.querySelector('[id="las-fotos-de-los-retos"]')).not.toBeNull();
    expect(pagina.querySelector('table')).not.toBeNull();
  });

  it('en el navegador, el texto sale del estado transferido (no del JavaScript)', async () => {
    TestBed.overrideProvider(FUENTE_LEGAL, { useValue: null });
    TestBed.inject(TransferState).set(
      makeStateKey<DocumentoLegal>('legal-terminos'),
      getDocumentoLegal('terminos'),
    );
    const harness = await RouterTestingHarness.create('/terminos');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Términos');
  });
});
