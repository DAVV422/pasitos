import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  HEADER_FIRMA,
  HEADER_IDEMPOTENCIA,
  HEADER_TIMESTAMP,
  hashCuerpo,
  signPedido,
} from '@pasitos/firmas';
import { isCodigoError } from '@pasitos/dominio';
import { ErrorApi, getParLlaves } from '@pasitos/web-core';
import { loadCopia, saveCopia } from '../copia-local';
import { SesionAsistente } from '../sesion-asistente';

const BASE = '/api/v1';
const COLA = 'fotos-pendientes';
/** Pasados 5 minutos, la firma se rehace con una hora nueva (misma clave y mismo archivo). */
const VIGENCIA_FIRMA_MS = 5 * 60_000;
/** Espera entre reintentos: 5 s, 10 s, 20 s… hasta 5 min. */
const ESPERA_INICIAL_MS = 5_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

/** Una foto que todavía no llegó al servidor: vive en IndexedDB hasta que se envía. */
interface FotoPendiente {
  readonly retoId: string;
  readonly foto: Blob;
  readonly origen: 'camara' | 'galeria';
  readonly autorizaUso: boolean;
  readonly clave: string;
  readonly hash: string;
  timestamp: number;
  firma: string;
}

/** Cómo va el envío de la foto de un reto. */
export interface EstadoEnvio {
  readonly retoId: string;
  readonly fase: 'enviando' | 'sin_conexion' | 'error';
  readonly progreso: number;
  readonly error?: string;
}

/**
 * Subir la foto de un reto (HU-322 §5): firmada sobre el SHA-256 del archivo, con
 * `XMLHttpRequest` para mostrar el progreso. Sin red, queda en cola (`fotos_pendientes`) y se
 * reintenta al volver la señal o al abrir la app, con la misma clave: el servidor no la repite.
 */
@Injectable({ providedIn: 'root' })
export class FotosService {
  private readonly sesion = inject(SesionAsistente);
  readonly envios = signal<Readonly<Record<string, EstadoEnvio>>>({});
  private espera = ESPERA_INICIAL_MS;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private enviando = false;

  constructor() {
    const alVolver = () => {
      this.espera = ESPERA_INICIAL_MS;
      void this.flush();
    };
    addEventListener('online', alVolver);
    inject(DestroyRef).onDestroy(() => removeEventListener('online', alVolver));
    void this.flush();
  }

  /** Firma la foto, la guarda en la cola y la intenta enviar. */
  async send(
    retoId: string,
    foto: Blob,
    origen: 'camara' | 'galeria',
    autorizaUso: boolean,
  ): Promise<void> {
    const bytes = new Uint8Array(await foto.arrayBuffer());
    const pendiente: FotoPendiente = {
      retoId,
      foto,
      origen,
      autorizaUso,
      clave: crypto.randomUUID(),
      hash: await hashCuerpo(bytes),
      timestamp: 0,
      firma: '',
    };
    await this.sign(pendiente);
    await this.save([...(await this.load()).filter((p) => p.retoId !== retoId), pendiente]);
    this.setEstado(retoId, { retoId, fase: 'enviando', progreso: 0 });
    await this.flush();
  }

  /** Envía lo que esté en cola, de a una foto. */
  async flush(): Promise<void> {
    if (this.enviando) return;
    this.enviando = true;
    try {
      for (const pendiente of await this.load()) {
        if (Date.now() - pendiente.timestamp > VIGENCIA_FIRMA_MS) {
          await this.sign(pendiente);
        }
        this.setEstado(pendiente.retoId, {
          retoId: pendiente.retoId,
          fase: 'enviando',
          progreso: 0,
        });
        try {
          await this.upload(pendiente);
          await this.save((await this.load()).filter((p) => p.clave !== pendiente.clave));
          this.clearEstado(pendiente.retoId);
          this.espera = ESPERA_INICIAL_MS;
          void this.sesion.refresh();
        } catch (error) {
          if (error instanceof ErrorApi && error.code === 'SIN_CONEXION') {
            this.setEstado(pendiente.retoId, {
              retoId: pendiente.retoId,
              fase: 'sin_conexion',
              progreso: 0,
            });
            this.schedule();
            return;
          }
          // El servidor la rechazó: no se reintenta (otra foto empieza de nuevo).
          await this.save((await this.load()).filter((p) => p.clave !== pendiente.clave));
          this.setEstado(pendiente.retoId, {
            retoId: pendiente.retoId,
            fase: 'error',
            progreso: 0,
            error: error instanceof ErrorApi ? error.detail : 'No pudimos enviar la foto.',
          });
        }
      }
    } finally {
      this.enviando = false;
    }
  }

