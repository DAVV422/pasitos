import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { asistentes, eventos, operaciones, organizaciones } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { uuidv7 } from 'uuidv7';
import { createReloj } from '../pruebas/entorno';
import { OperacionesTrabajoService } from './operaciones.service';

interface Vista {
  totales: Record<string, number>;
  columnas: { reconocidas: string[]; ignoradas: string[] };
  invalidas: { fila: number; motivo: string }[];
  duplicadas: { fila: number; motivo: string }[];
  posiblesDuplicadas: { fila: number; parecidoA: { codigo: string } }[];
  validas: unknown[];
}

/** Importar y exportar la lista de invitados en el trabajador (HU-210 §4 y §5). Requiere Docker. */
describe('process-operaciones', () => {
  let base: BaseDePrueba;
  let carpeta: string;
  let servicio: OperacionesTrabajoService;
  let organizacionId: string;

  beforeAll(async () => {
    base = await startBaseDePrueba();
    carpeta = await mkdtemp(join(tmpdir(), 'pasitos-operaciones-'));
    await mkdir(join(carpeta, 'cuarentena'), { recursive: true });
    servicio = new OperacionesTrabajoService(base.sistema.db, carpeta, createReloj());
    organizacionId = uuidv7();
    await base.sistema.db
      .insert(organizaciones)
      .values({ id: organizacionId, nombre: 'Org', slug: `org-${organizacionId}` });
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
    await rm(carpeta, { recursive: true, force: true });
  });

  async function createEvento(): Promise<string> {
    const eventoId = uuidv7();
    await base.sistema.db.insert(eventos).values({
      id: eventoId,
      organizacionId,
      slug: `evento-${eventoId}`,
      nombre: 'Evento',
      inicioAt: new Date('2026-12-01T13:00:00Z'),
      finAt: new Date('2026-12-01T21:00:00Z'),
    });
    return eventoId;
  }

  async function addAsistente(eventoId: string, nombre: string, email: string | null = null) {
    await base.sistema.db
      .insert(asistentes)
      .values({ id: uuidv7(), organizacionId, eventoId, nombre, email });
  }

  async function importar(eventoId: string, csv: string) {
    const archivoId = uuidv7();
    await writeFile(join(carpeta, 'cuarentena', archivoId), csv, 'utf-8');
    const id = uuidv7();
    await base.sistema.db.insert(operaciones).values({
      id,
      tipo: 'import-asistentes',
      organizacionId,
      eventoId,
      parametros: { archivoId },
      expiraAt: new Date(Date.now() + 3_600_000),
    });
    await servicio.processPendientes();
    const [fila] = await base.sistema.db.select().from(operaciones).where(eq(operaciones.id, id));
    return fila!;
  }

  it('50 filas con dos inválidas y un duplicado: la vista previa dice exactamente eso', async () => {
    const eventoId = await createEvento();
    const lineas = Array.from(
      { length: 50 },
      (_, i) => `Persona Número ${i + 1},persona${i + 1}@example.com`,
    );
    lineas[9] = ',sin-nombre@example.com';
    lineas[19] = 'Correo Roto,no-es-un-correo';
    lineas[29] = 'Repetida Otra Vez,persona1@example.com';
    const operacion = await importar(eventoId, `nombre,correo\n${lineas.join('\n')}\n`);
    expect(operacion.estado).toBe('lista');
    const vista = operacion.resultado as Vista;
    expect(vista.totales).toEqual({
      filas: 50,
      validas: 47,
      invalidas: 2,
      duplicadas: 1,
      posiblesDuplicadas: 0,
    });
    expect(vista.invalidas.map((f) => f.motivo)).toEqual([
      'Fila 11: falta el nombre',
      'Fila 21: el correo no es válido',
    ]);
    expect(vista.duplicadas).toEqual([
      expect.objectContaining({ fila: 31, motivo: 'Igual a la fila 2' }),
    ]);
    expect((operacion.datos as { validas: unknown[] }).validas).toHaveLength(47);
  });

  it('con `;`, BOM, encabezados con tildes y en otro orden, se lee igual', async () => {
    const eventoId = await createEvento();
    const operacion = await importar(
      eventoId,
      '\uFEFFCorreo Electrónico;Empresa;Nombre Completo;Código\r\nana@example.com;ACME;Ana Pérez;T-1\r\n',
    );
    const vista = operacion.resultado as Vista;
    expect(vista.columnas).toEqual({
      reconocidas: ['Correo Electrónico', 'Nombre Completo', 'Código'],
      ignoradas: ['Empresa'],
    });
    expect(vista.validas).toEqual([
      { fila: 2, nombre: 'Ana Pérez', email: 'ana@example.com', codigoExterno: 'T-1' },
    ]);
  });

  it('contra la lista: correo ya cargado es duplicado; nombre parecido sin correo que distinga, para revisar', async () => {
    const eventoId = await createEvento();
    await addAsistente(eventoId, 'Valeria Quispe Mamani', 'valeria@example.com');
    await addAsistente(eventoId, 'Jorge Luis Fernández', 'jorge@example.com');
    const operacion = await importar(
      eventoId,
      [
        'nombre,email',
        'Otra Persona,valeria@example.com',
        'Valeria Quispe Mamani,',
        'Jorge Luis Fernandez,otro-jorge@example.com',
        'Nadie Parecido,nadie@example.com',
      ].join('\n'),
    );
    const vista = operacion.resultado as Vista;
    expect(vista.duplicadas).toEqual([
      expect.objectContaining({ fila: 2, motivo: 'Ya está en la lista como A-0001' }),
    ]);
    // El nombre parecido con otro correo se distingue: no va a revisar.
    expect(vista.posiblesDuplicadas.map((f) => [f.fila, f.parecidoA.codigo])).toEqual([
      [3, 'A-0001'],
    ]);
    expect(vista.totales['validas']).toBe(2);
  });

  it('sin columna de nombre, la operación falla con IMPORTACION_INVALIDA', async () => {
    const operacion = await importar(await createEvento(), 'correo\nana@example.com\n');
    expect(operacion).toMatchObject({
      estado: 'fallida',
      error: 'No encontramos la columna del nombre.',
      resultado: { code: 'IMPORTACION_INVALIDA' },
    });
  });

  it('un CSV de 5 000 filas se valida en menos de 30 s', async () => {
    const eventoId = await createEvento();
    for (let i = 0; i < 200; i++) {
      await addAsistente(eventoId, `Ya Cargado ${i} Apellido`);
    }
    const lineas = Array.from(
      { length: 5_000 },
      (_, i) => `Invitado ${i} Ejemplo,invitado${i}@example.com,T${i}`,
    );
    const inicio = Date.now();
    const operacion = await importar(eventoId, `nombre,correo,ticket\n${lineas.join('\n')}\n`);
    // El límite de tiempo se comprueba con `pnpm rendimiento` (estas pruebas solas): con todas
    // las suites en paralelo, la computadora no da una medida confiable.
    if (process.env['PASITOS_RENDIMIENTO'] === '1') {
      expect(Date.now() - inicio).toBeLessThan(30_000);
    }
    expect((operacion.resultado as Vista).totales['filas']).toBe(5_000);
  }, 120_000);

  it('la búsqueda de parecidos usa el índice trigram', async () => {
    const plan = await base.sistema.db.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      return tx.execute<{ 'QUERY PLAN': string }>(
        sql`explain select 1 from asistentes where pasitos_normalizar(nombre) % pasitos_normalizar('quis')`,
      );
    });
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('asistentes_nombre_trgm');
  });

  it('exporta con BOM y escapa las celdas que serían fórmulas', async () => {
    const eventoId = await createEvento();
    await addAsistente(eventoId, '=HYPERLINK("http://x","clic")', 'h@example.com');
    const id = uuidv7();
    await base.sistema.db.insert(operaciones).values({
      id,
      tipo: 'export-asistentes',
      organizacionId,
      eventoId,
      expiraAt: new Date(Date.now() + 3_600_000),
    });
    await servicio.processPendientes();
    const [fila] = await base.sistema.db.select().from(operaciones).where(eq(operaciones.id, id));
    expect(fila).toMatchObject({ estado: 'lista', resultado: { filas: 1 } });
    const csv = await readFile(join(carpeta, 'exportaciones', `${id}.csv`), 'utf-8');
    expect(csv.startsWith('\uFEFFCódigo,Nombre,Correo')).toBe(true);
    expect(csv).toContain(`A-0001,"'=HYPERLINK(""http://x"",""clic"")",h@example.com`);
  });
});
