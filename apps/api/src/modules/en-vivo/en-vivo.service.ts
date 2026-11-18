import { Logger } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { outbox, type Db } from '@pasitos/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Client } from 'pg';
import type { AvisoOutbox, Suscriptor } from './audiencias';
import { CanalSse, CanalesEnVivo, REINTENTO_MS } from './canales';

/** Lo que se reenvía al reconectar (T-301 §2). */
export const REENVIO_MS = 5 * 60 * 1000;
const MAXIMO_REENVIO = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La hora de un UUID v7 (los primeros 48 bits son los milisegundos). */
export function getHoraUuidV7(id: string): number {
  return Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}

/**
 * Avisos en vivo (T-301). Escucha `outbox` con `LISTEN/NOTIFY` (el trigger de `0023_en_vivo`) y
 * reparte cada fila a las conexiones SSE de este proceso. Con varios procesos del API, cada uno
 * escucha y reparte a las suyas.
 */
export class EnVivoService {
  private readonly escuchas: ((aviso: AvisoOutbox) => void)[] = [];
  private readonly logger = new Logger(EnVivoService.name);
  readonly canales = new CanalesEnVivo();
  private cliente: Client | null = null;
  private detenido = false;
  private espera = 1_000;
  /** Los clientes caídos que ya se están reemplazando ('error' y 'end' llegan los dos). */
  private readonly caidos = new WeakSet<Client>();

  constructor(
    private readonly db: Db,
    private readonly urlBase: string,
  ) {}

  async start(): Promise<void> {
    this.detenido = false;
    await this.listen();
  }

  async stop(): Promise<void> {
    this.detenido = true;
    this.canales.closeAll();
    const cliente = this.cliente;
    this.cliente = null;
    await cliente?.end().catch(() => undefined);
  }

  /**
   * Abre el canal SSE de `suscriptor` sobre la respuesta: reenvía lo perdido desde
   * `Last-Event-ID` (o `?ultimo=`) y queda escuchando.
   */
  async open(
    request: FastifyRequest,
    reply: FastifyReply,
    suscriptor: Suscriptor,
    sesion: string,
  ): Promise<void> {
    reply.hijack();
    const respuesta = reply.raw;
    respuesta.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Request-Id': String(request.id),
    });
    respuesta.write(`retry: ${REINTENTO_MS}\n\n`);
    const canal = new CanalSse(respuesta, suscriptor, sesion, (c) => this.canales.remove(c));
    this.canales.add(canal);

    const ultimo = this.getUltimoId(request);
    if (ultimo) {
      await this.replay(canal, ultimo);
    }
  }

  /** Reparte una fila de `outbox` (también la usan los tests). */
  dispatch(aviso: AvisoOutbox): void {
    for (const escucha of this.escuchas) escucha(aviso);
    this.canales.dispatch(aviso);
  }

  /**
   * Para lo que vive en memoria y depende de `outbox` (la caché de `/app/evento`, HU-309): se
   * entera de cada aviso, haya o no canales abiertos.
   */
  onAviso(escucha: (aviso: AvisoOutbox) => void): void {
    this.escuchas.push(escucha);
  }

  private getUltimoId(request: FastifyRequest): string | null {
    const header = request.headers['last-event-id'];
    const query = (request.query as Record<string, string | undefined> | undefined)?.['ultimo'];
    const valor = (Array.isArray(header) ? header[0] : header) ?? query;
    return valor && UUID.test(valor) ? valor : null;
  }

  private async replay(canal: CanalSse, ultimo: string): Promise<void> {
    if (Date.now() - getHoraUuidV7(ultimo) > REENVIO_MS) {
      canal.sendReiniciar();
      return;
    }
    const filas = await this.db
      .select({
        id: outbox.id,
        tipo: outbox.tipo,
        eventoId: outbox.eventoId,
        payload: outbox.payload,
      })
      .from(outbox)
      .where(
        and(
          eq(outbox.eventoId, canal.suscriptor.eventoId),
          gt(outbox.id, ultimo),
          sql`${outbox.createdAt} > now() - interval '5 minutes'`,
        ),
      )
      .orderBy(asc(outbox.id))
      .limit(MAXIMO_REENVIO);
    if (filas.length === MAXIMO_REENVIO) {
      canal.sendReiniciar();
      return;
    }
    for (const fila of filas) {
      canal.deliver(toAviso(fila));
    }
  }

  /** Los avisos por repartir, uno detrás de otro (`load` nunca rechaza). */
  private cola: Promise<void> = Promise.resolve();

  private async listen(): Promise<void> {
    if (this.detenido) return;
    const cliente = new Client({ connectionString: this.urlBase });
    cliente.on('notification', (mensaje) => {
      if (mensaje.channel === 'outbox' && mensaje.payload) {
        // En el orden en que llegan: si cada lectura corriera sola, una rápida pasaría a una
        // lenta y el cliente recibiría los avisos desordenados (y Last-Event-ID saltaría uno).
        const id = mensaje.payload;
        this.cola = this.cola.then(() => this.load(id));
      }
    });
    cliente.on('error', (error) => {
      this.logger.warn({ err: error.message }, 'Se cortó la escucha de outbox; se reintenta');
      void this.reconnect(cliente);
    });
    cliente.on('end', () => void this.reconnect(cliente));
    try {
      await cliente.connect();
      await cliente.query('LISTEN outbox');
      this.cliente = cliente;
      this.espera = 1_000;
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'No se pudo escuchar outbox; se reintenta',
      );
      await this.reconnect(cliente);
    }
  }

  private async reconnect(anterior: Client): Promise<void> {
    if (this.detenido || this.caidos.has(anterior)) return;
    this.caidos.add(anterior);
    if (this.cliente === anterior) this.cliente = null;
    await anterior.end().catch(() => undefined);
    const espera = this.espera;
    this.espera = Math.min(this.espera * 2, 30_000);
    setTimeout(() => void this.listen(), espera).unref();
  }

  private async load(id: string): Promise<void> {
    if (this.canales.size === 0 && this.escuchas.length === 0) return;
    try {
      const [fila] = await this.db
        .select({
          id: outbox.id,
          tipo: outbox.tipo,
          eventoId: outbox.eventoId,
          payload: outbox.payload,
        })
        .from(outbox)
        .where(eq(outbox.id, id));
      if (fila) {
        this.dispatch(toAviso(fila));
      }
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error), outboxId: id },
        'No se pudo leer un aviso de outbox',
      );
    }
  }
}

function toAviso(fila: {
  id: string;
  tipo: string;
  eventoId: string | null;
  payload: unknown;
}): AvisoOutbox {
  return {
    id: fila.id,
    tipo: fila.tipo,
    eventoId: fila.eventoId,
    payload: (fila.payload ?? {}) as Record<string, unknown>,
  };
}
