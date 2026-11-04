# Inventario de vistas

> **Estado:** vigente · **Última revisión:** 2026-11-03
> **Mockup del nivel 1:** [mockups/nivel-1.html](mockups/nivel-1.html), en tema oscuro y claro. Es un solo archivo HTML que se edita directamente.
> Lista única de todas las pantallas de Pasitos, por perfil y por nivel de prioridad. El detalle de cada pantalla (textos y datos exactos) está en el [Brief de mockups](04-brief-mockups-ia.md); el número entre paréntesis es su sección en el brief.

## 1. Niveles

| Nivel | Qué incluye | Para qué |
|---|---|---|
| **1 · Esenciales** | 11 pantallas que muestran la idea completa | Mockup inicial: con ver solo estas, se entiende el producto |
| **2 · Complementarias** | Estados, errores y la gestión del evento | Producto usable de punta a punta |
| **3 · Variantes y extras** | Temas claros, variante Feria, herramientas internas | Más adelante |

## 2. Perfiles y dispositivos

| Perfil | Ruta | Dispositivo de diseño |
|---|---|---|
| Asistente | `/app` | Móvil 390 × 844 |
| Sala o stand | `/stand/:id` | Tablet horizontal 1194 × 834 (también monitor 1920 × 1080) |
| Mesa de canje | `/merchant` | Tablet vertical 834 × 1194 (también móvil) |
| Organizador | `/admin` | Desktop 1440 × 900 |
| Reporte público | `/reporte/:evento` | Web responsiva (desktop 1440 y móvil 390) |
| Sitio público | `/` | Web responsiva |
| Equipo Pasitos (interno) | `/interno` | Desktop |

## 3. Nivel 1 · Esenciales

| ID | Perfil | Pantalla | Brief | Por qué es esencial |
|---|---|---|---|---|
| A1 | Asistente | Bienvenida (ingreso con la entrada) | 5.1 | Primera impresión: entra sin registrarse |
| A2 | Asistente | Inicio · Retos | 5.2 | El corazón de la app: puntos, retos y estados |
| A3 | Asistente | Reto completado | 5.7 | El momento de recompensa |
| A4 | Asistente | Canjear + Confirmar canje | 5.3 · 5.9 | Para qué sirven los puntos |
| A5 | Asistente | Rechazo por circuito cerrado | 5.12 | Prueba de que los puntos no salen del evento |
| S1 | Sala / stand | QR rotativo | 6.1 | El anti-fraude visible |
| M1 | Mesa de canje | Nuevo canje → Esperando → Confirmado | 7.1 · 7.2 · 7.3 | Cómo cobra quien atiende la mesa |
| O0 | Organizador | Ingreso al panel | 8.0 | Puerta de entrada del organizador |
| O1 | Organizador | Panel · Resumen | 8.1 | Asistencia en vivo, retención y participaciones |
| O2 | Organizador | Panel · Retos + Nuevo reto | 8.2 | Cómo se configura el evento |
| R1 | Sponsor | Reporte público verificable (tema claro) | 9.1 | Lo que se vende: "Verifícalo tú mismo" |

## 4. Nivel 2 · Complementarias

### Asistente
| ID | Pantalla | Brief |
|---|---|---|
| A6 | Escáner | 5.5 |
| A7 | Verificando | 5.6 |
| A8 | Errores al escanear (ya completado, código vencido, aún no disponible) | 5.8 |
| A9 | Canje exitoso | 5.10 |
| A10 | Historial | 5.4 |
| A11 | Detalle de un reto (con QR, automático, encuesta) | 5.15 |
| A12 | Encuesta del evento | 5.16 |
| A13 | Cómo funciona (ayuda en 3 pasos) | 5.17 |
| A14 | Entrada no válida o ya usada en otro celular | 5.18 |
| A15 | Sin conexión | 5.19 |
| A16 | Permiso de cámara denegado + ingresar código a mano | 5.14 |
| A17 | Mi cuenta (ajustes de texto grande y tema; acción de demo) | 5.11 |
| A18 | Evento cerrado | 5.13 |
| A19 | El evento todavía no empezó | 5.20 |

### Sala o stand
| ID | Pantalla | Brief |
|---|---|---|
| S2 | Asistencia confirmada (+1) | 6.2 |
| S3 | En espera: el reto todavía no está habilitado o ya terminó | 6.3 |

### Mesa de canje
| ID | Pantalla | Brief |
|---|---|---|
| M2 | Ingreso de la mesa (código de 6 dígitos) | 7.0 |
| M3 | Canje recibido + últimos canjes | 7.3 |
| M4 | Canje vencido o cancelado | 7.4 |

### Organizador
| ID | Pantalla | Brief |
|---|---|---|
| O3 | Configurar evento: datos generales | 8.6 |
| O4 | Configurar evento: sponsors | 8.6 |
| O5 | Configurar evento: mesa de canje y catálogo | 8.6 |
| O6 | Entradas y asistentes (cargar lista, links y QR de entrada) | 8.7 |
| O7 | Pantallas de salas (links para abrir en cada tablet) | 8.8 |
| O8 | Reporte: compartir | 8.3 |
| O9 | Estadísticas avanzadas (bloqueada) | 8.4 |
| O10 | Cerrar evento + confirmación | 8.5 |

### Sitio público
| ID | Pantalla | Brief |
|---|---|---|
| P1 | Landing de Pasitos (qué es, cómo funciona, planes, solicitar) | 11.0 |
| P2 | Solicitud del plan Comunidad | 11.1 |
| P3 | Solicitud enviada | 11.2 |

## 5. Nivel 3 · Variantes y extras

| ID | Pantalla | Brief |
|---|---|---|
| T1 | Tema claro de S1, O1 y R1 | 3.2 |
| R2 | Reporte en PDF imprimible (una página) | 9.2 |
| R3 | Reporte público en móvil | 9.1 |
| F1 | Feria: asistente con saldo dual | 10.1 |
| F2 | Feria: confirmar pago en USD | 10.2 |
| F3 | Feria: reembolso | 10.3 |
| F4 | Feria: mesa con selector de moneda | 10.4 |
| O11 | Organizador: equipo y permisos | 8.9 |
| O12 | Organizador: pausa de emergencia | 8.9 |
| I1 | Interno: bandeja de solicitudes del plan Comunidad | 12.1 |
| E1 | Página no encontrada / link inválido | 12.2 |

## 6. Flujos principales

| Flujo | Pantallas |
|---|---|
| El asistente entra | A1 → A2 (A14 si la entrada no es válida · A19 si el evento no empezó) |
| Completar un reto con QR | A2 → A6 → A7 → A3 (A8 si hay error) · en paralelo S1 → S2 |
| Reto automático | A2 → A11 → (acción fuera de la app) → A3 |
| Canjear | A4 (Canjear) → A6 → A4 (Confirmar) → A9 · en paralelo M1 → M3 |
| Demo de circuito cerrado | A17 → A5 |
| Preparar un evento | O0 → O3 → O4 → O5 → O2 → O6 → O7 |
| Seguir el evento | O1 · O2 |
| Cerrar y reportar | O10 → O8 → R1 |
| Una comunidad llega a Pasitos | P1 → P2 → P3 → I1 |
