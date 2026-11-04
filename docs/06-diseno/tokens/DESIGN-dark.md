---
name: Pasitos Oscuro
colors:
  surface: '#0f131d'
  surface-dim: '#0f131d'
  surface-bright: '#353944'
  surface-container-lowest: '#0a0e18'
  surface-container-low: '#171b26'
  surface-container: '#1c1f2a'
  surface-container-high: '#262a35'
  surface-container-highest: '#313540'
  on-surface: '#dfe2f1'
  on-surface-variant: '#d8c3ad'
  inverse-surface: '#dfe2f1'
  inverse-on-surface: '#2c303b'
  outline: '#a08e7a'
  outline-variant: '#534434'
  surface-tint: '#ffb95f'
  primary: '#ffc174'
  on-primary: '#472a00'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#855300'
  secondary: '#ffb599'
  on-secondary: '#5a1c00'
  secondary-container: '#f66018'
  on-secondary-container: '#4f1700'
  tertiary: '#b0ceff'
  on-tertiary: '#00315f'
  tertiary-container: '#7eb3ff'
  on-tertiary-container: '#004480'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#d4e3ff'
  tertiary-fixed-dim: '#a5c8ff'
  on-tertiary-fixed: '#001c3a'
  on-tertiary-fixed-variant: '#004786'
  background: '#0f131d'
  on-background: '#dfe2f1'
  surface-variant: '#313540'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.03em
  display-hero-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-numeric:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 2rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

# Pasitos · Tema oscuro

> **Estado:** vigente (fuente de verdad del tema oscuro) · **Última revisión:** 2026-11-03
> La cabecera YAML es la exportación de la herramienta de diseño y se mantiene por compatibilidad. Para implementar, usa los **tokens semánticos** de este texto y del [Design system](../02-design-system.md). Si hay diferencias, mandan estos textos y las reglas del design system.

## Marca y estilo

Este design system define una estética fintech de alto rendimiento, pensada desde el inicio para el modo oscuro y para las economías de circuito cerrado de los eventos en Stellar. La personalidad combina confianza, velocidad y la energía de un evento en vivo. Tiene que funcionar en condiciones difíciles: lugares oscuros, sol fuerte, ruido y muchas transacciones seguidas.

### Público y emoción buscada
- **Asistentes:** deben sentir certeza al escanear, cero esfuerzo para ver su saldo y emoción al acumular puntos (PTS).
- **Mesas de canje y organizadores:** necesitan una respuesta visual rápida, estados de validación inconfundibles y datos densos y confiables de un vistazo.
- **Emoción:** velocidad sin fricción, precisión, gratificación táctil y calidez luminosa sobre negros profundos.

### Dirección estética: vidrio oscuro con movimiento
Se inspira en el logo de las dos flechas, que representa el avance paso a paso y los dos saldos (puntos y dólares). Combina:
- **Superficies obsidiana profundas:** negros estructurales con matices azul pizarra (`#0B0F19`, `#111827`), que ahorran batería en pantallas OLED.
- **Acentos solares luminosos:** amarillo dorado (`#F59E0B`) y naranja ámbar (`#EA580C`) como señales para los botones principales y el saldo de puntos.
- **Acabado táctil:** brillos sutiles en los bordes (1 px), resplandores difusos y una jerarquía de contraste disciplinada que apunta a WCAG AAA.

## Colores

La paleta toma los dos tonos cálidos del logo sobre un fondo obsidiana. Este tema funciona solo en modo oscuro.

### Roles y contraste
- **Primario (oro solar, `#F59E0B` / `#EAB308`):** botones principales, resaltados activos y saldo de puntos (PTS). Sobre botones dorados el texto va **siempre en obsidiana `#0B0F19`** (contraste mayor a 11:1).
- **Secundario (ámbar cinético, `#EA580C` / `#F97316`):** indicadores de dirección, pasos de progreso y estados destacados. Los cambios de estado de alta energía usan el degradado de `#F59E0B` a `#EA580C`.
- **Terciario (azul USD, `#2775CA` / `#3B82F6`):** **exclusivo para el saldo en dólares** (variante Feria): cargas, pagos y reembolsos. No se usa para nada más, para que nadie confunda puntos con dinero.
- **Neutros:**
  - `canvas-default`: `#0B0F19` (fondo base)
  - `surface-elevated`: `#111827` (tarjetas y bottom sheets)
  - `surface-highlight`: `#161F30` (grupos anidados, hover, filas de tabla)
  - `border-subtle`: `rgba(255, 255, 255, 0.08)`
  - `border-focus`: `rgba(245, 158, 11, 0.40)`
  - `text-primary`: `#F9FAFB`
  - `text-secondary`: `#9CA3AF`
  - `text-tertiary`: `#6B7280`

### Semántica y aislamiento del QR
- **Éxito (esmeralda, `#10B981`):** confirmación de retos completados y canjes recibidos.
- **Peligro (carmesí, `#EF4444`):** rechazos, caídas de red o saldo insuficiente.
- **Contenedor de QR intocable:** los QR siempre van sobre un contenedor blanco sólido (`#FFFFFF`), sin textura, con módulos negros puros (`#000000`) y una zona de silencio mínima de 16 px. Nunca se aplica oscuridad, transparencia ni tinte amarillo al área del QR.

## Tipografía

La jerarquía usa **Plus Jakarta Sans** para títulos expresivos y **Inter** para la legibilidad en datos, formularios y textos pequeños.

### Números tabulares
Todos los contadores de puntos, montos y totales usan números tabulares (`font-variant-numeric: tabular-nums` o `font-feature-settings: "tnum" 1`). Así los números no "saltan" cuando el saldo se anima.

