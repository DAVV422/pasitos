# Respuestas y errores del API

> **Estado:** ✅ vigente (D40) · **Última revisión:** 2026-11-13
> Cómo responde el API cuando una operación sale bien, cuando queda en proceso y cuando falla, y cómo lo maneja cada lado. Es el contrato entre [Backend](02-backend.md) y [Frontend](03-frontend.md).

## 1. Principios

1. **El código de estado HTTP dice qué pasó.** Nunca se responde `200` con un error adentro.
2. **Las respuestas exitosas devuelven el recurso directamente**, sin envoltorio (`{ data: ... }`).
3. **Los errores siguen un solo formato** para todo el API: *Problem Details* ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)), con un **código propio** del catálogo.
4. **El cliente decide por código, no por texto.** Los textos pueden cambiar; los códigos no.
5. **Ningún error expone detalles internos:** ni trazas, ni SQL, ni nombres de tablas, ni datos de otras personas.
6. **Las operaciones que mueven puntos son idempotentes:** repetirlas no duplica nada.

### 1.1 ¿Envolver las respuestas exitosas? (D40 ✅: opción A)

Hay tres opciones comunes:

| Opción | Cómo se ve | A favor | En contra |
|---|---|---|---|
| **A · Recurso directo** (propuesta) | `{ "id": "...", "estado": "confirmado" }` | Es lo que hacen los API públicos grandes (GitHub, Stripe) y es lo que recomienda HTTP: el código de estado ya dice cómo salió | Si un día hay que agregar metadatos a una respuesta que no los tenía, cambia su forma |
| **B · Envoltorio mínimo** | `{ "data": { ... }, "meta": { ... } }` | Todas las respuestas tienen la misma forma; los metadatos (paginación, avisos) tienen su lugar sin romper nada | Un nivel más en cada respuesta, sin información nueva |
| **C · Envoltorio clásico** | `{ "status": 200, "success": true, "message": "Canje realizado", "data": { ... } }` | Muy usado en proyectos NestJS y Express; el equipo lo conoce | `status` y `success` repiten lo que ya dice HTTP y pueden contradecirlo (`200` con `success: false`). `message` pone en el backend textos que son del frontend |

**Decisión:** A. **C se descartó porque:**
- El texto que ve la persona lo decide el frontend según el código (`libs/dominio/textos`). Un `message` del backend termina mostrándose tal cual o ignorándose.
- `status` dentro del cuerpo puede no coincidir con el estado HTTP.

En cualquiera de las tres, **los errores siguen el formato de §4**.

## 2. Formato general

- JSON en UTF-8. Campos en `camelCase`.
- **Fechas** en ISO 8601 UTC: `"2026-11-21T14:05:00.000Z"`.
- **Ids** como texto (UUID v7). **Puntos** como enteros.
- Campos opcionales sin valor: se omiten o van en `null`, según el esquema; nunca `""` para decir "no hay".
- **Versión** en la ruta: `/api/v1/...`. Agregar campos no cambia la versión; quitar o cambiar el significado de un campo sí.
- Cada respuesta lleva el header `X-Request-Id` con el `traceId`.

## 3. Respuestas exitosas

| Situación | Estado | Cuerpo |
|---|---|---|
| Consulta de un recurso | `200 OK` | El recurso |
| Consulta de una lista | `200 OK` | `{ items, pagination }` |
| Creación | `201 Created` | El recurso creado + header `Location` |
| Acción sobre un recurso (confirmar, anular, marcar asistencia) | `200 OK` | El recurso en su nuevo estado |
| Tarea que sigue en segundo plano (reporte, exportación) | `202 Accepted` | La operación y dónde consultarla (§7) |
| Acción sin nada que devolver (cerrar sesión) | `204 No Content` | Vacío |

**Un recurso:**

```http
POST /api/v1/eventos/01JF.../canjes/01JG.../confirmar
Idempotency-Key: 9b2f6c1e-3d4a-4f6b-9a7e-2c1d0e8f7a6b
```

