import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { Logger } from '@nestjs/common';
import { and, asc, eq, isNotNull, ne } from 'drizzle-orm';
import { alertas, archivos, enviosFoto, outbox, type Db } from '@pasitos/db';
import { AppError, MOTIVO_FOTO_ILEGIBLE, UMBRALES_ALERTAS } from '@pasitos/dominio';
import { getDistanciaHash, getHashPerceptual, processImagen } from '@pasitos/imagenes';
import { uuidv7 } from 'uuidv7';
import type { Reloj } from '../comun/reloj';

/** Cada cuánto mira la cola (pg-boss programa por minuto: va con un intervalo). */
export const PROCESAR_FOTOS_CADA_MS = 2_000;
/** Hasta 2 fotos a la vez en el proceso (HU-322 §4). */
const A_LA_VEZ = 2;
const POR_VUELTA = 10;

type Envio = typeof enviosFoto.$inferSelect;

/**
 * Trabajo `procesar-fotos` (HU-322 §4): la foto de un reto, de la cuarentena a sus variantes WebP
 * sin metadatos (tampoco el GPS), con su dHash. La alerta A11 y el aviso a los revisores. Una
 * imagen que no se puede leer queda `rechazada_sistema` y **no cuenta como intento**.
 */
export class ProcesarFotosService {
  private readonly logger = new Logger(ProcesarFotosService.name);

  constructor(
    private readonly db: Db,
    private readonly archivosDir: string,
    private readonly reloj: Reloj,
  ) {}

  /** Toma las recibidas (las más viejas primero) y las procesa de a dos. Devuelve cuántas. */
  async processPendientes(): Promise<number> {
    const pendientes = await this.db
      .select()
      .from(enviosFoto)
      .where(eq(enviosFoto.estado, 'recibida'))
      .orderBy(asc(enviosFoto.createdAt))
      .limit(POR_VUELTA);
    let hechas = 0;
    for (let i = 0; i < pendientes.length; i += A_LA_VEZ) {
      const tanda = pendientes.slice(i, i + A_LA_VEZ);
      const resultados = await Promise.all(tanda.map((envio) => this.process(envio)));
      hechas += resultados.filter(Boolean).length;
    }
    return hechas;
  }

  /** Una foto. `false` si falló por algo que no es la imagen (queda para la próxima vuelta). */
  private async process(envio: Envio): Promise<boolean> {
    const enCuarentena = join(this.archivosDir, 'cuarentena', envio.archivoId);
    let datos: Buffer;
    try {
      datos = await readFile(enCuarentena);
    } catch {
      await this.rejectSistema(envio, 'archivo_perdido');
      return true;
    }
    try {
      const imagen = await processImagen(datos, 'foto_reto');
      const hash = await getHashPerceptual(imagen.variantes['400']);
      const relativa = join('eventos', envio.organizacionId, envio.eventoId, envio.archivoId);
      await mkdir(join(this.archivosDir, relativa), { recursive: true });
      const variantes: Record<string, string> = {};
      for (const variante of ['original', '1200', '400'] as const) {
        const archivo = join(relativa, `${variante}.webp`);
        await writeFile(join(this.archivosDir, archivo), imagen.variantes[variante]);
        await chmod(join(this.archivosDir, archivo), 0o644);
        variantes[variante] = archivo.split(sep).join('/');
      }
      const ahora = this.reloj.now();
      await this.db.transaction(async (tx) => {
        await tx
          .update(archivos)
          .set({
            estado: 'aprobado',
            mime: 'image/webp',
            ancho: imagen.ancho,
            alto: imagen.alto,
            sha256: imagen.sha256,
            tamanoBytes: imagen.variantes.original.length,
            variantes,
          })
          .where(eq(archivos.id, envio.archivoId));
        await tx
          .update(enviosFoto)
          .set({
            estado: 'en_revision',
            sha256: imagen.sha256,
            hashPerceptual: hash,
            updatedAt: ahora,
          })
          .where(and(eq(enviosFoto.id, envio.id), eq(enviosFoto.estado, 'recibida')));
        // A11: la misma foto (o casi) desde otra cuenta en el mismo reto.
        const otras = await tx
          .select({
            id: enviosFoto.id,
            asistenteId: enviosFoto.asistenteId,
            hash: enviosFoto.hashPerceptual,
          })
          .from(enviosFoto)
          .where(
            and(
              eq(enviosFoto.retoId, envio.retoId),
              ne(enviosFoto.asistenteId, envio.asistenteId),
              isNotNull(enviosFoto.hashPerceptual),
            ),
          );
        const parecida = otras.find(
          (o) => o.hash && getDistanciaHash(o.hash, hash) <= UMBRALES_ALERTAS.a11DistanciaMaxima,
        );
        if (parecida) {
          const alertaId = uuidv7();
          const [nueva] = await tx
            .insert(alertas)
            .values({
              id: alertaId,
              organizacionId: envio.organizacionId,
              eventoId: envio.eventoId,
              tipo: 'A11',
              asistenteId: envio.asistenteId,
              datos: {
                retoId: envio.retoId,
                envioId: envio.id,
                otroEnvioId: parecida.id,
                otroAsistenteId: parecida.asistenteId,
              },
              clave: `A11:${[envio.id, parecida.id].sort().join(':')}`,
            })
            .onConflictDoNothing({ target: [alertas.eventoId, alertas.clave] })
            .returning({ id: alertas.id });
          if (nueva) {
            await tx.insert(outbox).values({
              id: uuidv7(),
              tipo: 'alerta.creada',
              eventoId: envio.eventoId,
              payload: { eventoId: envio.eventoId, alertaId, tipo: 'A11', prioridad: 'normal' },
            });
          }
        }
        // Para el contador de los revisores (HU-323).
        await tx.insert(outbox).values({
          id: uuidv7(),
          tipo: 'foto.recibida',
          eventoId: envio.eventoId,
          payload: { eventoId: envio.eventoId, retoId: envio.retoId, envioId: envio.id },
        });
      });
      await rm(enCuarentena, { force: true });
      return true;
    } catch (error) {
      if (error instanceof AppError) {
        // No es una imagen sana: no cuenta como intento.
        await this.rejectSistema(envio, error.code);
        await rm(enCuarentena, { force: true });
        return true;
      }
      this.logger.error(
        { envioId: envio.id, err: error instanceof Error ? error.message : String(error) },
        'No se pudo procesar una foto',
      );
      return false;
    }
  }

  private async rejectSistema(envio: Envio, codigo: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(archivos)
        .set({ estado: 'rechazado', motivoRechazo: codigo })
        .where(eq(archivos.id, envio.archivoId));
      await tx
        .update(enviosFoto)
        .set({
          estado: 'rechazada_sistema',
          motivoRechazo: MOTIVO_FOTO_ILEGIBLE,
          updatedAt: this.reloj.now(),
        })
        .where(and(eq(enviosFoto.id, envio.id), eq(enviosFoto.estado, 'recibida')));
      // La persona lo ve en su reto (T-301).
      await tx.insert(outbox).values({
        id: uuidv7(),
        tipo: 'foto.revisada',
        eventoId: envio.eventoId,
        payload: {
          eventoId: envio.eventoId,
          asistenteId: envio.asistenteId,
          envioId: envio.id,
          estado: 'rechazada_sistema',
        },
      });
    });
  }
}
