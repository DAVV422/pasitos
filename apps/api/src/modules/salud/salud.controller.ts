import { Controller, Get, Inject } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { AppError } from '../../common/errors/app-error';
import { Publica } from '../../common/sesion/sesion';
import { SaludService } from './salud.service';

export interface EstadoSalud {
  readonly estado: 'ok';
  readonly version: string;
  readonly base: 'ok';
  /** Segundos desde el último lote anclado; null si todavía no hay. Sin ids ni datos del evento. */
  readonly ultimoLoteConfirmadoHace: number | null;
}

/**
 * GET /api/v1/salud (T-005 §4). Sin autenticación y sin datos de negocio.
 * Responde 503 si la base no responde.
 */
@Controller('salud')
@Publica()
export class SaludController {
  constructor(
    private readonly saludService: SaludService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async getSalud(): Promise<EstadoSalud> {
    const baseOk = await this.saludService.isBaseDisponible();
    if (!baseOk) {
      throw new AppError('SERVICIO_NO_DISPONIBLE');
    }
    return {
      estado: 'ok',
      version: this.config.VERSION,
      base: 'ok',
      ultimoLoteConfirmadoHace: await this.saludService.getUltimoAnclajeSegundos(),
    };
  }
}
