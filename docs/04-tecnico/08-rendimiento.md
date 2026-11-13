# Rendimiento y consumo de datos

> **Estado:** ✅ vigente (D24) · **Última revisión:** 2026-11-06
> La v1 asume buena señal en el evento. En lugar de un modo sin conexión, cada proceso se diseña para gastar pocos datos y responder rápido.
> Relacionados: [Arquitectura](01-arquitectura.md) · [Libro y anclaje](07-libro-y-anclaje.md) · [Flujos de la v1](../01-producto/07-flujos-v1.md)

## 1. Presupuesto

| Métrica | Objetivo |
|---|---|
| Primera carga de la app del asistente | **≤ 250 KB comprimidos** y utilizable en **menos de 3 s** con 4G regular |
| Visitas siguientes | ~0 KB: la app queda guardada en el celular |
| Respuesta al escanear o canjear | **< 300 ms en el servidor** (p95) y **< 1 s** para el usuario |
| Datos por asistente en todo el evento | **< 0,5 MB** |
| Aviso en la mesa de "canje confirmado" | < 1 s después de que el asistente confirma |
| Contador de la pantalla | < 2 s después de cada escaneo |
| Panel del organizador | Puede pesar más (se usa en computadora), pero los gráficos se cargan después que los números |

Para dar una idea del tamaño: un evento de 400 personas suma unos 200 MB en todo el día. Una red de evento ni lo nota.

## 2. Medidas

| # | Medida | Detalle |
|---|---|---|
| 1 | **No esperar a Stellar** | El servidor responde al registrar el movimiento. El anclaje va aparte, cada 5 min ([Libro y anclaje](07-libro-y-anclaje.md)) |
| 2 | **Sin `stellar-sdk` en el navegador** | Solo lo usa el servidor. El asistente no firma transacciones de Stellar, solo reclamos con WebCrypto, que ya viene en el navegador |
| 3 | **Una app por perfil** | `/app`, `/sala`, `/mesa`, `/admin` y `/plataforma` se compilan por separado. El asistente nunca descarga el panel |
| 4 | **Lector de QR bajo demanda** | Se carga al abrir la cámara. Primero se intenta el lector nativo del navegador (`BarcodeDetector`); la librería se descarga solo si falta |
| 5 | **App guardada en el celular** | Service worker con la app en caché. Las imágenes del evento (mapa, logos) se guardan la primera vez que se ven |
| 6 | **Una llamada al abrir** | `GET /app/estado` devuelve saldo, retos, agenda, catálogo e historial reciente en 2–4 KB. Con `ETag`, si nada cambió, la respuesta es "sin cambios" (304) |
| 7 | **Respuestas mínimas** | Por ejemplo, `{"ok":true,"pts":20,"saldo":80,"n":1834}`, unos 150 bytes. Sin campos que la pantalla no usa |
| 8 | **QR generado en la pantalla** | La tablet firma el QR ella misma. El servidor solo se entera de los cambios de estado (pausa, generar otro, mostrar QR) |
| 9 | **Avisos en vivo con SSE** | El contador de la pantalla, el "canje confirmado" de la mesa y el panel reciben mensajes pequeños solo cuando algo cambia, sin consultar cada pocos segundos |
| 10 | **Fuentes e imágenes livianas** | Fuentes recortadas a los caracteres del español y solo 2 pesos (`woff2`). Íconos en SVG. Logos y fotos del catálogo en WebP de hasta 20 KB. Mapa en WebP de hasta 150 KB, que se descarga solo al abrirlo |
| 11 | **Reintento automático sin duplicados** | Cada envío lleva un ID único. Si la red falla, se reintenta solo 2–3 veces, y el servidor nunca lo cuenta dos veces |
| 12 | **Servidor cerca y con compresión** | Región cercana a Bolivia (por ejemplo, São Paulo), CDN para los archivos estáticos, Brotli y HTTP/2 |

## 3. Si la señal falla igual

- La app abre igual, porque está guardada en el celular, y muestra el último saldo conocido.
- Las acciones se reintentan solas. Si no lo logran, la pantalla lo dice con claridad (*"No pudimos conectar. Intenta de nuevo"*) y el botón **Reintentar** reenvía la misma acción sin duplicarla.
- Las pantallas de sala siguen mostrando el QR, porque lo genera la tablet, y avisan *"Contador sin conexión"*.
- **La mesa de canje necesita internet sí o sí** (D21). Se recomienda darle una red propia o datos móviles.

No hay cola de reclamos sin conexión ni sincronización a través de la mesa en la v1 (D23).

## 4. Cómo se mide

| Qué | Cómo | Cuándo |
|---|---|---|
| Peso y velocidad de carga | Lighthouse y WebPageTest con perfil "4G lento" en un Android de gama media | En cada versión |
| Respuesta del servidor | Métricas p50 y p95 por endpoint | Siempre, en el monitoreo |
| Pico de escaneos | Prueba de carga (por ejemplo, con k6): 500 personas escanean el mismo QR en 30 s | Antes del piloto |
| Pico en la mesa | 20 canjes por minuto en 2 mesas durante 10 minutos | Antes del piloto |
| Celulares reales | Android económico e iPhone viejo, con datos móviles | En el ensayo del piloto |
