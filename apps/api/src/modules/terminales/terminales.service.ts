import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  lugares,
  mesas,
  miembroTerminales,
  miembrosEvento,
  outbox,
  pantallas,
  tokens,
  usuarios,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import {
  getEstadoConexion,
  VIGENCIA_ENLACE_CONEXION_MS,
  VIGENCIA_QR_CONEXION_MS,
} from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { createTokenAleatorio } from '../auth/auth.repository';
import { hashPassword } from '../auth/password';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';

export type TipoTerminal = 'pantalla' | 'mesa';

type Pantalla = typeof pantallas.$inferSelect;
type Mesa = typeof mesas.$inferSelect;

export interface DatosPantalla {
  readonly nombre?: string | undefined;
  readonly lugarId?: string | undefined;
  readonly pin?: string | undefined;
}

export interface DatosMesa {
  readonly nombre?: string | undefined;
  readonly lugarId?: string | null | undefined;
}

export interface Conexion {
  readonly qr: string;
  readonly enlace: string;
  readonly expiraQrAt: string;
  readonly expiraEnlaceAt: string;
}

const PROPOSITO = { pantalla: 'conexion_pantalla', mesa: 'conexion_mesa' } as const;
const RUTA_APP = { pantalla: 'sala', mesa: 'mesa' } as const;

/**
 * Pantallas y mesas desde el panel (HU-209 §2 y §5): crearlas, generar su conexión y
 * desconectarlas. Conectar la tablet y el latido están en `ConexionService` (sin sesión del equipo).
 */
