import { withOrganizacion, type Db } from '@pasitos/db';
import type { EnVivoService } from '../en-vivo/en-vivo.service';
import { getEtag } from './estado-app';
import { getEventoApp, type EventoApp } from './evento-app';

/** Un respaldo por si un cambio no avisa (por ejemplo, el catálogo de premios). */
const VIGENCIA_MS = 30_000;

/** Los avisos de `outbox` que cambian el contenido de la app. */
function isCambioDeContenido(tipo: string): boolean {
  return (
    tipo === 'evento.contenido_actualizado' ||
    tipo.startsWith('reto.') ||
    tipo.startsWith('evento.')
  );
}

interface Entrada {
  readonly evento: EventoApp;
  readonly etag: string;
  readonly hasta: number;
}

/** La clave de la caché: el evento y la combinación de grupos de la persona (HU-325). */
function getClave(eventoId: string, grupoIds: readonly string[]): string {
  return `${eventoId}|${[...grupoIds].sort().join(',')}`;
}

/**
 * La caché de `GET /app/evento` (HU-309 §1): se arma una vez por evento y por combinación de
 * grupos (HU-325, hay pocas) y se guarda en memoria. Se invalida con los avisos de contenido de
 * `outbox`. Con 1.000 celulares que abren a la vez, la base lo arma una sola vez.
 */
export class EventoAppCache {
  private readonly entradas = new Map<string, Entrada>();
  private readonly pendientes = new Map<string, Promise<Entrada>>();

  constructor(
    private readonly db: Db,
    enVivo: EnVivoService,
    private readonly ahora: () => number = Date.now,
  ) {
    enVivo.onAviso((aviso) => {
      if (aviso.eventoId && isCambioDeContenido(aviso.tipo)) this.invalidate(aviso.eventoId);
    });
  }

  async get(
    organizacionId: string,
    eventoId: string,
    grupoIds: readonly string[] = [],
  ): Promise<Entrada> {
    const clave = getClave(eventoId, grupoIds);
    const guardada = this.entradas.get(clave);
    if (guardada && guardada.hasta > this.ahora()) return guardada;
    const enCurso = this.pendientes.get(clave);
    if (enCurso) return enCurso;
    const armando = withOrganizacion(this.db, organizacionId, (tx) =>
      getEventoApp(tx, eventoId, grupoIds),
    )
      .then((evento) => {
        const entrada = { evento, etag: getEtag(evento), hasta: this.ahora() + VIGENCIA_MS };
        this.entradas.set(clave, entrada);
        return entrada;
      })
      .finally(() => this.pendientes.delete(clave));
    this.pendientes.set(clave, armando);
    return armando;
  }

  /** Borra todas las combinaciones de grupos del evento. */
  invalidate(eventoId: string): void {
    for (const clave of [...this.entradas.keys()]) {
      if (clave.startsWith(`${eventoId}|`)) this.entradas.delete(clave);
    }
  }
}
