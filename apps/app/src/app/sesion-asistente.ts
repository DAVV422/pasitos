import { inject, Injectable, signal } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import {
  COOKIE_DISPOSITIVO,
  EnVivoService,
  ErrorApi,
  type ConexionEnVivo,
} from '@pasitos/web-core';
import { AsistenteApi, type EstadoApp, type EventoApp } from './asistente-api.service';
import { clearCopias, loadCopia, saveCopia } from './copia-local';

/** Cómo se anuló este celular (`DISPOSITIVO_NO_VINCULADO`), para la pantalla de *anulado*. */
export interface Anulacion {
  readonly anuladaAt: string | null;
  readonly metodo: string | null;
  /** La zona del evento, para mostrar la hora sin conexión. */
  readonly zonaHoraria: string;
}

const SIN_EN_VIVO_MS = 60_000;
const ESPERA_CONTENIDO_MS = 5_000;

/** Los avisos que cambian lo que se ve (HU-308 §5). */
const AVISOS = [
  'saldo.actualizado',
  'dispositivo.anulado',
  'foto.revisada',
  'evento.abierto',
  'evento.pausado',
  'evento.reanudado',
  'evento.cerrado',
  // HU-401: el aviso de 30 minutos antes del cierre programado.
  'evento.cierre_proximo',
  'aviso.publicado',
  'contenido.actualizado',
] as const;

/**
 * La sesión del asistente en la app (HU-306 §6, HU-308 §5): el último estado del servidor, el
 * contenido del evento y, si este celular perdió la entrada, cuándo. La sesión vive en la cookie
 * `px_asistente` (`HttpOnly`). Sin conexión, muestra la última copia guardada.
 */
@Injectable({ providedIn: 'root' })
export class SesionAsistente {
  private readonly api = inject(AsistenteApi);
  private readonly enVivo = inject(EnVivoService);
  private readonly router = inject(Router);

  readonly estado = signal<EstadoApp | null>(null);
  readonly evento = signal<EventoApp | null>(null);
  readonly anulacion = signal<Anulacion | null>(null);
  /** La última foto es la guardada: no hay red. */
  readonly sinConexion = signal(false);
  /** Cuándo llegó lo que se ve (para *"actualizado hace 3 min"*). */
  readonly actualizadoAt = signal<number | null>(null);
  /** No se pudo traer el contenido del evento y no hay copia (HU-309: el estado de error). */
  readonly errorEvento = signal(false);
  /** HU-323: lo que pasó con la última foto (*"¡Tu foto fue aprobada! +20 puntos"*). */
  readonly avisoFoto = signal<{ texto: string; variante: 'ok' | 'advertencia' } | null>(null);
  /** HU-320: *"¡Listo, Valeria! Ya estás en el evento"*, una vez, al llegar a *Inicio*. */
  readonly bienvenida = signal<string | null>(null);
  /** El último aviso del organizador (P2; si llega, se muestra). */
  readonly aviso = signal<string | null>(null);

  private conexion: ConexionEnVivo | null = null;
  private sondeo: ReturnType<typeof setInterval> | null = null;

  set(estado: EstadoApp): void {
    this.anulacion.set(null);
    this.estado.set(estado);
    this.sinConexion.set(false);
    this.actualizadoAt.set(Date.now());
    void saveCopia('estado', estado);
  }

  /** Pide el estado. `sin_sesion` y `anulado` los decide el guard. */
  async load(): Promise<'ok' | 'sin_sesion' | 'anulado'> {
    try {
      this.set(await this.api.getEstado());
      return 'ok';
    } catch (error) {
      if (error instanceof ErrorApi && error.code === 'DISPOSITIVO_NO_VINCULADO') {
        const copia = await loadCopia<EstadoApp>('estado');
        const anulacion: Anulacion = {
          anuladaAt: typeof error.meta['anuladaAt'] === 'string' ? error.meta['anuladaAt'] : null,
          metodo: typeof error.meta['metodo'] === 'string' ? error.meta['metodo'] : null,
          zonaHoraria:
            this.estado()?.evento.zonaHoraria ??
            copia?.valor.evento.zonaHoraria ??
            'America/La_Paz',
        };
        this.anulacion.set(anulacion);
        // HU-312 §2: se recuerda, para mostrarlo aunque abra sin conexión.
        await this.forget();
        await saveCopia('anulacion', anulacion);
        return 'anulado';
      }
      if (
        error instanceof ErrorApi &&
        (error.code === 'NO_AUTENTICADO' || error.code === 'SESION_VENCIDA')
      ) {
        await this.forget();
        return 'sin_sesion';
      }
      if (error instanceof ErrorApi && error.code === 'SIN_CONEXION') {
        const anulada = await loadCopia<Anulacion>('anulacion');
        if (anulada) {
          this.anulacion.set(anulada.valor);
          return 'anulado';
        }
        const copia = await loadCopia<EstadoApp>('estado');
        if (copia) {
          this.estado.set(copia.valor);
          this.actualizadoAt.set(copia.guardadaAt);
          this.sinConexion.set(true);
          return 'ok';
        }
      }
      throw error;
    }
  }

