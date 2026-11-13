# Design system

> **Estado:** vigente · **Última revisión:** 2026-11-13
> **Fuente de verdad:** [tokens/DESIGN-dark.md](tokens/DESIGN-dark.md) (tema oscuro) y [tokens/DESIGN-light.md](tokens/DESIGN-light.md) (tema claro). Este documento resume las reglas que aplican a los dos temas y cómo se resolvieron las diferencias entre ellos.

## 1. Cuándo se usa cada tema

**Desde la versión piloto (D36), todas las vistas usan el tema claro por defecto:** sitio público, app del asistente, salas, mesas, paneles, consola y reporte.

- Los tokens de los **dos** temas se implementan desde el inicio como variables CSS. Ningún componente usa colores fijos.
- El **tema oscuro** será una preferencia de cada persona: el equipo la guarda en su cuenta y el asistente en su navegador, con la opción *Automático (según el sistema)*. Queda para después del piloto.

| Vista | Tema en el piloto | Después |
|---|---|---|
| Sitio público, eventos y reporte (`/`, `/eventos`, `/reporte/:evento`) | Claro | Claro, o según la preferencia del sistema |
| App del asistente (`/app`) | Claro | Preferencia del asistente |
| Pantalla de sala o stand (`/sala`) | Claro | Configurable por pantalla |
| Mesa de canje (`/mesa`) | Claro | Configurable por dispositivo |
| Panel del organizador y consola (`/admin`, `/plataforma`) | Claro | Preferencia de cada persona del equipo |

**Ojo con los proyectores:** muchos lavan los colores oscuros y los bordes sutiles desaparecen. Hay que probar el tema elegido en el proyector real.

## 2. Reglas que aplican a todo

1. **Puntos siempre en ámbar/dorado; dólares siempre en azul.** El azul se usa **solo** para el saldo en dólares (variante Feria), nunca para "transacciones on-chain" ni para enlaces genéricos.
2. **Texto oscuro `#0B0F19` sobre botones ámbar o con degradado**, en los dos temas. El blanco sobre `#F59E0B` da un contraste de 2,2 y no se lee.
3. **QR negro sobre blanco**, dentro de una tarjeta blanca con zona de silencio (al menos 16 px o 4 módulos), aunque el resto sea oscuro. Muchos lectores no leen QR invertidos.
4. **Números tabulares** en saldos, contadores y métricas.
5. **Zonas táctiles de al menos 48 × 48 px** en móvil y tablet (más reglas en la sección 3).
6. **Los bordes no son el único indicador** de un campo o botón: también tienen fondo o texto distinguible.
7. **Sin jerga cripto en la vista del asistente** (ver [UX y pantallas](03-ux-y-pantallas.md)): nada de "Soroban", "gas", "gasless", "token", hashes en la tarjeta de saldo ni llaves visibles. El chip de red dice **`TESTNET`**.

## 3. Reglas de UX y accesibilidad

A los eventos va gente de todas las edades. **Diseñamos pensando en una persona mayor que usa el celular con poca práctica, de pie, con mala luz y apurada.** Si a ella le funciona, le funciona a todos.

### 3.1 Principios

1. **Simple y minimalista.** Pocas cosas por pantalla, mucho aire y nada decorativo que compita con la acción.
2. **Una acción principal por pantalla.** Un solo botón principal (ámbar), ancho completo en móvil y siempre en el mismo lugar (abajo, al alcance del pulgar). Las acciones secundarias van con contorno y debajo.
3. **Flujos evidentes.** En cada pantalla se responde: ¿dónde estoy?, ¿qué puedo hacer?, ¿qué pasa si toco esto? Título visible, botón "Volver" con texto y pasos numerados cuando hay más de uno.
4. **Lenguaje simple.** Frases cortas, verbos claros y nada de jerga. Los botones dicen exactamente lo que hacen: *"Canjear 20 puntos"*, no *"Confirmar"*.
5. **Siempre hay respuesta.** Toda acción muestra qué está pasando (*"Verificando…"*) y cómo terminó (éxito o error, con el siguiente paso).

