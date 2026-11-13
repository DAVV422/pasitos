# Brief de mockups para IA de diseño · Pasitos

> **Estado:** vigente · **Última revisión:** 2026-11-03 · Mockup de referencia del nivel 1: [mockups/nivel-1.html](mockups/nivel-1.html) · Actualizado con el logo y con el design system de [tokens/DESIGN-dark.md](tokens/DESIGN-dark.md) y [tokens/DESIGN-light.md](tokens/DESIGN-light.md). La primera versión de este brief es anterior al logo.
>
> **Cómo usar este documento:** pásalo completo a la IA de diseño. Si la herramienta tiene un límite de texto, envía primero las secciones 0–4 (contexto, reglas, design system, datos) y después **una sección de pantallas a la vez** (5 a 11). Las secciones 0–4 aplican a todas las pantallas.

---

## 0. Instrucción principal (copiar y pegar primero)

```
Diseña los mockups de alta fidelidad de "Pasitos", una web app responsiva para eventos
presenciales (meetups, foros, hackathons, eventos de comunidades). Los asistentes cumplen
retos (ir a una charla, quedarse al cierre, hacer su primera transacción en Stellar) y
ganan PUNTOS que solo pueden canjear dentro del evento por café, meriendas o merch. Al
final, el organizador comparte un REPORTE VERIFICABLE con sus sponsors.

Perfiles: Asistente (móvil), Pantalla QR de sala o stand (tablet/monitor), Mesa de canje
(tablet/móvil), Panel del organizador (desktop) y Reporte público (web responsiva).

Estilo: fintech moderna, oscura, limpia, con energía de evento en vivo. El logo ya existe
(dos flechas amarilla y naranja, se adjunta): úsalo tal cual, no diseñes otro. Todo el
texto de la interfaz en español. Sigue EXACTAMENTE los colores, textos, datos y reglas de
este documento. No agregues funciones, pantallas ni botones que no estén descritos.
```

---

## 1. Contexto del producto (para entender, no para dibujar)

- **Nombre:** **Pasitos** (siempre con mayúscula inicial). Cada participación es un paso y cada paso suma.
- **Logo (ya existe, no lo rediseñes):** dos flechas (chevrons) que apuntan a la derecha, la primera amarilla y la segunda naranja. Adjunta la imagen `assets/brand/pasitos-logo.png` como referencia. Úsalo como símbolo de 24–32 px junto a la palabra **"Pasitos"** en Plus Jakarta Sans 800 (blanca en tema oscuro, `#0B0F19` en tema claro). Sobre fondos oscuros, las flechas van sin el círculo claro.
- **Slogan:** *"Cada paso cuenta."* Aparece solo en la bienvenida (5.1), en el pie del reporte público (9.1) y en la solicitud del plan Comunidad (11.1).
- **Frase de apoyo:** *"Puntos por quedarse, reportes que se pueden comprobar."* Solo en la solicitud del plan Comunidad (11.1).
- **Problema:** la gente se va de los eventos antes del cierre, el merch se lo llevan unos pocos y el organizador no puede demostrarle a su sponsor qué logró su apoyo (solo le manda fotos).
- **Solución:** retos → puntos → canje dentro del evento + un reporte con datos que el sponsor puede comprobar.
- **Evento de ejemplo:** *Foro Tech 2026*, organizado por la comunidad ficticia **Comunidad Dev La Paz**, con el **Plan Comunidad** (gratuito). La Paz, Bolivia, sábado 21 de noviembre de 2026, 09:00–19:00.
- **Puntos (PTS):** se ganan gratis. Solo valen dentro del evento. **Vencen al cierre.** **Nunca se convierten en dinero.**
- **Saldo en dólares (USD):** **no existe en el evento principal.** Solo aparece en la *variante Feria* (sección 10), cuando el organizador lo activa.
- **Tecnología (solo afecta a pocos textos):** funciona sobre la red blockchain Stellar, en **testnet** (red de pruebas). El asistente **no** necesita saber de cripto.

---

## 2. Reglas obligatorias (la IA NO debe romperlas)

### 2.1 Lo que SÍ debe aparecer
1. Un chip pequeño **`TESTNET`** en el header de todas las vistas.
2. Los puntos siempre en **ámbar**. El saldo USD (solo en la variante Feria) siempre en **azul**. Nunca intercambiar estos colores.
3. Los códigos QR siempre **negros sobre fondo blanco**, dentro de una tarjeta blanca con margen blanco alrededor, aunque el resto de la interfaz sea oscura.
4. El chip *"Vence al cierre"* junto al saldo de puntos.
5. El chip *"Puntos válidos solo dentro de Foro Tech 2026"* en la vista del asistente.
6. Botones y zonas táctiles de al menos 48 px de alto en móvil y tablet.
7. El texto *"Hecho con Pasitos"* en el pie del reporte público y de la pantalla QR.

### 2.2 Lo que NO debe aparecer (errores comunes a evitar)
| ❌ No diseñar | Por qué |
|---|---|
| Saldo en dólares, botones de pago o reembolso **fuera de la sección 10** | El evento principal solo usa puntos |
| Botón o pantalla para **enviar puntos a otro asistente** | Está prohibido por diseño (evita robo y reventa de puntos) |
| Opción de **convertir puntos a dinero**, "retirar puntos" o "vender puntos" | Los puntos nunca se convierten en dinero |
| **Pago mixto** (parte puntos + parte USD) | Cada cobro es en una sola moneda |
| Catálogo o buscador de eventos, eventos públicos/privados, compra de entradas | Hay un solo evento activo |
| Formulario de registro, login con email o contraseña **para asistentes** | Entran con el link de su entrada |
| Tarifas por lead, "costo por lead" o montos cobrados a sponsors | No forma parte de este modelo |
| Logos o nombres de **marcas reales** (Google, GDG, Circle, Stellar, Visa, bancos, etc.) | Solo nombres ficticios (sección 4). "Stellar" y "Stellar Expert" pueden aparecer **solo como texto** |
| Jerga cripto en la vista del asistente: "seed phrase", "gas", "token", "mint", "NFT", "staking", "dirección de wallet" en grande | El asistente no debe sentir que usa cripto |
| Rankings, leaderboards, chat, perfiles sociales, coleccionables | No están en el producto |
| QR claros sobre fondo oscuro (invertidos) | Muchos lectores no los leen |
| Texto blanco sobre botones ámbar | No se lee: usar texto oscuro `#0B0F19` |
| Números distintos entre pantallas | Usar exactamente los datos de la sección 4 |
| Animaciones decorativas: confeti, números que vuelan, rebotes, parallax, brillos | El diseño es simple y minimalista (sección 2.4) |
| Mensajes importantes que desaparecen solos (toasts fugaces) | La persona tiene que poder leerlos con calma |
| Botones que son solo un ícono, o más de un botón principal por pantalla | Cada acción tiene que ser evidente |

