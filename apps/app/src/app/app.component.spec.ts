import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { SinAccesoPage } from './avisos.pages';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([{ path: '**', component: SinAccesoPage }])],
    }).compileComponents();
  });

  it('muestra el encabezado con el chip de testnet', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const html = fixture.nativeElement as HTMLElement;
    expect(html.textContent).toContain('Testnet');
    expect(html.querySelector('router-outlet')).not.toBeNull();
  });
});
