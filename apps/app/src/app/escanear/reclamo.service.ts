import { inject, Injectable, signal } from '@angular/core';
import { ErrorApi } from '@pasitos/web-core';
import { AsistenteApi, type ReclamoAceptado } from '../asistente-api.service';
import { formatHora } from '../formato';
import { SesionAsistente } from '../sesion-asistente';

/** Lo que muestra la app después de leer un QR (A7 → A3 o A8). */
export type ResultadoReclamo =
  | { readonly tipo: 'verificando' }
  | { readonly tipo: 'ganado'; readonly reclamo: ReclamoAceptado }
  | {
      readonly tipo: 'error';
      readonly codigo: string;
      readonly mensaje: string;
      readonly accion: 'escanear' | 'mi_entrada' | null;
    };

const REINTENTOS_MS = [1_000, 2_000, 4_000];
/** El mismo QR no se envía dos veces en 3 s (HU-310 §2.4). */
const REPETIDO_MS = 3_000;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Si el texto leído es un QR de reto de Pasitos (`PX1…` o el enlace `…/r/PX1…`). */
export function isQrReto(texto: string): boolean {
  return /(^|\/r\/)PX1\.[\w-]+\.[\w-]+/.test(texto.trim());
}

/**
 * Reclamar un QR de reto (HU-310 §2): firmado, con la misma `Idempotency-Key` en los reintentos
 * por la red (1, 2 y 4 s). El saldo que se muestra es el que confirma el servidor.
 */
@Injectable({ providedIn: 'root' })
export class ReclamoService {
  private readonly api = inject(AsistenteApi);
  private readonly sesion = inject(SesionAsistente);
  readonly resultado = signal<ResultadoReclamo | null>(null);
  private ultimo = { qr: '', at: 0 };

  async claim(qr: string): Promise<void> {
    const ahora = Date.now();
    if (qr === this.ultimo.qr && ahora - this.ultimo.at < REPETIDO_MS) return;
    this.ultimo = { qr, at: ahora };
    navigator.vibrate?.(60);
    this.resultado.set({ tipo: 'verificando' });
    const clave = crypto.randomUUID();
    for (let intento = 0; ; intento++) {
      try {
        const reclamo = await this.api.claim(qr, clave);
        const estado = this.sesion.estado();
        if (estado) this.sesion.set({ ...estado, saldo: reclamo.saldo });
        void this.sesion.refresh();
        this.resultado.set({ tipo: 'ganado', reclamo });
        return;
      } catch (error) {
        const sinRed = error instanceof ErrorApi && error.code === 'SIN_CONEXION';
        const espera = REINTENTOS_MS[intento];
        if (sinRed && espera !== undefined) {
          await esperar(espera);
          continue;
        }
        this.resultado.set(this.toError(error));
        return;
      }
    }
  }

  reset(): void {
    this.resultado.set(null);
  }

  /** Los mensajes de Flujos §5.3. */
  private toError(error: unknown): ResultadoReclamo {
    if (!(error instanceof ErrorApi)) {
      return {
        tipo: 'error',
        codigo: 'DESCONOCIDO',
        mensaje: 'Algo salió mal. Intenta de nuevo.',
        accion: 'escanear',
      };
    }
    const zona = this.sesion.estado()?.evento.zonaHoraria ?? 'America/La_Paz';
    const hora = (clave: string) => {
      const valor = error.meta[clave];
      return typeof valor === 'string' ? formatHora(valor, zona) : null;
    };
    const conAccion = (mensaje: string, accion: 'escanear' | 'mi_entrada' | null = null) =>
      ({ tipo: 'error', codigo: error.code, mensaje, accion }) as const;
    switch (error.code) {
      case 'QR_VENCIDO':
        return conAccion('El código cambió. Escanéalo de nuevo.', 'escanear');
      case 'RETO_YA_COMPLETADO': {
        const a = hora('completadoAt');
        return conAccion(a ? `Ya completaste este reto a las ${a}.` : 'Ya completaste este reto.');
      }
      case 'QR_YA_USADO':
        return conAccion('Este código ya fue usado.', 'escanear');
      case 'RETO_NO_DISPONIBLE': {
        const desde = hora('desde');
        return conAccion(
          desde ? `Este reto se habilita a las ${desde}.` : 'Este reto no está activo ahora.',
        );
      }
      case 'TOPE_ALCANZADO':
        return conAccion('Este reto ya entregó todos sus premios.');
      case 'SIN_CHECK_IN':
        return conAccion('Primero registra tu llegada en la entrada.', 'mi_entrada');
      case 'QR_INVALIDO':
        return conAccion('Este código no es de Pasitos.', 'escanear');
      case 'SIN_CONEXION':
        return conAccion('No pudimos conectar. Intenta de nuevo.', 'escanear');
      default:
        return conAccion(error.detail, 'escanear');
    }
  }
}