  /** El contenido del evento; sin red, la copia. Un error aquí no tira la pantalla. */
  async loadEvento(): Promise<void> {
    try {
      const evento = await this.api.getEvento();
      this.evento.set(evento);
      this.errorEvento.set(false);
      void saveCopia('evento', evento);
    } catch {
      const copia = await loadCopia<EventoApp>('evento');
      // Una copia de antes de HU-309 (sin `info`) no sirve para las pantallas nuevas.
      if (copia && 'info' in copia.valor && !this.evento()) {
        this.evento.set(copia.valor);
      }
      this.errorEvento.set(!this.evento());
    }
  }

  /**
   * Los avisos en vivo de toda la app (T-301) y, si el canal no está abierto, un pedido cada
   * 60 s. Al volver a la pestaña, el estado se vuelve a pedir (el navegador revalida el `ETag`).
   */
  start(): void {
    if (this.conexion) return;
    const conexion = this.enVivo.connect('/api/v1/app/en-vivo', [...AVISOS]);
    this.conexion = conexion;
    conexion.on('saldo.actualizado', (aviso) => {
      const saldo = (aviso.datos as { saldo?: unknown } | null)?.saldo;
      const estado = this.estado();
      if (estado && typeof saldo === 'number') {
        this.set({ ...estado, saldo });
      }
    });
    conexion.on('dispositivo.anulado', () => {
      void this.load().then((resultado) => {
        if (resultado !== 'ok')
          void this.router.navigate([`/${resultado === 'anulado' ? 'anulado' : 'sin-acceso'}`]);
      });
    });
    // HU-309: el contenido cambió. Cada celular espera un poco al azar para no pedir todos juntos.
    conexion.on('contenido.actualizado', () => {
      setTimeout(() => void this.loadEvento(), Math.random() * ESPERA_CONTENIDO_MS);
    });
    conexion.on('foto.revisada', (aviso) => {
      const datos = aviso.datos as { estado?: string; puntos?: number; motivo?: string } | null;
      if (datos?.estado === 'aprobada') {
        // Sin puntos: ya los tenía (dados a mano por el equipo).
        const puntos = datos.puntos ?? 0;
        this.avisoFoto.set({
          variante: 'ok',
          texto:
            puntos > 0
              ? `¡Tu foto fue aprobada! +${puntos} ${this.estado()?.evento.nombrePuntos ?? 'puntos'}`
              : '¡Tu foto fue aprobada!',
        });
      } else if (datos?.estado === 'rechazada' || datos?.estado === 'rechazada_sistema') {
        this.avisoFoto.set({
          variante: 'advertencia',
          texto: `Tu foto fue rechazada: ${datos.motivo ?? 'sin motivo'}`,
        });
      }
    });
    conexion.on('aviso.publicado', (aviso) => {
      const texto = (aviso.datos as { texto?: unknown } | null)?.texto;
      if (typeof texto === 'string') this.aviso.set(texto);
    });
    for (const tipo of [
      'foto.revisada',
      'evento.abierto',
      'evento.pausado',
      'evento.reanudado',
      'evento.cerrado',
      'evento.cierre_proximo',
      'reiniciar',
    ]) {
      conexion.on(tipo, () => void this.refresh());
    }
    this.sondeo = setInterval(() => {
      if (conexion.estado() !== 'abierta' && document.visibilityState === 'visible') {
        void this.refresh();
      }
    }, SIN_EN_VIVO_MS);
    document.addEventListener('visibilitychange', this.alVolver);
    addEventListener('online', this.alVolver);
  }

  private readonly alVolver = (): void => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  /** Vuelve a pedir el estado; si la sesión ya no sirve, lleva a su aviso. */
  async refresh(): Promise<void> {
    const resultado = await this.load().catch(() => 'ok' as const);
    if (resultado === 'anulado') await this.router.navigate(['/anulado']);
    if (resultado === 'sin_sesion') await this.router.navigate(['/sin-acceso']);
  }

  /** Cierra el canal y borra lo guardado: este celular ya no tiene la entrada. */
  private async forget(): Promise<void> {
    this.conexion?.close();
    this.conexion = null;
    if (this.sondeo) clearInterval(this.sondeo);
    this.sondeo = null;
    document.removeEventListener('visibilitychange', this.alVolver);
    removeEventListener('online', this.alVolver);
    this.estado.set(null);
    this.evento.set(null);
    await clearCopias();
  }
}

/** Las pantallas de la app piden una sesión: sin ella, cómo entrar; anulada, el aviso. */
export const sesionGuard: CanActivateFn = async () => {
  const sesion = inject(SesionAsistente);
  const router = inject(Router);
  if (!sesion.estado()) {
    // Un navegador que nunca se vinculó no tiene su id: no hace falta preguntar al servidor.
    if (!document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE_DISPOSITIVO}=`))) {
      return router.parseUrl('/sin-acceso');
    }
    const resultado = await sesion.load().catch(() => 'error' as const);
    if (resultado === 'anulado') return router.parseUrl('/anulado');
    if (resultado === 'sin_sesion') return router.parseUrl('/sin-acceso');
    if (resultado === 'error') return router.parseUrl('/sin-conexion');
  }
  sesion.start();
  if (!sesion.evento()) void sesion.loadEvento();
  return true;
};
