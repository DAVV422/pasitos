import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { movimientoPublicoSchema } from '@pasitos/dominio/esquemas';
import { fromHex, toHex } from './bytes';
import {
  buildEventoIdHash,
  buildGenesis,
  buildHoja,
  buildHuella,
  buildPruebaInclusion,
  buildRaiz,
  encodeConteos,
  verifyPruebaInclusion,
  type Conteo,
  type PasoPrueba,
} from './huellas';
import { canonicalizeJson } from './jcs';

interface Vectores {
  eventos: { eventoId: string; eventoIdHash: string; genesis: string }[];
  jcs: { entrada: unknown; salida: string }[];
  hojas: { movimiento: unknown; jcs: string; hoja: string }[];
  raizMovimientos: string;
  raices: { hojas: string[]; raiz: string }[];
  pruebas: { hojas: string[]; indice: number; prueba: PasoPrueba[]; raiz: string }[];
  cadena: {
    eventoIdHash: string;
    lotes: { n: number; huellaAnterior: string; raiz: string; conteos: Conteo[]; huella: string }[];
  };
}

/** Los mismos vectores que prueba el contrato en Rust (HU-102 §4). */
const vectores = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../vectores/huellas.json'), 'utf-8'),
) as Vectores;

describe('vectores compartidos', () => {
  it.each(vectores.eventos)('id del evento y génesis de $eventoId', async (v) => {
    const idHash = await buildEventoIdHash(v.eventoId);
    expect(toHex(idHash)).toBe(v.eventoIdHash);
    expect(toHex(await buildGenesis(idHash))).toBe(v.genesis);
  });

  it.each(vectores.jcs)('JSON canónico %#', (v) => {
    expect(canonicalizeJson(v.entrada)).toBe(v.salida);
  });

  it.each(vectores.hojas)('hoja del movimiento $movimiento.n', async (v) => {
    const movimiento = movimientoPublicoSchema.parse(v.movimiento);
    expect(canonicalizeJson(movimiento)).toBe(v.jcs);
    expect(toHex(await buildHoja(movimiento))).toBe(v.hoja);
  });

  it('raíz de los movimientos de ejemplo', async () => {
    const hojas = await Promise.all(
      vectores.hojas.map((v) => buildHoja(movimientoPublicoSchema.parse(v.movimiento))),
    );
    expect(toHex(await buildRaiz(hojas))).toBe(vectores.raizMovimientos);
  });

  it.each(vectores.raices)('raíz de $hojas.length hojas', async (v) => {
    expect(toHex(await buildRaiz(v.hojas.map(fromHex)))).toBe(v.raiz);
  });

  it.each(vectores.pruebas)('prueba de inclusión de la hoja $indice', async (v) => {
    const hojas = v.hojas.map(fromHex);
    const prueba = await buildPruebaInclusion(hojas, v.indice);
    expect(prueba).toEqual(v.prueba);
    const hoja = hojas[v.indice] ?? new Uint8Array();
    expect(await verifyPruebaInclusion(hoja, prueba, fromHex(v.raiz))).toBe(true);

    const alterada = new Uint8Array(hoja);
    alterada[0] = (alterada[0] ?? 0) ^ 0xff;
    expect(await verifyPruebaInclusion(alterada, prueba, fromHex(v.raiz))).toBe(false);
  });

  it('cadena de huellas de cinco lotes', async () => {
    const idHash = fromHex(vectores.cadena.eventoIdHash);
    let anterior = await buildGenesis(idHash);
    for (const lote of vectores.cadena.lotes) {
      expect(toHex(anterior)).toBe(lote.huellaAnterior);
      const huella = await buildHuella({
        eventoIdHash: idHash,
        n: lote.n,
        huellaAnterior: anterior,
        raiz: fromHex(lote.raiz),
        conteos: lote.conteos,
      });
      expect(toHex(huella)).toBe(lote.huella);
      anterior = huella;
    }
  });
});

describe('reglas del formato', () => {
  it('rechaza conteos desordenados o repetidos', () => {
    expect(() =>
      encodeConteos([
        [2, 1],
        [1, 1],
      ]),
    ).toThrow();
    expect(() =>
      encodeConteos([
        [2, 1],
        [2, 3],
      ]),
    ).toThrow();
    expect(encodeConteos([])).toHaveLength(0);
  });

  it('rechaza números que no son enteros en el JSON canónico', () => {
    expect(() => canonicalizeJson({ puntos: 1.5 })).toThrow();
  });

  it('un lote vacío no tiene raíz', async () => {
    await expect(buildRaiz([])).rejects.toThrow();
  });

  it('el movimiento público no admite campos de más', () => {
    const base = vectores.hojas[0]?.movimiento as Record<string, unknown>;
    expect(movimientoPublicoSchema.safeParse({ ...base, email: 'x@example.com' }).success).toBe(
      false,
    );
  });
});
