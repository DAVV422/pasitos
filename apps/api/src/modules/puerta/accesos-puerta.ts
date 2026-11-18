import { randomBytes, randomInt } from 'node:crypto';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  asistentes,
  dispositivos,
  eventos,
  tokens,
  vinculaciones,
  withOrganizacion,
  type Db,
} from '@pasitos/db';
import { AppError } from '@pasitos/dominio';
import { uuidv7 } from 'uuidv7';
import type { ContextoEvento } from '../../common/permisos/marcas';
import { hashToken } from '../auth/auth.repository';
import type { Reloj } from '../auth/sesiones.service';
import { toActor } from '../bitacora/actores';
import { BitacoraService } from '../bitacora/bitacora.service';

/** El QR de asistente y el enlace corto valen 2 minutos (HU-302 §1). */
export const VIGENCIA_ACCESO_MS = 2 * 60 * 1000;
export const PROPOSITO_QR = 'qr_asistente';
export const PROPOSITO_CORTO = 'enlace_corto_asistente';

/** Base32 de Crockford: sin I, L, O ni U, para que no se confundan al escribirlo. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `K7Q2-M9XD`: 8 caracteres (40 bits), para escribirlo a mano. */
export function createCodigoCorto(): string {
  let codigo = '';
  for (let i = 0; i < 8; i++) codigo += CROCKFORD[randomInt(CROCKFORD.length)];
  return `${codigo.slice(0, 4)}-${codigo.slice(4)}`;
}

/**
 * Lo escrito a mano, tal como se guarda su hash: mayúsculas, sin guion ni espacios, y las letras
 * que se confunden llevadas a su número (O a 0; I y L a 1).
 */
export function normalizeCodigoCorto(texto: string): string {
  return texto.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}

export interface AccesoGenerado {
  readonly id: string;
  readonly qr: string;
  readonly enlaceCorto: string;
  readonly codigoCorto: string;
  readonly expiraAt: string;
}

export interface EstadoAcceso {
  readonly estado: 'pendiente' | 'vinculado' | 'vencido';
  readonly modelo: string | null;
  readonly vinculadoAt: string | null;
}

/**
 * Generar el acceso en la puerta (HU-302 §2): el QR de 2 minutos y su enlace corto, para la
 * persona que el registrador tiene delante. Generar otro revoca los anteriores sin usar.
 */
export class AccesosPuertaService {
  private readonly bitacora = new BitacoraService();

  constructor(
    private readonly db: Db,
    private readonly reloj: Reloj,
    private readonly urlPublica: string,
  ) {}

  create(
    contexto: ContextoEvento,
    asistenteId: string,
    motivo: string | undefined,
  ): Promise<AccesoGenerado> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const [asistente] = await tx
        .select({ id: asistentes.id, nombre: asistentes.nombre, estado: asistentes.estado })
        .from(asistentes)
        .where(and(eq(asistentes.id, asistenteId), eq(asistentes.eventoId, contexto.eventoId)))
        .for('update');
      if (!asistente) throw new AppError('NO_ENCONTRADO');
      if (asistente.estado === 'cancelado') throw new AppError('ASISTENTE_CANCELADO');
      const [evento] = await tx
        .select({ estado: eventos.estado })
        .from(eventos)
        .where(eq(eventos.id, contexto.eventoId));
      if (evento?.estado !== 'publicado' && evento?.estado !== 'en_curso') {
        throw new AppError('EVENTO_NO_ACTIVO');
      }
      // Con un celular activo, cambiarlo pide motivo (HU-304).
      const [activa] = await tx
        .select({ id: vinculaciones.id })
        .from(vinculaciones)
        .where(and(eq(vinculaciones.asistenteId, asistenteId), isNull(vinculaciones.anuladaAt)));
      if (activa && !motivo) throw new AppError('MOTIVO_REQUERIDO');

      const ahora = this.reloj.now();
      await tx
        .update(tokens)
        .set({ revocadoAt: ahora })
        .where(
          and(
            inArray(tokens.proposito, [PROPOSITO_QR, PROPOSITO_CORTO]),
            eq(tokens.refId, asistenteId),
            isNull(tokens.usadoAt),
            isNull(tokens.revocadoAt),
          ),
        );
      const id = uuidv7();
      const secreto = randomBytes(32).toString('base64url');
      const codigoCorto = createCodigoCorto();
      const expiraAt = new Date(ahora.getTime() + VIGENCIA_ACCESO_MS);
      const comun = {
        eventoId: contexto.eventoId,
        refId: asistenteId,
        creadoPor: contexto.usuarioId,
        motivo: motivo ?? null,
        grupo: id,
        expiraAt,
      };
      await tx.insert(tokens).values([
        { ...comun, id, tokenHash: hashToken(secreto), proposito: PROPOSITO_QR },
        {
          ...comun,
          id: uuidv7(),
          tokenHash: hashToken(normalizeCodigoCorto(codigoCorto)),
          proposito: PROPOSITO_CORTO,
        },
      ]);
      // Sin el token ni el código: solo que se generó.
      await this.bitacora.record(tx, {
        actor: toActor(contexto),
        accion: 'acceso.create',
        organizacionId: contexto.organizacionId,
        eventoId: contexto.eventoId,
        objeto: { tipo: 'asistente', id: asistente.id, nombre: asistente.nombre },
        ...(motivo ? { despues: { motivo } } : {}),
      });
      return {
        id,
        qr: `${this.urlPublica}/app/acceso/qr/${secreto}`,
        enlaceCorto: `${this.urlPublica}/v/${codigoCorto}`,
        codigoCorto,
        expiraAt: expiraAt.toISOString(),
      };
    });
  }

  /** `GET /accesos/:id`: el respaldo del aviso en vivo (`acceso.vinculado`). */
  getEstado(contexto: ContextoEvento, id: string): Promise<EstadoAcceso> {
    return withOrganizacion(this.db, contexto.organizacionId, async (tx) => {
      const filas = await tx
        .select({
          id: tokens.id,
          expiraAt: tokens.expiraAt,
          usadoAt: tokens.usadoAt,
          revocadoAt: tokens.revocadoAt,
        })
        .from(tokens)
        .where(
          and(or(eq(tokens.id, id), eq(tokens.grupo, id)), eq(tokens.eventoId, contexto.eventoId)),
        );
      if (filas.length === 0) throw new AppError('NO_ENCONTRADO');
      const [vinculo] = await tx
        .select({ modelo: dispositivos.modelo, at: vinculaciones.createdAt })
        .from(vinculaciones)
        .innerJoin(dispositivos, eq(dispositivos.id, vinculaciones.dispositivoId))
        .where(
          inArray(
            vinculaciones.tokenId,
            filas.map((f) => f.id),
          ),
        )
        .orderBy(desc(vinculaciones.createdAt))
        .limit(1);
      if (vinculo) {
        return {
          estado: 'vinculado',
          modelo: vinculo.modelo,
          vinculadoAt: vinculo.at.toISOString(),
        };
      }
      const ahora = this.reloj.now().getTime();
      const vigente = filas.some(
        (f) => !f.usadoAt && !f.revocadoAt && f.expiraAt.getTime() > ahora,
      );
      return { estado: vigente ? 'pendiente' : 'vencido', modelo: null, vinculadoAt: null };
    });
  }
}
