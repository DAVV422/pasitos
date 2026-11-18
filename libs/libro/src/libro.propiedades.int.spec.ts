import { eq } from 'drizzle-orm';
import fc from 'fast-check';
import { retos, saldos, withOrganizacion } from '@pasitos/db';
import { startBaseDePrueba, type BaseDePrueba } from '@pasitos/db/pruebas';
import { LibroService, type NuevoMovimiento } from './libro.service';
import {
  createAsistentes,
  createCanje,
  createOrganizacionYEvento,
  createReto,
} from './pruebas/datos';

/**
 * Propiedades del libro (HU-101): para secuencias aleatorias de movimientos válidos e inválidos,
 * en tandas concurrentes, el saldo nunca es negativo, el reto no pasa su tope y el saldo guardado
 * es la suma del libro. Requiere Docker.
 */
describe('propiedades del libro', () => {
  let base: BaseDePrueba;
  const libro = new LibroService();

  beforeAll(async () => {
    base = await startBaseDePrueba();
  }, 180_000);

  afterAll(async () => {
    await base?.stop();
  });

  const operacion = fc.record({
    tipo: fc.constantFrom('checkin', 'reto', 'canje', 'vencimiento'),
    asistente: fc.integer({ min: 0, max: 3 }),
    puntos: fc.integer({ min: 1, max: 40 }),
  });

  it('el saldo nunca es negativo, el tope se respeta y el saldo es la suma del libro', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.array(operacion, { minLength: 1, maxLength: 4 }), { maxLength: 8 }),
        async (tandas) => {
          const { organizacionId, eventoId } = await createOrganizacionYEvento(base.sistema.db);
          const ids = await createAsistentes(base.app.db, organizacionId, eventoId, 4);
          const reto = await createReto(base.app.db, organizacionId, eventoId, {
            puntos: 10,
            topeTotal: 3,
            vecesPorPersona: 2,
          });

          for (const tanda of tandas) {
            const canjeIds = await Promise.all(
              tanda.map(() => createCanje(base.sistema.db, organizacionId, eventoId)),
            );
            await Promise.allSettled(
              tanda.map((op, i) => {
                const asistenteId = ids[op.asistente] ?? '';
                const nuevo: NuevoMovimiento =
                  op.tipo === 'reto'
                    ? { eventoId, asistenteId, tipo: 'reto', origen: 'asistente', retoId: reto.id }
                    : op.tipo === 'canje'
                      ? {
                          eventoId,
                          asistenteId,
                          tipo: 'canje',
                          origen: 'asistente',
                          canjeId: canjeIds[i] ?? '',
                          puntos: -op.puntos,
                        }
                      : op.tipo === 'vencimiento'
                        ? {
                            eventoId,
                            asistenteId,
                            tipo: 'vencimiento',
                            origen: 'sistema',
                            puntos: -op.puntos,
                          }
                        : {
                            eventoId,
                            asistenteId,
                            tipo: 'checkin',
                            origen: 'equipo',
                            puntos: op.puntos,
                          };
                return withOrganizacion(base.app.db, organizacionId, (tx) =>
                  libro.addMovimiento(tx, nuevo),
                );
              }),
            );
          }

          const [filaReto] = await base.sistema.db
            .select()
            .from(retos)
            .where(eq(retos.id, reto.id));
          expect(filaReto?.entregados).toBeLessThanOrEqual(3);
          for (const asistenteId of ids) {
            await withOrganizacion(base.app.db, organizacionId, async (tx) => {
              const [saldo] = await tx
                .select({ puntos: saldos.puntos })
                .from(saldos)
                .where(eq(saldos.asistenteId, asistenteId));
              expect(saldo?.puntos).toBeGreaterThanOrEqual(0);
              expect(saldo?.puntos).toBe(await libro.rebuildSaldo(tx, asistenteId));
            });
          }
        },
      ),
      { numRuns: 25 },
    );
  }, 180_000);
});
