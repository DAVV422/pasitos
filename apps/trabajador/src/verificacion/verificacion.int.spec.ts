import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { eventos, lotes, movimientos, movimientosLote, withOrganizacion } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { encodeUtf8, sha256, toHex } from '@pasitos/firmas';
import { parseEvidencia } from '../evidencia/evidencia';
import { addMovimientos, createEntorno, createEventoConContrato } from '../pruebas/entorno';
import {
  formatVerificacion,
  readEstadoDeEvidencia,
  readEstadoDeRed,
  VerificacionService,
} from './verificacion.service';

/** Intervalo, evidencia y verificación del Hito A (HU-105) con PostgreSQL real y Stellar falso. */
describe('intervalo, evidencia y verificación', () => {
  let base: BaseDePrueba;
  const archivosDir = join(tmpdir(), `pasitos-evidencia-${process.pid}`);

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
    await rm(archivosDir, { recursive: true, force: true });
  }, 60_000);

  async function listNumerosLote(eventoId: string): Promise<number[]> {
    const filas = await base.sistema.db
      .select({ numero: lotes.numero })
      .from(lotes)
      .where(eq(lotes.eventoId, eventoId))
      .orderBy(lotes.numero);
    return filas.map((f) => f.numero);
  }

  /** Un evento con al menos tres lotes anclados (lotes de 10 movimientos) y el contrato cerrado. */
  async function createEventoCerrado() {
    const entorno = createEntorno(base, { loteMax: 10, archivosDir });
    const { eventoId, contratoId } = await createEventoConContrato(base, entorno.contrato, 10);
    await entorno.sellador.processEvento(eventoId, { forzar: true });
    await entorno.contrato.closeContrato(eventoId);
    expect((await listNumerosLote(eventoId)).length).toBeGreaterThanOrEqual(3);
    return { ...entorno, eventoId, contratoId };
  }

  it('el intervalo cambiado con el evento en curso vale desde el ciclo siguiente; sin él, el de la plataforma', async () => {
    const { contrato, sellador, reloj } = createEntorno(base);
    const { eventoId } = await createEventoConContrato(base, contrato);
    expect(await sellador.processEvento(eventoId)).toBe('al_dia');
    expect(await listNumerosLote(eventoId)).toEqual([1]);

    // Sin intervalo propio: el de la plataforma (5 min en este sellador). A los 2 minutos no arma.
    await addMovimientos(base, eventoId, 3);
    reloj.adelantar(121_000);
    await sellador.processEvento(eventoId);
    expect(await listNumerosLote(eventoId)).toEqual([1]);

    // Con 2 minutos (lo que escribe EventosPlataformaService), el ciclo siguiente ya arma.
    await base.sistema.db
      .update(eventos)
      .set({ intervaloAnclajeMin: 2 })
      .where(eq(eventos.id, eventoId));
    await sellador.processEvento(eventoId);
    expect(await listNumerosLote(eventoId)).toEqual([1, 2]);

    // El tick siguiente llega un poco antes del minuto exacto desde que se armó (el armado tarda
    // unos segundos): igual arma, no espera otro minuto.
    await addMovimientos(base, eventoId, 3);
    reloj.adelantar(112_000);
    await sellador.processEvento(eventoId);
    expect(await listNumerosLote(eventoId)).toEqual([1, 2, 3]);
    // Pero no antes de tiempo.
    await addMovimientos(base, eventoId, 3);
    reloj.adelantar(60_000);
    await sellador.processEvento(eventoId);
    expect(await listNumerosLote(eventoId)).toEqual([1, 2, 3]);

    // La base rechaza un valor fuera de la lista (1 ya no está: el mínimo es 2).
    await expect(
      base.sistema.db
        .update(eventos)
        .set({ intervaloAnclajeMin: 1 })
        .where(eq(eventos.id, eventoId)),
    ).rejects.toMatchObject({ cause: { message: expect.stringContaining('check constraint') } });
  });

  it('al cerrar guarda evidencia-stellar.json con todas las transacciones, y su SHA-256 en eventos', async () => {
    const { eventoId, contratoId, repositorio } = await createEventoCerrado();
    const evento = await repositorio.getEvento(eventoId);
    const ruta = join(
      archivosDir,
      'publicos',
      evento?.organizacionId ?? '',
      eventoId,
      'evidencia-stellar.json',
    );
    const contenido = await readFile(ruta, 'utf-8');
    expect(evento?.evidenciaSha256).toBe(toHex(await sha256(encodeUtf8(contenido))));

    const evidencia = parseEvidencia(contenido);
    expect(evidencia).toMatchObject({
      version: 1,
      red: 'local',
      contrato: contratoId,
      versionContrato: 1,
    });
    expect(evidencia.incompleta).toBeUndefined();
    const operaciones = evidencia.transacciones.map((t) => t.operacion);
    expect(operaciones[0]).toBe('deploy');
    expect(operaciones.at(-1)).toBe('close');
    const anchors = evidencia.transacciones.filter((t) => t.operacion === 'anchor');
    expect(anchors.map((t) => t.lote)).toEqual(await listNumerosLote(eventoId));
    expect(anchors[0]?.envelopeXdr).toMatch(/^envelope-/);
    expect(evidencia.estado.cierre?.nFinal).toBe(anchors.length);
    expect(evidencia.estado.ultimo.n).toBe(anchors.length);
    // Sin datos personales: ni nombres ni correos del evento de prueba.
    expect(contenido).not.toMatch(/@example\.com|Asistente de prueba/i);
  });

  it('D59: al cerrar un evento real extiende 6 meses sus datos en la red; uno de prueba, no', async () => {
    const entorno = createEntorno(base, { archivosDir });
    const { eventoId, contratoId } = await createEventoConContrato(base, entorno.contrato);
    await base.sistema.db.update(eventos).set({ tipo: 'real' }).where(eq(eventos.id, eventoId));
    await entorno.sellador.processEvento(eventoId, { forzar: true });
    await entorno.contrato.closeContrato(eventoId);

    const extensiones = entorno.stellar.enviadas.filter((l) => l.operacion === 'extend_ttl');
    expect(extensiones).toEqual([
      expect.objectContaining({
        contratoId,
        ledgers: 3_110_000,
        incluirCodigo: true,
        retos: await entorno.repositorio.listNumerosRetosRegistrados(eventoId),
      }),
    ]);
    const evento = await entorno.repositorio.getEvento(eventoId);
    const dias = ((evento?.enRedHasta?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(179);
    expect(dias).toBeLessThan(181);
    // La extensión está en la evidencia y en el costo, y cerrar de nuevo no la repite.
    const [registrada] = (await entorno.transacciones.listIncluidas(eventoId)).filter(
      (t) => t.operacion === 'extend_ttl',
    );
    expect(registrada).toBeDefined();
    await entorno.contrato.closeContrato(eventoId);
    expect(entorno.stellar.enviadas.filter((l) => l.operacion === 'extend_ttl')).toHaveLength(1);
    expect(entorno.alertas.codigos()).not.toContain('COMISION_SOBRE_TOPE');

    const prueba = await createEventoCerrado();
    expect(prueba.stellar.enviadas.some((l) => l.operacion === 'extend_ttl')).toBe(false);
    expect((await prueba.repositorio.getEvento(prueba.eventoId))?.enRedHasta).toBeNull();
  });

  it('si el RPC ya no tiene una transacción, la evidencia sale incompleta con la lista de las que faltan', async () => {
    const { eventoId, stellar, transacciones, evidencia: servicio } = await createEventoCerrado();
    const [primera] = await transacciones.listIncluidas(eventoId);
    stellar.forgetResultado(primera?.txHash ?? '');
    const evidencia = await servicio.buildEvidencia(eventoId);
    expect(evidencia.incompleta).toBe(true);
    expect(evidencia.faltantes).toEqual([{ operacion: 'deploy', txHash: primera?.txHash }]);
  });

  it('stellar:verificar: todo coincide contra la red y contra la evidencia', async () => {
    const { eventoId, contratoId, stellar, repositorio } = await createEventoCerrado();
    const verificacion = new VerificacionService(repositorio);

    const contraRed = await verificacion.verifyEvento(
      eventoId,
      await readEstadoDeRed(
        stellar,
        contratoId,
        await repositorio.listNumerosRetosRegistrados(eventoId),
      ),
    );
    expect(contraRed.problemas).toEqual([]);
    expect(contraRed.coincide).toBe(true);
    expect(formatVerificacion(contraRed)).toMatch(/^Todo coincide: \d+ lotes/);

    const evento = await repositorio.getEvento(eventoId);
    const archivo = join(
      archivosDir,
      'publicos',
      evento?.organizacionId ?? '',
      eventoId,
      'evidencia-stellar.json',
    );
    const contraEvidencia = await verificacion.verifyEvento(
      eventoId,
      readEstadoDeEvidencia(parseEvidencia(await readFile(archivo, 'utf-8'))),
    );
    expect(contraEvidencia.coincide).toBe(true);
    expect(contraEvidencia.fuente).toBe('evidencia');
  });

  it('V10: un movimiento alterado después de anclar hace fallar su lote y los siguientes', async () => {
    const { eventoId, contratoId, stellar, repositorio } = await createEventoCerrado();
    const evento = await repositorio.getEvento(eventoId);
    // Un movimiento del lote 2. El libro no admite UPDATE: el dueño de la tabla apaga el trigger a propósito.
    const [enLote2] = await base.sistema.db
      .select({ id: movimientosLote.movimientoId })
      .from(movimientosLote)
      .innerJoin(lotes, eq(lotes.id, movimientosLote.loteId))
      .where(and(eq(lotes.eventoId, eventoId), eq(lotes.numero, 2)))
      .limit(1);
    await base.owner.db.execute(sql`alter table movimientos disable trigger solo_agregar`);
    try {
      await withOrganizacion(base.owner.db, evento?.organizacionId ?? '', (tx) =>
        tx
          .update(movimientos)
          .set({ puntos: sql`${movimientos.puntos} + 100` })
          .where(eq(movimientos.id, enLote2?.id ?? '')),
      );
    } finally {
      await base.owner.db.execute(sql`alter table movimientos enable trigger solo_agregar`);
    }

    const resultado = await new VerificacionService(repositorio).verifyEvento(
      eventoId,
      await readEstadoDeRed(
        stellar,
        contratoId,
        await repositorio.listNumerosRetosRegistrados(eventoId),
      ),
    );
    expect(resultado.coincide).toBe(false);
    const malos = resultado.lotes.filter((l) => !l.coincide).map((l) => l.numero);
    const total = resultado.lotes.length;
    expect(malos).toEqual(Array.from({ length: total - 1 }, (_, i) => i + 2));
    expect(resultado.lotes[0]?.coincide).toBe(true);
    expect(resultado.lotes[1]?.motivo).toContain('alterado');
    expect(resultado.problemas.join('\n')).toContain('no es la del contrato');
    expect(formatVerificacion(resultado)).toContain(
      'Lote 2: los movimientos no dan la raíz anclada',
    );
  });
});
