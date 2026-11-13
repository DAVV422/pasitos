# Reglas generales de desarrollo

> **Estado:** 📝 propuesta para revisar con el equipo · nomenclatura ✅ (D39) · **Última revisión:** 2026-11-13
> Reglas que valen para todo el código de Pasitos: API, apps web, trabajador y contrato. Las reglas propias de cada parte están en [Backend](02-backend.md), [Frontend](03-frontend.md) y [Respuestas y errores del API](04-respuestas-y-errores.md).
> Relacionados: [Stack tecnológico](../04-tecnico/09-stack-tecnologico.md) · [Glosario](../glosario.md) · [Decisiones](../decisiones.md)

## 1. Principios

1. **Simple antes que ingenioso.** Si hay dos formas de resolverlo, se elige la que entiende alguien que llega nuevo al equipo.
2. **Los puntos son dinero para el asistente.** Todo lo que toca el libro de movimientos se trata como código financiero: sin atajos, con tests y con revisión de otra persona.
3. **El servidor decide.** El frontend nunca calcula saldos, topes ni permisos por su cuenta; muestra lo que el API confirma.
4. **Una sola fuente de verdad.** Los tipos y las validaciones viven en `libs/dominio` y se comparten entre el API y las apps. No se copian.
5. **Fallar fuerte y temprano.** Una entrada inválida se rechaza en el borde (controlador o formulario), no a mitad de un proceso.
6. **Nada sin medir en `/app`.** Toda dependencia nueva en la app del asistente se justifica con su peso ([Rendimiento](../04-tecnico/08-rendimiento.md)).
7. **Seguro por defecto.** Ningún dato personal en logs, en Stellar ni en mensajes de error ([Amenazas y pruebas](../05-seguridad-legal/01-amenazas-y-pruebas.md)).

## 2. Nomenclatura (D39)

### 2.1 La regla: dominio en español, técnica en inglés

| Qué | Idioma | Ejemplos |
|---|---|---|
| **Sustantivos del dominio**: entidades, conceptos del negocio, estados | **Español** | `evento`, `reto`, `canje`, `movimiento`, `asistente`, `registrador`, `lote`, `huella` |
| **Verbos, sufijos y términos técnicos** | **Inglés** | `create`, `find`, `list`, `update`, `confirm`, `anchor`, `Service`, `Controller`, `Repository`, `Dto`, `Guard`, `is`, `has` |
| **Textos que ve el usuario** | **Español** | `"Canje confirmado"`, `"El QR ya venció"` |
| **Documentación y comentarios** | **Español** | |

Un nombre combina las dos partes en ese orden: **verbo técnico + sustantivo del dominio**.

| ✅ Bien | ❌ Mal | Por qué |
|---|---|---|
| `createCanje()` | `crearCanje()`, `createRedemption()` | El verbo va en inglés y el sustantivo del dominio en español |
| `CanjesService` | `ServicioCanjes` | El sufijo técnico va en inglés |
| `isRetoCompletado` | `esRetoCompletado`, `isChallengeDone` | Prefijo booleano en inglés, concepto en español |
| `findEventoBySlug()` | `buscarEventoPorSlug()` | `By`, `For`, `With` son técnicos |
| `estado: 'pendiente' \| 'confirmado'` | `status: 'pending'` | Los estados son del dominio |
| `anio`, `numero`, `contrasenaHash` → mejor `passwordHash` | `año`, `número` | Sin tildes ni ñ en identificadores. Si un término técnico existe en inglés (`password`, `email`, `token`), se usa en inglés |

**Si hay duda,** se busca el término en el glosario de la sección 2.3. Si no está, se agrega en el mismo *pull request*.

### 2.2 Formato de los nombres

| Elemento | Formato | Ejemplo |
|---|---|---|
| Variables, funciones, métodos, propiedades | `camelCase` | `saldoActual`, `confirmCanje()` |
| Clases, interfaces, tipos, enums | `PascalCase` | `CanjesService`, `MovimientoLibro` |
| Constantes globales | `UPPER_SNAKE_CASE` | `QR_ASISTENTE_TTL_SEGUNDOS` |
| Archivos y carpetas | `kebab-case` | `canjes.service.ts`, `mesa-canje/` |
| Tablas de la base | `snake_case`, **plural** | `eventos`, `movimientos`, `dispositivos` |
| Columnas | `snake_case` | `evento_id`, `puntos`, `created_at` |
| Rutas del API | `kebab-case`, sustantivos en plural | `/api/v1/eventos/:eventoId/retos` |
| Campos JSON | `camelCase` | `eventoId`, `createdAt` |
| Códigos de error | `UPPER_SNAKE_CASE`, en español | `SALDO_INSUFICIENTE`, `QR_VENCIDO` |
| Variables de entorno | `UPPER_SNAKE_CASE`, en inglés | `DATABASE_URL`, `STELLAR_RPC_URL` |
| Rust (contrato) | `snake_case` para funciones, `PascalCase` para tipos | `anchor(evento, n, huella_anterior, huella_nueva, conteos_por_reto)` |

