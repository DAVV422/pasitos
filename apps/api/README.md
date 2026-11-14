# API (`/api/v1`)

NestJS sobre Fastify. Logs con `traceId`, errores en formato Problem Details, Sentry y `GET /api/v1/salud`. Lee `.env` (ver `.env.example`).

## Comandos

| Comando | Qué hace |
|---|---|
| `nx serve api` | Arranca en desarrollo (lee `.env`) |
| `nx build api` | Build de producción |
| `nx test api` | Tests |
| `nx lint api` | Lint |
| `pnpm plataforma intervalo --evento <slug> --minutos <n\|plataforma> --motivo "…"` | Acción de la consola de plataforma mientras no existe (HU-105): cambia el intervalo de anclaje con `pasitos_sistema` y lo deja en la bitácora |

`GET /api/v1/salud` informa `ultimoLoteConfirmadoHace`: los segundos desde el último lote anclado en Stellar (HU-104), sin datos del evento.

## Reglas

Las del repositorio: [AGENTS.md](../../AGENTS.md) y [docs/09-desarrollo/](../../docs/09-desarrollo/README.md).