  clearEstado(retoId: string): void {
    this.envios.set(
      Object.fromEntries(Object.entries(this.envios()).filter(([id]) => id !== retoId)),
    );
  }

  private setEstado(retoId: string, estado: EstadoEnvio): void {
    this.envios.set({ ...this.envios(), [retoId]: estado });
  }

  private schedule(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.flush(), this.espera);
    this.espera = Math.min(this.espera * 2, ESPERA_MAXIMA_MS);
  }

  private async sign(pendiente: FotoPendiente): Promise<void> {
    const { privateKey } = await getParLlaves();
    pendiente.timestamp = Date.now();
    pendiente.firma = await signPedido(privateKey, {
      metodo: 'POST',
      ruta: `${BASE}/app/retos/${pendiente.retoId}/fotos`,
      clave: pendiente.clave,
      timestamp: pendiente.timestamp,
      hashCuerpo: pendiente.hash,
    });
  }

  /** `XMLHttpRequest` para el progreso; el resultado, como el resto de la app (`ErrorApi`). */
  private upload(pendiente: FotoPendiente): Promise<void> {
    return new Promise((listo, falla) => {
      const formulario = new FormData();
      formulario.append('origen', pendiente.origen);
      formulario.append('autorizaUso', String(pendiente.autorizaUso));
      formulario.append('foto', pendiente.foto, 'foto.jpg');
      const pedido = new XMLHttpRequest();
      pedido.open('POST', `${BASE}/app/retos/${pendiente.retoId}/fotos`);
      pedido.withCredentials = true;
      pedido.setRequestHeader(HEADER_IDEMPOTENCIA, pendiente.clave);
      pedido.setRequestHeader(HEADER_TIMESTAMP, String(pendiente.timestamp));
      pedido.setRequestHeader(HEADER_FIRMA, pendiente.firma);
      pedido.upload.onprogress = (evento) => {
        if (evento.lengthComputable) {
          this.setEstado(pendiente.retoId, {
            retoId: pendiente.retoId,
            fase: 'enviando',
            progreso: Math.round((evento.loaded / evento.total) * 100),
          });
        }
      };
      pedido.onload = () => {
        if (pedido.status >= 200 && pedido.status < 300) {
          listo();
          return;
        }
        let cuerpo: { code?: string; detail?: string } = {};
        try {
          cuerpo = JSON.parse(pedido.responseText) as typeof cuerpo;
        } catch {
          // Sin cuerpo: el 504 del service worker o un proxy.
        }
        falla(
          pedido.status === 504 && !cuerpo.code
            ? new ErrorApi('SIN_CONEXION', 504, 'No pudimos conectar.', null)
            : new ErrorApi(
                cuerpo.code && isCodigoError(cuerpo.code) ? cuerpo.code : 'DESCONOCIDO',
                pedido.status,
                cuerpo.detail ?? 'No pudimos enviar la foto.',
                null,
              ),
        );
      };
      pedido.onerror = () => falla(new ErrorApi('SIN_CONEXION', 0, 'No pudimos conectar.', null));
      pedido.send(formulario);
    });
  }

  private async load(): Promise<FotoPendiente[]> {
    return (await loadCopia<FotoPendiente[]>(COLA))?.valor ?? [];
  }

  private save(cola: FotoPendiente[]): Promise<void> {
    return saveCopia(COLA, cola);
  }
}
