import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  alertas,
  asistentes,
  dispositivos,
  outbox,
  usuarios,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { getNombreCorto } from './check-in.service';

/** Lo que no reconoce la persona, en palabras de la puerta. */
const QUE_NO_RECONOCE: Readonly<Record<string, string>> = {
  dispositivo: 'No reconoce un dispositivo',
  intento: 'No reconoce un intento de entrar',
  canje: 'No reconoce un canje',
};

export interface AlertaPuerta {
  readonly id: string;
  readonly tipo: string;
  readonly estado: string;
  readonly prioridad: string;
  readonly at: string;
  readonly asistente: {
    readonly id: string;
    readonly nombre: string;
    readonly codigo: string;
  } | null;
  readonly queNoReconoce: string | null;
  /** HU-318: la frase de la alerta y el modelo del celular. Nunca la IP ni la huella. */
  readonly frase: string;
  readonly modelo: string | null;
  /** Desde el celular anulado o el actual. */
  readonly desde: string | null;
  readonly atendidaPor: string | null;
  readonly resolucion: string | null;
}

/**
 * La frase de cada alerta (HU-318 §3), con nombres y el modelo del celular: nunca la IP ni la
 * huella (Acceso §6.3).
 */
export function describeAlerta(
  tipo: string,
  ctx: {
    nombre: string | null;
    modelo: string | null;
    datos: Record<string, unknown>;
    nombres: ReadonlyMap<string, string>;
  },
): string {
  const quien = ctx.nombre ?? 'Alguien';
  const nombreDe = (clave: string) => {
    const id = ctx.datos[clave];
    return typeof id === 'string' ? (ctx.nombres.get(id) ?? 'otra persona') : 'otra persona';
  };
  const celular = ctx.modelo ? ` (${ctx.modelo})` : '';
  switch (tipo) {
    case 'A1':
      return `${quien} y ${nombreDe('otroAsistenteId')} usan el mismo celular${celular}`;
    case 'A2':
      return `El celular de ${quien}${celular} intentó abrir otra inscripción`;
    case 'A3':
      return `${nombreDe('registradorId')} registró o vinculó ${String(ctx.datos['personas'] ?? 'muchas')} personas en 10 minutos`;
    case 'A4':
      return `Muchas revinculaciones: ${quien} o ${nombreDe('registradorId')}`;
    case 'A5':
      return `${quien} reclamó en dos lugares distintos en menos de un minuto`;
    case 'A6':
      return 'Muchos QR vencidos después de cada cambio en una pantalla: puede circular una foto del QR';
    case 'A7':
      return `El celular anulado de ${quien}${celular} sigue intentando entrar`;
    case 'A8':
      return `El celular de ${quien}${celular} parece automatizado`;
    case 'no_fui_yo':
      return `${quien} dice «No fui yo»`;
    default:
      return `Alerta ${tipo} sobre ${quien}`;
  }
}

/** El aviso, después de escribirlo: avisa a todos los que lo ven en vivo (T-301). */
async function notify(tx: Tx, eventoId: string, alertaId: string, tipo: string, estado: string) {
  await tx.insert(outbox).values({
    id: uuidv7(),
    tipo: 'alerta.actualizada',
    eventoId,
    payload: { eventoId, alertaId, tipo, estado },
  });
}

/** Cierra el aviso que pidió el acceso nuevo, al vincular el celular (HU-305 §1, *Revincular*). */
export async function closeAlertaRevincular(
  tx: Tx,
  datos: { alertaId: string; eventoId: string; ahora: Date },
): Promise<void> {
  const [cerrada] = await tx
    .update(alertas)
    .set({ estado: 'resuelta', resolucion: 'revincular', resueltaAt: datos.ahora })
    .where(
      and(
        eq(alertas.id, datos.alertaId),
        eq(alertas.eventoId, datos.eventoId),
        inArray(alertas.estado, ['abierta', 'atendiendo', 'derivada']),
      ),
    )
    .returning({ tipo: alertas.tipo });
  if (cerrada) {
    await notify(tx, datos.eventoId, datos.alertaId, cerrada.tipo, 'resuelta');
  }
}

/**
 * Los avisos *No fui yo* en la puerta (HU-305): verlos, tomarlos y resolverlos. El registrador
 * solo ve los *No fui yo*; las alertas A1–A11 son del organizador (HU-318).
 */
