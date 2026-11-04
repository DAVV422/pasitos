---
name: Pasitos Claro
colors:
  surface: '#faf8ff'
  surface-dim: '#d7d9e8'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#ebedfc'
  surface-container-high: '#e5e7f6'
  surface-container-highest: '#dfe2f1'
  on-surface: '#171b26'
  on-surface-variant: '#554336'
  inverse-surface: '#2c303b'
  inverse-on-surface: '#eef0ff'
  outline: '#887364'
  outline-variant: '#dbc2b0'
  surface-tint: '#904d00'
  primary: '#8d4b00'
  on-primary: '#ffffff'
  primary-container: '#b15f00'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb77d'
  secondary: '#a73a00'
  on-secondary: '#ffffff'
  secondary-container: '#fd651e'
  on-secondary-container: '#571a00'
  tertiary: '#0051d5'
  on-tertiary: '#ffffff'
  tertiary-container: '#316bf3'
  on-tertiary-container: '#fefcff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdcc3'
  primary-fixed-dim: '#ffb77d'
  on-primary-fixed: '#2f1500'
  on-primary-fixed-variant: '#6e3900'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b4c5ff'
  on-tertiary-fixed: '#00174b'
  on-tertiary-fixed-variant: '#003ea8'
  background: '#faf8ff'
  on-background: '#171b26'
  surface-variant: '#dfe2f1'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.03em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  title-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  numeric-balance-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.02em
  numeric-balance-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-tablet: 1.5rem
  gutter-desktop: 2rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 2.5rem
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

# Pasitos · Tema claro

> **Estado:** vigente (fuente de verdad del tema claro) · **Última revisión:** 2026-11-03
> Se usa en proyectores, en la pantalla QR cuando se proyecta, en el panel y en el reporte público o impreso.
> La cabecera YAML es la exportación de la herramienta de diseño y se mantiene por compatibilidad. Para implementar, usa los **tokens semánticos** de este texto y del [Design system](../02-design-system.md). Si hay diferencias, mandan estos textos y las reglas del design system.

## Marca y estilo

Este tema lleva el lenguaje visual de Pasitos a situaciones con mucha luz: auditorios de día, ferias al aire libre y pantallas proyectadas. Combina la confiabilidad de un registro verificable con la energía de un evento en vivo.

La base es una **fintech moderna de alto contraste** con una respuesta táctil nítida:
- **Claridad con reflejos:** alto contraste, peso visual deliberado y divisores nítidos que se leen bajo luz exterior, en proyectores y en pantallas inclinadas en la mesa de canje.
- **Dos saldos bien distintos:** los puntos usan ámbar y ocre con acentos naranja; el saldo en dólares (solo variante Feria) usa un azul de registro contable.
- **Credibilidad física:** las superficies recuerdan tarjetas blancas impecables, con bordes sutiles y elevaciones mínimas en lugar de desenfoques pesados, para rendir bien en celulares de gama baja.

## Colores

La paleta está ajustada para leerse en modo claro, apuntar a contraste WCAG AAA sobre blanco y reconocerse al instante durante el evento.

### Fondo y estructura
- **Fondo (`#F8FAFC`):** pizarra suave antirreflejo que separa el contenido de la luz ambiente.
- **Tarjetas y hojas (`#FFFFFF`):** blanco puro para planos elevados, modales, bottom sheets y módulos seguros.
- **Subsuperficie (`#F1F5F9`):** inputs, filas alternas de tablas, controles segmentados y filas inactivas.
- **Divisores y bordes (`#CBD5E1`):** bordes de 1 px que dan estructura sin ensuciar.
- **Texto principal (`#0B0F19`):** azul pizarra profundo con el máximo contraste para saldos, títulos y datos de auditoría.
- **Texto secundario (`#475569`):** pizarra accesible para textos pequeños y horas.

### Marca y saldos
- **Puntos (`#D97706` / `#B45309`):** ámbar profundo y ocre para textos, íconos y elementos interactivos sobre blanco, donde los amarillos claros se pierden.
- **Acento del logo (`#F59E0B`):** oro ámbar para ilustraciones, insignias y extremos de degradados.
- **Acción (`#EA580C`):** naranja de alta energía para acciones en vivo, check-ins y progreso.
- **Degradado de marca:** `linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)`, solo en los botones principales y en las tarjetas de logro.
- **Saldo en dólares (`#2563EB` / `#1D4ED8`):** azul fintech **exclusivo para el saldo en dólares** (variante Feria), para no confundirlo con los puntos.

### Estado y verificación
- **Éxito (`#047857`):** verde esmeralda para retos completados y canjes confirmados.
- **Peligro (`#B91C1C`):** rojo para rechazos, circuito cerrado, saldo insuficiente y caídas de red.
- **Pendiente (`#B45309` sobre `#FEF3C7`):** insignias ámbar para "Verificando…" y retos bloqueados por horario.
- **Aislamiento del QR:** zona de silencio blanca `#FFFFFF` con módulos `#000000`, para que lo lean todos los celulares.

## Tipografía

La escala combina **Plus Jakarta Sans** para títulos enérgicos y números de saldo con **Inter** para datos, etiquetas y textos pequeños.

### Reglas para números y datos
- **Números tabulares:** siempre `font-variant-numeric: tabular-nums` en puntos, montos, cuentas regresivas e identificadores, para que no haya saltos al actualizarse.
- **Saldos:** los prefijos y sufijos (`$`, `USD`, `PTS`) van al 65 % del tamaño del número, alineados ópticamente a la línea base.
- **Direcciones y hashes:** solo en el panel, el reporte y los modales de detalle. Se muestran truncados (`G…4X9`) en `body-sm`, dentro de un chip con fondo propio.

