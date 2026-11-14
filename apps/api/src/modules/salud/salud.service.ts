import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DbService } from '../../infra/db/db.module';

@Injectable()
export class SaludService {
  private readonly logger = new Logger(SaludService.name);

  constructor(private readonly dbService: DbService) {}

  async isBaseDisponible(): Promise<boolean> {
    try {
      await this.dbService.db.execute(sql`select 1`);
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'La base no responde');
      return false;
    }
  }

  /**
   * Segundos desde el último lote que entró en Stellar (HU-104 §4), o null si todavía no hay.
   * Pasa por una función de la base: el rol del API no lee transacciones_stellar.
   */
  async getUltimoAnclajeSegundos(): Promise<number | null> {
    try {
      const filas = await this.dbService.db.execute<{ segundos: number | null }>(
        sql`select segundos_desde_ultimo_anclaje() as segundos`,
      );
      return filas.rows[0]?.segundos ?? null;
    } catch (error) {
      this.logger.warn({ err: error }, 'No se pudo leer el último anclaje');
      return null;
    }
  }
}
