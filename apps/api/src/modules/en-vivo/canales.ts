import type { ServerResponse } from 'node:http';
import { toAvisoEnVivo, type AvisoEnVivo, type AvisoOutbox, type Suscriptor } from './audiencias';

/** Un comentario cada 25 s mantiene viva la conexión a través de Cloudflare (T-301 §2). */
export const HEARTBEAT_MS = 25_000;
/** Como mucho un contador por segundo por pantalla (API §8). */
export const AGRUPAR_MS = 1_000;
/** Conexiones abiertas por sesión: la cuarta cierra la más vieja. */
export const MAXIMO_POR_SESION = 3;
/** Lo que espera el navegador antes de reconectar solo (campo `retry:` de SSE). */
export const REINTENTO_MS = 3_000;

interface Pendiente {
  id: string;
  aviso: AvisoEnVivo;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Una conexión SSE abierta. Escribe en el formato de [Respuestas y errores §8]: `id:`, `event:` y
 * `data:` en JSON. Los contadores se agrupan: si llega otro antes del segundo, sale el último.
 */
export class CanalSse {
  readonly abiertoAt = Date.now();
  private cerrado = false;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly ultimoEnvio = new Map<string, number>();
  private readonly pendientes = new Map<string, Pendiente>();

  constructor(
    private readonly respuesta: ServerResponse,
    readonly suscriptor: Suscriptor,
    /** La sesión (equipo, asistente o terminal), para el máximo de conexiones. */
    readonly sesion: string,
    private readonly alCerrar: (canal: CanalSse) => void,
  ) {
    this.heartbeat = setInterval(() => this.write(': ping\n\n'), HEARTBEAT_MS);
    this.heartbeat.unref();
    respuesta.on('close', () => this.close());
  }

  get isCerrado(): boolean {
    return this.cerrado;
  }

  /** Reparte un aviso de `outbox` si le toca a este canal. */
  deliver(aviso: AvisoOutbox): void {
    const enVivo = toAvisoEnVivo(aviso, this.suscriptor);
    if (enVivo) {
      this.send(aviso.id, enVivo);
    }
  }

  send(id: string, aviso: AvisoEnVivo): void {
    if (this.cerrado) return;
    const clave = aviso.agrupar;
    if (clave) {
      const pendiente = this.pendientes.get(clave);
      if (pendiente) {
        pendiente.id = id;
        pendiente.aviso = aviso;
        return;
      }
      const espera = (this.ultimoEnvio.get(clave) ?? 0) + AGRUPAR_MS - Date.now();
      if (espera > 0) {
        const timer = setTimeout(() => {
          const actual = this.pendientes.get(clave);
          this.pendientes.delete(clave);
          if (actual) this.write(this.format(actual.id, actual.aviso), clave);
        }, espera);
        timer.unref();
        this.pendientes.set(clave, { id, aviso, timer });
        return;
      }
    }
    this.write(this.format(id, aviso), clave);
    if (aviso.cerrar) {
      this.close();
    }
  }

  /** `reiniciar`: el cliente vuelve a pedir la foto completa (se perdió demasiado). */
  sendReiniciar(): void {
    this.write('event: reiniciar\ndata: {}\n\n');
  }

  close(): void {
    if (this.cerrado) return;
    this.cerrado = true;
    clearInterval(this.heartbeat);
    for (const pendiente of this.pendientes.values()) clearTimeout(pendiente.timer);
    this.pendientes.clear();
    if (!this.respuesta.writableEnded) this.respuesta.end();
    this.alCerrar(this);
  }

  private format(id: string, aviso: AvisoEnVivo): string {
    return `id: ${id}\nevent: ${aviso.evento}\ndata: ${JSON.stringify(aviso.datos)}\n\n`;
  }

  private write(texto: string, clave?: string): void {
    if (this.cerrado || this.respuesta.writableEnded) return;
    this.respuesta.write(texto);
    if (clave) this.ultimoEnvio.set(clave, Date.now());
  }
}

/** Las conexiones abiertas en este proceso del API. */
export class CanalesEnVivo {
  private readonly canales = new Set<CanalSse>();

  /** Suma un canal; si la sesión ya tiene el máximo, cierra la más vieja. */
  add(canal: CanalSse): void {
    const deLaSesion = [...this.canales]
      .filter((c) => c.sesion === canal.sesion)
      .sort((a, b) => a.abiertoAt - b.abiertoAt);
    while (deLaSesion.length >= MAXIMO_POR_SESION) {
      deLaSesion.shift()?.close();
    }
    this.canales.add(canal);
  }

  remove(canal: CanalSse): void {
    this.canales.delete(canal);
  }

  dispatch(aviso: AvisoOutbox): void {
    for (const canal of this.canales) {
      canal.deliver(aviso);
    }
  }

  get size(): number {
    return this.canales.size;
  }

  closeAll(): void {
    for (const canal of [...this.canales]) canal.close();
  }
}
