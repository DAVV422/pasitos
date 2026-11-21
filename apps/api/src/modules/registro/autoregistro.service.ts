import { eq, sql } from 'drizzle-orm';
import {
  asistenteGrupos,
  asistentes,
  eventos,
  qrRegistro,
  withOrganizacion,
  type Cifrador,
  type Db,
} from '@pasitos/db';
import {
  AppError,
  getCiUltimos,
  getMetodoAutoregistro,
  type MuestraQrRegistro,
} from '@pasitos/dominio';
import type { DatosAutoregistro } from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import { hashDeviceId, type AccesoService } from '../acceso/acceso.service';
import { getEstadoApp, type EstadoApp } from '../acceso/estado-app';
import { getHuella, type RegistroTecnicoService } from '../acceso/registro-tecnico';
import { checkA9 } from '../acceso/reglas-alertas';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';
import { BitacoraService } from '../bitacora/bitacora.service';
import type { CheckInService } from '../puerta/check-in.service';
import { readPermisoRegistro } from './firma-registro';
import { getDisponibilidadQr } from './qr-registro.service';
import { resolveCelular } from './celular';

/** Lo que responde `POST /app/registro`: el estado de la app, y la sesión para la cookie. */
export interface Autoregistrado {
  readonly sesion: string;
  readonly expiraAt: Date;
  readonly estado: EstadoApp;
  /** Este navegador ya tenía su cuenta: entra a esa, sin crear otra (`200`). */
  readonly yaRegistrado: boolean;
}

/**
 * El autorregistro (HU-320 §2): con el permiso del QR, crea la cuenta, vincula el celular y, si el
 * QR lo dice, la deja presente con la bienvenida. Todo en una transacción: si un paso falla, no
 * queda nada. No envía ningún correo (D60).
 */
