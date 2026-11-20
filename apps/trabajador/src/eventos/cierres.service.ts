import { Logger } from '@nestjs/common';
import { and, eq, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { bitacora, eventos, miembrosOrganizacion, outbox, usuarios, type Db } from '@pasitos/db';
import { CorreosService, type OpcionesCupo } from '@pasitos/correos';
import {
  AVISO_CIERRE_AUTOMATICO_HORAS,
  AVISO_CIERRE_MIN,
  CIERRE_AUTOMATICO_HORAS,
} from '@pasitos/dominio/esquemas';
import { closeEvento, type OrigenCierre } from '@pasitos/libro';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../comun/reloj';

const ABIERTOS = ['publicado', 'en_curso', 'pausado'];
const HORA_MS = 3_600_000;

export interface ResultadoCierres {
  readonly avisos: number;
  readonly cerrados: string[];
  readonly correos: number;
}

/**
 * Trabajo `cerrar-eventos` (HU-401 §5), cada minuto:
 * - el aviso a los asistentes 30 minutos antes del cierre programado;
 * - el cierre programado, a su hora;
 * - el correo al dueño 2 horas antes del cierre automático, y el cierre automático a las 24 h del
 *   fin si nadie lo cerró ni lo programó.
 * El cierre es el mismo del dueño (`closeEvento`); la bitácora dice *Pasitos (automático)*.
 */
export class CierresEventosService {
  private readonly logger = new Logger(CierresEventosService.name);
  private readonly correos: CorreosService;

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    cupo: OpcionesCupo,
    private readonly publicUrl: string,
  ) {
    this.correos = new CorreosService(db, cupo, () => reloj.now());
  }

  async run(): Promise<ResultadoCierres> {
    const ahora = this.reloj.now();
    const avisos = await this.sendAvisos(ahora);
    const correos = await this.sendAvisosAutomaticos(ahora);
    const cerrados: string[] = [];
    // Los programados que llegaron a su hora.
    for (const evento of await this.db
      .select({ id: eventos.id })
      .from(eventos)
      .where(
        and(
          inArray(eventos.estado, ABIERTOS),
          isNotNull(eventos.cierreProgramadoAt),
          lte(eventos.cierreProgramadoAt, ahora),
        ),
      )) {
      if (await this.close(evento.id, 'programado', ahora)) cerrados.push(evento.id);
    }
    // Los que nadie cerró: 24 h después del fin.
    for (const evento of await this.db
      .select({ id: eventos.id })
      .from(eventos)
      .where(
        and(
          inArray(eventos.estado, ABIERTOS),
          isNull(eventos.cierreProgramadoAt),
          lte(eventos.finAt, new Date(ahora.getTime() - CIERRE_AUTOMATICO_HORAS * HORA_MS)),
        ),
      )) {
      if (await this.close(evento.id, 'automatico', ahora)) cerrados.push(evento.id);
    }
    return { avisos, cerrados, correos };
  }

  /** *"Los puntos vencen a las 19:00. ¡Canjéalos!"*: una vez por programación. */
  private async sendAvisos(ahora: Date): Promise<number> {
    const proximos = await this.db
      .update(eventos)
      .set({ cierreAvisoAt: ahora })
      .where(
        and(
          inArray(eventos.estado, ['en_curso', 'pausado']),
          isNotNull(eventos.cierreProgramadoAt),
          isNull(eventos.cierreAvisoAt),
          lte(eventos.cierreProgramadoAt, new Date(ahora.getTime() + AVISO_CIERRE_MIN * 60_000)),
        ),
      )
      .returning({ id: eventos.id, cierreAt: eventos.cierreProgramadoAt });
    for (const evento of proximos) {
      await this.db.insert(outbox).values({
        id: uuidv7(),
        tipo: 'evento.cierre_proximo',
        eventoId: evento.id,
        payload: { eventoId: evento.id, cierreAt: evento.cierreAt?.toISOString() ?? null },
      });
    }
    return proximos.length;
  }

  /** El correo al dueño, 2 h antes del cierre automático. */
  private async sendAvisosAutomaticos(ahora: Date): Promise<number> {
    const limite = new Date(
      ahora.getTime() - (CIERRE_AUTOMATICO_HORAS - AVISO_CIERRE_AUTOMATICO_HORAS) * HORA_MS,
    );
    let enviados = 0;
    const porAvisar = await this.db
      .select({
        id: eventos.id,
        organizacionId: eventos.organizacionId,
        nombre: eventos.nombre,
        finAt: eventos.finAt,
        zonaHoraria: eventos.zonaHoraria,
      })
      .from(eventos)
      .where(
        and(
          inArray(eventos.estado, ABIERTOS),
          isNull(eventos.cierreProgramadoAt),
          isNull(eventos.cierreAutomaticoAvisoAt),
          lte(eventos.finAt, limite),
        ),
      );
    for (const evento of porAvisar) {
      const cierreAt = new Date(evento.finAt.getTime() + CIERRE_AUTOMATICO_HORAS * HORA_MS);
      const formato = (opciones: Intl.DateTimeFormatOptions) =>
        new Intl.DateTimeFormat('es-BO', { timeZone: evento.zonaHoraria, ...opciones });
      await this.db.transaction(async (tx) => {
        const marcado = await tx
          .update(eventos)
          .set({ cierreAutomaticoAvisoAt: ahora })
          .where(and(eq(eventos.id, evento.id), isNull(eventos.cierreAutomaticoAvisoAt)))
          .returning({ id: eventos.id });
        if (marcado.length === 0) return;
        const duenos = await tx
          .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email })
          .from(miembrosOrganizacion)
          .innerJoin(usuarios, eq(usuarios.id, miembrosOrganizacion.usuarioId))
          .where(
            and(
              eq(miembrosOrganizacion.organizacionId, evento.organizacionId),
              eq(miembrosOrganizacion.rol, 'dueno'),
            ),
          );
        for (const dueno of duenos) {
          await this.correos.enqueue(tx, {
            tipo: 'cierre_automatico',
            destinatario: dueno.email,
            refId: dueno.id,
            datos: {
              nombre: (dueno.nombre ?? '').split(' ')[0] ?? '',
              evento: evento.nombre,
              fechaFin: formato({ day: '2-digit', month: '2-digit', year: 'numeric' }).format(
                evento.finAt,
              ),
              hora: formato({ hour: '2-digit', minute: '2-digit', hour12: false }).format(cierreAt),
              enlace: `${this.publicUrl}/admin/eventos/${evento.id}/cierre`,
            },
          });
          enviados += 1;
        }
      });
    }
    return enviados;
  }

  /** Cierra uno; si otro lo cerró a la vez (el dueño), no hace nada. */
  private async close(eventoId: string, origen: OrigenCierre, ahora: Date): Promise<boolean> {
    try {
      await this.db.transaction(async (tx) => {
        const cierre = await closeEvento(tx, { eventoId, cerradoPor: null, origen, ahora });
        await tx.insert(bitacora).values({
          id: uuidv7(),
          organizacionId: cierre.organizacionId,
          eventoId,
          actorTipo: 'sistema',
          actorNombre: 'Pasitos (automático)',
          accion: 'evento.close',
          objetoTipo: 'evento',
          objetoId: eventoId,
          objetoNombre: cierre.nombre,
          antes: { estado: cierre.estadoAnterior },
          despues: {
            estado: 'cerrado',
            origen,
            vencimientos: cierre.vencimientos,
            puntosVencidos: cierre.puntosVencidos,
            cobrosCancelados: cierre.cobrosCancelados,
          },
        });
      });
      this.logger.log({ eventoId, origen }, 'Evento cerrado');
      return true;
    } catch (error) {
      // Un publicado sin contrato todavía, o ya cerrado: se reintenta en la vuelta siguiente.
      this.logger.warn(
        { eventoId, origen, err: error instanceof Error ? error.message : String(error) },
        'No se pudo cerrar el evento',
      );
      return false;
    }
  }
}
