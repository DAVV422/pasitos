import { and, asc, count, eq, gte, sql } from 'drizzle-orm';
import { enviosCorreo, type Db, type Tx } from '@pasitos/db';
import {
  buildContenidoCorreo,
  CORREOS,
  type DatosCorreo,
  type PrioridadCorreo,
  type TipoCorreo,
} from '@pasitos/dominio/correos';
import { uuidv7 } from 'uuidv7';
import {
  CUPO_POR_DEFECTO,
  getCupoHoy,
  getDiaDeSalida,
  getInicioDia,
  getProgramadoPara,
  type EnviadosHoy,
  type OpcionesCupo,
} from './cupo';

type Ejecutor = Db | Tx;

export interface NuevoCorreo<T extends TipoCorreo> {
  readonly tipo: T;
  readonly destinatario: string;
  readonly datos: DatosCorreo<T>;
  /** Lo que lo originó (usuario, invitación, miembro…). */
  readonly refId?: string;
}

export interface EstimacionEntrega {
  /** Cuántos días tarda la tanda (1 = sale toda hoy). */
  readonly dias: number;
  /** Día (00:00 en Bolivia) en que sale el último. */
  readonly ultimoDia: Date;
}

/** Para validar al encolar: el trabajador pone el valor real de la configuración. */
const SISTEMA_DE_PRUEBA = { correoSoporte: 'soporte@example.com' };

/**
 * Encolar correos y estimar cuándo salen (T-007 §3). El envío lo hace el trabajador
 * (`send-correos`). `enqueue` recibe la transacción de quien llama: el correo queda en la cola
 * solo si la acción que lo pide también se guarda.
 */
export class CorreosService {
  constructor(
    private readonly db: Db,
    private readonly opciones: OpcionesCupo = CUPO_POR_DEFECTO,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async enqueue<T extends TipoCorreo>(ejecutor: Ejecutor, nuevo: NuevoCorreo<T>): Promise<string> {
    const destinatario = nuevo.destinatario.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
      throw new Error(`Destinatario inválido para el correo ${nuevo.tipo}`);
    }
    // Falla aquí, y no en el trabajador, si faltan datos o el enlace no es web.
    buildContenidoCorreo(nuevo.tipo, nuevo.datos, SISTEMA_DE_PRUEBA);

    const prioridad = CORREOS[nuevo.tipo].prioridad;
    const ahora = this.ahora();
    const [adelante, enviados] = await Promise.all([
      this.countEnCola(ejecutor, prioridad),
      this.getEnviadosHoy(ejecutor),
    ]);
    const dia = getDiaDeSalida(
      adelante,
      prioridad === 1,
      getCupoHoy(this.opciones, enviados),
      this.opciones,
    );
    const id = uuidv7();
    await ejecutor.insert(enviosCorreo).values({
      id,
      tipo: nuevo.tipo,
      prioridad,
      destinatario,
      datos: nuevo.datos,
      programadoPara: getProgramadoPara(dia, ahora),
      refId: nuevo.refId ?? null,
    });
    return id;
  }

  /** Cuántos días tardaría una tanda de `cantidad` correos de esta prioridad (aviso de HU-211). */
  async estimateEntrega(
    cantidad: number,
    prioridad: PrioridadCorreo,
    ejecutor: Ejecutor = this.db,
  ): Promise<EstimacionEntrega> {
    const ahora = this.ahora();
    const [adelante, enviados] = await Promise.all([
      this.countEnCola(ejecutor, prioridad),
      this.getEnviadosHoy(ejecutor),
    ]);
    const dia = getDiaDeSalida(
      adelante + Math.max(cantidad, 1) - 1,
      prioridad === 1,
      getCupoHoy(this.opciones, enviados),
      this.opciones,
    );
    return { dias: dia + 1, ultimoDia: getDia(ahora, dia) };
  }

  /** Enviados desde las 00:00 de hoy en Bolivia (los que el proveedor ya recibió). */
  async getEnviadosHoy(ejecutor: Ejecutor = this.db): Promise<EnviadosHoy> {
    const [fila] = await ejecutor
      .select({
        total: count(),
        seguridad: sql<number>`count(*) filter (where ${enviosCorreo.prioridad} = 1)`.mapWith(
          Number,
        ),
      })
      .from(enviosCorreo)
      .where(gte(enviosCorreo.enviadoAt, getInicioDia(this.ahora())));
    return { total: fila?.total ?? 0, seguridad: fila?.seguridad ?? 0 };
  }

  /**
   * Recalcula `programado_para` de toda la cola (al final de cada vuelta del envío), para que
   * *"sale el 18/11"* siga siendo cierto cuando cambia el cupo o llegan correos más urgentes.
   */
  async reprogramar(ejecutor: Ejecutor = this.db): Promise<void> {
    const ahora = this.ahora();
    const [cola, enviados] = await Promise.all([
      ejecutor
        .select({ id: enviosCorreo.id, prioridad: enviosCorreo.prioridad })
        .from(enviosCorreo)
        .where(eq(enviosCorreo.estado, 'en_cola'))
        .orderBy(asc(enviosCorreo.prioridad), asc(enviosCorreo.createdAt)),
      this.getEnviadosHoy(ejecutor),
    ]);
    if (cola.length === 0) {
      return;
    }
    const cupo = getCupoHoy(this.opciones, enviados);
    let posicionSeguridad = 0;
    let posicionResto = 0;
    const filas: { id: string; fecha: string }[] = [];
    for (const correo of cola) {
      const esSeguridad = correo.prioridad === 1;
      const posicion = esSeguridad ? posicionSeguridad++ : posicionResto++;
      filas.push({
        id: correo.id,
        fecha: getProgramadoPara(
          getDiaDeSalida(posicion, esSeguridad, cupo, this.opciones),
          ahora,
        ).toISOString(),
      });
    }
    await ejecutor.execute(sql`
      update envios_correo as e
         set programado_para = v.fecha
        from jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) as v(id uuid, fecha timestamptz)
       where e.id = v.id and e.estado = 'en_cola' and e.programado_para <> v.fecha`);
  }

  /** En cola antes que uno nuevo de esta prioridad (los de la prioridad 1 van en su propia fila). */
  private async countEnCola(ejecutor: Ejecutor, prioridad: PrioridadCorreo): Promise<number> {
    const [fila] = await ejecutor
      .select({ total: count() })
      .from(enviosCorreo)
      .where(
        and(
          eq(enviosCorreo.estado, 'en_cola'),
          prioridad === 1
            ? eq(enviosCorreo.prioridad, 1)
            : sql`${enviosCorreo.prioridad} between 2 and ${prioridad}`,
        ),
      );
    return fila?.total ?? 0;
  }
}

function getDia(ahora: Date, dia: number): Date {
  return dia === 0 ? getInicioDia(ahora) : getProgramadoPara(dia, ahora);
}
