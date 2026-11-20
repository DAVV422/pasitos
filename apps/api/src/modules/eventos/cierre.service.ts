import { and, count, eq, gt, sql } from 'drizzle-orm';
import { canjes, eventos, saldos, usuarios, withOrganizacion, type Db } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import {
  CIERRE_PROGRAMADO_MIN_MIN,
  getCierreAutomatico,
  isConfirmacionCierre,
} from '@pasitos/dominio/esquemas';
import { closeEvento, LibroService } from '@pasitos/libro';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { getNombreCorto } from '../puerta/check-in.service';

const HORA_MS = 3_600_000;

/** Cerrar el evento, programarlo y ver cómo va (HU-401). Solo el dueño cierra. */
export class CierreService {
  private readonly bitacora = new BitacoraService();
  private readonly libro = new LibroService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly red: 'local' | 'testnet',
  ) {}

  /** Lo que va a pasar al cerrar, con los números de ahora (HU-401 §5.1). */
  getVistaPrevia(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      const [conSaldo] = await tx
        .select({ personas: count(), puntos: sql<string>`coalesce(sum(${saldos.puntos}), 0)` })
        .from(saldos)
        .where(and(eq(saldos.eventoId, evento.id), gt(saldos.puntos, 0)));
      const cobros = await tx.$count(
        canjes,
        and(eq(canjes.eventoId, evento.id), eq(canjes.estado, 'pendiente')),
      );
      return {
        estado: evento.estado,
        personasConSaldo: conSaldo?.personas ?? 0,
        puntosSinUsar: Number(conSaldo?.puntos ?? 0),
        cobrosPendientes: cobros,
        programadoAt: evento.cierreProgramadoAt?.toISOString() ?? null,
        automaticoAt: getCierreAutomatico(evento.finAt).toISOString(),
      };
    });
  }

  /** La tarjeta del cierre en el Resumen: quién, cuándo y cómo va en Stellar. */
  getEstado(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      let cerradoPor: string | null = null;
      if (evento.cerradoPor) {
        const [usuario] = await tx
          .select({ nombre: usuarios.nombre })
          .from(usuarios)
          .where(eq(usuarios.id, evento.cerradoPor));
        cerradoPor = getNombreCorto(usuario?.nombre ?? null);
      }
      return {
        estado: evento.estado,
        cerradoAt: evento.cerradoAt?.toISOString() ?? null,
        cerradoPor,
        cierreEstado: evento.cierreEstado,
        programadoAt: evento.cierreProgramadoAt?.toISOString() ?? null,
        automaticoAt: getCierreAutomatico(evento.finAt).toISOString(),
        // El contrato en stellar.expert, donde se ve el cierre. `transacciones_stellar` es solo del
        // trabajador (pasitos_app no la lee).
        contrato:
          evento.contratoId && this.red === 'testnet'
            ? `https://stellar.expert/explorer/testnet/contract/${evento.contratoId}`
            : null,
      };
    });
  }

  /** Cerrar ahora, escribiendo CERRAR (HU-401 §2 y §3). */
  async close(contexto: ContextoEvento, confirmacion: string) {
    if (!isConfirmacionCierre(confirmacion)) throw new AppError('CONFIRMACION_INVALIDA');
    const resultado = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const cierre = await closeEvento(
        tx,
        {
          eventoId: contexto.eventoId,
          cerradoPor: contexto.usuarioId,
          origen: 'dueno',
          ahora: this.reloj.now(),
        },
        this.libro,
      );
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'evento.close',
        organizacionId: cierre.organizacionId,
        eventoId: cierre.eventoId,
        objeto: { tipo: 'evento', id: cierre.eventoId, nombre: cierre.nombre },
        antes: { estado: cierre.estadoAnterior },
        despues: {
          estado: 'cerrado',
          origen: 'dueno',
          vencimientos: cierre.vencimientos,
          puntosVencidos: cierre.puntosVencidos,
          cobrosCancelados: cierre.cobrosCancelados,
        },
      });
      return cierre;
    });
    return {
      estado: 'cerrado' as const,
      vencimientos: resultado.vencimientos,
      puntosVencidos: resultado.puntosVencidos,
      cobrosCancelados: resultado.cobrosCancelados,
    };
  }

  /**
   * Programar el cierre a una hora, o quitarlo (`null`). Entre ahora + 15 minutos y el fin + 24 h
   * (HU-401 §5). Volver a programar permite un aviso nuevo a los asistentes.
   */
  schedule(contexto: ContextoEvento, at: Date | null) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId, true);
      if (!['publicado', 'en_curso', 'pausado'].includes(evento.estado)) {
        throw new AppError('TRANSICION_NO_PERMITIDA', { meta: { estado: evento.estado } });
      }
      if (at) {
        const desde = this.reloj.now().getTime() + CIERRE_PROGRAMADO_MIN_MIN * 60_000;
        const hasta = getCierreAutomatico(evento.finAt).getTime();
        if (at.getTime() < desde || at.getTime() > hasta) {
          throw new AppError('VALIDACION', {
            errors: [
              {
                field: 'at',
                code: 'FUERA_DE_RANGO',
                message: `Elige una hora desde dentro de ${CIERRE_PROGRAMADO_MIN_MIN} minutos y hasta ${(hasta - evento.finAt.getTime()) / HORA_MS} horas después del fin.`,
              },
            ],
          });
        }
      }
      await tx
        .update(eventos)
        .set({ cierreProgramadoAt: at, cierreAvisoAt: null, updatedAt: this.reloj.now() })
        .where(eq(eventos.id, evento.id));
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'evento.cierre_programar',
        organizacionId: evento.organizacionId,
        eventoId: evento.id,
        objeto: { tipo: 'evento', id: evento.id, nombre: evento.nombre },
        antes: { programadoAt: evento.cierreProgramadoAt?.toISOString() ?? null },
        despues: { programadoAt: at?.toISOString() ?? null },
      });
      return { programadoAt: at?.toISOString() ?? null };
    });
  }

  private async getEvento(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    eventoId: string,
    bloquear = false,
  ) {
    const consulta = tx.select().from(eventos).where(eq(eventos.id, eventoId));
    const [evento] = bloquear ? await consulta.for('update') : await consulta;
    if (!evento) throw new AppError('NO_ENCONTRADO');
    return evento;
  }
}
