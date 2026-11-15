import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import {
  asistentes,
  eventos,
  miembrosOrganizacion,
  organizaciones,
  outbox,
  pantallas,
  retos,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, type RolEvento } from '@pasitos/dominio';
import {
  buildListaChequeo,
  canTransicion,
  DURACION_MAXIMA_EVENTO_MS,
  type esquemaEditarEvento,
  TRANSICIONES_EVENTO,
  type TransicionEvento,
} from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { z } from 'zod';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { ContextoSesion, Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, diff } from '../bitacora/bitacora.service';
import type { ArchivosService } from '../archivos/archivos.service';
import { toSlug } from '../plataforma/slug';

export interface DatosCrearEvento {
  readonly nombre: string;
  readonly inicioAt: string;
  readonly finAt: string;
  readonly zonaHoraria: string;
}

const ACCION_POR_TRANSICION = {
  publicar: 'evento.publish',
  abrir: 'evento.open',
  pausar: 'evento.pause',
  reanudar: 'evento.resume',
} as const;

/** Lo que el trabajador hace con cada transición (HU-205 §4): `outbox` en la misma transacción. */
const OUTBOX_POR_TRANSICION: Partial<Record<TransicionEvento, string>> = {
  publicar: 'evento.publicado',
  pausar: 'evento.pausado',
  reanudar: 'evento.reanudado',
};

export type DatosEditarEvento = z.infer<typeof esquemaEditarEvento>;

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

function isSlugRepetido(error: unknown): boolean {
  const causa = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const { code, constraint } = causa as { code?: string; constraint?: string };
  return code === '23505' && (constraint ?? '').includes('slug');
}

/**
 * Crear el evento y moverlo entre estados (HU-205). Todo con `withOrganizacion()` y RLS; cada
 * cambio deja su bitácora en la misma transacción.
 */
