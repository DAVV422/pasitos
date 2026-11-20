import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { AppError } from '@pasitos/dominio';
import { esquemaContacto } from '@pasitos/dominio/esquemas';
import type { FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import { Publica } from '../../common/sesion/sesion';
import { Limitador } from '../auth/limitador';
import { ContactoService } from './contacto.service';
import { EventosPublicosService } from './eventos-publicos.service';

const esquemaListarEventos = z.object({
  momento: z.enum(['proximos', 'en_curso', 'pasados']).default('proximos'),
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

/** Cloudflare y el navegador la guardan un minuto (HU-405 §1). */
const CACHE_PUBLICA = 'public, max-age=60, stale-while-revalidate=300';

/** Lo que el sitio público pide al API, sin sesión (HU-405, HU-410; después HU-406). */
@Controller('publico')
export class PublicoController {
  /** 60 por minuto por IP: para que nadie la recorra entera de golpe. */
  private readonly porIp = new Limitador([{ maximo: 60, ms: 60_000 }]);

  constructor(
    private readonly contacto: ContactoService,
    private readonly eventos: EventosPublicosService,
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
}
