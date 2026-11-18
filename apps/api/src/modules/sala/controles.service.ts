import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  escaneos,
  eventos,
  outbox,
  pantallas,
  qrEmitidos,
  retos,
  usuarios,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, listRetosElegibles, pickRetoDePantalla } from '@pasitos/dominio';
import type { AccionPantalla } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { verifyPassword } from '../auth/password';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';
import { getNombreCorto } from '../puerta/check-in.service';
import type { TerminalConectada } from '../terminales/conexion.service';

/** HU-315 §2: 5 PIN incorrectos bloquean los controles 5 minutos. */
export const FALLOS_PIN = 5;
export const BLOQUEO_PIN_MS = 5 * 60 * 1000;

const OUTBOX_POR_ACCION: Readonly<Record<AccionPantalla, string>> = {
  generar_otro: 'pantalla.epoca',
  pausar: 'pantalla.pausada',
  reanudar: 'pantalla.reanudada',
  cambiar_reto: 'pantalla.reto',
};

export interface DatosControl {
  readonly accion: AccionPantalla;
  readonly retoId?: string | null | undefined;
}

/**
 * Los controles de la pantalla (HU-315): desde la tablet con el PIN o desde el panel. *Generar
 * otro* y *Pausar* suben la época: el QR anterior deja de valer al instante, sin gracia.
 */
