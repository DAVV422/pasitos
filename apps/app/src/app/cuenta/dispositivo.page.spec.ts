import { signal, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AsistenteApi, type DispositivoApp } from '../asistente-api.service';
import { AnuladoPage } from '../avisos.pages';
import { NoFuiYoService } from '../no-fui-yo.service';
import { SesionAsistente, type Anulacion } from '../sesion-asistente';
import { DispositivoPage } from './dispositivo.page';

const DATOS: DispositivoApp = {
  actual: {
    modelo: 'SM-A145M · Chrome',
    desde: '2026-11-21T14:42:00Z',
    metodo: 'qr_puerta',
    puesto: 'Puerta · Luis C.',
  },
  historial: [
    {
      modelo: 'iPhone · Safari',
      desde: '2026-11-20T12:00:00Z',
      anuladaAt: '2026-11-21T14:42:00Z',
      motivo: 'nueva_vinculacion',
      por: 'Puerta · Luis C.',
    },
  ],
  intentos: [{ modelo: 'iPhone', at: '2026-11-21T13:15:00Z', que: 'abrir_enlace' }],
  avisos: [],
};

async function render<T>(componente: Type<T>): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(componente);
  await fixture.whenStable();
  await new Promise((r) => setTimeout(r, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('Mi dispositivo y anulado (HU-312)', () => {
  const noFuiYo = {
    enviando: signal(false),
    enviado: signal(false),
    error: signal<string | null>(null),
    send: vi.fn(() => {
      noFuiYo.enviado.set(true);
      return Promise.resolve();
    }),
  };
  const sesion = {
    estado: signal(null),
    anulacion: signal<Anulacion | null>(null),
  };

  beforeEach(async () => {
    noFuiYo.enviado.set(false);
    await TestBed.configureTestingModule({
      imports: [DispositivoPage, AnuladoPage],
      providers: [
        { provide: AsistenteApi, useValue: { getDispositivo: () => Promise.resolve(DATOS) } },
        { provide: SesionAsistente, useValue: sesion },
        { provide: NoFuiYoService, useValue: noFuiYo },
      ],
    }).compileComponents();
  });

  it('muestra este celular, el anterior y los intentos con frases, sin IP ni huella', async () => {
    const html = await render(DispositivoPage);
    expect(html.textContent).toContain('SM-A145M · Chrome');
    expect(html.textContent).toContain('Puerta · Luis C.');
    expect(html.textContent).toContain('iPhone · Safari');
    expect(html.textContent).toContain(
      'El 21/11 a las 09:15 alguien intentó abrir tu enlace en un iPhone.',
    );
    expect(html.querySelector('button')?.textContent).toContain('No fui yo');
  });

  it('el anulado: cuándo se abrió en otro celular y No fui yo', async () => {
    sesion.anulacion.set({
      anuladaAt: '2026-11-21T14:42:00Z',
      metodo: 'qr_puerta',
      zonaHoraria: 'America/La_Paz',
    });
    const html = await render(AnuladoPage);
    expect(html.textContent).toContain('Tu entrada se abrió en otro celular');
    expect(html.textContent).toContain('Fue el 21/11 a las 10:42.');
    (html.querySelector('button') as HTMLButtonElement).click();
    expect(noFuiYo.send).toHaveBeenCalledWith('dispositivo');
  });
});