export class TerminalesService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly publicUrl: string,
  ) {}

  // ── Pantallas ──────────────────────────────────────────────────────────────

  listPantallas(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select({
          pantalla: pantallas,
          lugar: { id: lugares.id, nombre: lugares.nombre },
          conectadaPor: { nombre: usuarios.nombre },
        })
        .from(pantallas)
        .leftJoin(lugares, eq(lugares.id, pantallas.lugarId))
        .leftJoin(usuarios, eq(usuarios.id, pantallas.conectadaPor))
        .where(eq(pantallas.eventoId, contexto.eventoId))
        .orderBy(asc(pantallas.numero));
      const operadores = await this.listOperadores(tx, contexto, 'pantalla');
      const ahora = this.reloj.now();
      return filas.map(({ pantalla, lugar, conectadaPor }) => ({
        id: pantalla.id,
        numero: pantalla.numero,
        nombre: pantalla.nombre,
        lugar: lugar?.id ? lugar : null,
        estado: pantalla.estado,
        conexion: getEstadoConexion(pantalla.estado, pantalla.ultimoContactoAt, ahora),
        conectadaPor: conectadaPor?.nombre ? conectadaPor : null,
        conectadaAt: pantalla.conectadaAt?.toISOString() ?? null,
        ultimoContactoAt: pantalla.ultimoContactoAt?.toISOString() ?? null,
        tieneLlave: pantalla.llavePublica !== null,
        registradaEnStellarAt: pantalla.registradaEnStellarAt?.toISOString() ?? null,
        tienePin: pantalla.pinHash !== null,
        reemplazadaPor: pantalla.reemplazadaPor,
        reemplazaA:
          filas.find((f) => f.pantalla.reemplazadaPor === pantalla.id)?.pantalla.id ?? null,
        motivoReemplazo: pantalla.motivoReemplazo,
        operadores: operadores.get(pantalla.id) ?? [],
      }));
    });
  }

  async createPantalla(
    contexto: ContextoEvento,
    datos: { nombre: string; lugarId: string; pin: string },
  ) {
    const pinHash = await hashPassword(datos.pin);
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await this.checkLugar(tx, contexto, datos.lugarId);
      const id = uuidv7();
      await tx.insert(pantallas).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        nombre: datos.nombre,
        lugarId: datos.lugarId,
        pinHash,
        createdBy: contexto.usuarioId,
      });
      await this.record(
        tx,
        toActor(contexto),
        contexto,
        'pantalla.create',
        'pantalla',
        id,
        datos.nombre,
        {
          nombre: datos.nombre,
          lugarId: datos.lugarId,
        },
      );
      return { id };
    });
  }

  async updatePantalla(contexto: ContextoEvento, id: string, datos: DatosPantalla) {
    const pinHash = datos.pin === undefined ? undefined : await hashPassword(datos.pin);
    await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getPantalla(tx, contexto, id);
      if (datos.lugarId !== undefined) {
        await this.checkLugar(tx, contexto, datos.lugarId);
      }
      await tx
        .update(pantallas)
        .set({
          ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
          ...(datos.lugarId === undefined ? {} : { lugarId: datos.lugarId }),
          ...(pinHash === undefined ? {} : { pinHash }),
          updatedAt: this.reloj.now(),
        })
        .where(eq(pantallas.id, id));
      // El PIN nunca va a la bitácora: solo que cambió.
      await this.record(
        tx,
        toActor(contexto),
        contexto,
        'pantalla.update',
        'pantalla',
        id,
        datos.nombre ?? actual.nombre,
        {
          ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
          ...(datos.lugarId === undefined ? {} : { lugarId: datos.lugarId }),
          ...(pinHash === undefined ? {} : { pinCambiado: true }),
        },
        {
          ...(datos.nombre === undefined ? {} : { nombre: actual.nombre }),
          ...(datos.lugarId === undefined ? {} : { lugarId: actual.lugarId }),
        },
      );
    });
  }

  // ── Mesas ──────────────────────────────────────────────────────────────────

  listMesas(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select({
          mesa: mesas,
          lugar: { id: lugares.id, nombre: lugares.nombre },
          conectadaPor: { nombre: usuarios.nombre },
        })
        .from(mesas)
        .leftJoin(lugares, eq(lugares.id, mesas.lugarId))
        .leftJoin(usuarios, eq(usuarios.id, mesas.conectadaPor))
        .where(eq(mesas.eventoId, contexto.eventoId))
        .orderBy(asc(mesas.createdAt));
      const operadores = await this.listOperadores(tx, contexto, 'mesa');
      const ahora = this.reloj.now();
      return filas.map(({ mesa, lugar, conectadaPor }) => ({
        id: mesa.id,
        nombre: mesa.nombre,
        lugar: lugar?.id ? lugar : null,
        estado: mesa.estado,
        conexion: getEstadoConexion(mesa.estado, mesa.ultimoContactoAt, ahora),
        conectadaPor: conectadaPor?.nombre ? conectadaPor : null,
        conectadaAt: mesa.conectadaAt?.toISOString() ?? null,
        ultimoContactoAt: mesa.ultimoContactoAt?.toISOString() ?? null,
        operadores: operadores.get(mesa.id) ?? [],
      }));
    });
  }

  createMesa(contexto: ContextoEvento, datos: { nombre: string; lugarId: string | null }) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      if (datos.lugarId) {
        await this.checkLugar(tx, contexto, datos.lugarId);
      }
      const id = uuidv7();
      await tx.insert(mesas).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        nombre: datos.nombre,
        lugarId: datos.lugarId,
        createdBy: contexto.usuarioId,
      });
      await this.record(
        tx,
        toActor(contexto),
        contexto,
        'mesa.create',
        'mesa',
        id,
        datos.nombre,
        datos,
      );
      return { id };
    });
  }

  updateMesa(contexto: ContextoEvento, id: string, datos: DatosMesa) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.getMesa(tx, contexto, id);
      if (datos.lugarId) {
        await this.checkLugar(tx, contexto, datos.lugarId);
      }
      await tx
        .update(mesas)
        .set({ ...datos, updatedAt: this.reloj.now() })
        .where(eq(mesas.id, id));
      await this.record(
        tx,
        toActor(contexto),
        contexto,
        'mesa.update',
        'mesa',
        id,
        datos.nombre ?? actual.nombre,
        { ...datos },
        {
          ...(datos.nombre === undefined ? {} : { nombre: actual.nombre }),
          ...(datos.lugarId === undefined ? {} : { lugarId: actual.lugarId }),
        },
      );
    });
  }

  // ── Conexión ───────────────────────────────────────────────────────────────

  /**
   * Dos tokens de un solo uso: el del QR (2 min) y el del enlace (24 h). Generar de nuevo revoca
   * los anteriores; usar uno anula el otro (V12). Si la pantalla ya está en Stellar, conectar otra
   * tablet crea una pantalla nueva: hace falta el motivo.
   */
  async createConexion(
    contexto: ContextoEvento,
    tipo: TipoTerminal,
    id: string,
    motivo: string | undefined,
  ): Promise<Conexion & { requiereMotivo: boolean }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      let requiereMotivo = false;
      if (tipo === 'pantalla') {
        const pantalla = await this.getPantalla(tx, contexto, id);
        if (pantalla.reemplazadaPor) {
          throw new AppError('TRANSICION_NO_PERMITIDA', {
            detail: 'Esta pantalla ya fue reemplazada: conecta la nueva.',
          });
        }
        requiereMotivo = pantalla.registradaEnStellarAt !== null;
        if (requiereMotivo && !motivo) {
          throw new AppError('VALIDACION', {
            detail:
              'Esta pantalla ya está registrada en Stellar: indica por qué conectas otra tablet.',
            errors: [
              {
                field: 'motivo',
                code: 'REQUERIDO',
                message: 'Indica el motivo (de 5 a 300 caracteres).',
              },
            ],
          });
        }
      } else {
        await this.getMesa(tx, contexto, id);
      }
      const ahora = this.reloj.now();
      await tx
        .update(tokens)
        .set({ revocadoAt: ahora })
        .where(
          and(
            eq(tokens.proposito, PROPOSITO[tipo]),
            eq(tokens.refId, id),
            isNull(tokens.usadoAt),
            isNull(tokens.revocadoAt),
          ),
        );
      const crear = async (vigenciaMs: number) => {
        const { token, hash } = createTokenAleatorio();
        const expiraAt = new Date(ahora.getTime() + vigenciaMs);
        await tx.insert(tokens).values({
          id: uuidv7(),
          tokenHash: hash,
          proposito: PROPOSITO[tipo],
          eventoId: contexto.eventoId,
          refId: id,
          creadoPor: contexto.usuarioId,
          motivo: requiereMotivo ? (motivo ?? null) : null,
          expiraAt,
        });
        return { url: `${this.publicUrl}/${RUTA_APP[tipo]}/conectar/${token}`, expiraAt };
      };
      const qr = await crear(VIGENCIA_QR_CONEXION_MS);
      const enlace = await crear(VIGENCIA_ENLACE_CONEXION_MS);
      return {
        qr: qr.url,
        enlace: enlace.url,
        expiraQrAt: qr.expiraAt.toISOString(),
        expiraEnlaceAt: enlace.expiraAt.toISOString(),
        requiereMotivo,
      };
    });
  }

  /** Desconectar al instante: la request siguiente de la terminal recibe `401` (HU-209 §2). */
  async disconnect(contexto: ContextoEvento, tipo: TipoTerminal, id: string): Promise<void> {
    await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const ahora = this.reloj.now();
      let nombre: string;
      if (tipo === 'pantalla') {
        const actual = await this.getPantalla(tx, contexto, id);
        nombre = actual.nombre;
        await tx
          .update(pantallas)
          .set({
            sessionTokenHash: null,
            estado: 'desconectada',
            epoca: actual.epoca + 1,
            updatedAt: ahora,
          })
          .where(eq(pantallas.id, id));
      } else {
        nombre = (await this.getMesa(tx, contexto, id)).nombre;
        await tx
          .update(mesas)
          .set({ sessionTokenHash: null, estado: 'desconectada', updatedAt: ahora })
          .where(eq(mesas.id, id));
      }
      // Los enlaces sin usar tampoco sirven más.
      await tx
        .update(tokens)
        .set({ revocadoAt: ahora })
        .where(
          and(
            eq(tokens.proposito, PROPOSITO[tipo]),
            eq(tokens.refId, id),
            isNull(tokens.usadoAt),
            isNull(tokens.revocadoAt),
          ),
        );
      await tx.insert(outbox).values({
        id: uuidv7(),
        tipo: 'terminal.desconectada',
        eventoId: contexto.eventoId,
        payload: { eventoId: contexto.eventoId, tipo, id },
      });
      await this.record(
        tx,
        toActor(contexto),
        contexto,
        tipo === 'pantalla' ? 'pantalla.disconnect' : 'mesa.disconnect',
        tipo,
        id,
        nombre,
      );
    });
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  private async listOperadores(tx: Tx, contexto: ContextoEvento, tipo: TipoTerminal) {
    const columna = tipo === 'pantalla' ? miembroTerminales.pantallaId : miembroTerminales.mesaId;
    const filas = await tx
      .select({ terminalId: columna, nombre: usuarios.nombre, email: miembrosEvento.emailInvitado })
      .from(miembroTerminales)
      .innerJoin(miembrosEvento, eq(miembrosEvento.id, miembroTerminales.miembroEventoId))
      .leftJoin(usuarios, eq(usuarios.id, miembrosEvento.usuarioId))
      .where(
        and(
          eq(miembrosEvento.eventoId, contexto.eventoId),
          inArray(miembrosEvento.estado, ['activo', 'invitado']),
        ),
      );
    const porTerminal = new Map<string, string[]>();
    for (const fila of filas) {
      if (fila.terminalId) {
        porTerminal.set(fila.terminalId, [
          ...(porTerminal.get(fila.terminalId) ?? []),
          fila.nombre ?? fila.email ?? 'Invitado',
        ]);
      }
    }
    return porTerminal;
  }

  private async checkLugar(tx: Tx, contexto: ContextoEvento, lugarId: string) {
    const [lugar] = await tx
      .select({ eventoId: lugares.eventoId })
      .from(lugares)
      .where(eq(lugares.id, lugarId));
    if (lugar?.eventoId !== contexto.eventoId) {
      throw new AppError('VALIDACION', {
        errors: [
          { field: 'lugarId', code: 'NO_VALIDO', message: 'Ese lugar no es de este evento.' },
        ],
      });
    }
  }

  private async getPantalla(tx: Tx, contexto: ContextoEvento, id: string): Promise<Pantalla> {
    const [pantalla] = await tx.select().from(pantallas).where(eq(pantallas.id, id)).for('update');
    if (pantalla?.eventoId !== contexto.eventoId) {
      throw new AppError('NO_ENCONTRADO');
    }
    return pantalla;
  }

  private async getMesa(tx: Tx, contexto: ContextoEvento, id: string): Promise<Mesa> {
    const [mesa] = await tx.select().from(mesas).where(eq(mesas.id, id)).for('update');
    if (mesa?.eventoId !== contexto.eventoId) {
      throw new AppError('NO_ENCONTRADO');
    }
    return mesa;
  }

  private record(
    tx: Tx,
    actor: ActorBitacora,
    contexto: ContextoEvento,
    accion:
      | 'pantalla.create'
      | 'pantalla.update'
      | 'pantalla.disconnect'
      | 'mesa.create'
      | 'mesa.update'
      | 'mesa.disconnect',
    tipo: TipoTerminal,
    id: string,
    nombre: string,
    despues?: Record<string, unknown>,
    antes?: Record<string, unknown>,
  ) {
    return this.bitacora.record(tx, {
      actor,
      accion,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo, id, nombre },
      ...(antes && Object.keys(antes).length > 0 ? { antes } : {}),
      ...(despues && Object.keys(despues).length > 0 ? { despues } : {}),
    });
  }
}