export class AutoregistroService {
  /** 10 por minuto por IP y 3 por minuto por navegador. */
  private readonly porIp: Limitador;
  private readonly porDispositivo: Limitador;
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly acceso: AccesoService,
    private readonly checkIn: CheckInService,
    private readonly registro: RegistroTecnicoService,
    private readonly cifrador: Cifrador,
    private readonly reloj: Reloj,
  ) {
    const ahora = () => this.reloj.now().getTime();
    this.porIp = new Limitador([{ maximo: 10, ms: 60_000 }], ahora);
    this.porDispositivo = new Limitador([{ maximo: 3, ms: 60_000 }], ahora);
  }

  async register(
    datos: DatosAutoregistro,
    permisoCookie: string | undefined,
    tecnico: { readonly ip: string; readonly userAgent: string },
  ): Promise<Autoregistrado> {
    const espera = Math.max(
      this.porIp.hit(tecnico.ip),
      this.porDispositivo.hit(hashDeviceId(datos.deviceId).toString('hex')),
    );
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    this.acceso.checkPedido(datos, tecnico.userAgent);
    const ahora = this.reloj.now();
    const permiso = readPermisoRegistro(this.cifrador, permisoCookie, ahora.getTime());
    if (!permiso) throw new AppError('PERMISO_REGISTRO_VENCIDO');
    const { organizacionId } = permiso;
    const visto: { eventoId?: string } = {};
    try {
      return await withOrganizacion(this.db, organizacionId, async (tx) => {
        // 1. El QR bloqueado: el tope pudo llenarse mientras la persona escribía.
        const [fila] = await tx
          .select({
            qr: qrRegistro,
            evento: {
              id: eventos.id,
              nombre: eventos.nombre,
              estado: eventos.estado,
              finAt: eventos.finAt,
              autoregistroActivo: eventos.autoregistroActivo,
              pedirCelular: eventos.pedirCelular,
            },
          })
          .from(qrRegistro)
          .innerJoin(eventos, eq(eventos.id, qrRegistro.eventoId))
          .where(eq(qrRegistro.id, permiso.qrId))
          .for('update', { of: qrRegistro });
        if (!fila) throw new AppError('PERMISO_REGISTRO_VENCIDO');
        const { qr, evento } = fila;
        visto.eventoId = evento.id;
        if (getDisponibilidadQr(qr, evento, ahora) !== 'activo') {
          throw new AppError('QR_REGISTRO_INACTIVO');
        }
        // El mismo navegador, aunque llegue por otro QR del evento, se espera a sí mismo.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${evento.id}:${hashDeviceId(datos.deviceId).toString('hex')}`}, 0))`,
        );

        // 2. Este navegador ya tiene su cuenta en el evento: entra a esa.
        const dispositivo = await this.acceso.findDispositivo(tx, evento.id, datos.deviceId);
        if (dispositivo?.vinculacionId && dispositivo.asistenteId) {
          const { sesion, expiraAt } = await this.acceso.reenterAutoregistro(tx, {
            organizacionId,
            finAt: evento.finAt,
            dispositivoId: dispositivo.dispositivoId,
            vinculacionId: dispositivo.vinculacionId,
            llavePublica: datos.llavePublica,
            senales: datos.senales,
            userAgent: tecnico.userAgent,
          });
          await this.registro.record(tx, organizacionId, {
            ...tecnico,
            senales: datos.senales ?? null,
            eventoId: evento.id,
            asistenteId: dispositivo.asistenteId,
            dispositivoId: dispositivo.dispositivoId,
            momento: 'intento_fallido',
            resultado: 'rechazado',
            motivo: 'autoregistro_repetido',
          });
          return {
            sesion,
            expiraAt,
            estado: await getEstadoApp(tx, dispositivo.asistenteId, ahora),
            yaRegistrado: true,
          };
        }

        // 3. La cuenta, con el carnet cifrado y sus últimos 3 dígitos, y el celular si se pide.
        const celular = resolveCelular(evento.pedirCelular, datos.celular);
        const asistenteId = uuidv7();
        await tx.insert(asistentes).values({
          id: asistenteId,
          organizacionId,
          eventoId: evento.id,
          nombre: datos.nombre,
          email: datos.email,
          celular,
          estado: 'registrado',
          origen: 'autoregistro',
          qrRegistroId: qr.id,
          registradoPor: qr.usuarioId,
          ciCifrado: datos.ci ? this.cifrador.encrypt(datos.ci) : null,
          ciUltimos: datos.ci ? getCiUltimos(datos.ci) : null,
        });

        // 4. El grupo del QR (HU-325).
        if (qr.grupoId) {
          await tx.insert(asistenteGrupos).values({
            asistenteId,
            grupoId: qr.grupoId,
            organizacionId,
            eventoId: evento.id,
            via: 'qr',
          });
        }
        // 5. El celular: dispositivo, vinculación, términos y sesión.
        const vinculado = await this.acceso.linkAutoregistro(tx, {
          organizacionId,
          eventoId: evento.id,
          finAt: evento.finAt,
          asistenteId,
          registradorId: null,
          existente: dispositivo?.dispositivoId ?? null,
          deviceId: datos.deviceId,
          llavePublica: datos.llavePublica,
          senales: datos.senales,
          userAgent: tecnico.userAgent,
        });

        const actor = { tipo: 'sistema' as const, nombre: `QR «${qr.nombre}»` };
        // 6. Presente, con la bienvenida, si el QR lo dice.
        if (qr.marcaPresente) {
          await this.checkIn.register(tx, {
            organizacionId,
            eventoId: evento.id,
            asistenteId,
            metodo: getMetodoAutoregistro(qr.muestra as MuestraQrRegistro),
            registradorId: qr.usuarioId,
            qrRegistroId: qr.id,
            actor,
          });
        }
        // 7. El contador del QR, en la misma transacción.
        await tx
          .update(qrRegistro)
          .set({ registros: sql`${qrRegistro.registros} + 1` })
          .where(eq(qrRegistro.id, qr.id));

        // 8. Registro técnico y A9 (A1 y A8 los revisa la vinculación).
        await this.registro.record(tx, organizacionId, {
          ...tecnico,
          senales: datos.senales ?? null,
          eventoId: evento.id,
          asistenteId,
          dispositivoId: vinculado.dispositivoId,
          momento: 'vinculacion',
          resultado: 'aceptado',
        });
        await checkA9(tx, {
          organizacionId,
          eventoId: evento.id,
          qrRegistroId: qr.id,
          asistenteId,
          dispositivoId: vinculado.dispositivoId,
          huella: getHuella(datos.senales),
          ahora,
        });

        // 9. Bitácora, sin el carnet ni el correo.
        await this.bitacora.record(tx, {
          actor,
          accion: 'asistente.autoregistro',
          organizacionId,
          eventoId: evento.id,
          objeto: { tipo: 'asistente', id: asistenteId, nombre: datos.nombre },
          despues: {
            qrRegistroId: qr.id,
            qr: qr.nombre,
            presente: qr.marcaPresente,
            conCorreo: datos.email !== null,
            conCarnet: datos.ci !== null,
          },
        });
        return {
          sesion: vinculado.sesion,
          expiraAt: vinculado.expiraAt,
          estado: await getEstadoApp(tx, asistenteId, ahora),
          yaRegistrado: false,
        };
      });
    } catch (error) {
      if (error instanceof AppError && visto.eventoId) {
        await this.registro.recordAparte(organizacionId, {
          ...tecnico,
          senales: datos.senales ?? null,
          eventoId: visto.eventoId,
          momento: 'intento_fallido',
          resultado: 'rechazado',
          motivo: error.code,
        });
      }
      throw error;
    }
  }
}