**Nombres que se entienden solos:** `puntosPorReto` y no `ppr`; `asistente` y no `a`. Solo se abrevian `id`, `url`, `qr`, `api`, `db` y los índices de bucles cortos (`i`).

**Booleanos:** siempre con `is`, `has`, `can` o `should`: `isVinculado`, `hasCheckIn`, `canCanjear`.

**Columnas técnicas comunes** (en inglés, iguales en todas las tablas): `id`, `created_at`, `updated_at`, `created_by`.

### 2.3 Glosario de identificadores

| Concepto | Identificador | Tabla |
|---|---|---|
| Evento | `evento` | `eventos` |
| Reto | `reto` | `retos` |
| Premio o producto del catálogo | `premio` | `premios` |
| Canje | `canje` | `canjes` |
| Movimiento del libro | `movimiento` | `movimientos` |
| Lote anclado | `lote` | `lotes` |
| Huella (hash) | `huella` | — |
| Sello en Stellar (anclaje) | `anclaje` (verbo: `anchor`) | `anclajes` |
| Asistente | `asistente` | `asistentes` |
| Invitado (antes de vincular) | `invitacion` | `invitaciones` |
| Código de asistente (`A-0231`) | `codigoAsistente` | columna `codigo_asistente` |
| Dispositivo vinculado | `dispositivo` | `dispositivos` |
| Registrador | `registrador` | rol en `miembros_evento` |
| Organizador | `organizador` | rol en `miembros_evento` |
| Pantalla de sala o stand | `pantalla` | `pantallas` |
| Mesa de canje | `mesa` | `mesas` |
| Asistencia (check-in) | `checkIn` | `check_ins` |
| Alerta de seguridad | `alerta` | `alertas` |
| Bitácora | `bitacora` | `bitacora` |
| Reporte | `reporte` | `reportes` |
| Usuario del equipo | `usuario` | `usuarios` |
| Sesión | `session` (técnico) | `sessions` |

## 3. TypeScript

- **`strict: true`** en todos los proyectos, más `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`.
- **Prohibido `any`.** Si un dato viene de afuera y no se conoce, se tipa como `unknown` y se valida con Zod.
- **Tipos derivados de Zod:** `type Canje = z.infer<typeof canjeSchema>`. No se escribe a mano un tipo que ya tiene esquema.
- **`interface`** para formas de objetos públicas; **`type`** para uniones y derivados.
- **Uniones de texto en lugar de `enum`:** `type EstadoCanje = 'pendiente' | 'confirmado' | 'anulado'`, con su arreglo `as const` para validar.
- **Nada de `!`** (aserción de no nulo) salvo en tests.
- **Fechas:** siempre en UTC y en formato ISO 8601 en el API. Se convierten a la hora de Bolivia (`America/La_Paz`) solo al mostrar.
- **Dinero y puntos:** enteros (`number` entero o `bigint` en la base). Nunca decimales con coma flotante.
- **Imports:** por alias del monorepo (`@pasitos/dominio`), nunca con rutas relativas que salen del proyecto (`../../../libs`).

## 4. Código limpio

- **Funciones cortas y con un solo propósito.** Si una función necesita un comentario para explicar *qué* hace, se divide o se renombra.
- **Máximo 3 parámetros;** si hacen falta más, se pasa un objeto con nombre.
- **Retorno temprano** en lugar de `if` anidados.
- **Sin números mágicos:** `QR_SALA_TTL_SEGUNDOS = 30`, no `30` suelto.
- **Inmutabilidad:** `const` por defecto, `readonly` en propiedades, sin mutar argumentos.
- **Comentarios** solo para el *porqué* (una decisión, un límite, un enlace a la decisión `Dxx`). El *qué* lo dice el código.
- **Sin código muerto ni comentado.** Para eso está git.
- **`TODO`** solo con referencia a una tarea: `// TODO(HU-204): ...`.
- **Errores:** nunca se tragan (`catch {}` vacío está prohibido). Se manejan o se propagan ([Respuestas y errores](04-respuestas-y-errores.md)).