export class AlertasPuertaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  list(
    contexto: ContextoEvento,
    filtros: { tipo?: string | undefined; estado?: string | undefined },
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const condiciones: SQL[] = [eq(alertas.eventoId, contexto.eventoId)];
      const tipo = contexto.rol === 'registrador' ? 'no_fui_yo' : filtros.tipo;
      if (tipo) condiciones.push(eq(alertas.tipo, tipo));
      if (filtros.estado) {
        condiciones.push(eq(alertas.estado, filtros.estado));
      } else {
        condiciones.push(inArray(alertas.estado, ['abierta', 'atendiendo', 'derivada']));
      }
      const filas = await tx
        .select({
          id: alertas.id,
          tipo: alertas.tipo,
          estado: alertas.estado,
          prioridad: alertas.prioridad,
          at: alertas.createdAt,
          datos: alertas.datos,
          resolucion: alertas.resolucion,
          asistenteId: asistentes.id,
          nombre: asistentes.nombre,
          codigo: asistentes.codigoAsistente,
          atendidaPor: usuarios.nombre,
          modelo: dispositivos.modelo,
        })
        .from(alertas)
        .leftJoin(asistentes, eq(asistentes.id, alertas.asistenteId))
        .leftJoin(usuarios, eq(usuarios.id, alertas.atendidaPor))
        .leftJoin(dispositivos, eq(dispositivos.id, alertas.dispositivoId))
        .where(and(...condiciones))
        // Los derivados arriba, después los de prioridad alta y los más viejos.
        .orderBy(
          desc(sql`${alertas.estado} = 'derivada'`),
          desc(sql`${alertas.prioridad} = 'alta'`),
          alertas.createdAt,
        )
        .limit(100);
      // Los nombres que aparecen en las frases (la otra persona de una A1, el registrador de una A3).
      const ids = new Set<string>();
      for (const f of filas) {
        const d = (f.datos ?? {}) as Record<string, unknown>;
        for (const clave of ['otroAsistenteId', 'registradorId']) {
          if (typeof d[clave] === 'string') ids.add(d[clave]);
        }
      }
      const nombres = new Map<string, string>();
      if (ids.size > 0) {
        const lista = [...ids];
        for (const p of await tx
          .select({ id: asistentes.id, nombre: asistentes.nombre })
          .from(asistentes)
          .where(inArray(asistentes.id, lista))) {
          nombres.set(p.id, p.nombre);
        }
        for (const u of await tx
          .select({ id: usuarios.id, nombre: usuarios.nombre })
          .from(usuarios)
          .where(inArray(usuarios.id, lista))) {
          nombres.set(u.id, getNombreCorto(u.nombre) ?? u.nombre);
        }
      }
      return {
        items: filas.map((f): AlertaPuerta => {
          const datos = (f.datos ?? {}) as { sobre?: string; desde?: string };
          return {
            id: f.id,
            tipo: f.tipo,
            estado: f.estado,
            prioridad: f.prioridad,
            at: f.at.toISOString(),
            asistente: f.asistenteId
              ? { id: f.asistenteId, nombre: f.nombre ?? '', codigo: f.codigo ?? '' }
              : null,
            queNoReconoce: datos.sobre ? (QUE_NO_RECONOCE[datos.sobre] ?? null) : null,
            desde: datos.desde ?? null,
            atendidaPor: getNombreCorto(f.atendidaPor),
            resolucion: f.resolucion,
            frase: describeAlerta(f.tipo, {
              nombre: f.nombre,
              modelo: f.modelo,
              datos: (f.datos ?? {}) as Record<string, unknown>,
              nombres,
            }),
            modelo: f.modelo,
          };
        }),
        pagination: { nextCursor: null },
      };
    });
  }

  /** La toma a su nombre. Si otro la tomó: `ALERTA_YA_ATENDIDA` con quién. */
  attend(contexto: ContextoEvento, alertaId: string) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const alerta = await this.lock(tx, contexto, alertaId);
      if (alerta.estado === 'atendiendo' && alerta.atendidaPor !== contexto.usuarioId) {
        const [quien] = await tx
          .select({ nombre: usuarios.nombre })
          .from(usuarios)
          .where(eq(usuarios.id, alerta.atendidaPor ?? ''));
        throw new AppError('ALERTA_YA_ATENDIDA', {
          detail: `Lo está atendiendo ${getNombreCorto(quien?.nombre ?? null) ?? 'otra persona'}.`,
          meta: { por: getNombreCorto(quien?.nombre ?? null) },
        });
      }
      if (
        alerta.estado !== 'abierta' &&
        alerta.estado !== 'atendiendo' &&
        alerta.estado !== 'derivada'
      ) {
        throw new AppError('ALERTA_YA_ATENDIDA', { detail: 'Este aviso ya se resolvió.' });
      }
      const ahora = this.reloj.now();
      await tx
        .update(alertas)
        .set({ estado: 'atendiendo', atendidaPor: contexto.usuarioId, atendidaAt: ahora })
        .where(eq(alertas.id, alertaId));
      await notify(tx, contexto.eventoId, alertaId, alerta.tipo, 'atendiendo');
      await this.record(tx, contexto, 'alerta.atender', alerta, { estado: 'atendiendo' });
      return { id: alertaId, estado: 'atendiendo', asistenteId: alerta.asistenteId };
    });
  }

  /**
   * Resolver (HU-305 §1): *descartar* con nota, *derivar* a los coorganizadores (solo el
   * registrador) o *revincular*, que se cierra sola al vincular el celular nuevo.
   */
  resolve(
    contexto: ContextoEvento,
    alertaId: string,
    datos: {
      resolucion: 'revincular' | 'descartar' | 'derivar' | 'revisada';
      nota?: string | undefined;
    },
  ) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const alerta = await this.lock(tx, contexto, alertaId);
      if (alerta.estado === 'atendiendo' && alerta.atendidaPor !== contexto.usuarioId) {
        throw new AppError('ALERTA_YA_ATENDIDA');
      }
      if (alerta.estado === 'resuelta' || alerta.estado === 'descartada') {
        throw new AppError('ALERTA_YA_ATENDIDA', { detail: 'Este aviso ya se resolvió.' });
      }
      if (datos.resolucion === 'revisada' && contexto.rol === 'registrador') {
        throw new AppError('SIN_PERMISO');
      }
      if (datos.resolucion === 'derivar' && contexto.rol !== 'registrador') {
        throw new AppError('SIN_PERMISO', {
          detail: 'Derivar es para el registrador: tú puedes resolverlo.',
        });
      }
      const ahora = this.reloj.now();
      const cambios =
        datos.resolucion === 'descartar'
          ? { estado: 'descartada', resueltaAt: ahora }
          : datos.resolucion === 'revisada'
            ? { estado: 'resuelta', resueltaAt: ahora, atendidaPor: contexto.usuarioId }
            : datos.resolucion === 'derivar'
              ? // Pasa a los coorganizadores: se suelta para que la tome uno de ellos.
                { estado: 'derivada', atendidaPor: null, atendidaAt: null }
              : // Revincular: sigue en atención hasta que el celular nuevo se vincule.
                { estado: 'atendiendo', atendidaPor: contexto.usuarioId, atendidaAt: ahora };
      await tx
        .update(alertas)
        .set({ ...cambios, resolucion: datos.resolucion, nota: datos.nota ?? null })
        .where(eq(alertas.id, alertaId));
      await notify(tx, contexto.eventoId, alertaId, alerta.tipo, cambios.estado);
      await this.record(tx, contexto, 'alerta.resolver', alerta, {
        estado: cambios.estado,
        resolucion: datos.resolucion,
        ...(datos.nota ? { nota: datos.nota } : {}),
      });
      return { id: alertaId, estado: cambios.estado, resolucion: datos.resolucion };
    });
  }

  private async lock(tx: Tx, contexto: ContextoEvento, alertaId: string) {
    const [alerta] = await tx
      .select({
        id: alertas.id,
        tipo: alertas.tipo,
        estado: alertas.estado,
        atendidaPor: alertas.atendidaPor,
        asistenteId: alertas.asistenteId,
      })
      .from(alertas)
      .where(and(eq(alertas.id, alertaId), eq(alertas.eventoId, contexto.eventoId)))
      .for('update');
    // El registrador no ve las alertas A1–A11: para él no existen.
    if (!alerta || (contexto.rol === 'registrador' && alerta.tipo !== 'no_fui_yo')) {
      throw new AppError('NO_ENCONTRADO');
    }
    return alerta;
  }

  private async record(
    tx: Tx,
    contexto: ContextoEvento,
    accion: 'alerta.atender' | 'alerta.resolver',
    alerta: { id: string; tipo: string; estado: string },
    despues: Record<string, unknown>,
  ) {
    await this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: 'alerta', id: alerta.id, nombre: alerta.tipo },
      antes: { estado: alerta.estado },
      despues,
    });
  }
}