### 2.3 Palabras en la vista del asistente
- ✅ "puntos", "PTS", "reto", "canjear", "verificado en Stellar" (solo en la confirmación de un reto), "Ver en Stellar Expert" (solo en el historial y en los modales de detalle), "primera transacción en Stellar" (nombre de un reto).
- ❌ "token", "wallet" (excepto en el modal de demo 5.11), "blockchain" en títulos, "cripto".

### 2.4 Accesibilidad y simplicidad (obligatorio)
Al evento va gente de todas las edades, incluidas **personas mayores con poca práctica con el celular**. El diseño debe ser **profesional, simple y minimalista**, con flujos y botones de acción fáciles de identificar. Reglas completas en el [Design system §3](02-design-system.md#3-reglas-de-ux-y-accesibilidad).
1. **Una sola acción principal por pantalla**: botón ámbar de ancho completo, abajo, de 56 px de alto en móvil. Las secundarias con contorno.
2. **Texto de lectura de 16 px como mínimo** (18 px en la información clave del asistente). Nada por debajo de 12 px.
3. **Contraste alto**: la información importante nunca en gris tenue.
4. **Cada estado con ícono + texto + color** (ej. ✓ *Completado*, 🔒 *Desde las 17:00*). El color nunca es el único indicador.
5. **Íconos siempre con texto.** La barra inferior muestra las etiquetas.
6. **Botones que dicen lo que hacen**: *"Canjear 20 puntos"*, *"Entrar al evento"*, nunca solo *"OK"* o *"Confirmar"*.
7. **Título visible y forma clara de volver** en cada pantalla.
8. **Mucho espacio en blanco** y pocos elementos por pantalla.
9. **Animación mínima**: solo transiciones funcionales cortas.
10. **Confirmaciones que se quedan** hasta que la persona toca *"Seguir"* o *"Entendido"*.

---

## 3. Design system

> Resumen de [tokens/DESIGN-dark.md](tokens/DESIGN-dark.md) y [tokens/DESIGN-light.md](tokens/DESIGN-light.md). Si la herramienta acepta archivos, adjunta también esos dos.

### 3.1 Colores (tema oscuro, por defecto)

| Token | Hex | Uso |
|---|---|---|
| `bg` | `#0B0F19` | Fondo de todas las pantallas |
| `surface` | `#111827` | Tarjetas, bottom sheets, modales |
| `surface-2` | `#161F30` | Elementos anidados, filas en hover, modales flotantes |
| `border` | `rgba(255,255,255,0.08)` | Bordes de 1 px (decorativos, nunca el único indicador de un elemento) |
| `text` | `#F9FAFB` | Texto principal |
| `text-muted` | `#9CA3AF` | Texto secundario, labels |
| `points` | `#F59E0B` | **Color de marca.** Todo lo relacionado con PUNTOS; botón principal (CTA) |
| `accent` | `#EA580C` | Naranja del logo: progreso, extremo del degradado |
| `brand-gradient` | `135deg, #F59E0B → #EA580C` | Botón principal (incluido "Escanear código QR") |
| `on-points` | `#0B0F19` | Texto e íconos sobre ámbar o sobre el degradado |
| `usd` | `#2775CA` | Solo variante Feria: fondo de botones y chips de USD (texto blanco encima) |
| `usd-text` | `#3B82F6` | Solo variante Feria: montos en USD escritos como texto |
| `success` | `#10B981` | Confirmaciones, "Completado", canje recibido |
| `danger` | `#EF4444` | Errores, rechazo, acciones irreversibles |
| `warning-bg` | `#3A2A0B` | Fondo de avisos suaves (ej. "Disponible desde las 17:00") |
| `qr-bg` | `#FFFFFF` | Fondo de cualquier QR |
| `qr-fg` | `#000000` | Módulos del QR |

**Profundidad:** tarjetas `#111827` con borde `1px solid rgba(255,255,255,0.06)` y sombra suave; modales y bottom sheets `#161F30` con desenfoque de fondo (vidrio). Elementos seleccionados: aura ámbar de 1 px con un resplandor tenue.

### 3.2 Tema claro (para proyector y para el reporte impreso)
Hacer **una variante clara** de la pantalla QR (6.1), del resumen del panel (8.1) y del reporte público (9.1):
`bg #F8FAFC` · `surface #FFFFFF` · `surface-2 #F1F5F9` · `border #CBD5E1` · `text #0B0F19` · `text-muted #475569` · `points #B45309` (textos) / `#D97706` (íconos) · `accent #EA580C` · mismo degradado de marca con texto `#0B0F19` · `success #047857` · `danger #B91C1C` · `usd #2563EB`.

### 3.3 Tipografía
- Títulos y saldos: **Plus Jakarta Sans**. Interfaz y textos: **Inter**.
- Números de saldos, contadores y métricas: **tabulares** (ancho fijo).

| Estilo | Fuente · tamaño / peso | Uso |
|---|---|---|
| Display | Plus Jakarta Sans · 48/800 (móvil 36) | Saldo de puntos del asistente; KPIs principales del reporte |
| H1 | Plus Jakarta Sans · 32/700 (móvil 26) | Títulos de pantalla |
| H2 | Plus Jakarta Sans · 22/600 | Títulos de tarjetas y secciones |
| Body | Inter · 16/400 | Texto general |
| Small | Inter · 14/400 | Secundario |
| Caption | Inter · 12/600, mayúsculas, espaciado +4 % | Chips y labels (`TESTNET`, `VENCE AL CIERRE`, `PLAN COMUNIDAD`) |
| Contador QR | Plus Jakarta Sans · 56/700 | Contador de la pantalla QR |

### 3.4 Espaciado, forma y sombras
- Grilla de 8 px (con medios pasos de 4 px). Márgenes laterales: 16 px en móvil, 24 px en tablet, 48 px en desktop.
- Radios: 16 px para tarjetas y modales, 12 px para botones e inputs, 24 px en el borde superior de los bottom sheets, 999 px para chips.
- Íconos: **Lucide** (trazo de 1.75 px). Íconos clave: `scan-line` (escanear), `trophy` (retos), `gift` (canjear), `history` (historial), `sparkles` (puntos), `shield-x` (rechazo), `check-circle-2` (éxito), `clock` (bloqueado por horario), `zap` (verificación automática), `external-link`, `share-2` (compartir reporte), `lock` (bloqueado), `badge-check` (verificado). En la tarjeta de saldo y en el chip de puntos se puede usar el **símbolo de las dos flechas** del logo en lugar de `sparkles`.

### 3.5 Componentes base

| Componente | Especificación |
|---|---|
| **Botón primario** | Degradado de marca (o `points` sólido), texto `on-points`, **56 px de alto y ancho completo en móvil** (48 px en desktop), radio 12, texto Inter 17/700. Uno solo por pantalla |
| **Botón secundario** | Fondo `surface-2`, borde 1 px `rgba(255,255,255,0.12)`, texto `text` |
| **Botón peligro** | Fondo `danger`, texto `#0B0F19` |
| **Chip** | Altura 24 px, caption, fondo con 15 % de opacidad del color del rol y texto en el color del rol |
| **Tarjeta de reto** | `surface`, radio 16, padding 16. Izquierda: avatar del sponsor u organizador (círculo de 40 px con iniciales). Centro: título (16/600), quién lo propone (small muted) y **cómo se verifica** (small, con ícono: `scan-line` "Escanea el QR", `zap` "Se verifica automáticamente", `clipboard-list` "Responde la encuesta"). Derecha: chip de recompensa `+20 PTS` en ámbar. Abajo: estado |
| **Tarjeta de producto** | `surface`, radio 16. Ícono del producto (64 px, ilustración plana simple), nombre y precio en puntos `20 PTS` (ámbar) |
| **Tarjeta KPI** | `surface`, radio 16. Label en caption muted, número en display, una línea de contexto en small |
| **Confirmación de éxito** | Bottom sheet con ícono `check-circle-2` grande en `success`, título, detalle y botón primario para seguir. **No desaparece sola** |
| **Bottom sheet / modal** | `surface-2` con desenfoque de fondo, radio superior 24, handle gris arriba, overlay negro al 60 % |
| **Barra inferior (asistente)** | Fija abajo: **botón principal "Escanear código QR"** de ancho completo (56 px, degradado, ícono `scan-line`) y debajo 3 pestañas con ícono y etiqueta visible: Retos · Canjear · Historial. La pestaña activa en ámbar con una línea debajo |

---

## 4. Datos ficticios (usar EXACTAMENTE estos)

### 4.1 Evento
- **Foro Tech 2026** · La Paz, Bolivia · Sábado 21 de noviembre de 2026 · 09:00–19:00
- Organizador: **Comunidad Dev La Paz** (ficticia) · chip `PLAN COMUNIDAD`
- Contrato del evento (solo en el reporte y el panel): `CDLZ…7Q3M`

### 4.2 Sponsors (ficticios)
| Sponsor | Iniciales | Color del avatar | Cómo participa |
|---|---|---|---|
| Nimbora Cloud | NC | `#7C3AED` | Da una charla en la Sala A |
| Kodara Academy | KA | `#0EA5E9` | Tiene un stand con una clase de 2 minutos |
| Quillu Pay | QP | `#EC4899` | Patrocina la encuesta de feedback |

El organizador (Comunidad Dev La Paz) usa el avatar `CD` en ámbar.

### 4.3 Retos
| Reto | Propone | Recompensa | Cómo se verifica | Estado para la asistente |
|---|---|---|---|---|
| Llegada temprana (antes de las 09:30) | Comunidad Dev La Paz | +50 PTS | QR en la entrada | ✅ Completado · 09:05 |
| Asiste a la charla "Escalando apps en la nube" | Nimbora Cloud | +20 PTS | QR en la Sala A | ✅ Completado · 10:31 |
| Prueba nuestra clase de 2 minutos | Kodara Academy | +30 PTS | QR en el stand | ✅ Completado · 11:42 |
| **Haz tu primera transacción en Stellar** | Comunidad Dev La Paz | +40 PTS | **Automático** (sin QR) | Pendiente |
| Responde la encuesta del evento | Quillu Pay | +15 PTS | Encuesta en la app | Pendiente |
| Check-in en la charla de cierre | Comunidad Dev La Paz | +30 PTS | QR en la Sala A | 🔒 Disponible desde las 17:00 |

### 4.4 Mesa de canje: **Mesa de canje Foro Tech** (atendida por el organizador)
| Producto | Puntos |
|---|---|
| Café | 20 PTS |
| Agua | 10 PTS |
| Merienda | 25 PTS |
| Pack de stickers | 15 PTS |
| Taza Foro Tech | 60 PTS |
| Polera Foro Tech | 100 PTS |

### 4.5 Asistente principal
- **Valeria Quispe** · Entrada `TICK-001` · ID corto `#0231`
- Saldo actual: **80 PTS** (cuadra con el historial de la sección 4.6)
- Cuenta (solo visible en el modal 5.11 y en el historial): `GDQ7…K4ZP`

### 4.6 Historial de Valeria (más reciente primero)
| Hora | Movimiento | Puntos |
|---|---|---|
| 11:42 | Reto · Prueba nuestra clase de 2 minutos (Kodara Academy) | +30 PTS |
| 11:15 | Canje · Café en la Mesa de canje | −20 PTS |
| 10:31 | Reto · Charla "Escalando apps en la nube" (Nimbora Cloud) | +20 PTS |
| 09:05 | Reto · Llegada temprana (Comunidad Dev La Paz) | +50 PTS |

### 4.7 Panel del organizador (18:30, evento todavía abierto)
- Inscritos **412** · Asistentes verificados **287** · Activos ahora **224** (punto verde "en vivo") · Retención al cierre **78 %** (224 de 287)
- Asistentes activos por hora: 09:00 120 · 10:00 230 · 11:00 268 · 12:00 275 · 13:00 220 · 14:00 248 · 15:00 260 · 16:00 251 · 17:00 236 · 18:00 224
- Puntos emitidos **31 890** · Canjeados **24 610** · Por vencer al cierre **7 280**
- Canjes en la mesa hoy: **318**

### 4.8 Participaciones por reto (usar en el panel y en el reporte)
| Reto | Participaciones |
|---|---|
| Llegada temprana | 164 |
| Charla de Nimbora Cloud | 201 |
| Clase de Kodara Academy | 142 |
| Primera transacción en Stellar | 173 |
| Encuesta (Quillu Pay) | 118 |
| Check-in de cierre | 224 |
| **Total** | **1 022** |

### 4.9 Reporte final (después del cierre)
- Asistentes verificados **287** de 412 inscritos
- Retos completados **1 022**
- Retención al cierre **78 %**
- Primera transacción en Stellar: **173 asistentes (60 %)**
- Puntos: emitidos **31 890** · canjeados **24 610** · vencidos **7 280**
- Por sponsor: *Nimbora Cloud: 201 asistentes en su charla* · *Kodara Academy: 142 probaron su clase* · *Quillu Pay: 118 respondieron su encuesta*

### 4.10 Datos para las pantallas de gestión
- **Organizadora:** Ana Mamani · `ana@comunidaddev.example` · rol *Organizadora principal*
- **Lugar:** Centro de Convenciones Illimani (ficticio) · Av. 6 de Agosto 2100, La Paz
- **Entradas:** 412 cargadas desde una planilla · 287 activadas · formato `TICK-001` a `TICK-412`
- **Pantallas de salas:** *Entrada principal* (reto Llegada temprana) · *Sala A* (charla de Nimbora Cloud y check-in de cierre) · *Stand Kodara Academy* (clase de 2 minutos)
- **Conexión de la mesa de canje:** QR de un solo uso que vence en 2 min, o enlace de un solo uso que vence a las 24 h. Dispositivos conectados: *Tablet de la mesa* (Ana Mamani, 08:41) y *Celular de respaldo* (Luis Condori, 08:55). Ya no hay código de 6 dígitos (D18)
- **Encuesta (Quillu Pay):** 3 preguntas: *"¿Qué tan útil te resultó el evento?"* (1 a 5) · *"¿Qué charla te gustó más?"* (opciones) · *"¿Volverías el próximo año?"* (Sí / No)
- **Solicitudes del plan Comunidad (interno):** *Club de Robótica UMSA* (pendiente) · *Meetup JS Cochabamba* (pendiente) · *Comunidad Dev La Paz* (aprobada)

---

## 5. Pantallas del ASISTENTE (móvil, 390 × 844 px)

**Estructura común (5.2 a 5.4):**
- **Header fijo:** logo de Pasitos (símbolo + palabra) a la izquierda y botón *"Mi cuenta"* (ícono + texto) a la derecha. Debajo: *Foro Tech 2026 · La Paz* y el chip `TESTNET`.
- **Tarjeta de saldo** (ancho completo, `surface`): ícono `sparkles` ámbar, **`80 PTS`** en display ámbar, chip `VENCE AL CIERRE`, y a la derecha un texto pequeño *"3 de 6 retos"*.
- Debajo, el chip ancho: *🔒 Puntos válidos solo dentro de Foro Tech 2026*.
- **Barra inferior** con el botón principal *"Escanear código QR"* y las 3 pestañas (sección 3.5).

### 5.1 Bienvenida (ingreso por entrada)
- Pantalla completa `bg`. Logo de Pasitos centrado arriba y, debajo, el slogan en small muted: *"Cada paso cuenta."*
- Tarjeta: *"¡Hola, Valeria!"* (H1) · *"Tu entrada TICK-001 para Foro Tech 2026 está lista."*
- Tres puntos con íconos: *"Cumple retos y gana puntos"* · *"Canjéalos por café, meriendas y merch"* · *"Tus puntos valen solo durante el evento"*.
- Indicador de carga: *"Preparando tu cuenta…"*.
- Botón primario (aparece al terminar la carga): **Entrar al evento**.
- **Sin campos de formulario.**

### 5.2 Inicio · pestaña Retos (pestaña activa)
- Estructura común arriba.
- Título *"Retos"* · subtítulo *"3 de 6 completados"* con una barra de progreso ámbar al 50 %. A la derecha, el enlace *"¿Cómo funciona?"* (abre 5.17).
- Las tarjetas se agrupan con subtítulos: **Por hacer** · **Más tarde** · **Completados**.
- Las 6 tarjetas de la sección 4.3, en este orden: pendientes primero, después el bloqueado, al final los completados.
  - **Pendiente con QR:** chip `+20 PTS`; texto *"Escanea el QR en la sala"*.
  - **Pendiente automático** ("Haz tu primera transacción en Stellar"): chip `+40 PTS`, ícono `zap`, texto *"Se verifica automáticamente"* y un enlace pequeño *"Cómo hacerlo →"* (abre 5.15).
  - **Pendiente con encuesta:** chip `+15 PTS`, botón pequeño *"Responder"*.
  - **Bloqueado:** tarjeta con fondo `surface` (sin bajar la opacidad del texto, para que se lea), ícono `clock` y franja inferior `warning-bg`: *"Disponible desde las 17:00"*.
  - **Completado:** ícono `check-circle-2` verde, *"Completado · 10:31"*, chip de recompensa en gris.

### 5.3 Inicio · pestaña Canjear
- Estructura común arriba.
- Título *"Canjear"* · subtítulo *"Usa tus puntos en la Mesa de canje Foro Tech"*.
- Grilla de 2 columnas con los 6 productos de la sección 4.4. Los que superan el saldo (Taza 60 sí alcanza; Polera 100 no) muestran el precio en gris y el texto *"Te faltan 20 PTS"*.
- Nota al pie, en muted: *"Para canjear, escanea el QR de la mesa."*
- **Sin botón "Comprar" en las tarjetas.**

### 5.4 Inicio · pestaña Historial
- Estructura común arriba.
- Lista de la sección 4.6. Cada fila: ícono por tipo (`trophy` reto · `gift` canje), descripción, hora y puntos a la derecha (positivos en ámbar, negativos en `text-muted`).
- Al final de cada fila, un ícono pequeño `external-link` (abre el movimiento en Stellar Expert).

### 5.5 Escáner
- Vista de cámara a pantalla completa (usar como fondo una foto borrosa de una sala de evento).
- Marco cuadrado central de 260 px con esquinas ámbar y una línea de escaneo.
- Arriba: botón `✕`. Texto: *"Apunta al QR de la sala, del stand o de la mesa de canje"*.
- Abajo: botón secundario *"Ingresar código manualmente"*.

### 5.6 Verificando
- Bottom sheet sobre el escáner: spinner ámbar, *"Verificando en Stellar…"* (H2) y *"Esto tarda unos segundos"* (muted).

### 5.7 Reto completado (pantalla clave para el pitch)
- Bottom sheet sobre la pantalla de Retos (que queda oscurecida detrás):
  - Ícono `check-circle-2` grande en `success`.
  - Título *"¡Reto completado!"* (H1) y el nombre del reto: *"Haz tu primera transacción en Stellar"*.
  - **`+40 PTS`** grande en ámbar.
  - Línea *"Tu saldo ahora: 120 PTS"* y un chip `badge-check` *"Verificado en Stellar"*.
  - Botón primario **Seguir** (no se cierra solo).
- Detrás, el saldo ya muestra **120 PTS** y el subtítulo *"4 de 6 completados"*. Sin animaciones decorativas.

### 5.8 Errores al escanear (3 variantes en bottom sheet)
Cada una con ícono grande, título, texto y botón **Entendido**:
| Variante | Ícono / color | Título | Texto |
|---|---|---|---|
| A | `check-circle-2` / `text-muted` | Ya completaste este reto 👌 | Cada reto se puede completar una sola vez. |
| B | `refresh-cw` / `points` | El código cambió | Los QR se renuevan cada 30 segundos. Escanéalo de nuevo. |
| C | `clock` / `points` | Este reto aún no está disponible | Se habilita a las 17:00. |

### 5.9 Confirmar canje (después de escanear el QR de la mesa)
- **5.9-A Normal:** bottom sheet con *"Mesa de canje Foro Tech"* (small muted), *"Café"* (H1), **`20 PTS`** grande en ámbar, línea *"Tu saldo después: 60 PTS"*, botón primario **Canjear 20 PTS** y botón secundario **Cancelar**.
- **5.9-B Saldo insuficiente:** igual, con *"Polera Foro Tech"* a **100 PTS**, el botón deshabilitado y el texto en `danger`: *"Te faltan 20 PTS"*.

### 5.10 Canje exitoso
- Pantalla completa con check verde grande, *"¡Listo!"* (H1), *"Muestra esta pantalla en la mesa de canje"*, una tarjeta resumen (Café · −20 PTS · 11:15 · `Ver en Stellar Expert ↗`) y el botón **Volver**.

### 5.11 Modal "Mi cuenta" (solo para la demo)
- Bottom sheet que se abre al tocar la tarjeta de saldo.
- Título *"Mi cuenta"*: *Valeria Quispe · Entrada TICK-001*.
- Bloque **Ver mejor** con dos interruptores grandes: *"Texto más grande"* y *"Tema claro"*.
- Bloque **Datos de la cuenta**: cuenta `GDQ7…K4ZP` con botón de copiar.
- Una sola acción secundaria: **Enviar puntos a una wallet externa**, con la etiqueta `SOLO DEMO` en caption gris.
- Al tocarla, aparece un formulario con el destino **fijo y no editable** `GBXT…9QLM (wallet externa de demo)`, el monto `20 PTS` y el botón **Enviar**.
- **No incluir** la opción de enviar a otro asistente ni un campo de dirección libre.

### 5.12 Rechazo por circuito cerrado (pantalla clave)
- Modal centrado (no bottom sheet) con borde de 1 px en `danger`.
- Ícono `shield-x` grande en `danger`.
- Título: **Transacción rechazada por la red Stellar**
- Texto: *"Política de circuito cerrado: estos puntos solo pueden estar en cuentas autorizadas por el evento (asistentes y mesa de canje). La cuenta de destino no está autorizada."*
- Bloque monoespaciado pequeño: `Código: op_not_authorized`
- Botones: **Ver en Stellar Expert ↗** (secundario) y **Entendido** (primario).
- Debe transmitir seguridad, no alarma: es una protección que funciona.

### 5.13 Evento cerrado
- Estructura común, con la tarjeta en **0 PTS** y el chip `VENCIDOS` en gris.
- Banner arriba: *"Foro Tech 2026 terminó. ¡Gracias por quedarte!"*
- Tarjeta: *"Tus puntos vencieron al cierre del evento. Completaste 4 retos."*
- Las pestañas Retos y Canjear deshabilitadas. El Historial sigue disponible.

### 5.14 Permiso de cámara denegado
- Ícono `camera-off`, *"Necesitamos tu cámara para escanear"*, instrucciones breves (*"Actívala en la configuración del navegador"*), botón primario **Intentar de nuevo** y botón secundario **Ingresar código manualmente**.

### 5.15 Detalle del reto "Haz tu primera transacción en Stellar"
- Bottom sheet. Arriba: avatar `CD`, título del reto (H2) y chip `+40 PTS`.
- Chip con ícono `zap`: *"Se verifica automáticamente"*.
- 3 pasos numerados, en texto simple: *"1. Abre la guía del taller en la Sala B"* · *"2. Envía una transacción de prueba desde tu cuenta de Pasitos"* · *"3. Vuelve aquí: tus puntos llegan solos en unos segundos"*.
- Botón primario **Abrir la guía** y botón secundario **Cerrar**.


### 5.16 Encuesta del evento
- Header con botón **← Volver** y el título *"Encuesta del evento"*. Debajo: *"Propone Quillu Pay · +15 PTS al terminar"*.
- Indicador *"Pregunta 1 de 3"* con barra de progreso.
- Una pregunta por pantalla (sección 4.10), con opciones grandes de ancho completo (56 px de alto cada una).
- Botón primario **Siguiente** (en la última: **Enviar respuestas**).

### 5.17 Cómo funciona
- Header con **← Volver** y el título *"¿Cómo funciona?"*.
- 3 pasos grandes y numerados, cada uno con ícono y una frase: *"1. Cumple retos: ve a charlas, quédate al cierre, responde la encuesta"* · *"2. Escanea el QR de la sala y recibe tus puntos"* · *"3. Canjea tus puntos en la Mesa de canje"*.
- Recuadro informativo: *"Tus puntos valen solo durante Foro Tech 2026 y vencen al cierre. No son dinero."*
- Botón primario **Entendido**.

### 5.18 Entrada no válida
- Pantalla completa con el logo arriba, ícono `ticket` en `danger` y el título *"No pudimos abrir tu entrada"*.
- Texto: *"El link no es válido o la entrada ya se activó en otro celular."*
- Recuadro: *"Acércate a la mesa de informes del evento y te ayudamos."*
- Botón primario **Intentar de nuevo**.

### 5.19 Sin conexión
- Banner fijo arriba en `warning-bg`, con ícono `wifi-off`: *"Sin conexión. Tus puntos están a salvo; los verás al reconectarte."*
- El botón de escanear queda deshabilitado con el texto *"Necesitas conexión para escanear"*.

### 5.20 El evento todavía no empezó
- Logo arriba, *"¡Hola, Valeria!"* y la tarjeta *"Foro Tech 2026 empieza el sábado 21 de noviembre a las 09:00"*.
- Texto: *"Vuelve a abrir este link ese día. Tus retos te estarán esperando."*
- Botón secundario **¿Cómo funciona?**.
---

## 6. Pantalla QR de SALA o STAND (tablet horizontal 1194 × 834 px; también monitor 1920 × 1080)

### 6.1 QR rotativo (pantalla clave para el pitch)
- Fondo `bg` (y una variante en tema claro, sección 3.2).
- **Arriba a la izquierda:** avatar `NC` grande (72 px) + *"Nimbora Cloud"* (H1). Debajo: *"Sala A · Escalando apps en la nube"* (H2) y el chip ámbar *"+20 PTS"*.
- **Arriba a la derecha:** chip `TESTNET` y logo de Pasitos pequeño.
- **Centro:** tarjeta blanca de 420 × 420 px con un **QR negro sobre blanco**, rodeada por un **anillo circular de cuenta regresiva** ámbar, consumido al 60 %, con *"18 s"* debajo.
- Debajo del QR: *"Escanea con la app de Foro Tech 2026"* (H2) y *"El código cambia cada 30 segundos"* (muted).
- **Abajo:** contador **`201`** (56/700) con el texto *"asistentes verificados en esta charla"*. Pie pequeño: *"Hecho con Pasitos"*.
- Sin botones: es una pantalla de exhibición.

### 6.2 Asistencia confirmada (momento)
- La misma pantalla 6.1 con el contador en **`202`** y, debajo, una línea verde con ícono `check-circle-2`: *"Asistencia registrada"* (visible 3 segundos). Sin destellos.

### 6.3 En espera
- Misma estructura que 6.1, sin QR. En el centro, ícono `clock` grande y el texto *"El check-in de la charla de cierre se habilita a las 17:00"* (H1). Debajo: *"Mientras tanto, mira los otros retos en la app"*.
- Variante: *"Este reto ya terminó. ¡Gracias por participar!"*.

---

## 7. MESA DE CANJE (tablet vertical 834 × 1194 px; debe funcionar también en móvil 390 × 844)

### 7.0 Conectar la tablet de la mesa
Sin usuario, contraseña ni código para dictar (D18). Tres estados:
- **Escanear:** cámara a pantalla completa con *"Escanea el QR que te muestra el organizador"*. Abajo: *"¿Te enviaron un enlace? Ábrelo en esta tablet y se conecta sola."*
- **Conectada:** check verde, *"Tablet conectada"*, tarjeta con evento, mesa y quién la conectó, nota *"Si pierdes la tablet, avisa al organizador: la desconecta desde su panel"*. Botón primario **Empezar a cobrar**.
- **Enlace ya usado o vencido:** *"Este enlace ya no sirve"*, explica por qué y pide uno nuevo. Botón primario **Escanear un QR nuevo**.

### 7.1 Nuevo canje
- Header: *"Mesa de canje Foro Tech"* (H1), chip `TESTNET`, y a la derecha *"Canjes hoy: 318"*.
- Grilla de 6 botones grandes de producto (sección 4.4), cada uno con su ícono, nombre y precio en puntos.
- **Sin selector de moneda:** en este evento solo hay puntos.

### 7.2 Esperando confirmación
- Tarjeta blanca grande con el **QR de canje negro sobre blanco**.
- Encima: *"Café · 20 PTS"* (H1 ámbar). Debajo: *"Pide al asistente que escanee este código"* y un indicador pulsante *"Esperando confirmación…"*.
- Botón secundario **Cancelar**.

### 7.3 Canje recibido
- Fondo con un velo verde (`success` al 15 %), check grande verde, *"Canje confirmado"* (H1), *"Café · 20 PTS · Asistente #0231 · 11:15"*, botón primario **Nuevo canje**.
- Abajo, el feed *"Últimos canjes"* con 4 filas (producto, puntos y hora).


### 7.4 Canje vencido o cancelado
- Tarjeta con ícono `clock` en `text-muted`: *"El canje se canceló"* (H1) y *"Pasaron 2 minutos sin confirmación. No se descontaron puntos."*
- Botón primario **Nuevo canje**.
---

## 8. PANEL DEL ORGANIZADOR (desktop 1440 × 900 px)

**Estructura común:** sidebar izquierdo de 240 px con el logo de Pasitos (símbolo + palabra), el chip `TESTNET`, el evento (fijo: *Foro Tech 2026*, sin selector) y el chip `PLAN COMUNIDAD`. Navegación: `Resumen` · `Retos` · `Reporte` · `Estadísticas avanzadas` (con ícono `lock`) · `Cerrar evento`. Arriba a la derecha: *"Comunidad Dev La Paz"* con el avatar `CD`.

### 8.0 Ingreso al panel
- Pantalla dividida: a la izquierda (40 %), fondo `surface` con el logo, el slogan *"Cada paso cuenta."* y la frase *"Puntos por quedarse, reportes que se pueden comprobar."*; a la derecha, el formulario.
- Título *"Ingresa a tu panel"* (H1). Campos con etiqueta visible arriba (no solo placeholder): *Correo* y *Contraseña* (con botón de texto *"Mostrar"*).
- Botón primario **Ingresar** de ancho completo del formulario. Enlace *"¿Olvidaste tu contraseña?"*.
- Al pie: *"¿Tu comunidad aún no usa Pasitos? Solicita el plan Comunidad"* (enlace a 11.1).
- Estado de error (variante): mensaje bajo el campo en `danger` con ícono: *"El correo o la contraseña no coinciden. Revísalos e intenta de nuevo."*

### 8.1 Resumen
- Fila de 4 tarjetas KPI: *Asistentes verificados 287* (contexto: "de 412 inscritos") · *Activos ahora 224* (punto verde "en vivo") · *Retención al cierre 78 %* · *Primera transacción en Stellar 173*.
- **Gráfico de línea** grande: "Asistentes activos por hora", con los datos de la sección 4.7. Línea vertical punteada en las 17:00 con la etiqueta *"Charla de cierre"*. Línea en ámbar, área con degradado suave.
- Tabla *"Participaciones por reto"* (sección 4.8) con una barra horizontal ámbar por fila.
- Tarjeta *"Puntos"*: emitidos 31 890 · canjeados 24 610 · por vencer al cierre 7 280.
- Hacer también la variante en tema claro.

### 8.2 Retos
- Tabla con los 6 retos: Reto · Propone · Recompensa · Verificación · Participaciones · Horario · Estado (toggle Activo/Inactivo).
- Botón primario **+ Nuevo reto**, que abre el modal 8.2-B.
- **8.2-B Modal "Nuevo reto":** campos *Nombre del reto*, *Propone* (select: organizador o un sponsor), *Recompensa en PTS*, *Veces por asistente* (por defecto 1), *Tope total de participaciones*, *Disponible desde* / *hasta* (horas), y *Cómo se verifica* (radio: `QR en sala o stand` · `Automático en Stellar` · `Encuesta` · `Confirmación del organizador`). Botones **Crear reto** y **Cancelar**.

### 8.3 Reporte (compartir)
- Título *"Reporte del evento"* y el texto *"Compártelo con tus sponsors. Cualquiera puede verificar los datos."*
- Tarjeta con el link `pasitos.app/reporte/foro-tech-2026`, botón **Copiar link**, botón secundario **Descargar PDF** e ícono `share-2`.
- Debajo, una vista previa en miniatura del reporte público (9.1).
- Aviso: *"El reporte final estará completo cuando cierres el evento."*

### 8.4 Estadísticas avanzadas (bloqueada)
- Fondo con una vista previa **borrosa** de gráficos (curva por hora, embudo de retención, barras por charla).
- Encima, una tarjeta centrada con el ícono `lock`, el título *"Estadísticas avanzadas"* y la lista: *Asistencia por hora* · *Embudo de retención* · *Asistencia por charla* · *Reporte con la marca de cada sponsor* · *Comparación con ediciones anteriores* · *Resultados de la encuesta* · *Exportar CSV*.
- Botón primario **Desbloquear para este evento** y nota en muted: *"Puedes incluirlo en tu propuesta de patrocinio."*

### 8.5 Cerrar evento
- Tarjeta de advertencia con borde `danger`: *"Cerrar Foro Tech 2026"* y la lista: *"Se desactivan todos los retos y canjes"* · *"Los 7 280 puntos sin usar vencen"* · *"El reporte final queda listo para compartir"*.
- Botón peligro **Cerrar evento y vencer puntos**.
- **8.5-B Modal de confirmación:** *"Esta acción no se puede deshacer"*, input *"Escribe CERRAR para confirmar"*, botón peligro deshabilitado hasta que se escriba la palabra.


### 8.6 Configurar evento
Página con pestañas horizontales con texto: `Datos` · `Sponsors` · `Mesa de canje` · `Ajustes`. Botón primario **Guardar cambios** abajo a la derecha.
- **Datos:** nombre, fecha, horario, lugar (sección 4.10), logo del evento (zona para subir imagen) y nombre del asset de puntos `FORO26` (solo lectura, con ayuda *"Se crea al publicar el evento"*).
- **Sponsors:** lista de los 3 sponsors con su avatar, nombre y retos asociados. Botón secundario **+ Agregar sponsor**.
- **Mesa de canje:** panel *Conectar un dispositivo* con el QR de un solo uso (*"Vence en 1:45 · sirve una sola vez"*), los botones **Copiar enlace de un solo uso** y **Generar QR nuevo**; lista *Dispositivos conectados* con quién los conectó y el botón **Desconectar**; y la tabla del catálogo (sección 4.4) con producto, puntos y stock opcional. Botón secundario **+ Agregar producto**.
- **Ajustes:** interruptor *"Saldo en dólares (variante Feria)"* apagado, con la nota *"Desactivado en el plan Comunidad"*.

### 8.7 Entradas y asistentes
- KPIs: *Entradas cargadas 412* · *Activadas 287* · *Sin activar 125*.
- Botón secundario **Cargar planilla (CSV)** y botón **Descargar links de entrada**.
- Tabla: código de entrada, nombre, estado (`Activada` en verde con ícono / `Sin activar` en gris con ícono) y hora de activación. Buscador con etiqueta.

### 8.8 Pantallas de salas
- Una tarjeta por pantalla (sección 4.10) con su nombre, el reto que muestra, un link corto y los botones **Copiar link** y **Abrir pantalla**.
- Nota: *"Abre cada link en la tablet o el monitor de esa sala. No necesita iniciar sesión."*

### 8.9 Equipo y pausa de emergencia (nivel 3)
- **Equipo:** lista de personas con acceso y su rol, según D19: *Dueño*, *Coorganizador*, *Registrador*, *Operador de mesa*, *Financiador (lector)*. Las *Pantallas de sala* son dispositivos y se listan aparte. Botón **+ Invitar** (por enlace de un solo uso o por email).
- **Check-in en la puerta (rol Registrador):** buscador por nombre, email o código de entrada; resultado con nombre, entrada y estado; botón **Marcar como presente**. Para homónimos se muestra parte del email. Después del check-in se ofrece *"Vincular su celular"* (QR de un solo uso) o *"Imprimir tarjeta"* para quien no tiene celular (D20).
- **Pausa de emergencia:** tarjeta con borde `danger`: *"Pausar todos los retos y canjes"* y botón peligro **Pausar el evento**, con confirmación.
---

## 9. REPORTE PÚBLICO VERIFICABLE (web responsiva: desktop 1440 px y móvil 390 px)

### 9.1 Reporte simple (pantalla clave para el pitch)
Es lo que el organizador comparte con sus sponsors. Debe verse **profesional, claro y confiable**, como un informe que se puede imprimir. Hacer la versión oscura y la clara.

- **Encabezado:** logo de Pasitos pequeño y chip `TESTNET`. Título *"Foro Tech 2026"* (H1), subtítulo *"Comunidad Dev La Paz · La Paz · 21 de noviembre de 2026"*. A la derecha, un sello con el ícono `badge-check` verde: *"Datos verificables en Stellar"*.
- **Fila de 4 KPIs (sección 4.9):** *Asistentes verificados 287* ("de 412 inscritos") · *Retos completados 1 022* · *Retención al cierre 78 %* · *Primera transacción en Stellar 173* ("60 % de los asistentes").
- **Sección "Resultados por sponsor":** 3 tarjetas, una por sponsor, con su avatar y una frase grande:
  - *Nimbora Cloud* — **201** asistentes en su charla
  - *Kodara Academy* — **142** probaron su clase
  - *Quillu Pay* — **118** respondieron su encuesta
- **Sección "Participación por reto":** tabla simple de la sección 4.8 (sin gráficos de tiempo).
- **Sección "Puntos":** emitidos 31 890 · canjeados 24 610 · vencidos 7 280.
- **Sección "Verifícalo tú mismo":** tarjeta con borde `success`: *"Estos números están registrados en la red Stellar y nadie puede modificarlos, ni el organizador ni Pasitos."*, el contrato `CDLZ…7Q3M` con botón de copiar y el botón **Ver en Stellar Expert ↗**.
- **Pie:** *"Hecho con Pasitos · Cada paso cuenta."*
- **No incluir** gráficos por hora, embudos, comparaciones ni datos personales (eso es parte de las estadísticas avanzadas).


### 9.2 Reporte en PDF (nivel 3)
- Una página A4 vertical en tema claro con el mismo contenido de 9.1, en una columna, con el enlace de verificación escrito completo y un QR que lleva al reporte web.
---

## 10. VARIANTE FERIA (saldo USD activado) — prioridad baja

Solo para mostrar que Pasitos también sirve en ferias con venta. Mismo design system. Equivalencia fija: **10 PTS = $1.00**. Asistente con **80 PTS** y **$15.00 USD**.

### 10.1 Asistente con saldo dual
- Igual que 5.2, pero la tarjeta de saldo se divide en dos mitades: izquierda **`80 PTS`** (ámbar, chip `VENCE AL CIERRE`); derecha **`$15.00`** en `usd-text`, label *"Saldo USD"* y botón de texto *"Reembolsar"*.

### 10.2 Confirmar pago en USD
- Bottom sheet: *"Tienda Foro Tech"*, *"Polera Foro Tech"*, **`$10.00`** en `usd-text`, línea ámbar pequeña *"Ganarás +5 PTS"*, *"Tu saldo después: $5.00"*, botón con fondo `usd` y texto blanco **Pagar $10.00**, y **Cancelar**.

### 10.3 Reembolso
- **A:** *"¿Reembolsar tu saldo?"*, **`$15.00`**, *"Se devolverá a tu método de pago original. Tus puntos no cambian."*, botón USD **Reembolsar $15.00**.
- **B:** check verde, *"Reembolso solicitado"*, saldo en **$0.00**.

### 10.4 Comercio con selector de moneda
- Igual que 7.1, con un **control segmentado** `Puntos | USD` arriba. Cada producto muestra solo el precio en la moneda elegida (ej. Café `20 PTS` o `$2.00`). Hacer las dos variantes.

---

## 11. SITIO PÚBLICO (web responsiva: desktop 1440 px y móvil 390 px)

### 11.0 Landing de Pasitos
Página simple, en tema claro, con una sola idea por bloque:
- **Header:** logo, enlaces *Cómo funciona* · *Planes* · *Ingresar* y botón primario **Solicitar plan Comunidad**.
- **Portada:** título *"Cada paso cuenta."* (headline-xl), subtítulo *"Puntos por quedarse, reportes que se pueden comprobar."*, botón primario **Solicitar plan Comunidad** y botón secundario **Ver un reporte de ejemplo**. Al lado, una captura del celular con la pantalla 5.2.
- **El problema:** 3 frases cortas con ícono: *"La gente se va antes del cierre"* · *"El merch se lo llevan unos pocos"* · *"Al sponsor solo le llegan fotos"*.
- **Cómo funciona:** 3 pasos numerados (Retos → Puntos → Reporte verificable).
- **Planes:** 3 tarjetas: *Comunidad* (gratis, con aprobación) · *Programa* (a medida, por evento) · *Feria* (comisión por venta).
- **Pie:** *"Hecho en Bolivia sobre la red Stellar"* y contacto.

### 11.1 Formulario de solicitud
- Página simple con el logo, el slogan, la frase de apoyo y el título *"Plan Comunidad: Pasitos gratis para tu comunidad"*.
- Columna izquierda con lo que incluye: *Retos y puntos sin costo* · *Canje de merch y meriendas* · *Reporte verificable para tus sponsors* · *Estadísticas avanzadas opcionales*.
- Columna derecha con el formulario: *Nombre de la comunidad*, *Responsable*, *Email o WhatsApp*, *Redes de la comunidad*, *Tipo de evento* (select), *Asistentes estimados* (máx. 300), *Fecha del evento*. Checkbox: *"Mostraremos «Hecho con Pasitos» en el evento"*.
- Botón primario **Enviar solicitud** y nota: *"Respondemos en 48 horas."*

### 11.2 Solicitud enviada
- Ícono `check-circle-2` grande en `success`, *"¡Recibimos tu solicitud!"* (H1) y *"Te responderemos en 48 horas al contacto que dejaste."*
- Resumen de lo enviado (nombre de la comunidad, evento y fecha) y botón secundario **Volver al inicio**.

---

## 12. HERRAMIENTAS INTERNAS Y SISTEMA (nivel 3)

### 12.1 Bandeja de solicitudes del plan Comunidad (equipo Pasitos)
- Tabla con las solicitudes (sección 4.10): comunidad, responsable, asistentes estimados, fecha y estado (`Pendiente` / `Aprobada` / `Rechazada`, cada uno con ícono).
- Al seleccionar una, panel lateral con los datos y los botones **Aprobar** (primario) y **Rechazar** (secundario), más el indicador *"Presupuesto del mes: $96 de $150 usados"*.

### 12.2 Página no encontrada
- Logo, *"No encontramos esta página"* (H1), *"Revisa el link o vuelve al inicio."* y botón primario **Ir al inicio**.

---

## 13. Prioridad (si la herramienta tiene límite de generación)

Seguir los niveles del [Inventario de vistas](05-inventario-de-vistas.md). El **nivel 1** es el mockup inicial:

1. **5.1** Bienvenida · **5.2** Inicio · Retos · **5.7** Reto completado · **5.3 + 5.9-A** Canjear y confirmar · **5.12** Rechazo por circuito cerrado
2. **6.1** Pantalla QR de sala
3. **7.1 → 7.2 → 7.3** Mesa de canje
4. **8.0** Ingreso al panel · **8.1** Resumen · **8.2** Retos con el modal Nuevo reto
5. **9.1** Reporte público (tema claro)

Después, el **nivel 2** (resto de las secciones 5 a 8, y 11.0 a 11.2) y por último el **nivel 3** (temas claros extra, sección 10, 8.9, 9.2 y 12).

---

## 14. Checklist para revisar los mockups generados

- [ ] Se usa el logo existente de las dos flechas (no uno nuevo) junto a la palabra "Pasitos", y hay un chip `TESTNET` en todas las vistas.
- [ ] Puntos siempre en ámbar. USD **solo** en la sección 10 y siempre en azul.
- [ ] Todos los QR son negros sobre blanco, con margen.
- [ ] No hay texto blanco sobre ámbar.
- [ ] No existe ningún botón para enviar puntos a otro asistente ni para convertir puntos en dinero.
- [ ] No aparecen tarifas por lead ni montos cobrados a sponsors.
- [ ] Solo aparecen nombres ficticios: Comunidad Dev La Paz, Nimbora Cloud, Kodara Academy, Quillu Pay.
- [ ] Los números coinciden con la sección 4 (80 PTS, 287 asistentes, 78 %, 173, 1 022…).
- [ ] El reporte público tiene la sección "Verifícalo tú mismo" y el pie con el slogan.
- [ ] No hay login de asistentes, catálogo de eventos, rankings ni NFTs.
- [ ] Todo el texto está en español.
- [ ] Hay un solo botón principal por pantalla, de ancho completo y 56 px en móvil, con un verbo que dice lo que hace.
- [ ] Ningún texto de lectura mide menos de 16 px, ni ningún chip menos de 12 px.
- [ ] Cada estado tiene ícono + texto, además del color.
- [ ] Cada pantalla tiene título visible y forma de volver.
- [ ] No hay animaciones decorativas ni mensajes importantes que desaparezcan solos.
