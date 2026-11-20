import { createHmac } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { and, count, eq, gt, isNotNull } from 'drizzle-orm';
import { mensajesContacto, usuarios, type Db } from '@pasitos/db';
import type { CorreosService } from '@pasitos/correos';
import { AppError, VERSION_TERMINOS } from '@pasitos/dominio';
import {
  ASISTENTES_CONTACTO,
  MESES_CONTACTO,
  TIPOS_EVENTO_CONTACTO,
  type DatosContacto,
} from '@pasitos/dominio/esquemas';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../auth/sesiones.service';
import { Limitador } from '../auth/limitador';
import type { VerificadorTurnstile } from './turnstile';

const HORA_MS = 3_600_000;
/** Hasta 5 mensajes por hora, un correo por mensaje; el sexto avisa una vez con la cuenta. */
const AVISOS_INDIVIDUALES_POR_HORA = 5;

export interface OpcionesContacto {
  readonly llaveDatos: string;
  readonly publicUrl: string;
  /** `null`: Turnstile apagado (sin `TURNSTILE_SECRETO`). */
  readonly turnstile: VerificadorTurnstile | null;
}

/**
 * El formulario de contacto de la landing (HU-410 §3). Sin sesión. La IP no se guarda: solo su
 * HMAC, para el límite de 3 por hora. El aviso a los administradores no lleva el mensaje.
 */
export class ContactoService {
  private readonly logger = new Logger(ContactoService.name);
  private readonly porIp: Limitador;

  constructor(
    private readonly db: Db,
    private readonly correos: CorreosService,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesContacto,
  ) {
    this.porIp = new Limitador([{ maximo: 3, ms: HORA_MS }], () => reloj.now().getTime());
  }

  async create(datos: DatosContacto, ip: string): Promise<void> {
    // 1. La trampa: un robot llena el campo oculto. Se le responde igual, sin guardar nada.
    if (datos.sitioWeb && datos.sitioWeb.trim() !== '') return;
    // 2. El límite por IP.
    const ipHash = createHmac('sha256', this.opciones.llaveDatos).update(ip).digest();
    const espera = this.porIp.hit(ipHash.toString('hex'));
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', {
        detail: 'Ya recibimos tus mensajes. Te escribiremos pronto.',
        meta: { reintentarEnSegundos: espera },
      });
    }
    // 3. Turnstile, solo si está configurado.
    if (this.opciones.turnstile) {
      const valido = datos.turnstile
        ? await this.opciones.turnstile.verify(datos.turnstile, ip)
        : false;
      if (!valido) throw new AppError('VERIFICACION_FALLIDA');
    }
    // 4. Guardar y avisar, en la misma transacción.
    const ahora = this.reloj.now();
    const borrarAt = new Date(ahora);
    borrarAt.setMonth(borrarAt.getMonth() + MESES_CONTACTO);
    const id = uuidv7();
    await this.db.transaction(async (tx) => {
      await tx.insert(mensajesContacto).values({
        id,
        nombre: datos.nombre,
        email: datos.email,
        organizacion: datos.organizacion ?? null,
        tipoEvento: datos.tipoEvento ?? null,
        asistentesAprox: datos.asistentesAprox ?? null,
        mensaje: datos.mensaje,
        versionPrivacidad: VERSION_TERMINOS,
        ipHash,
        createdAt: ahora,
        borrarAt,
      });
      const [ultimaHora] = await tx
        .select({ total: count() })
        .from(mensajesContacto)
        .where(gt(mensajesContacto.createdAt, new Date(ahora.getTime() - HORA_MS)));
      const total = ultimaHora?.total ?? 1;
      if (total > AVISOS_INDIVIDUALES_POR_HORA + 1) return;
      const admins = await tx
        .select({ email: usuarios.email })
        .from(usuarios)
        .where(and(isNotNull(usuarios.rolPlataforma), eq(usuarios.estado, 'activo')));
      for (const admin of admins) {
        if (total <= AVISOS_INDIVIDUALES_POR_HORA) {
          await this.correos.enqueue(tx, {
            tipo: 'nuevo_contacto',
            destinatario: admin.email,
            refId: id,
            datos: {
              quien: datos.organizacion ?? datos.nombre,
              nombre: datos.nombre,
              organizacion: datos.organizacion ?? 'Sin organización',
              tipoEvento: datos.tipoEvento ? TIPOS_EVENTO_CONTACTO[datos.tipoEvento] : 'Sin tipo',
              asistentes: datos.asistentesAprox
                ? ASISTENTES_CONTACTO[datos.asistentesAprox]
                : 'Sin dato',
              enlace: `${this.opciones.publicUrl}/plataforma/contactos/${id}`,
            },
          });
        } else {
          await this.correos.enqueue(tx, {
            tipo: 'nuevos_contactos',
            destinatario: admin.email,
            refId: id,
            datos: {
              cantidad: `más de ${AVISOS_INDIVIDUALES_POR_HORA}`,
              enlace: `${this.opciones.publicUrl}/plataforma/contactos`,
            },
          });
        }
      }
    });
    this.logger.log({ contactoId: id }, 'Nuevo mensaje de contacto');
  }
}