export class EventosService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly red: 'local' | 'testnet',
    private readonly archivos: ArchivosService,
  ) {}

  /** Solo el dueño de la organización; una organización suspendida no crea eventos. */
  async create(sesion: ContextoSesion, organizacionId: string, datos: DatosCrearEvento) {
    const [organizacion] = await this.db
      .select({ estado: organizaciones.estado, esDemo: organizaciones.esDemo })
      .from(organizaciones)
      .where(eq(organizaciones.id, organizacionId));
    return withOrganizacion(this.db, organizacionId, async (tx) => {
      const [dueno] = await tx
        .select({ id: miembrosOrganizacion.id })
        .from(miembrosOrganizacion)
        .where(
          and(
            eq(miembrosOrganizacion.usuarioId, sesion.usuario.id),
            eq(miembrosOrganizacion.estado, 'activo'),
            eq(miembrosOrganizacion.rol, 'dueno'),
          ),
        );
      // Sin ser dueña: 404 (no se revela la organización).
      if (!organizacion || !dueno) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (organizacion.estado === 'suspendida') {
        throw new AppError('SIN_PERMISO', { meta: { motivo: 'organizacion_suspendida' } });
      }
      const id = uuidv7();
      const slug = await this.insertConSlugLibre(tx, toSlug(datos.nombre), {
        id,
        organizacionId,
        nombre: datos.nombre,
        tipo: organizacion.esDemo ? 'demo' : 'real',
        inicioAt: new Date(datos.inicioAt),
        finAt: new Date(datos.finAt),
        zonaHoraria: datos.zonaHoraria,
      });
      await this.bitacora.record(tx, {
        actor: {
          tipo: 'usuario',
          id: sesion.usuario.id,
          nombre: sesion.usuario.nombre,
          rol: 'dueno',
          dispositivo: sesion.dispositivo,
        },
        accion: 'evento.create',
        organizacionId,
        eventoId: id,
        objeto: { tipo: 'evento', id, nombre: datos.nombre },
        despues: { nombre: datos.nombre, inicioAt: datos.inicioAt, finAt: datos.finAt },
      });
      return { id, slug };
    });
  }

  async get(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getFila(tx, contexto.eventoId);
      const contadores = await this.getContadores(tx, contexto.eventoId);
      return this.toEvento(evento, contexto.rol, contadores);
    });
  }

  /**
   * `PATCH /eventos/:eventoId` (HU-206 §1). El slug, solo en borrador y privado; con el evento
   * publicado, el inicio no pasa a antes de ahora. Las imágenes, aprobadas y del propósito correcto.
   * La bitácora guarda solo lo que cambió.
   */
  async update(contexto: ContextoEvento, datos: DatosEditarEvento) {
    const imagenes = [
      ['logoArchivoId', 'logo_evento'],
      ['portadaArchivoId', 'portada'],
      ['planoArchivoId', 'plano'],
    ] as const;
    for (const [campo, proposito] of imagenes) {
      const id = datos[campo];
      if (typeof id === 'string') {
        await this.archivos.checkUsable(contexto, id, proposito, campo);
      }
    }
    const resultado = await withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [actual] = await tx
        .select()
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId))
        .for('update');
      if (!actual) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (datos.slug !== undefined && datos.slug !== actual.slug) {
        if (actual.estado !== 'borrador' || actual.visibilidad !== 'privado') {
          throw errorCampo('slug', 'El enlace solo se cambia con el evento en borrador y privado.');
        }
      }
      const inicio = datos.inicioAt ? new Date(datos.inicioAt) : actual.inicioAt;
      const fin = datos.finAt ? new Date(datos.finAt) : actual.finAt;
      if (!(fin > inicio)) {
        throw errorCampo('finAt', 'El fin tiene que ser después del inicio.');
      }
      if (fin.getTime() - inicio.getTime() > DURACION_MAXIMA_EVENTO_MS) {
        throw errorCampo('finAt', 'Un evento dura como mucho 7 días.');
      }
      const movioElInicio =
        datos.inicioAt !== undefined && inicio.getTime() !== actual.inicioAt.getTime();
      if (actual.estado !== 'borrador' && movioElInicio && inicio < this.reloj.now()) {
        throw errorCampo(
          'inicioAt',
          'Con el evento publicado, el inicio no puede quedar en el pasado.',
        );
      }
      const resto: Omit<DatosEditarEvento, 'inicioAt' | 'finAt'> = { ...datos };
      delete (resto as DatosEditarEvento).inicioAt;
      delete (resto as DatosEditarEvento).finAt;
      const cambios = {
        ...resto,
        ...(datos.inicioAt ? { inicioAt: inicio } : {}),
        ...(datos.finAt ? { finAt: fin } : {}),
      };
      try {
        await tx.transaction((sub) =>
          sub
            .update(eventos)
            .set({ ...cambios, updatedAt: this.reloj.now() })
            .where(eq(eventos.id, actual.id)),
        );
      } catch (error) {
        if (isSlugRepetido(error)) {
          throw errorCampo('slug', 'Ese enlace ya lo usa otro evento.');
        }
        throw error;
      }
      const antes = Object.fromEntries(
        Object.keys(cambios).map((campo) => [campo, actual[campo as keyof typeof actual]]),
      );
      const recortado = diff(antes, cambios);
      if (Object.keys(recortado.despues).length > 0) {
        await this.bitacora.record(tx, {
          actor: toActor(contexto),
          accion: 'evento.update',
          organizacionId: actual.organizacionId,
          eventoId: actual.id,
          objeto: { tipo: 'evento', id: actual.id, nombre: datos.nombre ?? actual.nombre },
          antes: recortado.antes,
          despues: recortado.despues,
        });
        await tx.insert(outbox).values({
          id: uuidv7(),
          tipo: 'evento.contenido_actualizado',
          eventoId: actual.id,
          payload: { eventoId: actual.id },
        });
      }
      const fila = await this.getFila(tx, actual.id);
      return {
        reemplazados: imagenes
          .map(([campo]) => campo)
          .filter((campo) => datos[campo] !== undefined && datos[campo] !== actual[campo])
          .map((campo) => actual[campo]),
        evento: this.toEvento(fila, contexto.rol, await this.getContadores(tx, actual.id)),
      };
    });
    for (const anterior of resultado.reemplazados) {
      await this.archivos.markReemplazado(contexto, anterior);
    }
    return resultado.evento;
  }

  getListaChequeo(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) =>
      this.buildChequeo(tx, await this.getFila(tx, contexto.eventoId)),
    );
  }

  /**
   * Publicar, abrir, pausar o reanudar (HU-205 §3). La fila del evento queda bloqueada: dos
   * clics no publican dos veces (el segundo recibe TRANSICION_NO_PERMITIDA).
   */
  async transition(contexto: ContextoEvento, transicion: TransicionEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [evento] = await tx
        .select()
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId))
        .for('update');
      if (!evento) {
        throw new AppError('NO_ENCONTRADO');
      }
      if (!canTransicion(evento.estado, transicion)) {
        throw new AppError('TRANSICION_NO_PERMITIDA', { meta: { estado: evento.estado } });
      }
      const ahora = this.reloj.now();
      const cambios: Partial<typeof eventos.$inferInsert> = {
        estado: TRANSICIONES_EVENTO[transicion].a,
        updatedAt: ahora,
      };
      if (transicion === 'publicar') {
        const [organizacion] = await tx
          .select({ estado: organizaciones.estado })
          .from(organizaciones)
          .where(eq(organizaciones.id, evento.organizacionId));
        if (organizacion?.estado === 'suspendida') {
          throw new AppError('SIN_PERMISO', { meta: { motivo: 'organizacion_suspendida' } });
        }
        const chequeo = await this.buildChequeo(tx, evento);
        if (!chequeo.completa) {
          throw new AppError('EVENTO_NO_PUBLICABLE', {
            meta: { faltantes: chequeo.items.filter((i) => !i.ok) },
          });
        }
        cambios.publicadoAt = ahora;
        cambios.publicadoPor = contexto.usuarioId;
      }
      if (transicion === 'abrir') {
        if (!evento.contratoId) {
          throw new AppError('EVENTO_SIN_CONTRATO');
        }
        cambios.iniciadoAt = evento.iniciadoAt ?? ahora;
      }
      await tx.update(eventos).set(cambios).where(eq(eventos.id, evento.id));
      const tipoOutbox = OUTBOX_POR_TRANSICION[transicion];
      if (tipoOutbox) {
        await tx.insert(outbox).values({
          id: uuidv7(),
          tipo: tipoOutbox,
          eventoId: evento.id,
          payload: { eventoId: evento.id },
        });
      }
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: ACCION_POR_TRANSICION[transicion],
        organizacionId: evento.organizacionId,
        eventoId: evento.id,
        objeto: { tipo: 'evento', id: evento.id, nombre: evento.nombre },
        antes: { estado: evento.estado },
        despues: { estado: cambios.estado },
      });
      const actualizado = await this.getFila(tx, evento.id);
      return this.toEvento(actualizado, contexto.rol, await this.getContadores(tx, evento.id));
    });
  }

  private async insertConSlugLibre(
    tx: Tx,
    base: string,
    valores: Omit<typeof eventos.$inferInsert, 'slug'>,
  ): Promise<string> {
    // El slug es único entre todas las organizaciones y RLS no deja ver las demás: se prueba y,
    // si choca, se suma un sufijo (en un savepoint, para no perder la transacción).
    for (let n = 1; n < 50; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      try {
        await tx.transaction((sub) => sub.insert(eventos).values({ ...valores, slug }));
        return slug;
      } catch (error) {
        if (!isSlugRepetido(error)) {
          throw error;
        }
      }
    }
    throw new AppError('ERROR_INTERNO', { detail: 'No hay un slug libre' });
  }

  private async getFila(tx: Tx, eventoId: string) {
    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, eventoId));
    if (!evento) {
      throw new AppError('NO_ENCONTRADO');
    }
    return evento;
  }

  private async buildChequeo(tx: Tx, evento: typeof eventos.$inferSelect) {
    const [lista, [conPantallas]] = await Promise.all([
      tx
        .select({
          nombre: retos.nombre,
          tipo: retos.tipo,
          estado: retos.estado,
          lugarId: retos.lugarId,
          disponibleDesde: retos.disponibleDesde,
          disponibleHasta: retos.disponibleHasta,
        })
        .from(retos)
        .where(eq(retos.eventoId, evento.id)),
      tx.select({ total: count() }).from(pantallas).where(eq(pantallas.eventoId, evento.id)),
    ]);
    // Hasta que las pantallas tengan lugar (HU-209), un reto de QR con lugar "tiene pantalla" si
    // el evento tiene al menos una. El catálogo y las mesas entran con HU-208 y HU-209.
    const hayPantalla = (conPantallas?.total ?? 0) > 0;
    const dentro = (fecha: Date | null) =>
      fecha === null || (fecha >= evento.inicioAt && fecha <= evento.finAt);
    return buildListaChequeo({
      inicioAt: evento.inicioAt,
      finAt: evento.finAt,
      ahora: this.reloj.now(),
      retos: lista.map((r) => ({
        nombre: r.nombre,
        tipo: r.tipo,
        activo: r.estado === 'activo',
        tienePantalla: r.lugarId !== null && hayPantalla,
        enHorario: dentro(r.disponibleDesde) && dentro(r.disponibleHasta),
      })),
      premiosActivos: 0,
      mesas: 0,
    });
  }

  private async getContadores(tx: Tx, eventoId: string) {
    const [[retosActivos], [totalPantallas], [conectadas], [invitados]] = await Promise.all([
      tx
        .select({ total: count() })
        .from(retos)
        .where(and(eq(retos.eventoId, eventoId), eq(retos.estado, 'activo'))),
      tx.select({ total: count() }).from(pantallas).where(eq(pantallas.eventoId, eventoId)),
      tx
        .select({ total: count() })
        .from(pantallas)
        .where(and(eq(pantallas.eventoId, eventoId), isNotNull(pantallas.llavePublica))),
      tx
        .select({ total: sql<number>`count(*)::int` })
        .from(asistentes)
        .where(eq(asistentes.eventoId, eventoId)),
    ]);
    return {
      retos: retosActivos?.total ?? 0,
      pantallas: totalPantallas?.total ?? 0,
      pantallasConectadas: conectadas?.total ?? 0,
      mesas: 0,
      invitados: invitados?.total ?? 0,
    };
  }

  private toEvento(
    evento: typeof eventos.$inferSelect,
    rol: RolEvento,
    contadores: Awaited<ReturnType<EventosService['getContadores']>>,
  ) {
    return {
      id: evento.id,
      organizacionId: evento.organizacionId,
      slug: evento.slug,
      nombre: evento.nombre,
      tipo: evento.tipo,
      estado: evento.estado,
      visibilidad: evento.visibilidad,
      zonaHoraria: evento.zonaHoraria,
      inicioAt: evento.inicioAt,
      finAt: evento.finAt,
      publicadoAt: evento.publicadoAt,
      iniciadoAt: evento.iniciadoAt,
      nombrePuntos: evento.nombrePuntos,
      descripcion: evento.descripcion,
      contacto: evento.contacto,
      // El wifi lo ve el equipo; nunca es público (HU-206 §1).
      wifi: evento.wifi,
      seccionesPublicas: evento.seccionesPublicas,
      imagenes: {
        logoArchivoId: evento.logoArchivoId,
        portadaArchivoId: evento.portadaArchivoId,
        planoArchivoId: evento.planoArchivoId,
      },
      ubicacion: {
        nombre: evento.lugarNombre,
        direccion: evento.lugarDireccion,
        lat: evento.ubicacionLat,
        lng: evento.ubicacionLng,
        mapaEstaticoArchivoId: evento.mapaEstaticoArchivoId,
      },
      miRol: rol,
      stellar: {
        contratoId: evento.contratoId,
        enlace:
          evento.contratoId && this.red === 'testnet'
            ? `https://stellar.expert/explorer/testnet/contract/${evento.contratoId}`
            : null,
      },
      contadores,
    };
  }
}
