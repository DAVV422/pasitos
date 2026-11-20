import { and, desc, eq, lt, type SQL } from 'drizzle-orm';
import { mensajesContacto, type Db } from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import type { EstadoContacto } from '@pasitos/dominio/esquemas';
import type { Reloj } from '../auth/sesiones.service';
import { BitacoraService, type ActorBitacora } from '../bitacora/bitacora.service';

const POR_PAGINA = 50;

/**
 * La bandeja de contactos de la consola (HU-410 §5). Con la conexión de sistema: la tabla no es de
 * ninguna organización y pasitos_app no la puede cambiar. Ver el detalle (tiene datos personales)
 * y cada cambio quedan en la bitácora de plataforma.
 */
export class ContactosPlataformaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly sistema: Db,
    private readonly reloj: Reloj,
  ) {}

  async list(filtros: { estado?: EstadoContacto | undefined; cursor?: string | undefined }) {
    const condiciones: SQL[] = [];
    if (filtros.estado) condiciones.push(eq(mensajesContacto.estado, filtros.estado));
    if (filtros.cursor) condiciones.push(lt(mensajesContacto.id, filtros.cursor));
    const filas = await this.sistema
      .select({
        id: mensajesContacto.id,
        nombre: mensajesContacto.nombre,
        organizacion: mensajesContacto.organizacion,
        tipoEvento: mensajesContacto.tipoEvento,
        asistentesAprox: mensajesContacto.asistentesAprox,
        estado: mensajesContacto.estado,
        createdAt: mensajesContacto.createdAt,
      })
      .from(mensajesContacto)
      .where(condiciones.length > 0 ? and(...condiciones) : undefined)
      .orderBy(desc(mensajesContacto.id))
      .limit(POR_PAGINA + 1);
    const pagina = filas.slice(0, POR_PAGINA);
    const nuevos = await this.sistema.$count(
      mensajesContacto,
      eq(mensajesContacto.estado, 'nuevo'),
    );
    return {
      items: pagina.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
      pagination: { nextCursor: filas.length > POR_PAGINA ? (pagina.at(-1)?.id ?? null) : null },
      nuevos,
    };
  }

  /** El detalle, con el correo y el mensaje. Queda en la bitácora: tiene datos personales. */
  async get(actor: ActorBitacora, id: string) {
    return this.sistema.transaction(async (tx) => {
      const [fila] = await tx.select().from(mensajesContacto).where(eq(mensajesContacto.id, id));
      if (!fila) throw new AppError('NO_ENCONTRADO');
      await this.bitacora.record(tx, {
        actor,
        accion: 'contacto.ver',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'contacto', id, nombre: fila.organizacion ?? fila.nombre },
      });
      return {
        id: fila.id,
        nombre: fila.nombre,
        email: fila.email,
        organizacion: fila.organizacion,
        tipoEvento: fila.tipoEvento,
        asistentesAprox: fila.asistentesAprox,
        mensaje: fila.mensaje,
        estado: fila.estado,
        notaInterna: fila.notaInterna,
        atendidoAt: fila.atendidoAt?.toISOString() ?? null,
        createdAt: fila.createdAt.toISOString(),
        borrarAt: fila.borrarAt.toISOString(),
      };
    });
  }

  /** Cambiar el estado o la nota interna. La bitácora guarda el estado, y de la nota solo que cambió. */
  async update(
    actor: ActorBitacora & { tipo: 'usuario' },
    id: string,
    cambios: { estado?: EstadoContacto | undefined; notaInterna?: string | null | undefined },
  ): Promise<void> {
    await this.sistema.transaction(async (tx) => {
      const [fila] = await tx
        .select()
        .from(mensajesContacto)
        .where(eq(mensajesContacto.id, id))
        .for('update');
      if (!fila) throw new AppError('NO_ENCONTRADO');
      const ahora = this.reloj.now();
      await tx
        .update(mensajesContacto)
        .set({
          ...(cambios.estado ? { estado: cambios.estado } : {}),
          ...(cambios.notaInterna !== undefined ? { notaInterna: cambios.notaInterna } : {}),
          atendidoPor: actor.id,
          atendidoAt: ahora,
        })
        .where(eq(mensajesContacto.id, id));
      await this.bitacora.record(tx, {
        actor,
        accion: 'contacto.actualizar',
        organizacionId: null,
        eventoId: null,
        objeto: { tipo: 'contacto', id, nombre: fila.organizacion ?? fila.nombre },
        antes: { estado: fila.estado },
        despues: {
          estado: cambios.estado ?? fila.estado,
          ...(cambios.notaInterna !== undefined ? { nota: 'cambió' } : {}),
        },
      });
    });
  }
}
