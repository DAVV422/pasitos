# Reglas del frontend (Angular)

> **Estado:** 📝 propuesta para revisar con el equipo · **Última revisión:** 2026-11-13
> Estructura, componentes, estado, manejo de respuestas y errores, y reglas de las apps web (`app`, `sala`, `mesa`, `admin`, `plataforma`, `sitio`). Antes de leer esto: [Reglas generales](01-reglas-generales.md).
> Relacionados: [Stack §3](../04-tecnico/09-stack-tecnologico.md#3-frontend-por-qué-angular) · [Design system](../06-diseno/02-design-system.md) · [Rendimiento](../04-tecnico/08-rendimiento.md) · [Respuestas y errores del API](04-respuestas-y-errores.md)

## 1. Estructura

### 1.1 Dentro de una app

```text
apps/app/src/app/
├─ app.config.ts            # Providers: router, HttpClient, interceptores, zoneless
├─ app.routes.ts            # Rutas con carga diferida por feature
├─ core/                    # Una sola instancia en toda la app
│  ├─ api/                  # Clientes del API tipados (eventos.api.ts, canjes.api.ts)
│  ├─ interceptors/         # traceId, credenciales, errores, idempotencia
│  ├─ errors/               # ErrorApi, GlobalErrorHandler, textos por código
│  ├─ auth/                 # Sesión del asistente o del equipo
│  └─ dispositivo/          # Llave WebCrypto y firma (solo /app)
├─ features/                # Una carpeta por pantalla o flujo del usuario
│  ├─ inicio/
│  ├─ escanear/
│  ├─ canje/
│  │  ├─ canje.page.ts          # Contenedor: conecta el store con la vista
│  │  ├─ canje.store.ts         # Estado de la feature con signals
│  │  ├─ canje-resumen.component.ts
│  │  └─ canje.page.spec.ts
│  └─ mi-cuenta/
└─ shared/                  # Compartido solo dentro de esta app
```

- Lo que comparten varias apps va a `libs/`: componentes y tokens en `libs/ui`, esquemas y textos en `libs/dominio`, firmas en `libs/firmas`.
- **Reglas de límites (Nx):** una app no importa de otra app; `libs/ui` no importa de `features/`; `/app` no puede importar nada marcado como `scope:panel`.

### 1.2 Nombres de archivos

Se mantienen los sufijos por tipo, para que el rol de cada archivo se vea en el nombre y coincida con el backend:

| Tipo | Archivo | Clase |
|---|---|---|
| Página (contenedor de una ruta) | `canje.page.ts` | `CanjePage` |
| Componente de presentación | `canje-resumen.component.ts` | `CanjeResumenComponent` |
| Store de una feature | `canje.store.ts` | `CanjeStore` |
| Cliente del API | `canjes.api.ts` | `CanjesApi` |
| Servicio | `dispositivo.service.ts` | `DispositivoService` |
| Guard funcional | `check-in.guard.ts` | `checkInGuard` |
| Interceptor funcional | `errores.interceptor.ts` | `erroresInterceptor` |
| Pipe | `puntos.pipe.ts` | `PuntosPipe` |

- Selectores con prefijo por app: `px-` en `libs/ui` (`px-boton`), `app-`, `mesa-`, `adm-` en cada app.
- El generador de Angular se configura en `angular.json` para crear los archivos con estos sufijos.

## 2. Componentes

- **Standalone** siempre, sin `NgModule`.
- **Zoneless** con `ChangeDetectionStrategy.OnPush` en todos los componentes.
- **APIs con signals:** `input()`, `output()`, `model()`, `viewChild()`. No se usan `@Input()` ni `@Output()`.
- **`inject()`** en lugar de inyectar por el constructor.
- **Control de flujo nuevo:** `@if`, `@for` (con `track` por id), `@switch`, `@defer`.
- **Dos tipos de componente:**

| Página (`*.page.ts`) | Componente de presentación (`*.component.ts`) |
|---|---|
| Está asociada a una ruta | Se usa dentro de páginas u otros componentes |
| Usa el store y los servicios | Solo recibe `input()` y emite `output()` |
| Decide qué mostrar según el estado | No sabe de dónde vienen los datos |
| Pocas por feature | Reutilizable y fácil de probar |

- **Plantillas simples:** sin lógica en el HTML. Si una expresión no es trivial, se mueve a un `computed()`.
- **Un componente, un archivo.** Plantillas de más de ~60 líneas van en un `.html` aparte.
- **Sin manipular el DOM** directamente (`document.querySelector`). Si hace falta, `viewChild()` y `Renderer2`.

## 3. Estado

| Tipo de estado | Dónde vive | Herramienta |
|---|---|---|
| De un componente (abierto/cerrado, pestaña) | El componente | `signal()` |
| De una feature (canje en curso, lista de retos) | `*.store.ts` con `providedIn` en la ruta | `signal()`, `computed()` |
| De la app (sesión, evento actual, saldo) | Servicio en `core/` | `signal()` |
| Datos del servidor en vivo (saldo, asistencia) | Store + SSE | RxJS → `toSignal()` |
| Formularios | El formulario | Formularios reactivos tipados |

- **Signals para el estado, RxJS para flujos** (HTTP, SSE, temporizadores). En el borde se convierte con `toSignal()` o `rxResource()`.
- **Sin NgRx** en el piloto. Si un panel lo necesita más adelante, se decide con una nueva entrada en [Decisiones](../decisiones.md).
- **El saldo de puntos lo confirma el servidor.** Nunca se suma ni se resta en el cliente antes de la respuesta (sin actualizaciones optimistas en puntos ni canjes).
- **Suscripciones:** `takeUntilDestroyed()` o `toSignal()`; nunca `subscribe()` sin cierre.

## 4. Comunicación con el API

- **Un cliente por recurso** en `core/api/` (`CanjesApi`), con métodos tipados con los esquemas de `libs/dominio`.
- Los componentes **no usan `HttpClient` directamente**; usan el cliente o el store.
- **Interceptores, en este orden:**
  1. `traceIdInterceptor`: agrega `X-Request-Id`.
  2. `credencialesInterceptor`: `withCredentials` para la cookie de sesión (no hay tokens en `localStorage`).
  3. `idempotenciaInterceptor`: agrega `Idempotency-Key` a las operaciones que mueven puntos.
  4. `erroresInterceptor`: convierte cualquier error en un `ErrorApi` ([§5](#5-manejo-de-respuestas-y-errores)).
- **Validar lo que llega** en desarrollo y en los paneles con Zod. En `/app` se usa `zod/mini` para cuidar el peso.
- **Reintentos:** solo en `GET` y en operaciones con `Idempotency-Key`, con espera creciente y máximo 2 intentos.

## 5. Manejo de respuestas y errores

### 5.1 Toda pantalla tiene cuatro estados

| Estado | Qué ve la persona |
|---|---|
| **Cargando** | Esqueleto o indicador. Si tarda más de 3 s: *"Esto está tardando más de lo normal…"* |
| **Vacío** | Mensaje claro y la acción siguiente (*"Todavía no completaste retos. Escanea el QR de una charla."*) |
| **Error** | Qué pasó, en palabras simples, y qué hacer (reintentar, ir a la puerta) |
| **Listo** | El contenido |

Se modela con un tipo, no con varios booleanos sueltos:

```ts
type Estado<T> =
  | { tipo: 'cargando' }
  | { tipo: 'vacio' }
  | { tipo: 'error'; error: ErrorApi }
  | { tipo: 'listo'; datos: T };
```

### 5.2 Mientras se procesa una acción

- El botón se **deshabilita** y muestra que se está procesando (*"Confirmando…"*). Nunca se puede tocar dos veces.
- Si no hay respuesta en **5 s**, se muestra *"Revisando tu canje…"* y se consulta el resultado con la misma `Idempotency-Key`, sin crear otro canje.
- Al terminar: confirmación visible (pantalla de éxito, vibración corta si el equipo lo permite) y el saldo que **devolvió el servidor**.

### 5.3 Qué hacer con cada error

El `erroresInterceptor` entrega siempre un `ErrorApi` con `code`, `status`, `detail`, `traceId` y, en validaciones, `errors[]`. La pantalla decide por **código**, nunca por el texto:

| Situación | Qué hace la app |
|---|---|
| `VALIDACION` (400) | Muestra cada mensaje debajo de su campo |
| `NO_AUTENTICADO`, `SESION_VENCIDA` (401) | Equipo: vuelve al login conservando la ruta. Asistente: pantalla *"Tu acceso no está activo. Pídelo de nuevo en la puerta."* |
| `SIN_PERMISO` (403) | Pantalla *"No tienes permiso para esto"*, sin detalles técnicos |
| Error de negocio conocido (409, 422: `SALDO_INSUFICIENTE`, `QR_VENCIDO`, `RETO_YA_COMPLETADO`…) | Mensaje propio del código desde `libs/dominio/textos`, con la acción que corresponda |
| `DEMASIADOS_INTENTOS` (429) | Espera el tiempo de `Retry-After` y lo dice: *"Espera 30 segundos e intenta de nuevo"* |
| Sin conexión o tiempo agotado | Aviso *"Sin conexión"*, botón reintentar con la misma `Idempotency-Key` |
| 5xx o código desconocido | *"Algo salió mal. Intenta de nuevo."* + **código de soporte** (los primeros 8 caracteres del `traceId`) para que el registrador lo reporte |

- **Errores inesperados del frontend** pasan por un `GlobalErrorHandler` que los envía a Sentry (sin datos personales) y muestra el mensaje genérico.
- **Los textos de error no se escriben en los componentes.** Viven en `libs/dominio/textos/errores.ts`, uno por código.

## 6. Formularios

- **Formularios reactivos tipados** (`FormGroup<{...}>`, `nonNullable`).
- Las reglas de validación salen del **mismo esquema Zod** que usa el API; el mensaje se muestra al salir del campo o al enviar.
- El botón de enviar se deshabilita mientras se procesa, no mientras el formulario es inválido (al tocarlo se muestran los errores).

## 7. Estilos y diseño

- **Tailwind v4** con los tokens del [Design system](../06-diseno/02-design-system.md) como variables CSS. Sin colores ni tamaños sueltos (`#F59E0B`, `13px`).
- **Tema claro por defecto** (D36). Todo color sale de un token, para que el tema oscuro (P3) sea solo cambiar variables.
- Componentes base (`px-boton`, `px-tarjeta`, `px-campo`) en `libs/ui`. Antes de crear uno nuevo, se revisa si ya existe.

## 8. Accesibilidad

Objetivo **WCAG 2.2 nivel AA**. En los eventos hay personas mayores y celulares con pantallas chicas:

- Áreas táctiles de **48 × 48 px** como mínimo y una acción principal por pantalla.
- Contraste mínimo 4.5:1 en textos.
- Todo campo con `<label>`; todo ícono que funciona como botón con `aria-label`.
- Se puede usar con teclado en los paneles; foco visible siempre.
- Respeta `prefers-reduced-motion`.
- Los mensajes de error y de éxito se anuncian (`aria-live`).

## 9. Rendimiento

- **Budgets en `angular.json`** que hacen fallar el build (T-006). `/app`: ≤ 250 KB comprimidos en la primera carga.
- **Rutas con carga diferida** y `@defer` para la cámara, el lector de QR y lo que no se ve al entrar.
- Imágenes con `NgOptimizedImage`, en WebP o AVIF y con tamaño definido.
- Una sola familia tipográfica, con subconjunto de caracteres, o la del sistema.
- En `/app`, `/sala` y `/mesa`: sin librerías de componentes; Angular CDK solo en los paneles.

## 10. Seguridad

- Sin `innerHTML` con contenido que no se controla. Si es necesario, pasa por el sanitizador de Angular.
- La sesión va en cookie `HttpOnly`; **nada sensible en `localStorage`**.
- La llave del dispositivo es WebCrypto **no exportable** y vive en IndexedDB (Acceso del asistente *(interno)*).
- Compatible con una CSP estricta: sin scripts ni estilos en línea.

## 11. Sitio público (`apps/sitio`)

- **Prerender** para la landing y los términos; **SSR** para `/eventos` y `/eventos/:slug`.
- Cada página con título, descripción y etiquetas para compartir (Open Graph).
- Las páginas de eventos con visibilidad *Solo con enlace* llevan `noindex`.

## 12. Tests

- **Stores y servicios:** unitarios con Vitest.
- **Componentes de presentación:** se prueban sus entradas y salidas con Angular Testing Library.
- **Flujos completos:** Playwright, en un viewport de celular y con red lenta simulada.
- Cada estado de la sección 5.1 tiene al menos un test en las pantallas principales.

## 13. Lo que no se hace

- ❌ `HttpClient` en un componente.
- ❌ Calcular saldos, topes o permisos en el cliente.
- ❌ Textos de error escritos a mano en un componente.
- ❌ `subscribe()` sin cierre.
- ❌ Colores o medidas fuera de los tokens.
- ❌ Librerías pesadas en `/app` sin medir su peso.

## 14. Navegadores soportados (D42)

| Navegador | Versión mínima | Equipos que cubre |
|---|---|---|
| Chrome (Android y computadora) | **111** | Android 7 o superior con Chrome actualizado |
| Safari (iPhone, iPad y Mac) | **16.4** | iPhone 8 o posterior con iOS 16.4 o superior |
| Samsung Internet | **22** | Celulares Samsung con el navegador actualizado |
| Edge | **111** | Computadoras con Windows |
| Firefox | **128** | Computadoras y Android |

**Por qué esas versiones:** son las mínimas de Tailwind CSS v4 (usa `@property`, `color-mix()` y capas de cascada) y cubren todo lo demás que necesita Pasitos: WebCrypto con llaves P-256 no exportables, IndexedDB, `navigator.storage.persist()`, SSE y service worker.

**Qué pasa fuera de la lista:**
- En un navegador más viejo, la app muestra *"Tu navegador es muy antiguo. Actualízalo o usa Chrome o Safari."* antes de vincular el celular.
- Los **navegadores dentro de otras apps** (WhatsApp, Instagram, Facebook) no vinculan: la app pide abrir el enlace en Chrome o Safari (D33).

**Lector de QR:** en Chrome y Samsung Internet se usa el lector del navegador (`BarcodeDetector`). En Safari y Firefox, que no lo tienen, se carga una librería liviana **solo cuando se abre la cámara** (`@defer`), para no sumar peso a la primera carga.

**Configuración:** el archivo `.browserslistrc` de cada app lista estas versiones; Angular y Tailwind generan el código para ellas. Las pruebas de Playwright corren en Chromium y WebKit, y el ensayo se hace en al menos un Android de gama baja y un iPhone con iOS 16.4.
