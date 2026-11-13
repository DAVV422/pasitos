# Subida y validación de archivos

> **Estado:** ✅ vigente (D48) · **Última revisión:** 2026-11-13
> Cómo se reciben, validan, guardan y sirven los archivos que sube el equipo: logos, portadas, el plano del lugar, logos de sponsors, imágenes de premios y la lista de invitados en CSV. Los archivos se guardan **en el VPS**.
> Relacionados: [Stack tecnológico](09-stack-tecnologico.md) · [Amenazas y pruebas](../05-seguridad-legal/01-amenazas-y-pruebas.md) · [Backend](../09-desarrollo/02-backend.md)

## 1. Qué se puede subir

| Propósito | Formatos | Peso máximo | Medidas | Quién |
|---|---|---|---|---|
| Logo del evento, logo de sponsor | PNG, JPEG, WebP | 2 MB | Hasta 2 000 × 2 000 px | Dueño, coorganizador |
| Portada del evento | PNG, JPEG, WebP | 5 MB | Hasta 4 000 × 4 000 px | Dueño, coorganizador |
| Plano del lugar (mapa con puntos numerados) | PNG, JPEG, WebP | 5 MB | Hasta 6 000 × 6 000 px | Dueño, coorganizador |
| Imagen de premio | PNG, JPEG, WebP | 2 MB | Hasta 2 000 × 2 000 px | Dueño, coorganizador |
| Lista de invitados | CSV (UTF-8) | 2 MB | Hasta 5 000 filas | Dueño, coorganizador |

**No se aceptan:** SVG (puede llevar scripts), GIF, HEIC, PDF, archivos comprimidos ni ejecutables. Si el equipo necesita un formato nuevo, se agrega con una nueva entrada en [Decisiones](../decisiones.md).

## 2. El recorrido de un archivo

```mermaid
flowchart LR
    U[Subida] --> L[1 · Límites<br/>peso y tipo declarado]
    L --> Q[(Cuarentena)]
    Q --> T[2 · Tipo real<br/>bytes mágicos]
    T --> D[3 · Decodificar<br/>archivo sano]
    D --> AV[4 · Antivirus<br/>ClamAV]
    AV --> P[5 · Procesar<br/>reencodear y limpiar]
    P --> OK[(Públicos)]
    T -. falla .-> R[Rechazado]
    D -. falla .-> R
    AV -. falla .-> R
```

| Paso | Qué se comprueba | Cómo | Si falla |
|---|---|---|---|
| **1 · Límites** | Peso máximo del propósito, extensión y tipo declarado en la lista permitida, un solo archivo por request | Caddy y Fastify cortan la subida al pasar el peso (no esperan a recibirlo entero). Límite de subidas por usuario | `413` o `400 ARCHIVO_INVALIDO` |
| **Cuarentena** | El archivo se guarda con un nombre aleatorio en una carpeta que **nunca se sirve** | Fuera de la carpeta pública, sin permisos de ejecución | — |
| **2 · Tipo real** | Que el contenido sea de verdad lo que dice la extensión (por ejemplo, que un `.png` empiece con la firma de PNG) | Librería `file-type`, que lee los bytes del inicio | `ARCHIVO_TIPO_NO_PERMITIDO` |
| **3 · Archivo sano** | Que la imagen se pueda abrir completa y no esté corrupta ni truncada. Que no sea una "bomba" (una imagen chica que al abrirla ocupa gigas) | `sharp` la decodifica entera, con límite de píxeles y de medidas. El CSV se lee como UTF-8 y se validan sus columnas | `ARCHIVO_CORRUPTO` o `ARCHIVO_MUY_GRANDE` |
| **4 · Antivirus** | Virus, gusanos, troyanos y otros programas maliciosos conocidos | **ClamAV** (contenedor `clamav` en el VPS), con sus firmas actualizadas cada día | `ARCHIVO_INFECTADO`. Se registra en la bitácora y avisa a los administradores |
| **5 · Procesar** | Neutralizar lo que se haya escapado | Las imágenes se **vuelven a codificar** a WebP: se descartan los metadatos (EXIF, ubicación GPS de la foto) y cualquier contenido escondido dentro del archivo. Se generan los tamaños que usan las apps | — |

**Por qué reencodear:** un archivo puede ser al mismo tiempo una imagen válida y otra cosa (un *políglota*). Como Pasitos sirve solo la imagen que **generó él mismo**, el archivo original nunca llega a nadie.

**Lista de invitados (CSV):** no se guarda como archivo público. Se valida (UTF-8, columnas esperadas, correos con formato válido, duplicados), se importa a la tabla `asistentes` y el archivo se borra. Al **exportar** listas, las celdas que empiezan con `=`, `+`, `-` o `@` se escapan para que Excel no las ejecute como fórmulas.

