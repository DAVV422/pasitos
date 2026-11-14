import './instrument';
import type { IncomingMessage } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { resolveTraceId } from './common/observabilidad/trace-id';
import { loadAppConfig } from './config/app.config';

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();

  const adapter = new FastifyAdapter({
    // traceId de cada request (T-005 §2): el X-Request-Id que manda la app, o uno nuevo.
    genReqId: (request: IncomingMessage) => resolveTraceId(request.headers['x-request-id']),
    // Detrás de Caddy y Cloudflare (Infraestructura §4.2).
    trustProxy: true,
    bodyLimit: 1_048_576,
  });
  adapter.getInstance().addHook('onSend', async (request, reply) => {
    void reply.header('X-Request-Id', request.id);
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forConfig(config),
    adapter,
    {
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  await app.listen(config.PORT, '0.0.0.0');

  // Aviso a Nx de que el servidor está listo (nx serve).
  if (process.env['NX_READY_SIGNAL_SOCKET']) {
    try {
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js no está instalado
    }
  }
  app.get(Logger).log(`API escuchando en http://localhost:${config.PORT}/api/v1`);
}

void bootstrap();
