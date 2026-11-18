import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  alertas,
  asistentes,
  dispositivos,
  registrosTecnicos,
  usuarios,
  vinculaciones,
  withOrganizacion,
  type Db,
  type Tx,
} from '@pasitos/db';
import { AppError, describeModelo, type SenalesDispositivo } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { ContextoAsistente, FirmaVerificada } from '../../common/sesion/asistente';
import { describeDispositivo } from '../auth/dispositivo';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';
import { getNombreCorto } from '../puerta/check-in.service';
import { runIdempotente } from './idempotencia';
import type { RegistroTecnicoService } from './registro-tecnico';

/** De dónde salió cada celular: *"Puerta · Luis C."*, *"Enlace de invitación"*. */
function getPuesto(metodo: string, registrador: string | null): string {
  if (metodo === 'enlace') return 'Enlace de invitación';
  if (metodo === 'autoregistro') return 'Autorregistro';
  const corto = getNombreCorto(registrador);
  return corto ? `Puerta · ${corto}` : 'Puerta';
}

/** Qué intentó el otro dispositivo, a partir del motivo del rechazo. */
function getQue(motivo: string | null): 'abrir_enlace' | 'abrir_qr' | 'usar_anulado' | 'otro' {
  switch (motivo) {
    case 'INVITACION_YA_USADA':
      return 'abrir_enlace';
    case 'QR_ASISTENTE_VENCIDO':
      return 'abrir_qr';
    case 'DISPOSITIVO_NO_VINCULADO':
      return 'usar_anulado';
    default:
      return 'otro';
  }
}

/** `GET /app/dispositivo` (HU-312 §1): sin IP ni huella; solo modelos, horas y métodos. */
export interface DispositivoApp {
  readonly actual: {
    readonly modelo: string;
    readonly desde: string;
    readonly metodo: string;
    readonly puesto: string;
  } | null;
  readonly historial: readonly {
    readonly modelo: string;
    readonly desde: string;
    readonly anuladaAt: string;
    readonly motivo: string | null;
    readonly por: string;
  }[];
  readonly intentos: readonly {
    readonly modelo: string;
    readonly at: string;
    readonly que: ReturnType<typeof getQue>;
  }[];
  readonly avisos: readonly { readonly id: string; readonly estado: string; readonly at: string }[];
}

export interface NoFuiYo {
  readonly alertaId: string;
  readonly estado: string;
  /** Ya había un aviso abierto: se muestra ese en lugar de crear otro. */
  readonly yaExistia: boolean;
  readonly mensaje: string;
}

const MENSAJE_NO_FUI_YO = 'Avisamos a la puerta. Acércate con este celular.';

/** Mi dispositivo y *No fui yo* (HU-312). */
export class DispositivoAppService {
  /** 3 por hora por dispositivo (HU-312 §3). */
  private readonly limite: Limitador;

  constructor(
    private readonly db: Db,
    private readonly registro: RegistroTecnicoService,
    reloj: Reloj,
  ) {
    this.limite = new Limitador([{ maximo: 3, ms: 60 * 60 * 1000 }], () => reloj.now().getTime());
  }

