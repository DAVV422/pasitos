import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
type RequestConCuerpo = FastifyRequest & { rawBody?: Buffer };
import {
  esquemaAnularCi,
  esquemaAutoregistro,
  esquemaBuscarCarnet,
  esquemaRechazarCi,
  esquemaVerificarCi,
  esquemaCrearQrRegistro,
  esquemaMisDatos,
  esquemaEditarQrRegistro,
  esquemaImprimibleQrRegistro,
  esquemaInvalidarQrRegistro,
} from '@pasitos/dominio/esquemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Publica } from '../../common/sesion/sesion';
import { Asistente, AsistenteActual, type ContextoAsistente } from '../../common/sesion/asistente';
import { getPedidoIdempotente } from '../acceso/idempotencia';
import { COOKIE_ASISTENTE } from '../acceso/sesiones-asistente';
import { AutoregistroService } from './autoregistro.service';
import { CarnetsService } from './carnets.service';
import { MisDatosService } from './mis-datos.service';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { APP_CONFIG, type AppConfig } from '../../config/app.config';
import { AccionBitacoraDe } from '../bitacora/bitacora.service';
import { COOKIE_TERMINAL, ConexionService } from '../terminales/conexion.service';
import { QrRegistroService } from './qr-registro.service';
import { RegistroAppService } from './registro-app.service';

/** La cookie del permiso de registro (HU-319 §4): solo viaja a las rutas del registro. */
export const COOKIE_REGISTRO = 'px_registro';

/** Los QR de registro en el panel (HU-319 §2): D y C. *Activar cuentas*, quien lo tiene asignado. */
@Controller()
export class QrRegistroController {
  constructor(private readonly qr: QrRegistroService) {}

  @Get('eventos/:eventoId/qr-registro')
  @Permiso('qr_registro.read')
  list(@Contexto() contexto: ContextoEvento) {
    return this.qr.list(contexto);
  }

  /** *Activar cuentas*: los rotativos que muestra esta persona. */
  @Get('eventos/:eventoId/qr-registro/mios')
  @Permiso('puerta.activar')
  listMios(@Contexto() contexto: ContextoEvento) {
    return this.qr.listMios(contexto);
  }

  @Post('eventos/:eventoId/qr-registro')
  @Permiso('qr_registro.update')
  @AccionBitacoraDe('qr_registro.create')
  @HttpCode(201)
  create(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.qr.create(contexto, esquemaCrearQrRegistro.parse(cuerpo));
  }

  @Patch('qr-registro/:id')
  @Permiso('qr_registro.update', { recurso: 'qrRegistro' })
  @AccionBitacoraDe('qr_registro.update')
  update(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.qr.update(contexto, id, esquemaEditarQrRegistro.parse(cuerpo));
  }

  @Post('qr-registro/:id/invalidar')
  @Permiso('qr_registro.update', { recurso: 'qrRegistro' })
  @AccionBitacoraDe('qr_registro.invalidate')
  @HttpCode(200)
  invalidate(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.qr.invalidate(contexto, id, esquemaInvalidarQrRegistro.parse(cuerpo).motivo);
  }

  @Post('qr-registro/:id/duplicar')
  @Permiso('qr_registro.update', { recurso: 'qrRegistro' })
  @AccionBitacoraDe('qr_registro.create')
  @HttpCode(201)
  duplicate(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.qr.duplicate(contexto, id);
  }

  @Get('qr-registro/:id/imprimible')
  @Permiso('qr_registro.update', { recurso: 'qrRegistro' })
  @AccionBitacoraDe('qr_registro.download')
  async getImprimible(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { formato } = esquemaImprimibleQrRegistro.parse(query);
    const { contenido, tipo, archivo } = await this.qr.getImprimible(contexto, id, formato);
    void reply
      .header('Cache-Control', 'no-store')
      .header('Content-Type', tipo)
      .header('Content-Disposition', `attachment; filename="${archivo}"`);
    return contenido;
  }

  /** La franja del rotativo para quien lo tiene asignado (cada 30 s). A nadie más: 403. */
  @Get('qr-registro/:id/franja')
  @Permiso('puerta.activar', { recurso: 'qrRegistro' })
  getFranja(@Contexto() contexto: ContextoEvento, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.qr.getFranjaEquipo(contexto, id);
  }
}

/**
 * La tablet en modo Registro (HU-319 §5): pide la franja con su sesión `px_terminal`. Va aparte de
 * `/qr-registro/:id/franja` porque la tablet no tiene sesión del equipo.
 */
@Controller('sala/registro')
@Publica()
export class SalaRegistroController {
  constructor(
    private readonly qr: QrRegistroService,
    private readonly conexion: ConexionService,
  ) {}

