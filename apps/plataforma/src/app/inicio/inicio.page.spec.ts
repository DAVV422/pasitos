import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SesionService } from '@pasitos/panel';
import { InicioPage } from './inicio.page';

describe('InicioPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InicioPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('saluda a la persona de la sesión y muestra el chip de testnet', async () => {
    TestBed.inject(SesionService).set({
      usuario: { id: '1', email: 'ana@example.com', nombre: 'Ana', rolPlataforma: null },
      segundoFactor: {
        requerido: false,
        configurado: false,
        metodos: [],
        estado: 'no_aplica',
        verificadoAt: null,
      },
    });
    const fixture = TestBed.createComponent(InicioPage);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.querySelector('h1')?.textContent).toContain('Consola de plataforma');
    expect(html.textContent).toContain('Hola, Ana.');
    expect(html.textContent).toContain('Testnet');
  });
});
