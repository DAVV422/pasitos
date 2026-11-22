import { createReadStream } from 'node:fs';
import { chmod, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { eq } from 'drizzle-orm';
import { archivos, withOrganizacion, type Db } from '@pasitos/db';
import {
  AppError,
  EXTENSIONES_IMAGEN,
  MIMES_IMAGEN,
  PROPOSITOS_ARCHIVO,
  VARIANTES_IMAGEN,
  type PropositoArchivo,
  type VarianteImagen,
} from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { RolesRepository } from '../../common/permisos/roles.repository';
import { Limitador } from '../auth/limitador';
import type { ContextoSesion, Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import { checkCsv, processImagen, type ImagenProcesada } from '@pasitos/imagenes';

export interface ArchivoSubido {
  readonly datos: Buffer;
  readonly nombre: string;
  readonly mime: string;
}

export interface ArchivoAprobado {
  readonly id: string;
  readonly proposito: PropositoArchivo;
  readonly ancho: number | null;
  readonly alto: number | null;
  readonly variantes: Readonly<Partial<Record<VarianteImagen, string>>>;
}

/** El nombre original, limpio: solo para mostrar (Subida de archivos §3). */
export function cleanNombre(nombre: string): string {
  const base = nombre.split(/[\\/]/).at(-1) ?? 'archivo';
  return base.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 120) || 'archivo';
}

export function getUrlArchivo(id: string, variante: VarianteImagen): string {
  return `/api/v1/archivos/${id}/${variante}`;
}

/**
 * Subir y servir archivos (HU-214, Subida de archivos §2–§4). Todo entra por `cuarentena/` (nunca
 * se sirve); solo lo aprobado y reencodeado pasa a `eventos/<org>/<evento>/<id>/`.
 */
export class ArchivosService {
  private readonly bitacora = new BitacoraService();
  private readonly porUsuario: Limitador;

  constructor(
    private readonly db: Db,
    private readonly roles: RolesRepository,
    private readonly reloj: Reloj,
    private readonly archivosDir: string,
  ) {
    this.porUsuario = new Limitador([{ maximo: 30, ms: 60 * 60 * 1000 }], () =>
      this.reloj.now().getTime(),
    );
  }

  /** Paso 1 (lo que se puede revisar antes de leer el archivo): propósito, extensión y tipo declarado. */
  checkDeclarado(proposito: PropositoArchivo, nombre: string, mime: string): void {
    const definicion = PROPOSITOS_ARCHIVO[proposito];
    const extension = nombre.split('.').at(-1)?.toLowerCase() ?? '';
    const ok =
      definicion.tipo === 'csv'
        ? extension === 'csv'
        : (EXTENSIONES_IMAGEN as readonly string[]).includes(extension) &&
          (MIMES_IMAGEN as readonly string[]).includes(mime);
    if (!ok) {
      throw new AppError('ARCHIVO_INVALIDO', {
        detail:
          definicion.tipo === 'csv' ? 'Sube un archivo .csv.' : 'Usa una imagen PNG, JPEG o WebP.',
      });
    }
  }

  checkLimite(usuarioId: string): void {
    const espera = this.porUsuario.hit(usuarioId);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
  }

  async upload(
    contexto: ContextoEvento,
    proposito: PropositoArchivo,
    archivo: ArchivoSubido,
  ): Promise<ArchivoAprobado> {
    this.checkDeclarado(proposito, archivo.nombre, archivo.mime);
    const id = uuidv7();
    const nombre = cleanNombre(archivo.nombre);
    // Cuarentena: nombre aleatorio, sin extensión, solo el dueño del proceso puede leerlo.
    const enCuarentena = join(this.archivosDir, 'cuarentena', id);
    await mkdir(join(this.archivosDir, 'cuarentena'), { recursive: true });
    await writeFile(enCuarentena, archivo.datos, { mode: 0o600 });
    await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx.insert(archivos).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        proposito,
        nombreOriginal: nombre,
        mime: archivo.mime,
        tamanoBytes: archivo.datos.length,
        subidoPor: contexto.usuarioId,
      }),
    );

    if (PROPOSITOS_ARCHIVO[proposito].tipo === 'csv') {
      try {
        await checkCsv(archivo.datos);
      } catch (error) {
        await this.reject(contexto, id, enCuarentena, error);
        throw error;
      }
      // Queda en cuarentena para la importación (HU-210), que lo lee y lo borra.
      await this.recordSubida(contexto, id, proposito, null);
      return { id, proposito, ancho: null, alto: null, variantes: {} };
    }

    let imagen: ImagenProcesada;
    try {
      imagen = await processImagen(archivo.datos, proposito);
    } catch (error) {
      await this.reject(contexto, id, enCuarentena, error);
      throw error;
    }
    const variantes = await this.writeVariantes(contexto, id, imagen);
    await rm(enCuarentena, { force: true });
    await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      await tx
        .update(archivos)
        .set({
          estado: 'aprobado',
          mime: 'image/webp',
          ancho: imagen.ancho,
          alto: imagen.alto,
          sha256: imagen.sha256,
          tamanoBytes: imagen.variantes.original.length,
          variantes,
        })
        .where(eq(archivos.id, id));
    });
    await this.recordSubida(contexto, id, proposito, imagen);
    return this.toAprobado(id, proposito, imagen.ancho, imagen.alto);
  }

  /** Para el mapa estático (HU-214 §6): lo crea el servidor, por el mismo procesamiento. */
  async createDesdeServidor(
    contexto: ContextoEvento,
    proposito: PropositoArchivo,
    datos: Buffer,
  ): Promise<string> {
    const imagen = await processImagen(datos, proposito);
    const id = uuidv7();
    const variantes = await this.writeVariantes(contexto, id, imagen);
    await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx.insert(archivos).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        proposito,
        nombreOriginal: proposito,
        mime: 'image/webp',
        tamanoBytes: imagen.variantes.original.length,
        ancho: imagen.ancho,
        alto: imagen.alto,
        sha256: imagen.sha256,
        estado: 'aprobado',
        variantes,
      }),
    );
    return id;
  }

  /**
   * `GET /archivos/:id/:variante` (HU-214 §4): evento privado, el equipo y también los
   * dispositivos de ese evento (el celular vinculado de un asistente y las pantallas y mesas, que
   * muestran los premios, los sponsors y el logo); caché privado. Con enlace o público, cualquiera
   * (caché largo: el id cambia si se reemplaza). La ruta de disco sale de la fila y tiene que
   * quedar dentro de `eventos/`.
   */
  async open(
    id: string,
    variante: VarianteImagen,
    sesion: () => Promise<ContextoSesion | null>,
    eventoDelDispositivo: () => Promise<string | null> = () => Promise.resolve(null),
  ) {
    const archivo = await this.roles.findArchivoServible(id);
    const relativa = (archivo?.variantes as Partial<Record<VarianteImagen, string>> | null)?.[
      variante
    ];
    // HU-322: las fotos de los retos nunca salen por aquí (son personales): las sirven sus rutas.
    if (
      !archivo ||
      archivo.estado !== 'aprobado' ||
      !relativa ||
      archivo.proposito === 'foto_reto'
    ) {
      throw new AppError('NO_ENCONTRADO');
    }
    const privado = archivo.visibilidad === 'privado';
    if (privado && (await eventoDelDispositivo()) !== archivo.eventoId) {
      const persona = await sesion();
      const rol = persona
        ? await this.roles.findRol(persona.usuario.id, {
            id: archivo.eventoId,
            organizacionId: archivo.organizacionId,
            estado: archivo.estadoEvento,
          })
        : null;
      if (!rol) {
        throw new AppError('NO_ENCONTRADO');
      }
    }
    const carpeta = resolve(this.archivosDir, 'eventos');
    const ruta = normalize(resolve(this.archivosDir, relativa));
    if (!ruta.startsWith(carpeta + sep)) {
      throw new AppError('NO_ENCONTRADO');
    }
    const { size } = await stat(ruta).catch(() => {
      throw new AppError('NO_ENCONTRADO');
    });
    return {
      stream: createReadStream(ruta),
      tamano: size,
      cacheControl: privado ? 'private, max-age=300' : 'public, max-age=31536000, immutable',
    };
  }

  /** Marca el anterior como reemplazado cuando un recurso pasa a usar otro (HU-214 §2). */
  async markReemplazado(contexto: ContextoEvento, anteriorId: string | null): Promise<void> {
    if (!anteriorId) return;
    await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx
        .update(archivos)
        .set({ reemplazadoAt: this.reloj.now() })
        .where(eq(archivos.id, anteriorId)),
    );
  }

  /** Un archivo aprobado de este evento y de ese propósito, o VALIDACION en el campo. */
  async checkUsable(
    contexto: ContextoEvento,
    id: string,
    proposito: PropositoArchivo,
    campo: string,
  ): Promise<void> {
    const [fila] = await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx
        .select({
          eventoId: archivos.eventoId,
          proposito: archivos.proposito,
          estado: archivos.estado,
        })
        .from(archivos)
        .where(eq(archivos.id, id)),
    );
    if (
      !fila ||
      fila.eventoId !== contexto.eventoId ||
      fila.proposito !== proposito ||
      fila.estado !== 'aprobado'
    ) {
      throw new AppError('VALIDACION', {
        errors: [{ field: campo, code: 'ARCHIVO_NO_VALIDO', message: 'Sube la imagen de nuevo.' }],
      });
    }
  }

  private async writeVariantes(contexto: ContextoEvento, id: string, imagen: ImagenProcesada) {
    const relativa = join('eventos', contexto.organizacionId, contexto.eventoId, id);
    await mkdir(join(this.archivosDir, relativa), { recursive: true });
    const variantes: Record<string, string> = {};
    for (const variante of VARIANTES_IMAGEN) {
      const archivo = join(relativa, `${variante}.webp`);
      await writeFile(join(this.archivosDir, archivo), imagen.variantes[variante]);
      await chmod(join(this.archivosDir, archivo), 0o644);
      variantes[variante] = archivo.split(sep).join('/');
    }
    return variantes;
  }

  private async reject(contexto: ContextoEvento, id: string, ruta: string, error: unknown) {
    await rm(ruta, { force: true });
    await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      tx
        .update(archivos)
        .set({
          estado: 'rechazado',
          motivoRechazo: error instanceof AppError ? error.code : 'ERROR_INTERNO',
        })
        .where(eq(archivos.id, id)),
    );
  }

  private async recordSubida(
    contexto: ContextoEvento,
    id: string,
    proposito: PropositoArchivo,
    imagen: ImagenProcesada | null,
  ) {
    await withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'archivo.upload',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'archivo', id, nombre: PROPOSITOS_ARCHIVO[proposito].texto },
        despues: { proposito, ...(imagen ? { ancho: imagen.ancho, alto: imagen.alto } : {}) },
      }),
    );
  }

  private toAprobado(
    id: string,
    proposito: PropositoArchivo,
    ancho: number,
    alto: number,
  ): ArchivoAprobado {
    return {
      id,
      proposito,
      ancho,
      alto,
      variantes: Object.fromEntries(VARIANTES_IMAGEN.map((v) => [v, getUrlArchivo(id, v)])),
    };
  }
}
