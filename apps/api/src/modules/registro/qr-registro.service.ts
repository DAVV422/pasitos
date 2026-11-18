import { randomBytes } from 'node:crypto';
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm';
import {
  eventos,
  miembrosEvento,
  miembrosOrganizacion,
  outbox,
  pantallas,
  qrRegistro,
  usuarios,
  withOrganizacion,
  type Cifrador,
  type Db,
  type Tx,
} from '@pasitos/db';
import {
  AppError,
  FRANJA_REGISTRO_MS,
  getEstadoQrRegistro,
  getFranjaRegistro,
  PERMISOS,
  type EstadoQrRegistro,
  type MuestraQrRegistro,
} from '@pasitos/dominio';
import type { CrearQrRegistro, EditarQrRegistro } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { hashToken } from '../auth/auth.repository';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { TerminalConectada } from '../terminales/conexion.service';
import { buildUrlFijo, buildUrlRotativo, createTokenFijo } from './firma-registro';
import { renderPdf, renderPng } from './imprimible';

type FilaQr = typeof qrRegistro.$inferSelect;

/** Un QR de registro como lo ve el panel (HU-319 §2). Nunca lleva el secreto ni el token. */
export interface QrRegistroApi {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: string;
  readonly muestra: string;
  readonly usuario: { readonly id: string; readonly nombre: string } | null;
  readonly pantalla: { readonly id: string; readonly nombre: string } | null;
  readonly grupoId: string | null;
  readonly marcaPresente: boolean;
  readonly tope: number | null;
  readonly desde: string | null;
  readonly hasta: string | null;
  readonly estado: EstadoQrRegistro;
  readonly registros: number;
  readonly invalidadoAt: string | null;
  readonly motivoInvalidacion: string | null;
  readonly createdAt: string;
}

/** Por qué no se puede usar un QR ahora, mirando también el evento (HU-319 §4). */
export type DisponibilidadQr = EstadoQrRegistro | 'autoregistro_apagado' | 'evento_no_activo';

export function getDisponibilidadQr(
  qr: Pick<FilaQr, 'estado' | 'desde' | 'hasta' | 'tope' | 'registros'>,
  evento: { readonly autoregistroActivo: boolean; readonly estado: string },
  ahora: Date,
): DisponibilidadQr {
  const estado = getEstadoQrRegistro(qr, ahora);
  if (estado !== 'activo') return estado;
  if (!evento.autoregistroActivo) return 'autoregistro_apagado';
  if (evento.estado !== 'publicado' && evento.estado !== 'en_curso') return 'evento_no_activo';
  return 'activo';
}

/** La franja de un rotativo, para el celular del equipo o la tablet (HU-319 §2). */
export interface FranjaQrRegistro {
  readonly id: string;
  readonly nombre: string;
  readonly disponibilidad: DisponibilidadQr;
  /** `null` si el QR no se puede usar ahora (la pantalla dice por qué). */
  readonly url: string | null;
  readonly franja: number | null;
  readonly validoHasta: number | null;
  readonly horaServidor: number;
  readonly registros: number;
  readonly tope: number | null;
}

function errorCampo(field: string, message: string): AppError {
  return new AppError('VALIDACION', { errors: [{ field, code: 'NO_VALIDO', message }] });
}

function getRestriccion(error: unknown): string | null {
  const causa = ((error as { cause?: unknown }).cause ?? error) as {
    code?: string;
    constraint?: string;
  };
  return causa.code === '23505' ? (causa.constraint ?? '') : null;
}

const ROLES_ACTIVAN = PERMISOS['puerta.activar'] as readonly string[];

/**
 * Los QR de registro del panel (HU-319 §2): crear, editar, invalidar, *Crear otro igual*,
 * descargar el fijo y entregar la franja del rotativo a quien lo muestra.
 */
