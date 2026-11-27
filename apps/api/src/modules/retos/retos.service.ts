import { inArray, ne, and, asc, count, eq, isNull } from 'drizzle-orm';
import {
  miembrosEvento,
  retoResponsables,
  grupos,
  actividades,
  eventos,
  lugares,
  outbox,
  pantallas,
  participaciones,
  retos,
  sponsors,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { DatosReto } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService, diff } from '../bitacora/bitacora.service';

type Reto = typeof retos.$inferSelect;

/** Con el contrato del evento creado o por crearse: los topes viven también en la red. */
const ESTADOS_PUBLICADOS = new Set(['publicado', 'en_curso', 'pausado']);

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

const CAMPOS_PUBLICOS = [
  'nombre',
  'descripcion',
  'enlaces',
  'tipo',
  'modoQr',
  'rotacionSegundos',
  'puntos',
  'topeTotal',
  'vecesPorPersona',
  'lugarId',
  'disponibleDesde',
  'disponibleHasta',
  'sponsorId',
  // HU-325 y HU-322.
  'grupoId',
  'instruccionFoto',
  'permiteGaleria',
  'autorizacionUso',
  'intentosMax',
] as const;

/**
 * Retos (HU-207). `numero` lo pone la base y no cambia. Con el evento publicado, crear un reto o
 * subir su tope escribe `reto.cambiado` en `outbox` → `sync-retos`, y hasta que entra en el
 * contrato el reto no acepta reclamos. El tope **solo sube** una vez publicado (el contrato no deja
 * bajarlo, ajuste 3). La fila del reto se bloquea, la misma que bloquea un reclamo.
 */
