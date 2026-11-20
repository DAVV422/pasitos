import {
  buildCsvReporte,
  getFormaDeEntrar,
  roundTramo,
  toReportePublico,
  validateTramo,
  type DatosReporte,
} from './reporte';

const DATOS = {
  version: 1,
  generadoAt: '2026-12-05T23:00:00.000Z',
  evento: {
    nombre: 'Feria, "de" Ejemplo',
    organizacion: 'Comunidad',
    tipo: 'real',
    zonaHoraria: 'America/La_Paz',
    inicioAt: '2026-12-05T13:00:00.000Z',
    finAt: '2026-12-05T22:00:00.000Z',
    cerradoAt: null,
    lugar: null,
    logo: null,
    nombrePuntos: 'pasos',
    agenda: [],
  },
  limites: { desde: '2026-12-05T13:00:00.000Z', hasta: '2026-12-05T22:30:00.000Z' },
  tramo: null,
  pequeno: false,
  soloTotales: false,
  asistencia: {
    invitados: 10,
    presentes: 8,
    presentesDeLista: 6,
    tasa: 0.6,
    activos: 8,
    porForma: [{ forma: 'escaneo', total: 8 }],
    porRegistrador: [
      { nombre: 'Ana Ejemplo', total: 3 },
      { nombre: 'Beto Ejemplo', total: 1 },
    ],
    franjas: null,
    retencion: null,
  },
  participacion: {
    participaciones: 5,
    conReto: 4,
    conCanje: 2,
    porReto: [
      {
        numero: 1,
        nombre: '=Charla de apertura',
        tipo: 'qr',
        participaciones: 5,
        tope: 50,
        lugar: null,
        sponsor: null,
      },
    ],
    porLugar: [],
    porSponsor: [],
    fotos: { enviadas: 0, aprobadas: 0, rechazadas: 0, conAutorizacion: 0 },
    porGrupo: null,
  },
  puntos: {
    ganados: 100,
    canjeados: 40,
    ajustados: -5,
    vencidos: 55,
    ajustes: [{ categoria: 'Compensación', total: 1 }],
    anulaciones: 1,
  },
  premios: { entregados: 2, canjes: 2, gratuitos: 0, porPremio: [] },
} satisfies DatosReporte;

describe('reporte (HU-402)', () => {
  it('el CSV: BOM, formato largo, comillas y sin fórmulas de Excel', () => {
    const csv = buildCsvReporte(DATOS, null);
    expect(csv.startsWith('﻿seccion,indicador,detalle,valor\r\n')).toBe(true);
    expect(csv).toContain('evento,nombre,,"Feria, ""de"" Ejemplo"');
    expect(csv).toContain("retos,participaciones,'=Charla de apertura,5");
    expect(csv).toContain('puntos,ajustados,,-5');
    expect(csv).toContain('puntos,ajustes,Compensación,1');
    expect(csv).toContain('asistencia,por_registrador,Ana Ejemplo,3');
  });

  it('el reporte público no lleva los nombres de los registradores', () => {
    const publico = toReportePublico(DATOS);
    expect(publico.asistencia.porRegistrador).toEqual([
      { nombre: 'Registrador 1', total: 3 },
      { nombre: 'Registrador 2', total: 1 },
    ]);
    expect(JSON.stringify(publico)).not.toContain('Ana Ejemplo');
  });

  it('el tramo: dentro del evento, de a 15 minutos y Hasta después de Desde', () => {
    const limites = DATOS.limites;
    const ok = { desde: '2026-12-05T13:00:00.000Z', hasta: '2026-12-05T17:00:00.000Z' };
    expect(validateTramo(ok, limites)).toBeNull();
    expect(validateTramo({ desde: ok.hasta, hasta: ok.desde }, limites)).toBe('VALIDACION');
    expect(validateTramo({ ...ok, hasta: '2026-12-05T17:07:00.000Z' }, limites)).toBe('VALIDACION');
    expect(validateTramo({ ...ok, desde: '2026-12-05T12:00:00.000Z' }, limites)).toBe('VALIDACION');
    expect(roundTramo(new Date('2026-12-05T13:07:00Z'), 'abajo').toISOString()).toBe(
      '2026-12-05T13:00:00.000Z',
    );
    expect(roundTramo(new Date('2026-12-05T13:07:00Z'), 'arriba').toISOString()).toBe(
      '2026-12-05T13:15:00.000Z',
    );
  });

  it('cómo entraron, agrupado', () => {
    expect(getFormaDeEntrar('vinculacion_puerta')).toBe('puerta');
    expect(getFormaDeEntrar('autoregistro_tablet')).toBe('autorregistro');
    expect(getFormaDeEntrar('verificacion_ci')).toBe('carnet');
  });
});
