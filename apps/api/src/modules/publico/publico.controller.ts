import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { esquemaContacto } from '@pasitos/dominio/esquemas';
import type { FastifyRequest } from 'fastify';
import { Publica } from '../../common/sesion/sesion';
import { ContactoService } from './contacto.service';

/** Lo que el sitio público pide al API, sin sesión (HU-410; después HU-405 y HU-406). */
@Controller('publico')
export class PublicoController {
  constructor(private readonly contacto: ContactoService) {}

  /** El formulario de la landing. Responde 201 sin cuerpo, también a la trampa. */
  @Post('contacto')
  @Publica()
  @HttpCode(201)
  async createContacto(@Body() cuerpo: unknown, @Req() request: FastifyRequest): Promise<void> {
    await this.contacto.create(esquemaContacto.parse(cuerpo), request.ip);
  }
}