### 3.2 Reglas concretas

| Tema | Regla |
|---|---|
| **Tamaño de texto** | Texto de lectura de 16 px como mínimo (18 px en la información clave del asistente). Nada por debajo de 12 px, ni siquiera en chips |
| **Contraste** | Mínimo 4,5:1 en todo el texto y apuntar a 7:1 en el texto principal. La información importante nunca va en gris tenue |
| **Botones** | Alto mínimo de 48 px; **56 px para la acción principal en móvil**. Separación de al menos 8 px entre botones tocables |
| **Íconos** | Siempre acompañados de texto. Nunca un botón que sea solo un ícono, salvo "Cerrar" (✕) con su etiqueta accesible |
| **Color** | Nunca es el único indicador. Cada estado lleva **ícono + texto + color** (ej. ✓ *Completado* en verde) |
| **Navegación** | Barra inferior fija con etiquetas visibles. Sin gestos ocultos (deslizar, mantener presionado) como única forma de hacer algo |
| **Mensajes** | La información importante (reto completado, errores) **no desaparece sola**: se queda hasta que la persona toca *"Entendido"* o *"Seguir"* |
| **Errores** | Dicen qué pasó y qué hacer, con un botón para hacerlo. Sin códigos técnicos para el asistente (excepto en el modal de demo) |
| **Acciones irreversibles** | Siempre piden confirmación, con el botón de peligro separado del resto |
| **Animación** | Mínima: solo transiciones funcionales de 200 ms o menos (abrir una hoja, cambiar de pestaña). Sin confeti, rebotes, parallax ni números que vuelan. Respetar `prefers-reduced-motion` |
| **Tiempo** | El asistente nunca tiene que apurarse. El QR rota cada 30 s, pero se acepta el anterior durante unos segundos de gracia |
| **Zoom** | La interfaz soporta zoom de texto al 200 % sin romperse. Nunca se desactiva el zoom del navegador |
| **Densidad** | En móvil, como máximo unas 5 o 6 tarjetas visibles. Las listas largas se agrupan (Pendientes · Completados) |
| **Ayuda** | Siempre a un toque: enlace *"¿Cómo funciona?"* en el inicio del asistente |
| **Ajustes** | En *Mi cuenta*: **texto más grande** y, después del piloto, **tema oscuro** (D36) |

### 3.3 Cómo revisar una pantalla

- [ ] ¿Se entiende qué hacer en 5 segundos, sin explicación?
- [ ] ¿Hay un solo botón principal y se lee qué hace?
- [ ] ¿Todos los textos se leen con el brillo bajo?
- [ ] ¿Cada estado tiene ícono y texto, además de color?
- [ ] ¿Todos los botones tienen al menos 48 px de alto?
- [ ] ¿Hay forma de volver atrás?
- [ ] ¿Funciona con el texto al 200 %?

## 4. Tokens semánticos

| Token | Oscuro | Claro | Uso |
|---|---|---|---|
| `bg` | `#0B0F19` | `#F8FAFC` | Fondo |
| `surface` | `#111827` | `#FFFFFF` | Tarjetas, bottom sheets |
| `surface-2` | `#161F30` | `#F1F5F9` | Elementos anidados, hover, filas |
| `border` | `rgba(255,255,255,0.08)` | `#CBD5E1` | Bordes de 1 px |
| `text` | `#F9FAFB` | `#0B0F19` | Texto principal |
| `text-muted` | `#9CA3AF` | `#475569` | Texto secundario |
| `points` | `#F59E0B` | `#B45309` (texto) / `#D97706` (íconos) | Puntos, marca, botón principal |
| `on-points` | `#0B0F19` | `#0B0F19` | Texto sobre ámbar o degradado |
| `accent` | `#EA580C` | `#EA580C` | Progreso, extremo del degradado |
| `brand-gradient` | `135deg, #F59E0B → #EA580C` | Igual | Botón principal, logros |
| `usd` | `#2775CA` (fondos) / `#3B82F6` (textos) | `#2563EB` / `#1D4ED8` | **Solo** saldo en dólares (Feria) |
| `success` | `#10B981` | `#047857` | Confirmaciones |
| `danger` | `#EF4444` | `#B91C1C` | Errores, rechazos |
| `warning-bg` | `#3A2A0B` | `#FEF3C7` | Avisos suaves ("Disponible desde las 17:00") |
| `qr-bg` / `qr-fg` | `#FFFFFF` / `#000000` | Igual | Cualquier QR |