## 5. Formato y lint

Lo que se puede automatizar, no se discute en la revisión:

| Herramienta | Para qué |
|---|---|
| **Prettier** | Formato. Comillas simples, punto y coma, ancho 100 |
| **ESLint** (`typescript-eslint`, `@angular-eslint`, `@nx/enforce-module-boundaries`) | Reglas de código y límites entre proyectos |
| **`@typescript-eslint/naming-convention`** | Hace cumplir la sección 2.2 |
| **`cargo fmt` y `cargo clippy`** | Formato y lint del contrato |
| **commitlint** | Formato de los mensajes de commit (sección 6) |
| **`.githooks/pre-commit`** | Frena secretos y documentación interna ([docs/README.md](../README.md)) |

El CI falla si alguna de estas revisiones falla.

## 6. Git y revisión

**Ramas:**
- `main` está protegida: solo se cambia con un *pull request* aprobado y con el CI en verde.
- Ramas cortas, de días y no de semanas: `feat/HU-204-confirmar-canje`, `fix/HU-301-qr-vencido`, `chore/T-006-budgets`.

**Commits** con [Conventional Commits](https://www.conventionalcommits.org/), descripción en español:

```text
feat(canjes): confirmar canje con firma del dispositivo

Refs: HU-204
```

Tipos: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`. El alcance es el proyecto o el módulo (`api`, `app`, `canjes`, `contrato`).

**Pull requests:**
- Uno por historia o tarea, idealmente de menos de 400 líneas cambiadas.
- La descripción dice qué cambia, cómo se probó y enlaza la HU.
- **Al menos una aprobación.** Lo que toca el libro de movimientos, las firmas, el contrato o la autenticación necesita la aprobación de alguien que no lo escribió.

**Lista de revisión:**
- [ ] Cumple los criterios de aceptación de la HU.
- [ ] Tiene tests y pasan.
- [ ] Nombres según la sección 2.
- [ ] Errores con código del catálogo ([Respuestas y errores §4](04-respuestas-y-errores.md#43-catálogo-de-códigos)).
- [ ] Sin datos personales en logs.
- [ ] Si cambia el API, se actualizó el esquema en `libs/dominio`.
- [ ] Si toca `/app`, el peso sigue dentro del presupuesto.

## 7. Tests

| Nivel | Herramienta | Qué se prueba | Exigencia |
|---|---|---|---|
| Unitario | Vitest | Funciones del dominio, servicios, componentes | Obligatorio en `libs/dominio` y `libs/firmas` (cobertura ≥ 90 %) |
| Integración | Vitest + PostgreSQL real (Testcontainers) | Endpoints con la base, transacciones, topes | Obligatorio en cada endpoint que escribe |
| Extremo a extremo | Playwright | Flujos completos: vincular, ganar puntos, canjear | Los flujos de la Definición de terminado |
| Carga | k6 | Pico de la entrada y del canje | Antes de cada ensayo |
| Contrato | `cargo test` | Topes, orden de lotes, permisos | Cobertura total de las funciones públicas |

- Los tests se nombran con lo que prueban, en español: `it('rechaza el canje si el saldo no alcanza')`.
- **No se usan mocks de la base** para probar lógica de puntos: se prueba contra PostgreSQL real.
- Un bug que se arregla trae su test que lo reproduce.

## 8. Dependencias

- Antes de agregar una dependencia: ¿lo resuelve la plataforma (navegador, Node, Angular, NestJS)? ¿Tiene mantenimiento activo? ¿Cuánto pesa?
- Versiones fijas en el `pnpm-lock.yaml`. Renovate o Dependabot abren las actualizaciones; se revisan como cualquier PR.
- Prohibidas en `/app`: librerías de componentes completas, Moment.js, Lodash completo.

## 9. Reglas en cada proyecto

Cada proyecto del monorepo (`apps/*`, `libs/*`, `contracts/*`) tiene un `README.md` corto con:
1. qué es y quién lo usa;
2. cómo correrlo y probarlo;
3. sus reglas propias, si las tiene, con enlace a estas reglas generales.

En la raíz hay un `AGENTS.md` con el resumen de estas reglas, para quien programe con asistentes de IA.
