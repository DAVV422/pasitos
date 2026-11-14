# Reglas para programar en Pasitos

Resumen de una página para quien programa en este repositorio, también con asistentes de IA. El detalle está en [docs/09-desarrollo/](docs/09-desarrollo/README.md); si algo de aquí no coincide, manda ese documento.

## Antes de empezar

- Node **24.15 o superior** (ver `.node-version`), pnpm y Docker.
- `pnpm install` y `git config core.hooksPath .githooks` (revisa secretos y el formato de los commits).
- Todo en español: documentación, comentarios, textos de la app y descripciones de los commits.

## Nombres (D39)

- **Conceptos del negocio en español; verbos y términos técnicos en inglés:** `createCanje()`, `CanjesService`, `findEventoBySlug()`, `isVinculado`. Nunca `crearCanje()` ni `createRedemption()`.
- Sin tildes ni ñ en identificadores (`anio`, `contrasena` → mejor `password`).
- Tablas en plural y `snake_case` (`eventos`, `check_ins`); columnas en `snake_case`; JSON en `camelCase`; códigos de error en `UPPER_SNAKE_CASE` y en español (`SALDO_INSUFICIENTE`).
- Glosario de identificadores: [Reglas generales §2.3](docs/09-desarrollo/01-reglas-generales.md#23-glosario-de-identificadores).

## Backend (NestJS + Fastify)

- Capas: **controller** (HTTP y validación) → **service** (caso de uso, transacción, reglas) → **repository** (solo Drizzle). Las reglas puras van en `libs/dominio`.
- Los servicios lanzan `AppError('CODIGO')`, nunca `HttpException`. El `ProblemDetailsFilter` arma la respuesta.
- **Toda consulta a tablas de una organización pasa por `withOrganizacion()`** (RLS, D47). Sin eso, la base no devuelve nada.
- El libro de movimientos y la bitácora **solo agregan filas**.
- Nada de `console.log` (usar el logger) ni de `process.env` fuera de `config/`.

## Frontend (Angular zoneless)

- Componentes standalone, `OnPush`, `input()`/`output()`, `inject()`, `@if`/`@for`.
- Componentes base en `@pasitos/ui` (`px-…`); colores y medidas **solo** con los tokens (Stylelint lo hace cumplir).
- Ningún componente usa `HttpClient` directo; los textos de error salen de `libs/dominio`; el saldo de puntos lo confirma el servidor.
- Tema claro por defecto (D36); toda pantalla con sus estados: cargando, vacío, error y listo.

## Respuestas del API (D40)

- Éxito: el recurso directo, sin envoltorio. Listas: `{ items, pagination }`.
- Error: Problem Details (`application/problem+json`) con `code` del catálogo de `libs/dominio`.
- Lo que mueve puntos lleva `Idempotency-Key`.

## Datos personales

- Nunca en logs, en Sentry, en Stellar ni en mensajes de error. Los datos de prueba son inventados (`@example.com`).

## Commits y PR

- Conventional Commits con descripción en español: `feat(canjes): confirmar canje con firma del dispositivo`.
- Antes de abrir un PR: `pnpm verificar`.
