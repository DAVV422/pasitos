import { and, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import {
  AppError,
  INTERVALOS_ANCLAJE_MIN,
  isIntervaloAnclaje,
  type IntervaloAnclajeMin,
} from '@pasitos/dominio';
import { eventos, organizaciones, transaccionesStellar, type Db } from '@pasitos/db';
import { BitacoraService, toActorBitacora } from '../bitacora/bitacora.service';

/** Quién actúa desde la consola de plataforma. Con HU-201 es la persona con sesión; antes, un comando. */
export interface ActorPlataforma {
  readonly tipo: 'usuario' | 'sistema';
  readonly id: string | null;
  readonly nombre: string;
  readonly rol: string | null;
}

/**
 * Acciones de Pasitos sobre los eventos de cualquier organización (consola de plataforma).
 * Usa la conexión de pasitos_sistema: la consola actúa sobre todas las organizaciones.
 * HU-202 la expone en PATCH /plataforma/eventos/:id; hasta entonces la usa `pnpm plataforma`.
 */
export class EventosPlataformaService {
  constructor(private readonly db: Db) {}

  /**
   * Cambia cada cuánto se ancla un evento (HU-105 §1). `null` vuelve al valor de la plataforma
   * (ANCLAJE_INTERVALO_MIN). Vale desde el ciclo siguiente: tick-sellador lo lee cada minuto.
   */
  async updateIntervaloAnclaje(
    eventoId: string,
    minutos: IntervaloAnclajeMin | null,
    actor: ActorPlataforma,
    motivo?: string,
  ): Promise<void> {
    if (minutos !== null && !isIntervaloAnclaje(minutos)) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'intervaloAnclajeMin',
            code: 'VALOR_NO_PERMITIDO',
            message: `Valores permitidos: ${INTERVALOS_ANCLAJE_MIN.join(', ')} o vacío.`,
          },
        ],
      });
    }
    await this.db.transaction(async (tx) => {
      const [evento] = await tx
        .select({
          id: eventos.id,
          organizacionId: eventos.organizacionId,
          nombre: eventos.nombre,
          intervaloAnclajeMin: eventos.intervaloAnclajeMin,
        })
        .from(eventos)
        .where(eq(eventos.id, eventoId))
        .for('update');
      if (!evento) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (evento.intervaloAnclajeMin === minutos) {
        return;
      }
      await tx
        .update(eventos)
        .set({ intervaloAnclajeMin: minutos, updatedAt: sql`now()` })
        .where(eq(eventos.id, eventoId));
      await new BitacoraService().record(tx, {
        actor: toActorBitacora(actor),
        accion: 'evento.intervalo_anclaje.update',
        organizacionId: evento.organizacionId,
        eventoId,
        objeto: { tipo: 'evento', id: eventoId, nombre: evento.nombre },
        antes: { intervaloAnclajeMin: evento.intervaloAnclajeMin },
        despues: { intervaloAnclajeMin: minutos, ...(motivo ? { motivo } : {}) },
      });
    });
  }

  /** Eventos de todas las organizaciones (HU-202 §3), del más nuevo al más viejo. */
  async listEventos(filtros: {
    organizacionId?: string | undefined;
    estado?: string | undefined;
    tipo?: string | undefined;
    cursor?: string | undefined;
    limit: number;
  }) {
    const condiciones: SQL[] = [];
    if (filtros.organizacionId)
      condiciones.push(eq(eventos.organizacionId, filtros.organizacionId));
    if (filtros.estado) condiciones.push(eq(eventos.estado, filtros.estado));
    if (filtros.tipo) condiciones.push(eq(eventos.tipo, filtros.tipo));
    if (filtros.cursor) condiciones.push(lt(eventos.id, filtros.cursor));
    const filas = await this.db
      .select({
        id: eventos.id,
        nombre: eventos.nombre,
        slug: eventos.slug,
        tipo: eventos.tipo,
        estado: eventos.estado,
        inicioAt: eventos.inicioAt,
        finAt: eventos.finAt,
        contratoId: eventos.contratoId,
        intervaloAnclajeMin: eventos.intervaloAnclajeMin,
        enRedHasta: eventos.enRedHasta,
        organizacion: { id: organizaciones.id, nombre: organizaciones.nombre },
        ultimoLoteConfirmadoAt: sql<Date | null>`(select max(l.confirmado_at) from lotes l
          where l.evento_id = "eventos"."id")`,
      })
      .from(eventos)
      .innerJoin(organizaciones, eq(organizaciones.id, eventos.organizacionId))
      .where(condiciones.length > 0 ? and(...condiciones) : undefined)
      .orderBy(desc(eventos.id))
      .limit(filtros.limit + 1);
    const pagina = filas.slice(0, filtros.limit);
    return {
      items: pagina,
      pagination: {
        nextCursor: filas.length > filtros.limit ? (pagina.at(-1)?.id ?? null) : null,
      },
    };
  }

  /**
   * Costo de red del mes o de un evento (HU-104, `getCostoRed`), con los stroops también en XLM.
   * Consulta la tabla directo: el API no carga el SDK de Stellar.
   */
  async getCostoRed(filtros: { eventoId?: string | undefined; mes?: string | undefined }) {
    const condiciones: SQL[] = [];
    if (filtros.eventoId) condiciones.push(eq(transaccionesStellar.eventoId, filtros.eventoId));
    if (filtros.mes) {
      const [anio, numero] = filtros.mes.split('-').map(Number);
      const desde = new Date(Date.UTC(anio ?? 1970, (numero ?? 1) - 1, 1));
      const hasta = new Date(Date.UTC(anio ?? 1970, numero ?? 1, 1));
      condiciones.push(
        gte(transaccionesStellar.createdAt, desde),
        lt(transaccionesStellar.createdAt, hasta),
      );
    }
    const filas = await this.db
      .select({
        operacion: transaccionesStellar.operacion,
        cantidad: sql<number>`count(*)::int`,
        comisionStroops: sql<string>`coalesce(sum(coalesce(${transaccionesStellar.comisionStroops}, 0)), 0)::text`,
      })
      .from(transaccionesStellar)
      .where(condiciones.length > 0 ? and(...condiciones) : undefined)
      .groupBy(transaccionesStellar.operacion);
    const total = filas.reduce((suma, f) => suma + BigInt(f.comisionStroops), 0n);
    return {
      transacciones: filas.reduce((suma, f) => suma + f.cantidad, 0),
      comisionStroops: total.toString(),
      comisionXlm: toXlm(total),
      porOperacion: Object.fromEntries(
        filas.map((f) => [
          f.operacion,
          {
            cantidad: f.cantidad,
            comisionStroops: f.comisionStroops,
            comisionXlm: toXlm(BigInt(f.comisionStroops)),
          },
        ]),
      ),
    };
  }
}

/** 1 XLM = 10 000 000 stroops; siete decimales, como texto. */
export function toXlm(stroops: bigint): string {
  const entero = stroops / 10_000_000n;
  const resto = (stroops % 10_000_000n).toString().padStart(7, '0');
  return `${entero}.${resto}`;
}
