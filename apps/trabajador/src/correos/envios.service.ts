import { Logger } from '@nestjs/common';
import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import { CorreosService, getCupoHoy, type OpcionesCupo } from '@pasitos/correos';
import { enviosCorreo, type Db } from '@pasitos/db';
import { buildContenidoCorreo, CORREOS, type TipoCorreo } from '@pasitos/dominio/correos';
import type { Reloj } from '../comun/reloj';
import { CorreoError, type CorreoPort } from './correo.port';
import { renderCorreo } from './plantilla-base';

export interface OpcionesEnvio {
  /** `Pasitos <hola@…>`. */
  readonly remitente: string;
  /** Para `{correoSoporte}` en los textos. */
  readonly correoSoporte: string;
  /** Límite del proveedor (Resend: 2 por segundo). 0 = sin espera (tests). */
  readonly porSegundo: number;
  readonly maxIntentos: number;
  /** Como mucho, cuántos por vuelta (una vuelta por minuto). */
  readonly porVuelta: number;
}

export interface ResultadoVuelta {
  readonly enviados: number;
  readonly fallidos: number;
  readonly reintentos: number;
}

export type FilaEnvio = typeof enviosCorreo.$inferSelect;

/**
 * Lo que un tipo de correo necesita además de la cola (HU-211): completar los datos justo antes
 * de enviar (el enlace de la invitación, que no se guarda en claro en la cola) y enterarse de cómo
 * terminó.
 */
export interface GanchoCorreo {
  prepare?(envio: FilaEnvio): Promise<Record<string, unknown>>;
  onEnviado?(envio: FilaEnvio, ahora: Date): Promise<void>;
  onFallido?(envio: FilaEnvio, ahora: Date): Promise<void>;
}

/**
 * Trabajo `send-correos` (T-007 §3): toma de la cola por prioridad y antigüedad hasta llenar el
 * cupo del día, envía respetando el límite por segundo, reintenta los errores temporales con espera
 * creciente (1, 2, 4 min) y marca `fallido` los permanentes. Al final recalcula `programado_para`.
 * En los logs solo van el id y el tipo: nunca el destinatario ni los datos.
 */
export class EnviosCorreoService {
  private readonly logger = new Logger(EnviosCorreoService.name);
  private readonly correos: CorreosService;

  constructor(
    private readonly db: Db,
    private readonly proveedor: CorreoPort,
    private readonly cupo: OpcionesCupo,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesEnvio,
    private readonly ganchos: Partial<Record<TipoCorreo, GanchoCorreo>> = {},
  ) {
    this.correos = new CorreosService(db, cupo, () => reloj.now());
  }

  async processCola(): Promise<ResultadoVuelta> {
    const cupoHoy = getCupoHoy(this.cupo, await this.correos.getEnviadosHoy());
    const seguridad = await this.listListos(
      [1],
      Math.min(cupoHoy.seguridad, this.opciones.porVuelta),
    );
    // Los de seguridad también gastan el tope total.
    const resto = await this.listListos(
      [2, 3, 4],
      Math.min(
        cupoHoy.resto,
        cupoHoy.seguridad - seguridad.length,
        this.opciones.porVuelta - seguridad.length,
      ),
    );

    const resultado = { enviados: 0, fallidos: 0, reintentos: 0 };
    for (const [indice, envio] of [...seguridad, ...resto].entries()) {
      if (indice > 0 && this.opciones.porSegundo > 0) {
        await this.reloj.sleep(Math.ceil(1000 / this.opciones.porSegundo));
      }
      resultado[await this.sendEnvio(envio)] += 1;
    }
    await this.correos.reprogramar();
    return resultado;
  }

  private async sendEnvio(envio: FilaEnvio): Promise<keyof ResultadoVuelta> {
    let mensaje;
    try {
      if (!Object.hasOwn(CORREOS, envio.tipo)) {
        throw new Error(`Tipo de correo desconocido: ${envio.tipo}`);
      }
      const gancho = this.ganchos[envio.tipo as TipoCorreo];
      const datos = gancho?.prepare ? await gancho.prepare(envio) : envio.datos;
      const contenido = buildContenidoCorreo(envio.tipo as TipoCorreo, datos as never, {
        correoSoporte: this.opciones.correoSoporte,
      });
      mensaje = await renderCorreo(contenido);
    } catch (error) {
      // Un correo que no se puede armar no se arregla reintentando.
      await this.markFallido(envio, error instanceof Error ? error.message : String(error));
      return 'fallidos';
    }

    try {
      const { proveedorId } = await this.proveedor.send({
        de: this.opciones.remitente,
        para: envio.destinatario,
        asunto: mensaje.asunto,
        html: mensaje.html,
        texto: mensaje.texto,
        etiquetas: { Tipo: envio.tipo, Envio: envio.id },
      });
      const ahora = this.reloj.now();
      await this.db
        .update(enviosCorreo)
        .set({
          estado: 'enviado',
          proveedorId,
          enviadoAt: ahora,
          intentos: envio.intentos + 1,
          error: null,
          updatedAt: ahora,
        })
        .where(eq(enviosCorreo.id, envio.id));
      await this.ganchos[envio.tipo as TipoCorreo]?.onEnviado?.(envio, ahora);
      return 'enviados';
    } catch (error) {
      const temporal = !(error instanceof CorreoError) || error.temporal;
      const motivo = error instanceof Error ? error.message : String(error);
      if (temporal && envio.intentos + 1 < this.opciones.maxIntentos) {
        await this.db
          .update(enviosCorreo)
          .set({ intentos: envio.intentos + 1, error: motivo, updatedAt: this.reloj.now() })
          .where(eq(enviosCorreo.id, envio.id));
        this.logger.warn({ envio: envio.id, tipo: envio.tipo }, 'Correo no enviado; se reintenta');
        return 'reintentos';
      }
      await this.markFallido(envio, motivo);
      return 'fallidos';
    }
  }

  private async markFallido(envio: FilaEnvio, motivo: string): Promise<void> {
    await this.db
      .update(enviosCorreo)
      .set({
        estado: 'fallido',
        intentos: envio.intentos + 1,
        error: motivo.slice(0, 500),
        updatedAt: this.reloj.now(),
      })
      .where(eq(enviosCorreo.id, envio.id));
    this.logger.error({ envio: envio.id, tipo: envio.tipo }, 'Correo fallido');
    await this.ganchos[envio.tipo as TipoCorreo]?.onFallido?.(envio, this.reloj.now());
  }

  /** En cola y sin espera de reintento pendiente (1, 2, 4… min desde el último intento). */
  private listListos(prioridades: number[], limite: number): Promise<FilaEnvio[]> {
    if (limite <= 0) {
      return Promise.resolve([]);
    }
    const ahora = this.reloj.now();
    return this.db
      .select()
      .from(enviosCorreo)
      .where(
        and(
          eq(enviosCorreo.estado, 'en_cola'),
          inArray(enviosCorreo.prioridad, prioridades),
          or(
            eq(enviosCorreo.intentos, 0),
            lte(
              sql`${enviosCorreo.updatedAt} + make_interval(mins => power(2, ${enviosCorreo.intentos} - 1)::int)`,
              ahora,
            ),
          ),
        ),
      )
      .orderBy(asc(enviosCorreo.prioridad), asc(enviosCorreo.createdAt))
      .limit(limite);
  }
}
