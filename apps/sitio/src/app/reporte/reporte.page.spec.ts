import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { DatosReporte, Reporte } from '@pasitos/dominio';
import { appRoutes } from '../app.routes';
import { FUENTE_REPORTE } from './fuente-reporte';

const TOKEN = 'a'.repeat(43);

const DATOS: DatosReporte = {
  version: 1,
  generadoAt: '2026-12-05T23:00:00Z',
  evento: {
    nombre: 'Feria de Ejemplo',
    organizacion: 'Comunidad de Ejemplo',
    tipo: 'real',
    zonaHoraria: 'America/La_Paz',
    inicioAt: '2026-12-05T13:00:00Z',
    finAt: '2026-12-05T22:00:00Z',
    cerradoAt: '2026-12-05T22:30:00Z',
    lugar: 'Centro de Ejemplo',
    logo: null,
    nombrePuntos: 'pasos',
    agenda: [],
  },
  limites: { desde: '2026-12-05T13:00:00Z', hasta: '2026-12-05T22:30:00Z' },
  tramo: null,
  pequeno: false,
  soloTotales: false,
  asistencia: {
    invitados: 200,
    presentes: 150,
    presentesDeLista: 120,
    tasa: 0.6,
    activos: 140,
    porForma: [{ forma: 'escaneo', total: 150 }],
    porRegistrador: [{ nombre: 'Registrador 1', total: 30 }],
    franjas: [{ hora: '2026-12-05T13:00:00Z', checkIns: 80, activos: 90 }],
    retencion: { primeraHora: 90, ultimaHora: 40, apertura: null, cierre: null },
  },
  participacion: {
    participaciones: 128,
    conReto: 100,
    conCanje: 60,
    porReto: [
      {
        numero: 1,
        nombre: 'Charla de apertura',
        tipo: 'qr',
        participaciones: 128,
        tope: 200,
        lugar: null,
        sponsor: null,
      },
    ],
    porLugar: [],
    porSponsor: [],
    fotos: { enviadas: 0, aprobadas: 0, rechazadas: 0, conAutorizacion: 0 },
    porGrupo: [],
  },
  puntos: {
    ganados: 3000,
    canjeados: 2000,
    ajustados: 10,
    vencidos: 990,
    ajustes: [],
    anulaciones: 0,
  },
  premios: { entregados: 70, canjes: 60, gratuitos: 0, porPremio: [] },
};

const REPORTE: Reporte = {
  datos: DATOS,
  stellar: {
    red: 'testnet',
    contratoId: 'C'.repeat(56),
    enlaceContrato: `https://stellar.expert/explorer/testnet/contract/${'C'.repeat(56)}`,
    estado: 'registrado',
    lotes: [],
    huellaFinal: 'ab'.repeat(32),
    cerradoAt: '2026-12-05T22:30:00Z',
    enRedHasta: null,
    evidenciaSha256: null,
  },
};

async function render(reporte: Reporte | null) {
  const respuesta = { status: 200 } as ResponseInit & { status: number };
  TestBed.configureTestingModule({
    providers: [
      provideRouter(appRoutes),
      { provide: FUENTE_REPORTE, useValue: () => Promise.resolve(reporte) },
      { provide: RESPONSE_INIT, useValue: respuesta },
    ],
  });
  const harness = await RouterTestingHarness.create(`/reporte/${TOKEN}`);
  await new Promise((r) => setTimeout(r, 0));
  harness.detectChanges();
  return { pagina: harness.routeNativeElement as HTMLElement, respuesta };
}

describe('reporte compartido (HU-402)', () => {
  it('muestra los totales, testnet y no se indexa', async () => {
    const { pagina, respuesta } = await render(REPORTE);
    expect(respuesta.status).toBe(200);
    expect(pagina.querySelector('h1')?.textContent).toContain('Feria de Ejemplo');
    expect(pagina.textContent).toContain('150');
    expect(pagina.textContent).toContain('60 %');
    expect(pagina.textContent).toContain('Charla de apertura');
    expect(pagina.querySelector('[data-testid="stellar"]')?.textContent).toContain('testnet');
    expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex');
    expect(TestBed.inject(Meta).getTag('property="og:title"')?.content).toBe(
      'Feria de Ejemplo · 150 presentes · Reporte verificable',
    );
  });

  it('un enlace que no sirve: el aviso y un 404 de verdad', async () => {
    const { pagina, respuesta } = await render(null);
    expect(pagina.querySelector('h1')?.textContent).toContain('Este reporte no está disponible');
    expect(respuesta.status).toBe(404);
  });
});