  get(contexto: ContextoAsistente): Promise<DispositivoApp> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select({
          id: vinculaciones.id,
          modelo: dispositivos.modelo,
          desde: vinculaciones.createdAt,
          metodo: vinculaciones.metodo,
          anuladaAt: vinculaciones.anuladaAt,
          motivo: vinculaciones.motivoAnulacion,
          registrador: usuarios.nombre,
        })
        .from(vinculaciones)
        .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
        .leftJoin(usuarios, eq(usuarios.id, vinculaciones.registradorId))
        .where(eq(vinculaciones.asistenteId, contexto.asistenteId))
        .orderBy(desc(vinculaciones.createdAt));
      const activa = filas.find((f) => f.anuladaAt === null);
      // Quién lo reemplazó: la vinculación siguiente.
      const historial = filas.flatMap((fila, i) => {
        if (!fila.anuladaAt) return [];
        const siguiente = filas[i - 1];
        return [
          {
            modelo: fila.modelo,
            desde: fila.desde.toISOString(),
            anuladaAt: fila.anuladaAt.toISOString(),
            motivo: fila.motivo,
            por: siguiente ? getPuesto(siguiente.metodo, siguiente.registrador) : 'Puerta',
          },
        ];
      });
      const intentos = await tx
        .select({
          at: registrosTecnicos.createdAt,
          motivo: registrosTecnicos.motivo,
          userAgent: registrosTecnicos.userAgent,
          senales: registrosTecnicos.senales,
        })
        .from(registrosTecnicos)
        .where(
          and(
            eq(registrosTecnicos.asistenteId, contexto.asistenteId),
            eq(registrosTecnicos.momento, 'intento_fallido'),
          ),
        )
        .orderBy(desc(registrosTecnicos.createdAt))
        .limit(20);
      const avisos = await this.listAvisos(tx, contexto.asistenteId, [
        'abierta',
        'atendiendo',
        'resuelta',
        'descartada',
      ]);
      return {
        actual: activa
          ? {
              modelo: activa.modelo,
              desde: activa.desde.toISOString(),
              metodo: activa.metodo,
              puesto: getPuesto(activa.metodo, activa.registrador),
            }
          : null,
        historial,
        intentos: intentos.map((intento) => ({
          modelo: describeModelo(
            (intento.senales ?? undefined) as SenalesDispositivo | undefined,
            describeDispositivo(intento.userAgent ?? undefined),
          ),
          at: intento.at.toISOString(),
          que: getQue(intento.motivo),
        })),
        avisos: avisos.map((a) => ({ id: a.id, estado: a.estado, at: a.at.toISOString() })),
      };
    });
  }

  /**
   * *No fui yo* (HU-312 §3): crea el aviso `no_fui_yo` para la puerta (HU-305). También desde el
   * celular anulado. Si ya hay uno abierto, devuelve ese.
   */
  async create(
    contexto: ContextoAsistente,
    datos: { sobre: 'dispositivo' | 'intento' | 'canje'; refId?: string | undefined },
    firma: FirmaVerificada,
  ): Promise<NoFuiYo> {
    const espera = this.limite.hit(contexto.dispositivoId);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    return withOrganizacion(this.db, contexto.organizacionId, (tx) =>
      runIdempotente(tx, `asistente:${contexto.asistenteId}`, firma, async () => {
        // La fila del asistente bloqueada: dos toques a la vez no crean dos avisos.
        await tx
          .select({ id: asistentes.id })
          .from(asistentes)
          .where(eq(asistentes.id, contexto.asistenteId))
          .for('update');
        const [abierto] = await this.listAvisos(tx, contexto.asistenteId, [
          'abierta',
          'atendiendo',
        ]);
        if (abierto) {
          return {
            alertaId: abierto.id,
            estado: abierto.estado,
            yaExistia: true,
            mensaje: MENSAJE_NO_FUI_YO,
          };
        }
        const clave = `no_fui_yo:${uuidv7()}`;
        await this.registro.raiseAlerta(tx, contexto.organizacionId, {
          eventoId: contexto.eventoId,
          tipo: 'no_fui_yo',
          asistenteId: contexto.asistenteId,
          dispositivoId: contexto.dispositivoId,
          datos: {
            desde: contexto.anulada ? 'anulado' : 'actual',
            sobre: datos.sobre,
            refId: datos.refId ?? null,
          },
          clave,
          prioridad: 'alta',
        });
        const [creada] = await tx
          .select({ id: alertas.id, estado: alertas.estado })
          .from(alertas)
          .where(and(eq(alertas.eventoId, contexto.eventoId), eq(alertas.clave, clave)));
        if (!creada) throw new AppError('ERROR_INTERNO');
        return {
          alertaId: creada.id,
          estado: creada.estado,
          yaExistia: false,
          mensaje: MENSAJE_NO_FUI_YO,
        };
      }),
    );
  }

  private listAvisos(tx: Tx, asistenteId: string, estados: string[]) {
    return tx
      .select({ id: alertas.id, estado: alertas.estado, at: alertas.createdAt })
      .from(alertas)
      .where(
        and(
          eq(alertas.asistenteId, asistenteId),
          eq(alertas.tipo, 'no_fui_yo'),
          inArray(alertas.estado, estados),
        ),
      )
      .orderBy(desc(alertas.createdAt));
  }
}