export class RetosService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
  ) {}

  list(contexto: ContextoEvento) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select({ reto: retos, lugar: lugares.nombre })
        .from(retos)
        .leftJoin(lugares, eq(lugares.id, retos.lugarId))
        .where(eq(retos.eventoId, contexto.eventoId))
        .orderBy(asc(retos.numero));
      const conPantalla = await this.getLugaresConPantalla(tx, contexto.eventoId);
      const responsables = await this.listResponsables(
        tx,
        filas.map((f) => f.reto.id),
      );
      return filas.map(({ reto, lugar }) => ({
        ...this.toReto(reto, responsables.get(reto.id)),
        lugar: lugar ? { id: reto.lugarId, nombre: lugar } : null,
        tienePantalla: reto.tipo !== 'qr' || conPantalla(reto.lugarId),
      }));
    });
  }

  async create(contexto: ContextoEvento, datos: DatosReto) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      await this.checkReglas(tx, contexto, evento, datos);
      const id = uuidv7();
      const publicado = ESTADOS_PUBLICADOS.has(evento.estado);
      await tx.insert(retos).values({
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        ...this.toColumnas(datos),
        createdBy: contexto.usuarioId,
      });
      await this.setResponsables(tx, contexto, id, datos.tipo === 'foto' ? datos.responsables : []);
      if (publicado) {
        await this.notifyCambio(tx, contexto.eventoId, id);
      }
      await this.record(tx, contexto, 'reto.create', id, datos.nombre, undefined, datos);
      return this.toReto(
        await this.getReto(tx, contexto, id),
        datos.tipo === 'foto' ? datos.responsables : [],
      );
    });
  }

  async update(contexto: ContextoEvento, id: string, cambios: Partial<DatosReto>) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      const actual = await this.getReto(tx, contexto, id, true);
      const publicado = ESTADOS_PUBLICADOS.has(evento.estado);
      const antes: DatosReto = {
        ...this.toDatos(actual),
        responsables: (await this.listResponsables(tx, [id])).get(id) ?? [],
      };
      const final: DatosReto = { ...antes, ...cambios };
      if (cambios.topeTotal !== undefined && cambios.topeTotal < actual.topeTotal) {
        if (publicado) {
          throw new AppError('TOPE_NO_BAJA', { meta: { tope: actual.topeTotal } });
        }
      }
      if (final.topeTotal < actual.entregados) {
        throw errorCampo(
          'topeTotal',
          `Ya se entregó ${actual.entregados} veces: el tope no puede ser menor.`,
        );
      }
      await this.checkReglas(tx, contexto, evento, final);
      const subioElTope = final.topeTotal > actual.topeTotal;
      await tx
        .update(retos)
        .set({
          ...this.toColumnas(final),
          updatedAt: this.reloj.now(),
          // Hasta que el tope nuevo entra en el contrato, el reto espera (fase 3 lo revisa).
          ...(publicado && subioElTope ? { registradoEnStellarAt: null } : {}),
        })
        .where(eq(retos.id, id));
      if (cambios.responsables !== undefined || cambios.tipo !== undefined) {
        await this.setResponsables(
          tx,
          contexto,
          id,
          final.tipo === 'foto' ? final.responsables : [],
        );
      }
      if (publicado && subioElTope) {
        await this.notifyCambio(tx, contexto.eventoId, id);
      }
      const recortado = diff(antes, final);
      if (Object.keys(recortado.despues).length > 0) {
        await this.record(
          tx,
          contexto,
          'reto.update',
          id,
          final.nombre,
          recortado.antes,
          recortado.despues,
        );
      }
      return this.toReto(
        await this.getReto(tx, contexto, id),
        final.tipo === 'foto' ? final.responsables : [],
      );
    });
  }

  /**
   * En borrador y sin participaciones, se borra. Con participaciones: `RETO_CON_PARTICIPACIONES`.
   * Publicado y sin participaciones, se desactiva (su número ya está en el contrato).
   */
  async delete(contexto: ContextoEvento, id: string): Promise<{ desactivado: boolean }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      const actual = await this.getReto(tx, contexto, id, true);
      const [conParticipaciones] = await tx
        .select({ total: count() })
        .from(participaciones)
        .where(eq(participaciones.retoId, id));
      if (actual.entregados > 0 || (conParticipaciones?.total ?? 0) > 0) {
        throw new AppError('RETO_CON_PARTICIPACIONES');
      }
      if (ESTADOS_PUBLICADOS.has(evento.estado) || actual.registradoEnStellarAt) {
        await this.setEstado(tx, contexto, actual, 'desactivado');
        return { desactivado: true };
      }
      const [enAgenda] = await tx
        .select({ titulo: actividades.titulo })
        .from(actividades)
        .where(eq(actividades.retoId, id))
        .limit(1);
      if (enAgenda) {
        throw new AppError('RECURSO_EN_USO', {
          meta: { usadoPor: [{ tipo: 'actividad', nombre: enAgenda.titulo }] },
        });
      }
      await tx.delete(retos).where(eq(retos.id, id));
      await this.record(
        tx,
        contexto,
        'reto.delete',
        id,
        actual.nombre,
        this.toDatos(actual),
        undefined,
      );
      return { desactivado: false };
    });
  }

  async setActivo(contexto: ContextoEvento, id: string, activo: boolean) {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const evento = await this.getEvento(tx, contexto.eventoId);
      const actual = await this.getReto(tx, contexto, id, true);
      await this.setEstado(tx, contexto, actual, activo ? 'activo' : 'desactivado');
      // Reactivar uno que nunca entró en el contrato (desactivado antes de publicar) lo registra.
      if (activo && ESTADOS_PUBLICADOS.has(evento.estado) && !actual.registradoEnStellarAt) {
        await this.notifyCambio(tx, contexto.eventoId, id);
      }
      return this.toReto(await this.getReto(tx, contexto, id));
    });
  }

  // ── Reglas ─────────────────────────────────────────────────────────────────

  private async checkReglas(
    tx: Tx,
    contexto: ContextoEvento,
    evento: { inicioAt: Date; finAt: Date },
    datos: DatosReto,
  ): Promise<void> {
    // HU-322: un reto con foto dice qué foto pedir, y sus responsables son del equipo del evento.
    if (datos.tipo === 'foto') {
      const largo = datos.instruccionFoto?.length ?? 0;
      if (largo < 5 || largo > 200) {
        throw errorCampo('instruccionFoto', 'Cuenta qué foto pedir (de 5 a 200 caracteres).');
      }
      const unicos = [...new Set(datos.responsables)];
      if (unicos.length > 0) {
        const validos = await tx
          .select({ id: miembrosEvento.id })
          .from(miembrosEvento)
          .where(
            and(
              eq(miembrosEvento.eventoId, contexto.eventoId),
              inArray(miembrosEvento.id, unicos),
              ne(miembrosEvento.estado, 'revocado'),
            ),
          );
        if (validos.length !== unicos.length) {
          throw errorCampo('responsables', 'Alguna de esas personas no es del equipo del evento.');
        }
      }
    }
    if (datos.tipo === 'qr' && !datos.lugarId) {
      throw errorCampo(
        'lugarId',
        'Un reto de QR necesita su lugar: las pantallas de ese lugar lo muestran.',
      );
    }
    const desde = datos.disponibleDesde ? new Date(datos.disponibleDesde) : null;
    const hasta = datos.disponibleHasta ? new Date(datos.disponibleHasta) : null;
    if (desde && hasta && !(desde < hasta)) {
      throw errorCampo('disponibleHasta', 'El final tiene que ser después del comienzo.');
    }
    if (
      (desde && (desde < evento.inicioAt || desde > evento.finAt)) ||
      (hasta && (hasta < evento.inicioAt || hasta > evento.finAt))
    ) {
      throw errorCampo('disponibleDesde', 'El horario tiene que estar dentro del evento.');
    }
    for (const [campo, tabla] of [
      ['lugarId', lugares],
      ['sponsorId', sponsors],
      ['grupoId', grupos],
    ] as const) {
      const id = datos[campo];
      if (!id) continue;
      const [fila] = await tx
        .select({ id: tabla.id })
        .from(tabla)
        .where(and(eq(tabla.id, id), eq(tabla.eventoId, contexto.eventoId)));
      if (!fila) throw errorCampo(campo, 'No es de este evento.');
    }
  }

  /** ¿Ese lugar tiene pantalla? Las reemplazadas no cuentan (HU-209). */
  private async getLugaresConPantalla(
    tx: Tx,
    eventoId: string,
  ): Promise<(lugarId: string | null) => boolean> {
    const filas = await tx
      .selectDistinct({ lugarId: pantallas.lugarId })
      .from(pantallas)
      .where(and(eq(pantallas.eventoId, eventoId), isNull(pantallas.reemplazadaPor)));
    const conPantalla = new Set(filas.map((f) => f.lugarId));
    return (lugarId) => lugarId !== null && conPantalla.has(lugarId);
  }

  // ── Ayudantes ──────────────────────────────────────────────────────────────

  private async setEstado(
    tx: Tx,
    contexto: ContextoEvento,
    actual: Reto,
    estado: 'activo' | 'desactivado',
  ) {
    if (actual.estado === estado) return;
    await tx
      .update(retos)
      .set({ estado, updatedAt: this.reloj.now() })
      .where(eq(retos.id, actual.id));
    await this.record(
      tx,
      contexto,
      estado === 'activo' ? 'reto.activate' : 'reto.deactivate',
      actual.id,
      actual.nombre,
      { estado: actual.estado },
      { estado },
    );
  }

  private async notifyCambio(tx: Tx, eventoId: string, retoId: string) {
    await tx.update(retos).set({ registradoEnStellarAt: null }).where(eq(retos.id, retoId));
    await tx
      .insert(outbox)
      .values({ id: uuidv7(), tipo: 'reto.cambiado', eventoId, payload: { eventoId, retoId } });
  }

  private async getEvento(tx: Tx, eventoId: string) {
    const [evento] = await tx
      .select({ estado: eventos.estado, inicioAt: eventos.inicioAt, finAt: eventos.finAt })
      .from(eventos)
      .where(eq(eventos.id, eventoId));
    if (!evento) throw new AppError('NO_ENCONTRADO');
    return evento;
  }

  private async getReto(
    tx: Tx,
    contexto: ContextoEvento,
    id: string,
    bloquear = false,
  ): Promise<Reto> {
    const consulta = tx
      .select()
      .from(retos)
      .where(and(eq(retos.id, id), eq(retos.eventoId, contexto.eventoId)));
    const [reto] = bloquear ? await consulta.for('update') : await consulta;
    if (!reto) throw new AppError('NO_ENCONTRADO');
    // HU-321: el reto de la verificación de carnet se maneja en *Reglas y puerta*.
    if (bloquear && reto.tipo === 'verificacion_ci') {
      throw new AppError('VALIDACION', {
        detail: 'Este reto se configura en Configuración → Reglas y puerta.',
      });
    }
    return reto;
  }

  private toColumnas(datos: DatosReto) {
    return {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      enlaces: datos.enlaces,
      tipo: datos.tipo,
      modoQr: datos.modoQr,
      rotacionSegundos: datos.rotacionSegundos,
      puntos: datos.puntos,
      topeTotal: datos.topeTotal,
      vecesPorPersona: datos.vecesPorPersona,
      lugarId: datos.lugarId,
      disponibleDesde: datos.disponibleDesde ? new Date(datos.disponibleDesde) : null,
      disponibleHasta: datos.disponibleHasta ? new Date(datos.disponibleHasta) : null,
      sponsorId: datos.sponsorId,
      grupoId: datos.grupoId,
      instruccionFoto: datos.tipo === 'foto' ? datos.instruccionFoto : null,
      permiteGaleria: datos.permiteGaleria,
      autorizacionUso: datos.autorizacionUso,
      intentosMax: datos.intentosMax,
    };
  }

  private toDatos(reto: Reto): DatosReto {
    return {
      nombre: reto.nombre,
      descripcion: reto.descripcion,
      enlaces: [...(reto.enlaces ?? [])],
      tipo: reto.tipo as DatosReto['tipo'],
      modoQr: reto.modoQr as DatosReto['modoQr'],
      rotacionSegundos: reto.rotacionSegundos as DatosReto['rotacionSegundos'],
      puntos: reto.puntos,
      topeTotal: reto.topeTotal,
      vecesPorPersona: reto.vecesPorPersona,
      lugarId: reto.lugarId,
      disponibleDesde: reto.disponibleDesde?.toISOString() ?? null,
      disponibleHasta: reto.disponibleHasta?.toISOString() ?? null,
      sponsorId: reto.sponsorId,
      grupoId: reto.grupoId,
      instruccionFoto: reto.instruccionFoto,
      permiteGaleria: reto.permiteGaleria,
      autorizacionUso: reto.autorizacionUso as DatosReto['autorizacionUso'],
      intentosMax: reto.intentosMax,
      responsables: [],
    };
  }

  /** HU-322: quiénes revisan las fotos de cada reto (`miembros_evento.id`). */
  private async listResponsables(
    tx: Tx,
    retoIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const porReto = new Map<string, string[]>();
    if (retoIds.length === 0) return porReto;
    const filas = await tx
      .select({ retoId: retoResponsables.retoId, miembroId: retoResponsables.miembroId })
      .from(retoResponsables)
      .where(inArray(retoResponsables.retoId, [...retoIds]));
    for (const fila of filas) {
      porReto.set(fila.retoId, [...(porReto.get(fila.retoId) ?? []), fila.miembroId]);
    }
    return porReto;
  }

  private async setResponsables(
    tx: Tx,
    contexto: ContextoEvento,
    retoId: string,
    miembros: readonly string[],
  ): Promise<void> {
    await tx.delete(retoResponsables).where(eq(retoResponsables.retoId, retoId));
    const unicos = [...new Set(miembros)];
    if (unicos.length === 0) return;
    await tx.insert(retoResponsables).values(
      unicos.map((miembroId) => ({
        retoId,
        miembroId,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
      })),
    );
  }

  private toReto(reto: Reto, responsables: readonly string[] = []) {
    return {
      id: reto.id,
      numero: reto.numero,
      ...Object.fromEntries(CAMPOS_PUBLICOS.map((c) => [c, this.toDatos(reto)[c]])),
      responsables,
      estado: reto.estado,
      entregados: reto.entregados,
      registradoEnStellar: reto.registradoEnStellarAt !== null,
    };
  }

  private record(
    tx: Tx,
    contexto: ContextoEvento,
    accion: 'reto.create' | 'reto.update' | 'reto.delete' | 'reto.activate' | 'reto.deactivate',
    id: string,
    nombre: string,
    antes: Record<string, unknown> | undefined,
    despues: Record<string, unknown> | undefined,
  ) {
    return this.bitacora.record(tx, {
      actor: toActor(contexto),
      accion,
      organizacionId: contexto.organizacionId,
      eventoId: contexto.eventoId,
      objeto: { tipo: 'reto', id, nombre },
      ...(antes ? { antes } : {}),
      ...(despues ? { despues } : {}),
    });
  }
}