export class QrRegistroService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly cifrador: Cifrador,
    private readonly reloj: Reloj,
    private readonly publicUrl: string,
  ) {}

  list(contexto: ContextoEvento): Promise<{ items: QrRegistroApi[] }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => ({
      items: await this.select(tx, eq(qrRegistro.eventoId, contexto.eventoId)),
    }));
  }

  /** *Activar cuentas*: los rotativos activos que esta persona muestra en su celular. */
  listMios(contexto: ContextoEvento): Promise<{ items: QrRegistroApi[] }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => ({
      items: await this.select(
        tx,
        and(
          eq(qrRegistro.eventoId, contexto.eventoId),
          eq(qrRegistro.usuarioId, contexto.usuarioId),
          eq(qrRegistro.muestra, 'miembro'),
          eq(qrRegistro.estado, 'activo'),
        ),
      ),
    }));
  }

  create(contexto: ContextoEvento, datos: CrearQrRegistro): Promise<QrRegistroApi> {
    if (datos.tipo === 'fijo') {
      if (datos.muestra && datos.muestra !== 'impreso') {
        throw errorCampo('muestra', 'Un QR fijo se imprime.');
      }
      if (!datos.confirmarRiesgo) throw new AppError('CONFIRMAR_RIESGO');
    } else if (datos.muestra !== 'miembro' && datos.muestra !== 'pantalla') {
      throw errorCampo('muestra', 'Elige quién lo muestra: una persona del equipo o una tablet.');
    }
    const muestra: MuestraQrRegistro =
      datos.tipo === 'fijo' ? 'impreso' : (datos.muestra ?? 'miembro');
    this.checkOpciones(datos);
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const quien = await this.checkQuienMuestra(tx, contexto, muestra, datos);
      const id = uuidv7();
      const token = datos.tipo === 'fijo' ? createTokenFijo() : null;
      await this.insertConNombre(tx, {
        id,
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        nombre: datos.nombre,
        tipo: datos.tipo,
        muestra,
        ...quien,
        grupoId: datos.grupoId,
        marcaPresente: datos.marcaPresente,
        tope: datos.tope,
        desde: datos.desde ? new Date(datos.desde) : null,
        hasta: datos.hasta ? new Date(datos.hasta) : null,
        ...this.buildSecretos(token),
        createdBy: contexto.usuarioId,
      });
      const [creado] = await this.select(tx, eq(qrRegistro.id, id));
      if (!creado) throw new AppError('NO_ENCONTRADO');
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'qr_registro.create',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'qr_registro', id, nombre: creado.nombre },
        despues: this.toBitacora(creado),
      });
      await this.notifyPantalla(tx, contexto.eventoId, quien.pantallaId);
      return creado;
    });
  }

  update(contexto: ContextoEvento, id: string, datos: EditarQrRegistro): Promise<QrRegistroApi> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.lock(tx, contexto, id);
      if (actual.estado !== 'activo') throw new AppError('QR_REGISTRO_INACTIVO');
      const muestra = datos.muestra ?? (actual.muestra as MuestraQrRegistro);
      if (actual.tipo === 'fijo' && muestra !== 'impreso') {
        throw errorCampo('muestra', 'Un QR fijo se imprime.');
      }
      if (actual.tipo === 'rotativo' && muestra === 'impreso') {
        throw errorCampo('muestra', 'Un QR rotativo lo muestra una persona o una tablet.');
      }
      const desde =
        datos.desde === undefined ? actual.desde : datos.desde ? new Date(datos.desde) : null;
      const hasta =
        datos.hasta === undefined ? actual.hasta : datos.hasta ? new Date(datos.hasta) : null;
      this.checkOpciones({
        grupoId: datos.grupoId === undefined ? actual.grupoId : datos.grupoId,
        desde: desde?.toISOString() ?? null,
        hasta: hasta?.toISOString() ?? null,
      });
      const quien = await this.checkQuienMuestra(tx, contexto, muestra, {
        usuarioId: datos.usuarioId === undefined ? actual.usuarioId : datos.usuarioId,
        pantallaId: datos.pantallaId === undefined ? actual.pantallaId : datos.pantallaId,
      });
      const [antes] = await this.select(tx, eq(qrRegistro.id, id));
      try {
        await tx.transaction((sub) =>
          sub
            .update(qrRegistro)
            .set({
              ...(datos.nombre === undefined ? {} : { nombre: datos.nombre }),
              muestra,
              ...quien,
              ...(datos.grupoId === undefined ? {} : { grupoId: datos.grupoId }),
              ...(datos.marcaPresente === undefined ? {} : { marcaPresente: datos.marcaPresente }),
              ...(datos.tope === undefined ? {} : { tope: datos.tope }),
              desde,
              hasta,
              updatedAt: this.reloj.now(),
            })
            .where(eq(qrRegistro.id, id)),
        );
      } catch (error) {
        throw this.toErrorUnico(error);
      }
      const [despues] = await this.select(tx, eq(qrRegistro.id, id));
      if (!antes || !despues) throw new AppError('NO_ENCONTRADO');
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'qr_registro.update',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'qr_registro', id, nombre: despues.nombre },
        antes: this.toBitacora(antes),
        despues: this.toBitacora(despues),
      });
      await this.notifyPantalla(tx, contexto.eventoId, actual.pantallaId);
      if (quien.pantallaId !== actual.pantallaId) {
        await this.notifyPantalla(tx, contexto.eventoId, quien.pantallaId);
      }
      return despues;
    });
  }

  /** No se puede deshacer: para volver a usarlo, *Crear otro igual*. */
  invalidate(contexto: ContextoEvento, id: string, motivo: string): Promise<QrRegistroApi> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const actual = await this.lock(tx, contexto, id);
      if (actual.estado !== 'activo') throw new AppError('QR_REGISTRO_INACTIVO');
      const ahora = this.reloj.now();
      await tx
        .update(qrRegistro)
        .set({
          estado: 'invalidado',
          invalidadoPor: contexto.usuarioId,
          invalidadoAt: ahora,
          motivoInvalidacion: motivo,
          updatedAt: ahora,
        })
        .where(eq(qrRegistro.id, id));
      const [invalidado] = await this.select(tx, eq(qrRegistro.id, id));
      if (!invalidado) throw new AppError('NO_ENCONTRADO');
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'qr_registro.invalidate',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'qr_registro', id, nombre: invalidado.nombre },
        antes: { estado: 'activo' },
        despues: { estado: 'invalidado', motivo },
      });
      await this.notifyPantalla(tx, contexto.eventoId, actual.pantallaId);
      return invalidado;
    });
  }

  /** *Crear otro igual*: la misma configuración, `nombre (2)` y un token o secreto nuevo. */
  duplicate(contexto: ContextoEvento, id: string): Promise<QrRegistroApi> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const original = await this.lock(tx, contexto, id);
      const nuevoId = uuidv7();
      const token = original.tipo === 'fijo' ? createTokenFijo() : null;
      const nombre = await this.insertConNombre(
        tx,
        {
          id: nuevoId,
          organizacionId: original.organizacionId,
          eventoId: original.eventoId,
          nombre: original.nombre,
          tipo: original.tipo,
          muestra: original.muestra,
          usuarioId: original.usuarioId,
          pantallaId: original.pantallaId,
          grupoId: original.grupoId,
          marcaPresente: original.marcaPresente,
          tope: original.tope,
          desde: original.desde,
          hasta: original.hasta,
          ...this.buildSecretos(token),
          createdBy: contexto.usuarioId,
        },
        true,
      );
      const [copia] = await this.select(tx, eq(qrRegistro.id, nuevoId));
      if (!copia) throw new AppError('NO_ENCONTRADO');
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'qr_registro.create',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'qr_registro', id: nuevoId, nombre },
        despues: { ...this.toBitacora(copia), copiaDe: original.id },
      });
      await this.notifyPantalla(tx, contexto.eventoId, original.pantallaId);
      return copia;
    });
  }

  /** El fijo para imprimir, con el nombre del evento y el del QR (queda en la bitácora). */
  getImprimible(
    contexto: ContextoEvento,
    id: string,
    formato: 'png' | 'pdf',
  ): Promise<{ contenido: Buffer; tipo: string; archivo: string }> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const qr = await this.lock(tx, contexto, id, false);
      if (qr.tipo !== 'fijo' || !qr.tokenCifrado) {
        throw errorCampo('tipo', 'Solo los QR fijos se descargan para imprimir.');
      }
      if (qr.estado !== 'activo') throw new AppError('QR_REGISTRO_INACTIVO');
      const [evento] = await tx
        .select({ nombre: eventos.nombre })
        .from(eventos)
        .where(eq(eventos.id, qr.eventoId));
      const datos = {
        evento: evento?.nombre ?? '',
        nombreQr: qr.nombre,
        url: buildUrlFijo(this.publicUrl, this.cifrador.decryptTexto(qr.tokenCifrado)),
      };
      const contenido = formato === 'pdf' ? renderPdf(datos) : await renderPng(datos);
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'qr_registro.download',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'qr_registro', id, nombre: qr.nombre },
        despues: { formato },
      });
      const base = qr.nombre
        .normalize('NFD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase();
      return {
        contenido,
        tipo: formato === 'pdf' ? 'application/pdf' : 'image/png',
        archivo: `qr-registro-${base || 'pasitos'}.${formato}`,
      };
    });
  }

  /** La franja del rotativo, solo para la persona del equipo que lo tiene asignado. */
  getFranjaEquipo(contexto: ContextoEvento, id: string): Promise<FranjaQrRegistro> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const qr = await this.lock(tx, contexto, id, false);
      if (
        qr.tipo !== 'rotativo' ||
        qr.muestra !== 'miembro' ||
        qr.usuarioId !== contexto.usuarioId
      ) {
        throw new AppError('QR_NO_ASIGNADO');
      }
      return this.buildFranja(tx, qr);
    });
  }

  /** La tablet en modo Registro: la franja del QR que tiene asignado, o `null`. */
  getFranjaPantalla(terminal: TerminalConectada): Promise<FranjaQrRegistro | null> {
    if (terminal.tipo !== 'pantalla') throw new AppError('TERMINAL_DESCONECTADA');
    return withOrganizacion(this.db, terminal.organizacionId, async (tx) => {
      const [qr] = await tx
        .select()
        .from(qrRegistro)
        .where(and(eq(qrRegistro.pantallaId, terminal.id), eq(qrRegistro.estado, 'activo')));
      return qr ? this.buildFranja(tx, qr) : null;
    });
  }

  // ── Pasos ───────────────────────────────────────────────────────────────

  private async buildFranja(tx: Tx, qr: FilaQr): Promise<FranjaQrRegistro> {
    const [evento] = await tx
      .select({ autoregistroActivo: eventos.autoregistroActivo, estado: eventos.estado })
      .from(eventos)
      .where(eq(eventos.id, qr.eventoId));
    const ahora = this.reloj.now();
    const disponibilidad = evento
      ? getDisponibilidadQr(qr, evento, ahora)
      : ('evento_no_activo' as const);
    const base = {
      id: qr.id,
      nombre: qr.nombre,
      disponibilidad,
      horaServidor: ahora.getTime(),
      registros: qr.registros,
      tope: qr.tope,
    };
    if (disponibilidad !== 'activo' || !qr.secretoCifrado) {
      return { ...base, url: null, franja: null, validoHasta: null };
    }
    const secreto = this.cifrador.decrypt(qr.secretoCifrado);
    const { url, franja } = buildUrlRotativo(this.publicUrl, qr.id, secreto, ahora.getTime());
    return {
      ...base,
      url,
      franja,
      validoHasta: (getFranjaRegistro(ahora.getTime()) + 1) * FRANJA_REGISTRO_MS,
    };
  }

  private checkOpciones(datos: {
    readonly grupoId: string | null;
    readonly desde: string | null;
    readonly hasta: string | null;
  }): void {
    // Los grupos llegan con HU-325.
    if (datos.grupoId) throw errorCampo('grupoId', 'Ese grupo no existe.');
    if (datos.desde && datos.hasta && Date.parse(datos.desde) >= Date.parse(datos.hasta)) {
      throw errorCampo('hasta', 'El fin tiene que ser después del inicio.');
    }
  }

  /** Quién lo muestra: una persona que puede activar cuentas, una tablet del evento o nadie. */
  private async checkQuienMuestra(
    tx: Tx,
    contexto: ContextoEvento,
    muestra: MuestraQrRegistro,
    datos: { readonly usuarioId: string | null; readonly pantallaId: string | null },
  ): Promise<{ usuarioId: string | null; pantallaId: string | null }> {
    if (muestra === 'impreso') return { usuarioId: null, pantallaId: null };
    if (muestra === 'pantalla') {
      if (!datos.pantallaId) throw errorCampo('pantallaId', 'Elige la tablet que lo muestra.');
      const [pantalla] = await tx
        .select({ id: pantallas.id })
        .from(pantallas)
        .where(and(eq(pantallas.id, datos.pantallaId), eq(pantallas.eventoId, contexto.eventoId)));
      if (!pantalla) throw errorCampo('pantallaId', 'Esa tablet no es de este evento.');
      return { usuarioId: null, pantallaId: pantalla.id };
    }
    if (!datos.usuarioId) throw errorCampo('usuarioId', 'Elige la persona que lo muestra.');
    const [miembro] = await tx
      .select({ id: miembrosEvento.id })
      .from(miembrosEvento)
      .where(
        and(
          eq(miembrosEvento.eventoId, contexto.eventoId),
          eq(miembrosEvento.usuarioId, datos.usuarioId),
          eq(miembrosEvento.estado, 'activo'),
          inArray(miembrosEvento.rol, [...ROLES_ACTIVAN]),
        ),
      );
    const [dueno] = miembro
      ? [miembro]
      : await tx
          .select({ id: miembrosOrganizacion.id })
          .from(miembrosOrganizacion)
          .where(
            and(
              eq(miembrosOrganizacion.organizacionId, contexto.organizacionId),
              eq(miembrosOrganizacion.usuarioId, datos.usuarioId),
              eq(miembrosOrganizacion.rol, 'dueno'),
              eq(miembrosOrganizacion.estado, 'activo'),
            ),
          );
    if (!dueno) {
      throw errorCampo(
        'usuarioId',
        'Esa persona no puede mostrar QR de registro: tiene que ser registrador, coorganizador o dueño.',
      );
    }
    return { usuarioId: datos.usuarioId, pantallaId: null };
  }

  private buildSecretos(token: string | null) {
    return token
      ? {
          tokenHash: hashToken(token),
          tokenCifrado: this.cifrador.encrypt(token),
          secretoCifrado: null,
        }
      : {
          tokenHash: null,
          tokenCifrado: null,
          secretoCifrado: this.cifrador.encrypt(randomBytes(32)),
        };
  }

  /**
   * Inserta con un *savepoint*. Con `buscarNombre`, prueba `nombre (2)`, `(3)`… hasta encontrar
   * uno libre (*Crear otro igual*). Devuelve el nombre que quedó.
   */
  private async insertConNombre(
    tx: Tx,
    fila: typeof qrRegistro.$inferInsert,
    buscarNombre = false,
  ): Promise<string> {
    const base = fila.nombre.replace(/ \(\d+\)$/, '');
    for (let n = buscarNombre ? 2 : 1; n < 100; n += 1) {
      const sufijo = n === 1 ? '' : ` (${n})`;
      const nombre = n === 1 ? fila.nombre : `${base.slice(0, 60 - sufijo.length)}${sufijo}`;
      try {
        await tx.transaction((sub) => sub.insert(qrRegistro).values({ ...fila, nombre }));
        return nombre;
      } catch (error) {
        const restriccion = getRestriccion(error);
        if (restriccion === 'qr_registro_nombre' && buscarNombre) continue;
        throw this.toErrorUnico(error);
      }
    }
    throw errorCampo('nombre', 'Ya hay demasiados QR con ese nombre.');
  }

  private toErrorUnico(error: unknown): unknown {
    const restriccion = getRestriccion(error);
    if (restriccion === 'qr_registro_nombre') {
      return errorCampo('nombre', 'Ya hay un QR de registro con ese nombre.');
    }
    if (restriccion === 'qr_registro_pantalla_activa') {
      return errorCampo('pantallaId', 'Esa tablet ya muestra otro QR de registro.');
    }
    return error;
  }

  private async lock(
    tx: Tx,
    contexto: ContextoEvento,
    id: string,
    bloquear = true,
  ): Promise<FilaQr> {
    const consulta = tx
      .select()
      .from(qrRegistro)
      .where(and(eq(qrRegistro.id, id), eq(qrRegistro.eventoId, contexto.eventoId)));
    const [fila] = bloquear ? await consulta.for('update') : await consulta;
    if (!fila) throw new AppError('NO_ENCONTRADO');
    return fila;
  }

  /** La tablet vuelve a pedir su estado (cambia entre el modo Registro y el de retos). */
  private async notifyPantalla(tx: Tx, eventoId: string, pantallaId: string | null): Promise<void> {
    if (!pantallaId) return;
    await tx.insert(outbox).values({
      id: uuidv7(),
      tipo: 'pantalla.reto',
      eventoId,
      payload: { eventoId, pantallaId },
    });
  }

  private async select(tx: Tx, donde: SQL | undefined): Promise<QrRegistroApi[]> {
    const filas = await tx
      .select({
        qr: qrRegistro,
        usuarioNombre: usuarios.nombre,
        pantallaNombre: pantallas.nombre,
      })
      .from(qrRegistro)
      .leftJoin(usuarios, eq(usuarios.id, qrRegistro.usuarioId))
      .leftJoin(pantallas, eq(pantallas.id, qrRegistro.pantallaId))
      .where(donde)
      .orderBy(asc(qrRegistro.estado), asc(qrRegistro.nombre));
    const ahora = this.reloj.now();
    return filas.map(({ qr, usuarioNombre, pantallaNombre }) => ({
      id: qr.id,
      nombre: qr.nombre,
      tipo: qr.tipo,
      muestra: qr.muestra,
      usuario: qr.usuarioId ? { id: qr.usuarioId, nombre: usuarioNombre ?? '' } : null,
      pantalla: qr.pantallaId ? { id: qr.pantallaId, nombre: pantallaNombre ?? '' } : null,
      grupoId: qr.grupoId,
      marcaPresente: qr.marcaPresente,
      tope: qr.tope,
      desde: qr.desde?.toISOString() ?? null,
      hasta: qr.hasta?.toISOString() ?? null,
      estado: getEstadoQrRegistro(qr, ahora),
      registros: qr.registros,
      invalidadoAt: qr.invalidadoAt?.toISOString() ?? null,
      motivoInvalidacion: qr.motivoInvalidacion,
      createdAt: qr.createdAt.toISOString(),
    }));
  }

  /** Lo que va a la bitácora: la configuración, nunca el token ni el secreto. */
  private toBitacora(qr: QrRegistroApi): Record<string, unknown> {
    return {
      nombre: qr.nombre,
      tipo: qr.tipo,
      muestra: qr.muestra,
      usuarioId: qr.usuario?.id ?? null,
      pantallaId: qr.pantalla?.id ?? null,
      grupoId: qr.grupoId,
      marcaPresente: qr.marcaPresente,
      tope: qr.tope,
      desde: qr.desde,
      hasta: qr.hasta,
    };
  }
}
