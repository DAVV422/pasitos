import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { esquemaActualizarContacto, esquemaListarContactos } from '@pasitos/dominio/esquemas';
import { Plataforma } from '../../common/permisos/marcas';
import { Sesion } from '../../common/sesion/sesion';
import type { ContextoSesion } from '../auth/sesiones.service';
import { toActorPlataforma } from '../bitacora/actores';
import { AccionBitacoraDe, type ActorBitacora } from '../bitacora/bitacora.service';
import { ContactosPlataformaService } from './contactos-plataforma.service';

/** La bandeja del formulario de contacto (HU-410 §5): admin y soporte la ven; solo admin la cambia. */
@Controller('plataforma/contactos')
export class ContactosPlataformaController {
  constructor(private readonly contactos: ContactosPlataformaService) {}

  @Get()
  @Plataforma('lectura')
  list(@Query() consulta: unknown) {
    return this.contactos.list(esquemaListarContactos.parse(consulta));
  }

  /** El detalle queda en la bitácora de plataforma: tiene el correo y el mensaje. */
  @Get(':id')
  @Plataforma('lectura')
  @AccionBitacoraDe('contacto.ver')
  get(@Sesion() sesion: ContextoSesion, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.contactos.get(toActorPlataforma(sesion), id);
  }

  @Patch(':id')
  @Plataforma('escritura')
  @AccionBitacoraDe('contacto.actualizar')
  @HttpCode(204)
  async update(
    @Sesion() sesion: ContextoSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ): Promise<void> {
    await this.contactos.update(
      toActorPlataforma(sesion) as ActorBitacora & { tipo: 'usuario' },
      id,
      esquemaActualizarContacto.parse(cuerpo),
    );
  }
}