## 3. Dónde se guardan

En un volumen del VPS:

```text
/srv/pasitos/archivos/
├─ cuarentena/      # Recién subidos. No se sirven. Se borran a las 24 h si no se aprobaron
└─ publicos/
   └─ <organizacion>/<evento>/<id>/
      ├─ original.webp
      ├─ 1200.webp
      └─ 400.webp
```

- **Nombres aleatorios** (el `id` del archivo). El nombre original solo se guarda en la base, limpio, como dato.
- **Caddy sirve** `/archivos/publicos/...` como archivos estáticos con `Content-Type` fijo por extensión, `X-Content-Type-Options: nosniff` y caché larga. Cloudflare los cachea.
- Los archivos de un evento **Privado** se sirven a través del API, que comprueba la sesión, y no como estáticos.
- **Sin copias de seguridad por ahora** (D44): si el disco del VPS falla, se pierden también las imágenes. Conviene tenerlo en cuenta al revisar D44.

## 4. Tabla `archivos`

| Columna | Nota |
|---|---|
| `organizacion_id`, `evento_id` | Aislamiento por organización (D47) |
| `proposito` | `logo_evento` · `portada` · `plano` · `logo_sponsor` · `imagen_premio` · `importacion_csv` |
| `nombre_original` | Limpio, solo para mostrar |
| `mime`, `tamano_bytes`, `ancho`, `alto`, `sha256` | Del archivo procesado. El `sha256` permite detectar el mismo archivo subido dos veces |
| `estado` | `cuarentena` · `aprobado` · `rechazado` |
| `motivo_rechazo` | El código de error |
| `antivirus` | Resultado y versión de las firmas de ClamAV |
| `variantes` | Tamaños generados y sus rutas |
| `subido_por`, `created_at`, `reemplazado_at` | |

Las tablas que usan imágenes guardan el `archivo_id` (`eventos.logo_archivo_id`, `sponsors.logo_archivo_id`, …).

## 5. Ubicación del evento: Google Maps

El **plano del lugar** es una imagen que sube el organizador (sección 1). La **ubicación del evento** usa Google Maps:

| Dónde | Cómo | Por qué |
|---|---|---|
| Panel del organizador | Buscador de lugares (*Places Autocomplete*) para elegir la dirección. Se guardan `place_id`, latitud y longitud | Evita direcciones mal escritas |
| Sitio público y app del asistente | Una **imagen estática del mapa**, que el servidor pide una sola vez a Google (*Static Maps*) y guarda como un archivo más | No carga el JavaScript de Google en `/app` (cuida el peso) y Google no recibe la IP de cada asistente |
| Botón *Cómo llegar* | Abre Google Maps con la ubicación (`https://www.google.com/maps/search/?api=1&query=…`) | No necesita la llave; abre la app de mapas del celular |

**La llave de Google:**
- **Una llave por uso:** la del panel, restringida por dominio (*HTTP referrer*) y solo a *Places*; la del servidor, restringida por IP del VPS y solo a *Static Maps*.
- Con un tope de uso diario en la consola de Google, para que un abuso no genere costos.
- Se guarda como secreto (sops + age), nunca en el repositorio.

## 6. Errores

Se suman al [catálogo de códigos](../09-desarrollo/04-respuestas-y-errores.md#43-catálogo-de-códigos):

| Código | Estado | Texto para la persona |
|---|---|---|
| `ARCHIVO_MUY_GRANDE` | 413 | El archivo supera el tamaño máximo (por ejemplo, 2 MB). |
| `ARCHIVO_TIPO_NO_PERMITIDO` | 422 | Este tipo de archivo no está permitido. Usa PNG, JPEG o WebP. |
| `ARCHIVO_CORRUPTO` | 422 | No pudimos abrir el archivo. Puede estar dañado. |
| `ARCHIVO_INFECTADO` | 422 | El archivo no pasó el control de seguridad. |
| `ARCHIVO_INVALIDO` | 400 | El archivo no cumple los requisitos. |

## 7. Pruebas

- Un archivo de cada tipo permitido pasa; uno de cada tipo prohibido se rechaza.
- Un `.png` que en realidad es otra cosa, una imagen truncada y una "bomba" de descompresión se rechazan.
- El archivo de prueba **EICAR** (un falso virus estándar) se rechaza con `ARCHIVO_INFECTADO`.
- La imagen servida no tiene metadatos EXIF.
- Nada de la carpeta de cuarentena se puede descargar por HTTP.
- Un CSV con `=HYPERLINK(...)` en un nombre se exporta escapado.
