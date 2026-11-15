import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { eventos, withOrganizacion, type Db } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { ArchivosService } from './archivos.service';

export interface DatosUbicacion {
  readonly nombre: string;
  readonly direccion: string;
  readonly lat?: number | null | undefined;
  readonly lng?: number | null | undefined;
}

/** Trae la imagen del mapa (Static Maps). Se inyecta para poder probar sin Google. */
export type TraerMapa = (lat: number, lng: number) => Promise<Buffer | null>;

/** Static Maps con la llave del servidor (restringida por IP), o nada si no hay llave. */
export function createTraerMapaGoogle(llave: string | undefined): TraerMapa {
  const logger = new Logger('MapaEstatico');
  return async (lat, lng) => {
    if (!llave) {
      return null;
    }
    const centro = `${lat},${lng}`;
    const url = new URL('https://maps.googleapis.com/maps/api/staticmap');
    url.search = new URLSearchParams({
      center: centro,
      zoom: '16',
      size: '640x320',
      scale: '2',
      markers: centro,
      key: llave,
    }).toString();
    try {
      const respuesta = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (!respuesta.ok) {
        throw new Error(`Static Maps respondió ${respuesta.status}`);
      }
      return Buffer.from(await respuesta.arrayBuffer());
    } catch (error) {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'No se pudo traer el mapa estático; la ubicación se guarda sin mapa',
      );
      return null;
    }
  };
}

/**
 * Ubicación marcada en el mapa (HU-214 §6, ajuste 8): sin buscar direcciones. Con punto y llave,
 * el servidor pide **una vez** el mapa estático y lo guarda como un archivo más (los asistentes no
 * cargan Google).
 */
export class UbicacionService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly archivos: ArchivosService,
    private readonly traerMapa: TraerMapa,
  ) {}

  async update(contexto: ContextoEvento, datos: DatosUbicacion) {
    const conPunto = typeof datos.lat === 'number' && typeof datos.lng === 'number';
    const [actual] = await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx
        .select({
          nombre: eventos.lugarNombre,
          direccion: eventos.lugarDireccion,
          lat: eventos.ubicacionLat,
          lng: eventos.ubicacionLng,
          mapa: eventos.mapaEstaticoArchivoId,
        })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId)),
    );
    if (!actual) {
      throw new AppError('NO_ENCONTRADO');
    }
    const cambioElPunto = actual.lat !== (datos.lat ?? null) || actual.lng !== (datos.lng ?? null);
    let mapa = cambioElPunto ? null : actual.mapa;
    if (conPunto && (cambioElPunto || !actual.mapa)) {
      const imagen = await this.traerMapa(datos.lat as number, datos.lng as number);
      mapa = imagen
        ? await this.archivos
            .createDesdeServidor(contexto, 'mapa_estatico', imagen)
            .catch(() => null)
        : null;
    }
    await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await tx
        .update(eventos)
        .set({
          lugarNombre: datos.nombre,
          lugarDireccion: datos.direccion,
          ubicacionLat: conPunto ? (datos.lat as number) : null,
          ubicacionLng: conPunto ? (datos.lng as number) : null,
          mapaEstaticoArchivoId: mapa,
          updatedAt: new Date(),
        })
        .where(eq(eventos.id, contexto.eventoId));
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'evento.ubicacion.update',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'evento', id: contexto.eventoId, nombre: datos.nombre },
        antes: {
          nombre: actual.nombre,
          direccion: actual.direccion,
          lat: actual.lat,
          lng: actual.lng,
        },
        despues: {
          nombre: datos.nombre,
          direccion: datos.direccion,
          lat: datos.lat ?? null,
          lng: datos.lng ?? null,
        },
      });
    });
    if (mapa !== actual.mapa) {
      await this.archivos.markReemplazado(contexto, actual.mapa);
    }
    return {
      nombre: datos.nombre,
      direccion: datos.direccion,
      lat: conPunto ? datos.lat : null,
      lng: conPunto ? datos.lng : null,
      mapaEstaticoArchivoId: mapa,
    };
  }
}