  @Get('franja')
  async getFranja(@Req() request: FastifyRequest) {
    const terminal = await this.conexion.beat(request.cookies[COOKIE_TERMINAL]);
    return { franja: await this.qr.getFranjaPantalla(terminal) };
  }
}

/** Abrir un QR de registro (HU-319 §4): público, con el permiso en una cookie. */
@Controller('app/registro')
@Publica()
export class RegistroAppController {
  constructor(
    private readonly registro: RegistroAppService,
    private readonly autoregistro: AutoregistroService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * HU-320: crea la cuenta con el permiso `px_registro`. Pide `Idempotency-Key`; un reintento del
   * mismo navegador entra a la cuenta que ya creó (`200`, `yaRegistrado`), sin crear otra.
   */
  @Post()
  async register(
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    getPedidoIdempotente(request);
    const { sesion, expiraAt, estado, yaRegistrado } = await this.autoregistro.register(
      esquemaAutoregistro.parse(cuerpo),
      request.cookies[COOKIE_REGISTRO],
      { ip: request.ip, userAgent: request.headers['user-agent'] ?? '' },
    );
    const segura = this.config.PUBLIC_URL.startsWith('https://');
    void reply
      .status(yaRegistrado ? 200 : 201)
      .setCookie(COOKIE_ASISTENTE, sesion, {
        httpOnly: true,
        secure: segura,
        sameSite: 'lax',
        path: '/api',
        expires: expiraAt,
      })
      .clearCookie(COOKIE_REGISTRO, { path: '/api/v1/app/registro' });
    return { ...estado, yaRegistrado };
  }

  @Get(':tipo/:codigo')
  async open(
    @Param('tipo') tipo: string,
    @Param('codigo') codigo: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const { apertura, permiso, expira } = await this.registro.open(tipo, codigo, {
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? '',
    });
    void reply.header('Cache-Control', 'no-store').setCookie(COOKIE_REGISTRO, permiso, {
      httpOnly: true,
      secure: this.config.PUBLIC_URL.startsWith('https://'),
      sameSite: 'lax',
      path: '/api/v1/app/registro',
      expires: expira,
    });
    return apertura;
  }
}

/** *Mis datos* (HU-320 §4): la persona ve y edita su nombre, su correo y su carnet. */
@Controller('app')
export class MisDatosController {
  constructor(private readonly misDatos: MisDatosService) {}

  @Get('yo')
  @Asistente()
  get(@AsistenteActual() asistente: ContextoAsistente) {
    return this.misDatos.get(asistente);
  }

  @Patch('yo')
  @Asistente({ firmado: true })
  update(@AsistenteActual() asistente: ContextoAsistente, @Body() cuerpo: unknown) {
    return this.misDatos.update(asistente, esquemaMisDatos.parse(cuerpo));
  }
}

/**
 * Verificar el carnet (HU-321 §3). La matriz da `ci.verify` a D, C y R, y además lo tiene quien
 * esté marcado con *Verifica carnets*: por eso la ruta pide solo ser del evento y el servicio
 * decide (`403 NO_VERIFICA_CI`). Deshacer es de D y C.
 */
@Controller()
export class CarnetsController {
  constructor(private readonly carnets: CarnetsService) {}

  @Post('eventos/:eventoId/carnets/buscar')
  @Permiso('evento.read')
  @HttpCode(200)
  search(@Contexto() contexto: ContextoEvento, @Body() cuerpo: unknown) {
    return this.carnets.search(contexto, esquemaBuscarCarnet.parse(cuerpo));
  }

  @Post('asistentes/:id/carnet/verificar')
  @Permiso('evento.read', { recurso: 'asistentes' })
  @HttpCode(200)
  verify(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    return this.carnets.verify(
      contexto,
      id,
      esquemaVerificarCi.parse(cuerpo ?? {}),
      getPedidoIdempotente(request),
    );
  }

  @Post('asistentes/:id/carnet/rechazar')
  @Permiso('evento.read', { recurso: 'asistentes' })
  @HttpCode(200)
  reject(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.carnets.reject(contexto, id, esquemaRechazarCi.parse(cuerpo).nota);
  }

  @Post('asistentes/:id/carnet/anular')
  @Permiso('puntos.ajustar', { recurso: 'asistentes' })
  @AccionBitacoraDe('ci.unverify')
  @HttpCode(200)
  cancel(
    @Contexto() contexto: ContextoEvento,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
    @Req() request: RequestConCuerpo,
  ) {
    return this.carnets.cancel(
      contexto,
      id,
      esquemaAnularCi.parse(cuerpo).motivo,
      getPedidoIdempotente(request),
    );
  }
}
