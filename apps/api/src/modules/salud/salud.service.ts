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
}
