import { Controller, Get, Inject, Query } from '@nestjs/common';
import { and, desc, eq, gte, ilike, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import { bitacora, withOrganizacion } from '@pasitos/db';
import { getTextoAccion } from '@pasitos/dominio';
import * as z from 'zod';
import { Contexto, Permiso, type ContextoEvento } from '../../common/permisos/marcas';
import { DbService } from '../../infra/db/db.module';

const UUID = z.uuid();

const esquemaFiltros = z.object({
  actor: z.string().trim().max(80).optional(),
  accion: z.string().trim().max(80).optional(),
  desde: z.iso.datetime({ offset: true }).optional(),
  cursor: UUID.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** `GET /eventos/:eventoId/bitacora` (HU-213 §3). Solo dueño y coorganizadores. */
@Controller('eventos/:eventoId/bitacora')
export class BitacoraController {
  constructor(@Inject(DbService) private readonly db: DbService) {}

  @Get()
  @Permiso('bitacora.read')
  async list(@Contexto() contexto: ContextoEvento, @Query() consulta: unknown) {
    const filtros = esquemaFiltros.parse(consulta);
    const condiciones: (SQL | undefined)[] = [eq(bitacora.eventoId, contexto.eventoId)];
    if (filtros.actor) {
      // Un usuarioId exacto, o texto de 3 letras o más sobre el nombre.
      condiciones.push(
        UUID.safeParse(filtros.actor).success
          ? eq(bitacora.actorId, filtros.actor)
          : filtros.actor.length >= 3
            ? ilike(bitacora.actorNombre, `%${filtros.actor.replace(/[\\%_]/g, '\\$&')}%`)
            : undefined,
      );
    }
    if (filtros.accion) {
      condiciones.push(
        or(eq(bitacora.accion, filtros.accion), ilike(bitacora.accion, `${filtros.accion}.%`)),
      );
    }
    if (filtros.desde) {
      condiciones.push(gte(bitacora.createdAt, new Date(filtros.desde)));
    }
    if (filtros.cursor) {
      condiciones.push(lt(bitacora.id, filtros.cursor));
    }
    const filas = await withOrganizacion(this.db.db, contexto.organizacionId, (tx) =>
      tx
        .select()
        .from(bitacora)
        .where(and(...condiciones, isNotNull(bitacora.id)))
        .orderBy(desc(bitacora.id))
        .limit(filtros.limit + 1),
    );
    const pagina = filas.slice(0, filtros.limit);
    return {
      items: pagina.map((fila) => ({
        id: fila.id,
        cuando: fila.createdAt,
        quien: { nombre: fila.actorNombre, rol: fila.actorRol, tipo: fila.actorTipo },
        accion: fila.accion,
        texto: getTextoAccion(fila.accion),
        objeto: fila.objetoTipo
          ? { tipo: fila.objetoTipo, id: fila.objetoId, nombre: fila.objetoNombre }
          : null,
        antes: fila.antes,
        despues: fila.despues,
        dispositivo: fila.dispositivoModelo,
      })),
      pagination: {
        nextCursor: filas.length > filtros.limit ? (pagina.at(-1)?.id ?? null) : null,
      },
    };
  }
}