### Jerarquía y espaciado entre letras
- Los estilos display y `headline-lg` usan un espaciado más cerrado (`-0.02em` a `-0.03em`) para una presencia moderna y compacta.
- Las etiquetas pequeñas, chips y categorías usan mayúsculas con espaciado `0.04em` en Inter SemiBold, para leerse bien al sol o con luces de escenario.

## Layout y espaciado

El sistema parte de una unidad base de 4 px, con incrementos principales de 8, 16, 24 y 40 px.

### Adaptación por dispositivo
- **Móvil (320–640 px):** 4 columnas fluidas con márgenes y gutters de `1rem`. Las acciones principales y el botón de escanear quedan en la zona del pulgar, en una barra inferior fija.
- **Tablet / mesa de canje (641–1024 px):** 8 columnas con márgenes y gutters de `1.5rem`. Permite dividir la pantalla en lista y detalle.
- **Desktop / panel (1025 px o más):** 12 columnas con un ancho máximo de `1280px`, márgenes de `3rem` y gutters de `2rem`. Pensado para que el organizador siga el evento en vivo.

### Escala de espacios
- `space-xs` (4 px): separación entre íconos y etiquetas.
- `space-sm` (8 px): relleno interno de inputs y espacio vertical entre filas.
- `space-md` (16 px): relleno interno estándar de componentes.
- `space-lg` (24 px): separación entre bloques de tarjetas y secciones.
- `space-xl` (40 px): transiciones grandes y relleno de modales.

## Elevación y profundidad

La jerarquía no depende de sombras pesadas, que se ven artificiales sobre fondos OLED. La profundidad se logra con capas tonales, desenfoques tipo vidrio y bordes de 1 px que captan la luz.

### Niveles de superficie
1. **Nivel 0 (fondo):** `#0B0F19` sólido. Sin elevación.
2. **Nivel 1 (tarjetas y listas):** `#111827` con borde `1px solid rgba(255, 255, 255, 0.06)` y sombra suave `0 4px 20px -2px rgba(0, 0, 0, 0.50)`.
3. **Nivel 2 (módulos flotantes y modales):** `#161F30` con `backdrop-filter: blur(16px)`, borde `1px solid rgba(255, 255, 255, 0.12)` y sombra `0 12px 32px -4px rgba(0, 0, 0, 0.70)`.
4. **Nivel 3 (foco o seleccionado):** aura ámbar `0 0 0 1px #F59E0B` y resplandor exterior `0 0 24px -4px rgba(245, 158, 11, 0.25)`.

### Vidrio
Los headers de navegación y los bottom sheets usan `background: rgba(17, 24, 39, 0.85)` con `backdrop-filter: blur(12px) saturate(160%)`, para que el contenido de abajo se desenfoque suavemente.

## Formas

Radios unificados con el tema claro:

- **Chips y etiquetas pequeñas:** `9999px` (píldora). Tooltips: `0.375rem` (6 px).
- **Botones e inputs:** `0.75rem` (12 px).
- **Tarjetas, módulos de QR, modales y bottom sheets:** `1rem` (16 px). Borde superior de los bottom sheets: `1.5rem` (24 px).
- **Botón "Escanear código QR":** igual que los botones (12 px), de ancho completo.

## Componentes

### Botones
- **Principal:** degradado de `#F59E0B` a `#EA580C` (135°) o `#F59E0B` sólido. Texto Inter Bold en `#0B0F19` (siempre oscuro, por accesibilidad). Alto mínimo de 48 px. Al presionarlo se comprime levemente (`scale(0.98)`).
- **Secundario:** fondo `#161F30`, borde `1px solid rgba(255, 255, 255, 0.12)` y texto `#F9FAFB`. En hover, el borde pasa a `#F59E0B`.
- **Terciario / texto:** fondo transparente, texto `#F59E0B`, con subrayado sutil o una flecha.
- **Peligro:** fondo `#EF4444` y texto `#0B0F19`.

### Módulo de QR
- Tarjeta blanca (`#FFFFFF`) con radio de 16 px y un bisel exterior obsidiana.
- Contiene el QR dinámico en `#000000`.
- Debajo del código, un anillo de cuenta regresiva animado muestra cuánto falta para que el QR cambie (30 s).

### Tarjeta de saldo
- **Planes Comunidad y Programa:** una sola sección de **puntos (PTS)** en amarillo dorado (`#F59E0B`) con números tabulares, el chip *"Vence al cierre"* y la insignia de las dos flechas.
- **Variante Feria:** se agrega una segunda sección de **saldo en dólares** en azul (`#3B82F6`), claramente separada de los puntos.
- No hay detalles técnicos (hashes, llaves) en la tarjeta. El enlace "Ver en Stellar Expert" solo aparece en el historial y en los modales de detalle.

### Chips e insignias
- **Estado:** forma de píldora con fondo semitransparente (ej. éxito: fondo `rgba(16, 185, 129, 0.15)`, texto `#10B981`, borde `1px solid rgba(16, 185, 129, 0.3)`).
- **Red:** chip compacto **`TESTNET`** con un punto pulsante que indica que la red está activa. No se muestran nombres técnicos como "Soroban" en la vista del asistente.

### Inputs
- Contenedor `#111827`, borde `1px solid rgba(255, 255, 255, 0.10)`, texto `#F9FAFB` y placeholder `#6B7280`.
- Al enfocar: borde `1px solid #F59E0B` con `box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15)`.
- *(Feria)* Los inputs de monto en dólares pueden tener botones rápidos de carga (`+$5`, `+$10`, `+$20`).

### Checkboxes y radios
- Tamaño de 20 × 20 px, fondo `#161F30` y borde `1px solid rgba(255, 255, 255, 0.2)`.
- Marcado: fondo `#F59E0B` con el check en `#0B0F19`.
