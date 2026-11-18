import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { AppError } from '@pasitos/dominio';
import { hashCuerpo, importLlavePublica, verifyPedido } from '@pasitos/firmas';
import {
  META_ASISTENTE,
  type FirmaVerificada,
  type OpcionesAsistente,
  type RequestConAsistente,
} from '../../common/sesion/asistente';
import type { Reloj } from '../auth/sesiones.service';
import { COOKIE_ASISTENTE, type SesionesAsistenteService } from './sesiones-asistente';

/** La hora del celular puede diferir de la del servidor hasta 5 minutos (API §2.1). */
export const TOLERANCIA_RELOJ_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAXIMO_LLAVES = 5_000;

function header(request: RequestConAsistente, nombre: string): string | undefined {
  const valor = request.headers[nombre.toLowerCase()];
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * Guard global de las rutas `@Asistente()` (HU-306 §4): la sesión `px_asistente` con su
 * vinculación activa y, en las firmadas, la firma del dispositivo y la hora del celular. La
 * `Idempotency-Key` la aplica el caso de uso, en su misma transacción (IdempotenciaService).
 */
export class AsistenteGuard implements CanActivate {
  /** Las llaves públicas ya importadas, por dispositivo (verificar cuesta menos de 1 ms). */
  private readonly llaves = new Map<string, CryptoKey>();

  constructor(
    private readonly reflector: Reflector,
    private readonly sesiones: SesionesAsistenteService,
    private readonly reloj: Reloj,
  ) {}

  async canActivate(ejecucion: ExecutionContext): Promise<boolean> {
    const opciones = this.reflector.getAllAndOverride<OpcionesAsistente | undefined>(
      META_ASISTENTE,
      [ejecucion.getHandler(), ejecucion.getClass()],
    );
    if (!opciones) {
      return true;
    }
    const request = ejecucion.switchToHttp().getRequest<RequestConAsistente>();
    const sesion = await this.sesiones.authenticate(request.cookies[COOKIE_ASISTENTE]);
    const { llavePublica, ...contexto } = sesion;
    request.asistente = contexto;
    if (opciones.firmado) {
      request.firma = await this.verifyFirma(request, sesion.dispositivoId, llavePublica);
    }
    return true;
  }

  private async verifyFirma(
    request: RequestConAsistente,
    dispositivoId: string,
    llavePublica: Buffer | null,
  ): Promise<FirmaVerificada> {
    const clave = header(request, 'Idempotency-Key');
    if (!clave || !UUID.test(clave)) {
      throw new AppError('VALIDACION', {
        errors: [
          {
            field: 'Idempotency-Key',
            code: 'REQUERIDO',
            message: 'Falta la clave de la operación.',
          },
        ],
      });
    }
    const timestamp = Number(header(request, 'X-Pasitos-Timestamp'));
    const firma = header(request, 'X-Pasitos-Firma');
    if (!Number.isFinite(timestamp) || !firma || !llavePublica) {
      throw new AppError('FIRMA_INVALIDA');
    }
    if (Math.abs(this.reloj.now().getTime() - timestamp) > TOLERANCIA_RELOJ_MS) {
      throw new AppError('FIRMA_INVALIDA', {
        detail:
          'La hora de tu celular no coincide. Revisa la fecha y la hora, y vuelve a intentar.',
      });
    }
    const ruta = request.url.split('?')[0] ?? request.url;
    const pedido = {
      metodo: request.method,
      ruta,
      clave,
      timestamp,
      hashCuerpo: await hashCuerpo(request.rawBody ? new Uint8Array(request.rawBody) : ''),
    };
    const llave = await this.getLlave(dispositivoId, llavePublica);
    if (!(await verifyPedido(llave, pedido, firma))) {
      throw new AppError('FIRMA_INVALIDA');
    }
    return {
      clave,
      timestamp,
      hashCuerpo: pedido.hashCuerpo,
      firma: Buffer.from(firma.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      ruta,
    };
  }

  private async getLlave(dispositivoId: string, cruda: Buffer): Promise<CryptoKey> {
    const guardada = this.llaves.get(dispositivoId);
    if (guardada) {
      return guardada;
    }
    const llave = await importLlavePublica(new Uint8Array(cruda));
    if (this.llaves.size >= MAXIMO_LLAVES) {
      this.llaves.clear();
    }
    this.llaves.set(dispositivoId, llave);
    return llave;
  }
}
