import { createPublicKey } from 'node:crypto';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  eventos,
  lugares,
  mesas,
  miembroTerminales,
  miembrosEvento,
  outbox,
  pantallas,
  tokens,
  usuarios,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { buildNombreReemplazo, type LlavePublicaJwk } from '@pasitos/dominio/esquemas';
import { toLlaveCruda } from '@pasitos/firmas';
import { uuidv7 } from 'uuidv7';
import type { Provider } from '@nestjs/common';
import { DbSistemaService } from '../../infra/db/db.module';
import { createTokenAleatorio, hashToken } from '../auth/auth.repository';
import { Limitador } from '../auth/limitador';
import { RELOJ, type Reloj } from '../auth/sesiones.service';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';
import type { TipoTerminal } from './terminales.service';

export const COOKIE_TERMINAL = 'px_terminal';

const PUBLICADOS = ['publicado', 'en_curso', 'pausado'];
/** Como mucho una escritura del latido cada 20 s (HU-209 §2). */
const LATIDO_MINIMO_MS = 20_000;

export interface TerminalConectada {
  readonly tipo: TipoTerminal;
  readonly id: string;
  readonly nombre: string;
  readonly lugar: string | null;
  readonly evento: { readonly id: string; readonly nombre: string };
}

/**
 * Conectar una tablet con su token de un solo uso y el latido (HU-209 §2 y §3). Llegan sin sesión
 * del equipo y con un token que no dice de qué organización es: por eso usan la conexión de sistema.
 */
export class ConexionService {
  private readonly bitacora = new BitacoraService();
  private readonly porIp: Limitador;

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {
    this.porIp = new Limitador([{ maximo: 10, ms: 60_000 }], () => this.reloj.now().getTime());
  }

  async connect(
    token: string,
    llavePublica: LlavePublicaJwk | undefined,
    ip: string,
  ): Promise<{ sesion: string; terminal: TerminalConectada }> {
    const espera = this.porIp.hit(ip);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    return this.db.transaction(async (tx) => {
      const ahora = this.reloj.now();
      const [fila] = await tx
        .select()
        .from(tokens)
        .where(
          and(
            eq(tokens.tokenHash, hashToken(token)),
            inArray(tokens.proposito, ['conexion_pantalla', 'conexion_mesa']),
          ),
        )
        .for('update');
      if (!fila?.refId || !fila.eventoId) {
        throw new AppError('ENLACE_VENCIDO');
      }
      if (fila.usadoAt) {
        throw new AppError('ENLACE_YA_USADO');
      }
      if (fila.revocadoAt || fila.expiraAt <= ahora) {
        throw new AppError('ENLACE_VENCIDO');
      }
      await tx.update(tokens).set({ usadoAt: ahora }).where(eq(tokens.id, fila.id));
      // Usar uno anula el otro (V12).
      await tx
        .update(tokens)
        .set({ revocadoAt: ahora })
        .where(
          and(
            eq(tokens.proposito, fila.proposito),
            eq(tokens.refId, fila.refId),
            ne(tokens.id, fila.id),
            isNull(tokens.usadoAt),
            isNull(tokens.revocadoAt),
          ),
        );

      const [evento] = await tx
        .select({
          id: eventos.id,
          nombre: eventos.nombre,
          estado: eventos.estado,
          organizacionId: eventos.organizacionId,
        })
        .from(eventos)
        .where(eq(eventos.id, fila.eventoId));
      if (!evento || evento.estado === 'cerrado') {
        throw new AppError('ENLACE_VENCIDO');
      }
      const actor = await this.getActor(tx, fila.creadoPor, evento.id);
      const { token: sesion, hash } = createTokenAleatorio();
      const terminal =
        fila.proposito === 'conexion_pantalla'
          ? await this.connectPantalla(tx, {
              pantallaId: fila.refId,
              llavePublica,
              motivo: fila.motivo,
              creadoPor: fila.creadoPor,
              sesionHash: hash,
              evento,
              actor,
              ahora,
            })
          : await this.connectMesa(tx, fila.refId, fila.creadoPor, hash, evento, actor, ahora);
      return { sesion, terminal };
    });
  }