## 5. Tipografía

| Estilo | Fuente | Tamaño / peso | Uso |
|---|---|---|---|
| Display | Plus Jakarta Sans | 48/800 (móvil 36) | Saldo de puntos, KPIs principales del reporte |
| Headline L | Plus Jakarta Sans | 32/700 (móvil 26) | Títulos de pantalla |
| Headline M | Plus Jakarta Sans | 22/600 | Títulos de tarjetas y secciones |
| Body L | Inter | 16/400 | Texto general |
| Body M | Inter | 14/400 | Secundario |
| Label | Inter | 12–13/600, mayúsculas con +0.04em | Chips (`TESTNET`, `VENCE AL CIERRE`, `PLAN COMUNIDAD`) |
| Contador QR | Plus Jakarta Sans | 56/700 | Contador de la pantalla QR |

## 6. Forma y espaciado

- Grilla de 8 px (con medios pasos de 4 px).
- Márgenes laterales: 16 px en móvil, 24 px en tablet y 32–48 px en desktop.
- Radios: **12 px** en botones e inputs, **16 px** en tarjetas y modales, **24 px** en el borde superior de los bottom sheets y **píldora** en los chips.
- Íconos: **Lucide** (trazo de 1,75 px).

## 7. Diferencias resueltas entre los dos archivos de tokens

Al unificar los temas se corrigieron estas diferencias. Los archivos de tokens ya están ajustados:

| Tema | Antes | Ahora | Motivo |
|---|---|---|---|
| Claro | Texto blanco en el botón principal | Texto `#0B0F19` | Contraste insuficiente |
| Oscuro | Azul también para "transacciones Stellar" | Azul solo para dólares | No confundir puntos con dinero |
| Oscuro | Radio base de 8 px en botones | 12 px, igual que el claro | Consistencia entre temas |
| Oscuro | Chip de red "Stellar Soroban" | Chip `TESTNET` | Sin jerga en la vista del asistente |
| Oscuro | Tarjeta de saldo que gira para mostrar hash y llaves | Sin detalles técnicos en la tarjeta | Sin jerga; las llaves nunca se muestran |
| Ambos | Selectores de monto (`25 %`, `MAX`, `Max PTS`) | Solo botones de carga en dólares en la variante Feria | Los puntos no se transfieren ni se cargan |
| Ambos | Tarjeta de saldo dual siempre | Solo puntos; dual solo en la variante Feria | Modelo de negocio vigente |
| Ambos | Textos en inglés | En español | Idioma del proyecto |

## 8. Componentes clave

Los detalles de cada componente están en los archivos de tokens. Los más importantes para el producto:

| Componente | Especificación resumida |
|---|---|
| **Botón principal** | Degradado de marca o `#F59E0B`, texto `#0B0F19`, 56 px de alto en móvil (48 en desktop), ancho completo en móvil, radio de 12 |
| **Barra inferior del asistente** | Botón principal fijo *"Escanear código QR"* de ancho completo + 3 pestañas con etiqueta (Retos · Canjear · Historial) |
| **Tarjeta de reto** | Avatar del sponsor (círculo de 40 px con iniciales), título, quién lo propone, **cómo se verifica** (ícono + texto), chip `+20 PTS` y estado |
| **Tarjeta de saldo** | Puntos en display tabular, chip *"Vence al cierre"* e insignia de las dos flechas |
| **Módulo de QR** | Tarjeta blanca con radio de 16, QR negro y anillo de cuenta regresiva de 30 s |
| **Confirmación de éxito** | Bottom sheet con ícono `check-circle-2` grande en `success`, título, detalle y botón **Seguir**. No desaparece sola |
