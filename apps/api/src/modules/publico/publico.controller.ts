import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { AppError } from '@pasitos/dominio';
import { esquemaContacto } from '@pasitos/dominio/esquemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import { Publica } from '../../common/sesion/sesion';
import { COOKIE_ASISTENTE, SesionesAsistenteService } from '../acceso/sesiones-asistente';
import { Limitador } from '../auth/limitador';
import { ContactoService } from './contacto.service';
import { EventosPublicosService } from './eventos-publicos.service';

const esquemaListarEventos = z.object({
  momento: z.enum(['proximos', 'en_curso', 'pasados']).default('proximos'),
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

/** El reporte compartido: 5 minutos (HU-402 §5). Dejar de compartir tarda eso en notarse. */
const CACHE_REPORTE = 'public, max-age=300';

/** Cloudflare y el navegador la guardan un minuto (HU-405 §1). */
const CACHE_PUBLICA = 'public, max-age=60, stale-while-revalidate=300';

/** Lo que el sitio público pide al API, sin sesión (HU-405, HU-406, HU-410). */
@Controller('publico')
export class PublicoController {
  /** 60 por minuto por IP: para que nadie la recorra entera de golpe. */
  private readonly porIp = new Limitador([{ maximo: 60, ms: 60_000 }]);

  constructor(
    private readonly contacto: ContactoService,
    private readonly eventos: EventosPublicosService,
    private readonly sesiones: SesionesAsistenteService,
  ) {}

  /** El formulario de la landing. Responde 201 sin cuerpo, también a la trampa. */
  @Post('contacto')
  @Publica()
  @HttpCode(201)
  async createContacto(@Body() cuerpo: unknown, @Req() request: FastifyRequest): Promise<void> {
    await this.contacto.create(esquemaContacto.parse(cuerpo), request.ip);
  }

  /** Próximos, en curso y pasados, solo los eventos *Público* (HU-405 §2). */
  @Get('eventos')
  @Publica()
  async listEventos(
    @Query() consulta: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const espera = this.porIp.hit(request.ip);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    const { momento, cursor, limit } = esquemaListarEventos.parse(consulta);
    void reply.header('Cache-Control', CACHE_PUBLICA);
    return this.eventos.list(momento, { cursor, limit });
  }

  /** La página pública del evento (HU-406 §1). Sin página: `404 EVENTO_SIN_PAGINA_PUBLICA`. */
  @Get('eventos/:slug')
  @Publica()
  async getEvento(
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const espera = this.porIp.hit(request.ip);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new AppError('EVENTO_SIN_PAGINA_PUBLICA');
    const evento = await this.eventos.get(slug);
    void reply.header('Cache-Control', CACHE_PUBLICA);
    return evento;
  }

  /**
   * ¿Este navegador tiene una entrada vinculada a ese evento? (HU-406 §4, *Ir a mi entrada*). Lee
   * la cookie del asistente; responde siempre `{ vinculado }`, nunca un error ni otro dato.
   */
  @Get('eventos/:slug/mi-entrada')
  @Publica()
  async getMiEntrada(
    @Param('slug') slug: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ vinculado: boolean }> {
    void reply.header('Cache-Control', 'private, no-store');
    const token = request.cookies[COOKIE_ASISTENTE];
    if (!token || !/^[a-z0-9-]{1,80}$/.test(slug)) return { vinculado: false };
    try {
      const [eventoId, sesion] = await Promise.all([
        this.eventos.getId(slug),
        this.sesiones.authenticate(token),
      ]);
      return { vinculado: eventoId !== null && sesion.eventoId === eventoId && !sesion.anulada };
    } catch {
      return { vinculado: false };
    }
  }

  /** El reporte compartido con un enlace (HU-402 §5). Sin él: `404 NO_ENCONTRADO`, siempre igual. */
  @Get('reportes/:token')
  @Publica()
  async getReporte(
    @Param('token') token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const espera = this.porIp.hit(request.ip);
    if (espera > 0) {
      throw new AppError('DEMASIADOS_INTENTOS', { meta: { reintentarEnSegundos: espera } });
    }
    const reporte = await this.eventos.getReporte(token);
    if (!reporte) throw new AppError('NO_ENCONTRADO');
    void reply.header('Cache-Control', CACHE_REPORTE).header('X-Robots-Tag', 'noindex');
    return reporte;
  }
}