  /** La terminal sigue en línea. Sin sesión válida (desconectada o reemplazada): `401`. */
  async beat(sesion: string | undefined): Promise<TerminalConectada> {
    if (!sesion) {
      throw new AppError('TERMINAL_DESCONECTADA');
    }
    const hash = hashToken(sesion);
    const ahora = this.reloj.now();
    const reciente = (ultimo: Date | null) =>
      ultimo !== null && ahora.getTime() - ultimo.getTime() < LATIDO_MINIMO_MS;

    const [pantalla] = await this.db
      .select({
        id: pantallas.id,
        nombre: pantallas.nombre,
        ultimo: pantallas.ultimoContactoAt,
        lugar: lugares.nombre,
        eventoId: eventos.id,
        evento: eventos.nombre,
      })
      .from(pantallas)
      .innerJoin(eventos, eq(eventos.id, pantallas.eventoId))
      .leftJoin(lugares, eq(lugares.id, pantallas.lugarId))
      .where(eq(pantallas.sessionTokenHash, hash));
    if (pantalla) {
      if (!reciente(pantalla.ultimo)) {
        await this.db
          .update(pantallas)
          .set({ ultimoContactoAt: ahora })
          .where(eq(pantallas.id, pantalla.id));
      }
      return {
        tipo: 'pantalla',
        id: pantalla.id,
        nombre: pantalla.nombre,
        lugar: pantalla.lugar,
        evento: { id: pantalla.eventoId, nombre: pantalla.evento },
      };
    }
    const [mesa] = await this.db
      .select({
        id: mesas.id,
        nombre: mesas.nombre,
        ultimo: mesas.ultimoContactoAt,
        lugar: lugares.nombre,
        eventoId: eventos.id,
        evento: eventos.nombre,
      })
      .from(mesas)
      .innerJoin(eventos, eq(eventos.id, mesas.eventoId))
      .leftJoin(lugares, eq(lugares.id, mesas.lugarId))
      .where(eq(mesas.sessionTokenHash, hash));
    if (!mesa) {
      throw new AppError('TERMINAL_DESCONECTADA');
    }
    if (!reciente(mesa.ultimo)) {
      await this.db.update(mesas).set({ ultimoContactoAt: ahora }).where(eq(mesas.id, mesa.id));
    }
    return {
      tipo: 'mesa',
      id: mesa.id,
      nombre: mesa.nombre,
      lugar: mesa.lugar,
      evento: { id: mesa.eventoId, nombre: mesa.evento },
    };
  }

  // ── Pantalla: una pantalla es una tablet (§3) ─────────────────────────────

  private async connectPantalla(
    tx: Tx,
    datos: {
      pantallaId: string;
      llavePublica: LlavePublicaJwk | undefined;
      motivo: string | null;
      creadoPor: string | null;
      sesionHash: Buffer;
      evento: { id: string; nombre: string; estado: string; organizacionId: string };
      actor: ActorBitacora;
      ahora: Date;
    },
  ): Promise<TerminalConectada> {
    const { evento, actor, ahora } = datos;
    if (!datos.llavePublica) {
      throw new AppError('VALIDACION', {
        errors: [
          { field: 'llavePublica', code: 'REQUERIDO', message: 'Falta la llave de la pantalla.' },
        ],
      });
    }
    const llave = Buffer.from(toLlaveCruda(checkPuntoP256(datos.llavePublica)));
    const [anterior] = await tx
      .select()
      .from(pantallas)
      .where(eq(pantallas.id, datos.pantallaId))
      .for('update');
    if (!anterior || anterior.reemplazadaPor) {
      throw new AppError('ENLACE_VENCIDO');
    }

    let pantalla = anterior;
    const enStellar = anterior.registradaEnStellarAt !== null;
    const mismaLlave = anterior.llavePublica !== null && llave.equals(anterior.llavePublica);
    if (enStellar && !mismaLlave) {
      // Otra tablet con la pantalla ya en el contrato: pantalla nueva con otro número.
      if (!datos.motivo) {
        throw new AppError('ENLACE_VENCIDO', {
          detail:
            'La pantalla se registró en Stellar después de generar este enlace. Genera uno nuevo.',
        });
      }
      const nuevaId = uuidv7();
      await tx.insert(pantallas).values({
        id: nuevaId,
        organizacionId: anterior.organizacionId,
        eventoId: anterior.eventoId,
        nombre: buildNombreReemplazo(anterior.nombre),
        lugarId: anterior.lugarId,
        pinHash: anterior.pinHash,
        motivoReemplazo: datos.motivo,
        createdBy: datos.creadoPor,
      });
      await tx
        .update(pantallas)
        .set({
          estado: 'desconectada',
          sessionTokenHash: null,
          epoca: anterior.epoca + 1,
          reemplazadaPor: nuevaId,
          updatedAt: ahora,
        })
        .where(eq(pantallas.id, anterior.id));
      // Los operadores de stand pasan a la nueva en la misma transacción.
      await tx
        .update(miembroTerminales)
        .set({ pantallaId: nuevaId })
        .where(eq(miembroTerminales.pantallaId, anterior.id));
      const [nueva] = await tx.select().from(pantallas).where(eq(pantallas.id, nuevaId));
      if (!nueva) {
        throw new AppError('ERROR_INTERNO');
      }
      await this.bitacora.record(tx, {
        actor,
        accion: 'pantalla.replace',
        organizacionId: evento.organizacionId,
        eventoId: evento.id,
        objeto: { tipo: 'pantalla', id: nueva.id, nombre: nueva.nombre },
        antes: { pantallaId: anterior.id, numero: anterior.numero },
        despues: { pantallaId: nueva.id, numero: nueva.numero, motivo: datos.motivo },
      });
      pantalla = nueva;
    }

    await tx
      .update(pantallas)
      .set({
        llavePublica: llave,
        sessionTokenHash: datos.sesionHash,
        estado: 'activa',
        conectadaPor: datos.creadoPor,
        conectadaAt: ahora,
        ultimoContactoAt: ahora,
        epoca: pantalla.epoca + 1,
        updatedAt: ahora,
      })
      .where(eq(pantallas.id, pantalla.id));
    if (PUBLICADOS.includes(evento.estado) && pantalla.registradaEnStellarAt === null) {
      await tx.insert(outbox).values({
        id: uuidv7(),
        tipo: 'pantalla.conectada',
        eventoId: evento.id,
        payload: { eventoId: evento.id, pantallaId: pantalla.id },
      });
    }
    await this.bitacora.record(tx, {
      actor,
      accion: 'pantalla.connect',
      organizacionId: evento.organizacionId,
      eventoId: evento.id,
      objeto: { tipo: 'pantalla', id: pantalla.id, nombre: pantalla.nombre },
    });
    return {
      tipo: 'pantalla',
      id: pantalla.id,
      nombre: pantalla.nombre,
      lugar: await this.getNombreLugar(tx, pantalla.lugarId),
      evento: { id: evento.id, nombre: evento.nombre },
    };
  }

