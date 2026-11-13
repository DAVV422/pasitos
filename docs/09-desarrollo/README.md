# Desarrollo

> **Estado:** 📝 propuesta para revisar con el equipo · **Última revisión:** 2026-11-13
> Reglas para escribir el código de Pasitos. Se aplican desde la fase 0 de la versión piloto.

| Documento | Qué define |
|---|---|
| [Reglas generales](01-reglas-generales.md) | Principios, **nomenclatura** (D39), TypeScript, código limpio, formato, git, revisión, tests y dependencias |
| [Backend](02-backend.md) | Estructura de NestJS, capas, patrones, reglas del libro de movimientos, seguridad, base de datos y logs |
| [Frontend](03-frontend.md) | Estructura de Angular, componentes, estado, comunicación con el API, manejo de errores, accesibilidad y rendimiento |
| [Respuestas y errores del API](04-respuestas-y-errores.md) | Formato de las respuestas, de los errores y de lo que queda en proceso; catálogo de códigos; idempotencia; SSE (D40) |

## Cómo se aplican

1. **Lo automatizable lo hace la máquina:** ESLint, Prettier, commitlint, budgets de Angular y `.githooks/pre-commit`. El CI falla si algo no cumple.
2. **Lo demás se revisa en el *pull request*** con la lista de [Reglas generales §6](01-reglas-generales.md#6-git-y-revisión).
3. **Cada proyecto** del monorepo tiene un `README.md` corto que enlaza aquí y agrega sus reglas propias, si tiene.
4. **Cambiar una regla** es un PR a estos documentos, revisado por el equipo. Si cambia una decisión (`Dxx`), se registra en [Decisiones](../decisiones.md).