```json
{
  "id": "01JG8Z3K2M7Q9R4T6V8X0Y2A4C",
  "comprobante": "C-4821",
  "estado": "confirmado",
  "premio": { "id": "01JF...", "nombre": "Café" },
  "puntos": 30,
  "saldo": 50,
  "createdAt": "2026-11-21T14:05:00.000Z"
}
```

**Una lista** (paginación por cursor):

```json
{
  "items": [ { "id": "...", "nombre": "Charla de apertura", "puntos": 20 } ],
  "pagination": { "limit": 20, "nextCursor": "eyJpZCI6IjAxSkYuLi4ifQ" }
}
```

`nextCursor` es `null` cuando no hay más páginas. Se pide la siguiente con `?cursor=...&limit=20` (máximo 100).

## 4. Errores

### 4.1 Formato

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json
X-Request-Id: 01JG8Z5W1B3D5F7H9K1M3P5R7T
```

```json
{
  "type": "urn:pasitos:error:saldo-insuficiente",
  "title": "Saldo insuficiente",
  "status": 409,
  "code": "SALDO_INSUFICIENTE",
  "detail": "Te faltan 10 puntos para este canje.",
  "traceId": "01JG8Z5W1B3D5F7H9K1M3P5R7T",
  "meta": { "faltan": 10 }
}
```

| Campo | Qué es | Siempre |
|---|---|---|
| `type` | Identificador del tipo de error. Cuando exista el dominio, será una URL a su documentación | Sí |
| `title` | Nombre corto del error, igual para todas las veces que ocurre | Sí |
| `status` | El mismo código HTTP | Sí |
| `code` | **Código del catálogo** (§4.3). Es lo que usa el cliente | Sí |
| `detail` | Explicación para la persona, en español, sin datos internos | Sí |
| `traceId` | Para encontrar el caso en los logs | Sí |
| `errors` | Lista de errores por campo, solo en `VALIDACION` | No |
| `meta` | Datos útiles para la pantalla (`faltan`, `reintentarEn`) | No |

**Error de validación:**

```json
{
  "type": "urn:pasitos:error:validacion",
  "title": "Datos inválidos",
  "status": 400,
  "code": "VALIDACION",
  "detail": "Revisa los campos marcados.",
  "traceId": "01JG...",
  "errors": [
    { "field": "nombre", "code": "REQUERIDO", "message": "Escribe el nombre del asistente." },
    { "field": "email", "code": "FORMATO_INVALIDO", "message": "El correo no tiene un formato válido." }
  ]
}
```

### 4.2 Qué código HTTP corresponde

| Estado | Cuándo | Ejemplos de `code` |
|---|---|---|
| `400` | La entrada no cumple el esquema | `VALIDACION` |
| `401` | No hay sesión o venció | `NO_AUTENTICADO`, `SESION_VENCIDA`, `CREDENCIALES_INVALIDAS` |
| `403` | Hay sesión, pero no tiene permiso | `SIN_PERMISO`, `DISPOSITIVO_NO_VINCULADO`, `FIRMA_INVALIDA` |
| `404` | No existe, **o existe pero es de otro evento** (no se revela) | `NO_ENCONTRADO` |
| `409` | Choca con el estado actual | `SALDO_INSUFICIENTE`, `RETO_YA_COMPLETADO`, `PREMIO_AGOTADO`, `INVITACION_YA_USADA`, `IDEMPOTENCIA_CONFLICTO` |
| `422` | Está bien formado, pero una regla del negocio no lo permite | `EVENTO_CERRADO`, `SIN_CHECK_IN`, `QR_VENCIDO`, `TOPE_ALCANZADO`, `LIMITE_REGISTRO_ALCANZADO` |
| `429` | Demasiados intentos (con header `Retry-After`) | `DEMASIADOS_INTENTOS` |
| `500` | Error inesperado | `ERROR_INTERNO` |
| `503` | Una dependencia no está disponible o hay mantenimiento | `SERVICIO_NO_DISPONIBLE` |

### 4.3 Catálogo de códigos

El catálogo vive en **`libs/dominio/errores.ts`** y es la única fuente: de ahí salen el estado HTTP, el `title` y el texto por defecto. Agregar un código es parte del PR que lo usa.

| Código | Estado | Texto para la persona |
|---|---|---|
| **Generales** | | |
| `VALIDACION` | 400 | Revisa los campos marcados. |
| `NO_ENCONTRADO` | 404 | No encontramos lo que buscas. |
| `DEMASIADOS_INTENTOS` | 429 | Espera un momento e intenta de nuevo. |
| `ERROR_INTERNO` | 500 | Algo salió mal. Intenta de nuevo. |
| `SERVICIO_NO_DISPONIBLE` | 503 | El servicio no está disponible en este momento. |
| `IDEMPOTENCIA_CONFLICTO` | 409 | Esta operación ya se envió con otros datos. |
| **Equipo y sesión** | | |
| `NO_AUTENTICADO` | 401 | Inicia sesión para continuar. |
| `SESION_VENCIDA` | 401 | Tu sesión venció. Inicia sesión de nuevo. |
| `CREDENCIALES_INVALIDAS` | 401 | El correo o la contraseña no son correctos. |
| `SIN_PERMISO` | 403 | No tienes permiso para esto. |
| **Acceso del asistente** | | |
| `INVITACION_YA_USADA` | 409 | Esta invitación ya se abrió en otro celular. Pide ayuda en la puerta. |
| `INVITACION_REVOCADA` | 422 | Este acceso ya no es válido. Pide uno nuevo en la puerta. |
| `QR_ASISTENTE_VENCIDO` | 422 | El código venció. Pide al registrador que lo genere de nuevo. |
| `NAVEGADOR_NO_SOPORTADO` | 422 | Abre el enlace en Chrome o Safari, no dentro de otra app. |
| `DISPOSITIVO_NO_VINCULADO` | 403 | Este celular no tiene tu acceso. Pídelo en la puerta. |
| `FIRMA_INVALIDA` | 403 | No pudimos verificar tu celular. Pide ayuda en la puerta. |
| `SIN_CHECK_IN` | 422 | Primero marca tu asistencia en la puerta. |
| **Puerta** | | |
| `LIMITE_REGISTRO_ALCANZADO` | 422 | Se alcanzó el límite de registros en puerta. |
| `ASISTENTE_YA_REGISTRADO` | 409 | Esta persona ya está registrada en el evento. |
| **Archivos** ([Subida de archivos §6](../04-tecnico/10-subida-de-archivos.md#6-errores)) | | |
| `ARCHIVO_MUY_GRANDE` | 413 | El archivo supera el tamaño máximo. |
| `ARCHIVO_TIPO_NO_PERMITIDO` | 422 | Este tipo de archivo no está permitido. Usa PNG, JPEG o WebP. |
| `ARCHIVO_CORRUPTO` | 422 | No pudimos abrir el archivo. Puede estar dañado. |
| `ARCHIVO_INFECTADO` | 422 | El archivo no pasó el control de seguridad. |
| `ARCHIVO_INVALIDO` | 400 | El archivo no cumple los requisitos. |
| **Retos y puntos** | | |
| `QR_VENCIDO` | 422 | Este QR ya venció. Escanea el que se ve ahora en la pantalla. |
| `QR_INVALIDO` | 422 | Este QR no es de Pasitos o no es de este evento. |
| `RETO_YA_COMPLETADO` | 409 | Ya completaste este reto. |
| `RETO_NO_DISPONIBLE` | 422 | Este reto no está activo ahora. |
| `TOPE_ALCANZADO` | 422 | Este reto ya entregó todos sus premios. |
| **Canjes** | | |
| `SALDO_INSUFICIENTE` | 409 | Te faltan puntos para este canje. |
| `PREMIO_AGOTADO` | 409 | Este premio se agotó. |
| `CANJE_VENCIDO` | 422 | El cobro venció. Pide que generen uno nuevo. |
| `CANJE_YA_CONFIRMADO` | 409 | Este canje ya se confirmó. |
| **Evento** | | |
| `EVENTO_CERRADO` | 422 | El evento ya cerró. Los puntos vencieron. |
| `EVENTO_NO_INICIADO` | 422 | El evento todavía no empezó. |

## 5. Del lado del backend

- Los servicios lanzan **`AppError`** con un código del catálogo y, si hace falta, `meta`:

  ```ts
  throw new AppError('SALDO_INSUFICIENTE', { meta: { faltan: costo - saldo } });
  ```

- Un **`ProblemDetailsFilter` global** convierte todo en la respuesta de §4.1:

| Lo que llega al filtro | Lo que responde |
|---|---|
| `AppError` | Su código, estado y texto del catálogo |
| Error de Zod (entrada inválida) | `400 VALIDACION` con `errors[]` |
| `HttpException` de NestJS o Fastify (por ejemplo, ruta inexistente) | Su estado, con el código general que corresponda |
| Cualquier otro error | `500 ERROR_INTERNO`. Se registra con su traza en los logs y en Sentry; al cliente solo le llega el mensaje genérico |

- **Recursos de otro evento:** se responde `404 NO_ENCONTRADO`, no `403`, para no revelar que existen.
- **Login:** el mismo `CREDENCIALES_INVALIDAS` si el correo no existe o si la contraseña está mal.

## 6. Operaciones que mueven puntos: idempotencia

Ganar puntos, confirmar un canje, hacer un ajuste y registrar en la puerta llevan el header **`Idempotency-Key`** (un UUID que genera el cliente por cada intento del usuario).

| Caso | Respuesta |
|---|---|
| Primera vez | Se procesa y se guarda la respuesta junto con la clave (24 h) |
| Misma clave y mismo cuerpo | **Se devuelve la respuesta guardada**, sin procesar de nuevo |
| Misma clave, otro cuerpo | `409 IDEMPOTENCIA_CONFLICTO` |
| La primera todavía se está procesando | `409 IDEMPOTENCIA_CONFLICTO` con `meta.enProceso: true`; el cliente reintenta en 1 s |
| Sin la clave | `400 VALIDACION` |

Así, si el celular pierde la señal justo al confirmar, el reintento devuelve el mismo canje en lugar de cobrar dos veces.

## 7. Operaciones en segundo plano

Lo que tarda más de un segundo (generar el reporte, exportar invitados, enviar invitaciones masivas) **no se espera en el request**:

```http
POST /api/v1/eventos/01JF.../reportes
→ 202 Accepted
Location: /api/v1/operaciones/01JH...
```

```json
{ "id": "01JH...", "tipo": "build-reporte", "estado": "en_proceso", "createdAt": "..." }
```

`GET /api/v1/operaciones/:id` devuelve el estado:

| `estado` | Qué trae |
|---|---|
| `en_proceso` | `progreso` opcional (0–100) |
| `completada` | `resultado` (por ejemplo, la URL del reporte) |
| `fallida` | `error` con el mismo formato de §4.1 |

El panel también recibe el cambio por SSE, sin tener que consultar a cada rato.

## 8. Eventos en vivo (SSE)

- Endpoint por app: `GET /api/v1/eventos/:eventoId/en-vivo`.
- Nombre del evento: `<dominio>.<participio>`, en español: `canje.confirmado`, `asistencia.registrada`, `reto.completado`, `lote.anclado`, `alerta.creada`.
- Datos en JSON con el mismo formato que las respuestas del API.
- Cada mensaje lleva `id:` para que el navegador retome desde el último recibido si se corta la conexión.

```text
id: 01JG8Z...
event: canje.confirmado
data: {"canjeId":"01JG...","comprobante":"C-4821","mesaId":"01JF..."}
```

## 9. Del lado del frontend

El resumen está en [Frontend §5](03-frontend.md#5-manejo-de-respuestas-y-errores):

- El `erroresInterceptor` convierte toda respuesta de error, la falta de red y el tiempo agotado en un **`ErrorApi`** (`code`, `status`, `detail`, `traceId`, `errors`, `meta`). La falta de red usa el código local `SIN_CONEXION`.
- La pantalla elige qué hacer según el **código**; el texto sale de `libs/dominio/textos/errores.ts`.
- Si llega un código que la app no conoce, muestra el `detail` del servidor y el código de soporte.