export class ControlesPantallaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  /**
   * Desde la tablet: el PIN, con su bloqueo guardado en la pantalla. El PIN se revisa antes de
   * bloquear la fila: así el fallo se guarda en su propia transacción sin esperar a la otra.
   */
  async controlDesdeTablet(terminal: TerminalConectada, datos: DatosControl & { pin: string }) {
    if (terminal.tipo !== 'pantalla') throw new AppError('TERMINAL_DESCONECTADA');
    const [pantalla] = await withOrganizacion(this.db, terminal.organizacionId, (tx) =>
      tx
        .select({
          pinHash: pantallas.pinHash,
          fallos: pantallas.pinFallos,
          bloqueadaHasta: pantallas.controlesBloqueadosHasta,
        })
        .from(pantallas)
        .where(eq(pantallas.id, terminal.id)),
    );
    if (!pantalla) throw new AppError('TERMINAL_DESCONECTADA');
    const ahora = this.reloj.now();
    if (pantalla.bloqueadaHasta && pantalla.bloqueadaHasta > ahora) {
      throw new AppError('DEMASIADOS_INTENTOS', {
        detail: 'Demasiados PIN incorrectos. Espera 5 minutos.',
        meta: {
          reintentarEnSegundos: Math.ceil(
            (pantalla.bloqueadaHasta.getTime() - ahora.getTime()) / 1000,
          ),
        },
      });
    }
    if (!pantalla.pinHash || !(await verifyPassword(pantalla.pinHash, datos.pin))) {
      await this.recordFallo(terminal, pantalla.fallos + 1, ahora);
      throw new AppError('PIN_INVALIDO');
    }
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      if (pantalla.fallos > 0) {
        await tx.update(pantallas).set({ pinFallos: 0 }).where(eq(pantallas.id, terminal.id));
      }
      return this.apply(tx, {
        pantallaId: terminal.id,
        eventoId: terminal.evento.id,
        organizacionId: terminal.organizacionId,
        datos,
        actor: { tipo: 'sistema', nombre: 'PIN en la tablet' },
      });
    });
  }

  /** Desde el panel, sin PIN: D y C, y el operador de stand en sus pantallas (lo cuida el guard). */
  controlDesdePanel(contexto: ContextoEvento, pantallaId: string, datos: DatosControl) {
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      this.apply(tx, {
        pantallaId,
        eventoId: contexto.eventoId,
        organizacionId: contexto.organizacionId,
        datos,
        actor: toActor(contexto),
      }),
    );
  }

  /**
   * *Mis pantallas* (HU-315 §4): el operador de stand ve solo las suyas; D, C y F, todas. Al
   * registrador le responde vacío.
   */
  listPantallas(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const soloSuyas = contexto.rol === 'operador_stand';
      // El registrador ve solo la asistencia en el panel (Flujos §2.4): ninguna pantalla.
      if (
        contexto.rol === 'registrador' ||
        (soloSuyas && contexto.terminales.pantallas.length === 0)
      ) {
        return { items: [], pagination: { nextCursor: null } };
      }
      const filas = await tx
        .select({
          id: pantallas.id,
          numero: pantallas.numero,
          nombre: pantallas.nombre,
          estado: pantallas.estado,
          lugarId: pantallas.lugarId,
          retoFijadoId: pantallas.retoActualId,
          ultimoContactoAt: pantallas.ultimoContactoAt,
        })
        .from(pantallas)
        .where(
          and(
            eq(pantallas.eventoId, contexto.eventoId),
            soloSuyas ? inArray(pantallas.id, contexto.terminales.pantallas) : undefined,
          ),
        )
        .orderBy(pantallas.numero);
      const filasRetos = await this.listRetos(tx, contexto.eventoId);
      const [evento] = await tx
        .select({ estado: eventos.estado })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId));
      const ahora = this.reloj.now();
      return {
        items: filas.map((p) => {
          const elegido = pickRetoDePantalla(
            p,
            filasRetos,
            { estado: evento?.estado ?? '' },
            ahora,
          );
          return {
            id: p.id,
            numero: p.numero,
            nombre: p.nombre,
            estado: elegido.estado,
            conectada: p.estado !== 'desconectada',
            ultimoContactoAt: p.ultimoContactoAt?.toISOString() ?? null,
            reto: elegido.reto
              ? {
                  id: elegido.reto.id,
                  nombre: elegido.reto.nombre,
                  entregados: elegido.reto.entregados,
                  tope: elegido.reto.topeTotal,
                }
              : null,
            fijado: p.retoFijadoId !== null,
            opciones: this.getOpciones(filasRetos, p.lugarId, ahora),
          };
        }),
        pagination: { nextCursor: null },
      };
    });
  }

  /**
   * El historial (HU-315 §4, mockup O7): los QR mostrados y los escaneos rechazados por motivo.
   */
  getHistorial(contexto: ContextoEvento, pantallaId: string, desde: Date | undefined) {
    if (contexto.rol === 'registrador') {
      return Promise.resolve({ qr: [], aceptados: 0, rechazos: [] });
    }
    if (contexto.rol === 'operador_stand' && !contexto.terminales.pantallas.includes(pantallaId)) {
      throw new AppError('NO_ENCONTRADO');
    }
    const inicio = desde ?? new Date(this.reloj.now().getTime() - 12 * 60 * 60 * 1000);
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const qr = await tx
        .select({
          inicioAt: qrEmitidos.inicioAt,
          finAt: qrEmitidos.finAt,
          modo: qrEmitidos.modo,
          epoca: qrEmitidos.epoca,
          franja: qrEmitidos.franja,
          finMotivo: qrEmitidos.finMotivo,
          reto: retos.nombre,
          invalidadoPor: usuarios.nombre,
        })
        .from(qrEmitidos)
        .innerJoin(retos, eq(retos.id, qrEmitidos.retoId))
        .leftJoin(usuarios, eq(usuarios.id, qrEmitidos.invalidadoPor))
        .where(and(eq(qrEmitidos.pantallaId, pantallaId), gte(qrEmitidos.inicioAt, inicio)))
        .orderBy(desc(qrEmitidos.inicioAt))
        .limit(300);
      const porResultado = await tx
        .select({ resultado: escaneos.resultado, total: count() })
        .from(escaneos)
        .where(and(eq(escaneos.pantallaId, pantallaId), gte(escaneos.createdAt, inicio)))
        .groupBy(escaneos.resultado);
      return {
        qr: qr.map((q) => ({
          inicioAt: q.inicioAt.toISOString(),
          finAt: q.finAt?.toISOString() ?? null,
          modo: q.modo,
          epoca: q.epoca,
          franja: q.franja,
          finMotivo: q.finMotivo,
          reto: q.reto,
          invalidadoPor: getNombreCorto(q.invalidadoPor),
        })),
        aceptados: porResultado.find((r) => r.resultado === 'aceptado')?.total ?? 0,
        rechazos: porResultado
          .filter((r) => r.resultado !== 'aceptado')
          .sort((a, b) => b.total - a.total)
          .map((r) => ({ resultado: r.resultado, total: r.total })),
      };
    });
  }

  private async apply(
    tx: Tx,
    paso: {
      pantallaId: string;
      eventoId: string;
      organizacionId: string;
      datos: DatosControl;
      actor: ActorBitacora;
    },
  ) {
    const [pantalla] = await tx
      .select({
        id: pantallas.id,
        nombre: pantallas.nombre,
        estado: pantallas.estado,
        epoca: pantallas.epoca,
        lugarId: pantallas.lugarId,
        retoFijadoId: pantallas.retoActualId,
      })
      .from(pantallas)
      .where(and(eq(pantallas.id, paso.pantallaId), eq(pantallas.eventoId, paso.eventoId)))
      .for('update');
    if (!pantalla) throw new AppError('NO_ENCONTRADO');
    if (pantalla.estado === 'desconectada') throw new AppError('TERMINAL_DESCONECTADA');
    const { accion } = paso.datos;
    const ahora = this.reloj.now();
    let cambios: Partial<typeof pantallas.$inferInsert>;
    switch (accion) {
      case 'generar_otro':
        cambios = { epoca: pantalla.epoca + 1 };
        break;
      case 'pausar':
        cambios = { estado: 'pausada', epoca: pantalla.epoca + 1 };
        break;
      case 'reanudar':
        cambios = { estado: 'activa', epoca: pantalla.epoca + 1 };
        break;
      case 'cambiar_reto': {
        const retoId = paso.datos.retoId ?? null;
        if (retoId) {
          // Solo retos con QR del lugar y en horario.
          const opciones = this.getOpciones(
            await this.listRetos(tx, paso.eventoId),
            pantalla.lugarId,
            ahora,
          );
          if (!opciones.some((o) => o.id === retoId)) {
            throw new AppError('VALIDACION', {
              errors: [
                {
                  field: 'retoId',
                  code: 'NO_DISPONIBLE',
                  message: 'Ese reto no es de este lugar o no está en horario.',
                },
              ],
            });
          }
        }
        cambios = { retoActualId: retoId, epoca: pantalla.epoca + 1 };
        break;
      }
    }
    await tx
      .update(pantallas)
      .set({ ...cambios, updatedAt: ahora })
      .where(eq(pantallas.id, pantalla.id));
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: OUTBOX_POR_ACCION[accion],
      eventoId: paso.eventoId,
      payload: { eventoId: paso.eventoId, pantallaId: pantalla.id, epoca: cambios.epoca },
    });
    await this.bitacora.record(tx, {
      actor: paso.actor,
      accion: 'pantalla.control',
      organizacionId: paso.organizacionId,
      eventoId: paso.eventoId,
      objeto: { tipo: 'pantalla', id: pantalla.id, nombre: pantalla.nombre },
      despues: {
        accion,
        ...(accion === 'cambiar_reto' ? { retoId: paso.datos.retoId ?? null } : {}),
      },
    });
    return {
      id: pantalla.id,
      estado: cambios.estado ?? pantalla.estado,
      epoca: cambios.epoca ?? pantalla.epoca,
    };
  }

  private async recordFallo(terminal: TerminalConectada, fallos: number, ahora: Date) {
    await withOrganizacion(this.db, terminal.organizacionId, (tx) =>
      tx
        .update(pantallas)
        .set(
          fallos >= FALLOS_PIN
            ? {
                pinFallos: 0,
                controlesBloqueadosHasta: new Date(ahora.getTime() + BLOQUEO_PIN_MS),
              }
            : { pinFallos: sql`${pantallas.pinFallos} + 1` },
        )
        .where(eq(pantallas.id, terminal.id)),
    );
  }

  private listRetos(tx: Tx, eventoId: string) {
    return tx
      .select({
        id: retos.id,
        nombre: retos.nombre,
        lugarId: retos.lugarId,
        tipo: retos.tipo,
        estado: retos.estado,
        modoQr: retos.modoQr,
        disponibleDesde: retos.disponibleDesde,
        disponibleHasta: retos.disponibleHasta,
        entregados: retos.entregados,
        topeTotal: retos.topeTotal,
      })
      .from(retos)
      .where(and(eq(retos.eventoId, eventoId), eq(retos.tipo, 'qr')));
  }

  /** Los retos que se pueden elegir con *Cambiar de reto* (la regla vive en `libs/dominio`). */
  private getOpciones(
    filas: Awaited<ReturnType<ControlesPantallaService['listRetos']>>,
    lugarId: string | null,
    ahora: Date,
  ): { id: string; nombre: string }[] {
    return listRetosElegibles(filas, lugarId, ahora).map((r) => ({ id: r.id, nombre: r.nombre }));
  }
}
