import { eq } from 'drizzle-orm';
import { eventos, qrRegistro, withOrganizacion, type Cifrador, type Db } from '@pasitos/db';
import {
  AppError,
  isFranjaRegistroVigente,
  VERSION_TERMINOS,
  type CodigoError,
} from '@pasitos/dominio';
import type { AccesoSistema } from '../acceso/acceso-sistema';
import type { RegistroTecnicoService } from '../acceso/registro-tecnico';
import { getUrlArchivo } from '../archivos/archivos.service';
import { hashToken } from '../auth/auth.repository';
import { Limitador } from '../auth/limitador';
import type { Reloj } from '../auth/sesiones.service';
import {
  buildPermisoRegistro,
  isFirmaFranja,
  isTokenFijo,
  parseCodigoRotativo,
} from './firma-registro';
import { getDisponibilidadQr } from './qr-registro.service';

/** Lo que ve la persona al abrir un QR de registro (HU-319 §4), antes del formulario (HU-320). */
export interface AperturaRegistro {
  readonly evento: { readonly nombre: string; readonly logoUrl: string | null };
  readonly qr: { readonly nombre: string };
  readonly terminos: { readonly version: string; readonly privacidad: string };
  /** Hasta cuándo sirve el permiso para terminar el formulario. */
  readonly permisoHasta: string;
}

const MOTIVOS: Partial<Record<CodigoError, string>> = {
  QR_REGISTRO_INVALIDO: 'qr_registro_invalido',
  QR_REGISTRO_VENCIDO: 'qr_registro_vencido',
  QR_REGISTRO_INACTIVO: 'qr_registro_inactivo',
};

/**
 * Abrir un QR de registro (`GET /app/registro/:tipo/:codigo`, público): comprueba la firma o el
 * token, la franja y que el QR y el evento estén activos, y entrega el permiso de registro.
 */
export class RegistroAppService {
  /** 30 por minuto por IP: el evento comparte el wifi. */
  private readonly porIp: Limitador;

  constructor(
    private readonly db: Db,
    private readonly sistema: AccesoSistema,
    private readonly registro: RegistroTecnicoService,
    private readonly cifrador: Cifrador,
    private readonly reloj: Reloj,
  ) {
    this.porIp = new Limitador([{ maximo: 30, ms: 60_000 }], () => this.reloj.now().getTime());
  }

  async open(
    tipo: string,
    codigo: string,
    tecnico: { readonly ip: string; readonly userAgent: string },
  ): Promise<{ apertura: AperturaRegistro; permiso: string; expira: Date }> {
    const espera = this.porIp.hit(tecnico.ip);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    const rotativo = tipo === 'r' ? parseCodigoRotativo(codigo) : null;
    const tokenHash = tipo === 'f' && isTokenFijo(codigo) ? hashToken(codigo) : null;
    if (!rotativo && !tokenHash) throw new AppError('QR_REGISTRO_INVALIDO');
    const encontrado = await this.sistema.findOrganizacionDeQrRegistro(
      rotativo ? { id: rotativo.qrId } : { tokenHash: tokenHash ?? Buffer.alloc(0) },
    );
    if (!encontrado) throw new AppError('QR_REGISTRO_INVALIDO');
    const { organizacionId } = encontrado;

    const resultado = await withOrganizacion(this.db, organizacionId, async (tx) => {
      const [fila] = await tx
        .select({
          qr: qrRegistro,
          evento: {
            id: eventos.id,
            nombre: eventos.nombre,
            logoArchivoId: eventos.logoArchivoId,
            estado: eventos.estado,
            autoregistroActivo: eventos.autoregistroActivo,
          },
        })
        .from(qrRegistro)
        .innerJoin(eventos, eq(eventos.id, qrRegistro.eventoId))
        .where(eq(qrRegistro.id, encontrado.id));
      if (!fila) return { error: 'QR_REGISTRO_INVALIDO' as const, eventoId: null };
      const { qr, evento } = fila;
      const ahora = this.reloj.now();
      if (rotativo) {
        const firmaValida =
          qr.tipo === 'rotativo' &&
          qr.secretoCifrado !== null &&
          isFirmaFranja(
            this.cifrador.decrypt(qr.secretoCifrado),
            qr.id,
            rotativo.franja,
            rotativo.firma,
          );
        if (!firmaValida) return { error: 'QR_REGISTRO_INVALIDO' as const, eventoId: evento.id };
        if (!isFranjaRegistroVigente(rotativo.franja, ahora.getTime())) {
          return { error: 'QR_REGISTRO_VENCIDO' as const, eventoId: evento.id };
        }
      } else if (qr.tipo !== 'fijo') {
        return { error: 'QR_REGISTRO_INVALIDO' as const, eventoId: evento.id };
      }
      if (getDisponibilidadQr(qr, evento, ahora) !== 'activo') {
        return { error: 'QR_REGISTRO_INACTIVO' as const, eventoId: evento.id };
      }
      return { qr, evento, ahora };
    });

    if ('error' in resultado) {
      if (resultado.eventoId) {
        await this.registro.recordAparte(organizacionId, {
          eventoId: resultado.eventoId,
          momento: 'intento_fallido',
          resultado: 'rechazado',
          motivo: MOTIVOS[resultado.error] ?? null,
          ip: tecnico.ip,
          userAgent: tecnico.userAgent,
        });
      }
      throw new AppError(resultado.error);
    }
    const { qr, evento, ahora } = resultado;
    const { valor, exp } = buildPermisoRegistro(
      this.cifrador,
      { qrId: qr.id, organizacionId },
      ahora.getTime(),
    );
    return {
      apertura: {
        evento: {
          nombre: evento.nombre,
          logoUrl: evento.logoArchivoId ? getUrlArchivo(evento.logoArchivoId, '400') : null,
        },
        qr: { nombre: qr.nombre },
        terminos: { version: VERSION_TERMINOS, privacidad: VERSION_TERMINOS },
        permisoHasta: new Date(exp).toISOString(),
      },
      permiso: valor,
      expira: new Date(exp),
    };
  }
}