## Layout y espaciado

Grilla base de **8 pt** con columnas fluidas, desde el uso a una mano en el celular hasta las pantallas del panel.

### Breakpoints
- **Móvil (`< 640px`):** una columna fluida con un ancho máximo de `480px`. Barras inferiores fijas para que las acciones queden al alcance del pulgar.
- **Tablet / mesa de canje (`640px – 1024px`):** 8 columnas. Vistas divididas: saldo y escáner a la izquierda (4 columnas) y actividad a la derecha (4 columnas).
- **Desktop / panel (`> 1024px`):** 12 columnas con un máximo de `1280px` centrado, y un riel lateral fijo de `260px` para la navegación del organizador.

### Zonas táctiles
Todo elemento interactivo (botones, toggles, acciones de lista) tiene una zona táctil mínima de `48px × 48px`, aunque el ícono sea más chico. Así se evitan errores en lugares llenos de gente.

## Elevación y profundidad

La profundidad se logra con **microsombras y bordes sutiles** (`#CBD5E1`), sin ensuciar el fondo claro.

### Niveles
- **Nivel 0 (fondo plano):** `#F8FAFC`. Encabezados de tablas y bandas divisorias, sin elevación.
- **Nivel 1 (tarjetas y listas):** `#FFFFFF` sobre el fondo, con borde `1px solid #E2E8F0` y sombra `0 1px 3px 0 rgba(15, 23, 42, 0.05)`.
- **Nivel 2 (módulos interactivos y saldos):** `0 4px 12px -2px rgba(15, 23, 42, 0.08)`.
- **Nivel 3 (overlays, botones flotantes y modales):** hojas de QR y modales de confirmación: `0 20px 25px -5px rgba(15, 23, 42, 0.12), 0 8px 10px -6px rgba(15, 23, 42, 0.04)`.
- **Nivel 4 (toasts de alerta):** confirmaciones y avisos de saldo: `0 25px 50px -12px rgba(15, 23, 42, 0.25)` con un borde de acento de 1,5 px según el estado.

## Formas

Geometría estructurada y deportiva, que equilibra la cercanía de un evento con la precisión fintech. Radios unificados con el tema oscuro:

- **Tarjetas y modales:** `16px` (token `lg`).
- **Botones e inputs:** `12px` (token `md`), estables al tacto sin volverse píldoras de juguete.
- **Chips, insignias y toggles:** `999px` (píldora).

## Componentes

### Botones
- **Principal:** alto mínimo de `48px` (`52px` en desktop). Degradado de marca `linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)`, texto **`#0B0F19`** en negrita de 16 px y radio de 12 px. Al presionar: `transform: scale(0.98)`. *(El texto blanco sobre ámbar no cumple el contraste mínimo, por eso va oscuro.)*
- **Dólares (solo Feria):** alto mínimo de `48px`, fondo `#2563EB` y texto `#FFFFFF`. En hover, `#1D4ED8`.
- **Secundario / contorno:** fondo `#FFFFFF`, borde 1 px `#CBD5E1` y texto `#0B0F19`. En hover, la superficie pasa a `#F1F5F9`.
- **Destructivo:** fondo `#FEE2E2`, texto `#B91C1C` y borde 1 px `#FCA5A5`. Al presionar, el fondo pasa a `#B91C1C` con texto `#FFFFFF`.

### Chips e insignias
- **Puntos (PTS):** píldora con fondo `#FEF3C7`, texto `#B45309` e ícono de las dos flechas en `#EA580C` a la izquierda.
- **Dólares (solo Feria):** píldora con fondo `#DBEAFE`, texto `#1D4ED8`, peso 600 y números tabulares.
- **Estado:** verificado con fondo `#D1FAE5` y texto `#047857`; pendiente con fondo `#FEF3C7` y texto `#B45309`.

### Tarjetas
- **Tarjeta de saldo:** fondo blanco (`#FFFFFF`), radio de 16 px y borde de 1 px `#CBD5E1`. El saldo va en `numeric-balance-lg` con números tabulares. En la variante Feria, un encabezado con dos pestañas separa los **PTS** del saldo en **USD**.
- **Tarjeta de actividad:** fondo blanco con un borde izquierdo de 4 px en `#D97706` (participación) o `#2563EB` (pago en dólares, solo Feria).

### Inputs y teclados
- **Inputs:** alto de `48px`, fondo `#F8FAFC`, borde 1 px `#CBD5E1`, texto `#0B0F19`, placeholder `#94A3B8` y radio de `12px`. Al enfocar, el borde pasa a 2 px `#D97706`, sin anillos difusos.
- **Montos (solo Feria):** número centrado en `headline-xl` con números tabulares y botones rápidos (`+$5`, `+$10`, `+$20`).

### Checkboxes, radios y toggles
- **Checkboxes:** `20px × 20px`, radio de `6px` y borde de 1,5 px `#CBD5E1`. Marcado: fondo `#EA580C` con check blanco.
- **Radios:** `20px × 20px`, redondos, con borde `#CBD5E1`. Marcado: borde de 2 px `#EA580C` con un punto central de 10 px `#EA580C`.
- **Toggles:** pista de `48px × 28px` en `#E2E8F0`. Activado: la pista pasa a `#EA580C` con el control circular blanco separado 2 px del borde.

### Módulo de QR
- Contenedor con fondo blanco obligatorio (`#FFFFFF`), rodeado de una zona de silencio blanca de 16 px y un borde sutil de `1px` `#CBD5E1`.