  private async connectMesa(
    tx: Tx,
    mesaId: string,
    creadoPor: string | null,
    sesionHash: Buffer,
    evento: { id: string; nombre: string; organizacionId: string },
    actor: ActorBitacora,
    ahora: Date,
  ): Promise<TerminalConectada> {
    const [mesa] = await tx.select().from(mesas).where(eq(mesas.id, mesaId)).for('update');
    if (!mesa) {
      throw new AppError('ENLACE_VENCIDO');
    }
    await tx
      .update(mesas)
      .set({
        sessionTokenHash: sesionHash,
        estado: 'activa',
        conectadaPor: creadoPor,
        conectadaAt: ahora,
        ultimoContactoAt: ahora,
        updatedAt: ahora,
      })
      .where(eq(mesas.id, mesa.id));
    await this.bitacora.record(tx, {
      actor,
      accion: 'mesa.connect',
      organizacionId: evento.organizacionId,
      eventoId: evento.id,
      objeto: { tipo: 'mesa', id: mesa.id, nombre: mesa.nombre },
    });
    return {
      tipo: 'mesa',
      id: mesa.id,
      nombre: mesa.nombre,
      lugar: await this.getNombreLugar(tx, mesa.lugarId),
      evento: { id: evento.id, nombre: evento.nombre },
    };
  }

  /** En la bitácora, la conexión la hizo quien generó el token. */
  private async getActor(
    tx: Tx,
    usuarioId: string | null,
    eventoId: string,
  ): Promise<ActorBitacora> {
    if (!usuarioId) {
      return { tipo: 'sistema', nombre: 'Pasitos (automático)' };
    }
    const [usuario] = await tx
      .select({ nombre: usuarios.nombre })
      .from(usuarios)
      .where(eq(usuarios.id, usuarioId));
    const [miembro] = await tx
      .select({ rol: miembrosEvento.rol })
      .from(miembrosEvento)
      .where(
        and(
          eq(miembrosEvento.usuarioId, usuarioId),
          eq(miembrosEvento.eventoId, eventoId),
          eq(miembrosEvento.estado, 'activo'),
        ),
      );
    return {
      tipo: 'usuario',
      id: usuarioId,
      nombre: usuario?.nombre ?? 'Usuario',
      rol: miembro?.rol ?? 'dueno',
      dispositivo: null,
    };
  }

  private async getNombreLugar(tx: Tx, lugarId: string | null): Promise<string | null> {
    if (!lugarId) {
      return null;
    }
    const [lugar] = await tx
      .select({ nombre: lugares.nombre })
      .from(lugares)
      .where(eq(lugares.id, lugarId));
    return lugar?.nombre ?? null;
  }
}

/** Que la llave sea un punto de la curva: `createPublicKey` lo comprueba. */
function checkPuntoP256(jwk: LlavePublicaJwk): LlavePublicaJwk {
  try {
    createPublicKey({ key: { ...jwk }, format: 'jwk' });
  } catch {
    throw new AppError('VALIDACION', {
      errors: [
        {
          field: 'llavePublica',
          code: 'NO_VALIDO',
          message: 'La llave de la pantalla no es válida.',
        },
      ],
    });
  }
  return jwk;
}

/** El proveedor, aquí y no en el módulo: la conexión de sistema queda solo en este archivo. */
export const PROVEEDOR_CONEXION: Provider = {
  provide: ConexionService,
  inject: [DbSistemaService, RELOJ],
  useFactory: (db: DbSistemaService, reloj: Reloj) => new ConexionService(db.db, reloj),
};
