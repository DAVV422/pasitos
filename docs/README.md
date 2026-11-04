# Documentación de Pasitos

> **Cada paso cuenta.** Puntos por quedarse, reportes que se pueden comprobar.
> **Última revisión:** 2026-11-03 · Para el equipo y los desarrolladores nuevos.

## Pasitos en 30 segundos

Pasitos convierte la participación en un evento en **puntos que solo valen dentro de ese evento**, y le da al organizador un **reporte verificable** en la red Stellar para mostrarles a sus sponsors y financiadores qué logró su apoyo. Es gratis para comunidades aprobadas; pagan los financiadores que necesitan reportar, y las ferias pagan por uso.

## Orden de lectura

| Si eres… | Lee |
|---|---|
| **Nuevo en el equipo** (cualquier rol) | [Visión](01-producto/01-vision.md) → [Cómo funciona](01-producto/02-como-funciona.md) → [Blockchain explicado fácil](01-producto/04-blockchain-explicado-facil.md) → [Decisiones](decisiones.md) |
| **Desarrollador de contratos** | [Arquitectura](04-tecnico/01-arquitectura.md) → [Contrato `challenges`](04-tecnico/02-contrato-challenges.md) → [Amenazas y pruebas](05-seguridad-legal/01-amenazas-y-pruebas.md) → [Setup en testnet](04-tecnico/06-setup-testnet.md) |
| **Desarrollador de backend** | [Arquitectura](04-tecnico/01-arquitectura.md) → [Datos on-chain](04-tecnico/03-datos-on-chain.md) → [Herramientas](04-tecnico/05-herramientas.md) → [Costos de red](04-tecnico/04-costos-de-red.md) |
| **Desarrollador de frontend / diseño** | [UX y pantallas](06-diseno/03-ux-y-pantallas.md) → [Design system](06-diseno/02-design-system.md) → [Marca](06-diseno/01-marca.md) → [Brief de mockups](06-diseno/04-brief-mockups-ia.md) |
| **Negocio y ventas** | [Clientes y segmentos](02-negocio/02-clientes-y-segmentos.md) → [Modelo de ingresos](02-negocio/03-modelo-de-ingresos.md) → [Plan Comunidad](02-negocio/04-plan-comunidad.md) → [Guía de entrevistas](03-validacion/01-guia-de-entrevistas.md) |

## Índice

### Transversales
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Decisiones](decisiones.md) | Registro único de decisiones (D1…D17) | Vigente |
| [Glosario](glosario.md) | Términos de producto, negocio y blockchain | Vigente |

### 01 · Producto
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Visión y problema](01-producto/01-vision.md) | Qué es Pasitos, qué problema resuelve, por qué Stellar, objetivos | Vigente |
| [Cómo funciona](01-producto/02-como-funciona.md) | Participantes, recorrido, retos, los dos saldos, reporte, reglas del producto | Vigente |
| [Casos de uso](01-producto/03-casos-de-uso.md) | Tipos de evento y en qué etapa entra cada uno | Vigente |
| [Blockchain explicado fácil](01-producto/04-blockchain-explicado-facil.md) | Stellar y blockchain sin tecnicismos | Vigente |
| [Cómo explicar Pasitos](01-producto/05-como-explicar-pasitos.md) | Explicaciones de 10 s, 30 s y 2 min, y preguntas difíciles | Vigente |
| [Roadmap](01-producto/06-roadmap.md) | Etapas y camino del MVP a producción | Vigente |

### 02 · Negocio
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Mercado y competencia](02-negocio/01-mercado-y-competencia.md) | Ecosistema Stellar, competidores, encaje con el SCF | Vigente |
| [Clientes y segmentos](02-negocio/02-clientes-y-segmentos.md) | Quién usa, quién paga y por qué | Vigente |
| [Modelo de ingresos](02-negocio/03-modelo-de-ingresos.md) | Planes Comunidad, Programa y Feria | Vigente · precios 🔍 |
| [Plan Comunidad](02-negocio/04-plan-comunidad.md) | Uso gratis con aprobación, reporte simple, estadísticas pagas | Propuesta 🔍 |
| [Economía unitaria](02-negocio/05-economia-unitaria.md) | ¿Los ingresos cubren los costos? | Vigente · números 🔍 |

### 03 · Validación
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Guía de entrevistas](03-validacion/01-guia-de-entrevistas.md) | Reglas, segmentos, guiones, carta de intención | Vigente |
| [Hipótesis y resultados](03-validacion/02-hipotesis-y-resultados.md) | H1–H6, registro de entrevistas y pilotos | Resultados pendientes |

### 04 · Técnico
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Arquitectura](04-tecnico/01-arquitectura.md) | Componentes, wallets, endpoints, vistas, escalabilidad | Vigente |
| [Contrato `challenges`](04-tecnico/02-contrato-challenges.md) | Token, almacenamiento, funciones, errores, invariantes, flujos | Vigente |
| [Datos on-chain](04-tecnico/03-datos-on-chain.md) | Qué va on-chain, qué no y cuándo | Vigente |
| [Costos de red](04-tecnico/04-costos-de-red.md) | Cómo cobra Stellar, estimaciones y controles | Medición pendiente |
| [Herramientas](04-tecnico/05-herramientas.md) | Qué usamos en vez de construir | Vigente |
| [Setup en testnet](04-tecnico/06-setup-testnet.md) | Orden de despliegue, script, reset de demo | Vigente |

### 05 · Seguridad y legal
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Amenazas y pruebas](05-seguridad-legal/01-amenazas-y-pruebas.md) | Modelo de amenazas, tests del contrato y de integración | Vigente |
| [Legal y cumplimiento](05-seguridad-legal/02-legal-y-cumplimiento.md) | Checklist legal, datos, antes de mainnet | Revisión legal 🔍 |

### 06 · Diseño
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Marca](06-diseno/01-marca.md) | Nombre, slogan, logo, colores, tono | Vigente · faltan archivos del logo |
| [Design system](06-diseno/02-design-system.md) | Reglas comunes y tokens semánticos de los dos temas | Vigente |
| [UX y pantallas](06-diseno/03-ux-y-pantallas.md) | Vistas, estados, mensajes de error, requisitos | Vigente |
| [Inventario de vistas](06-diseno/05-inventario-de-vistas.md) | Todas las pantallas por perfil y nivel (1 esenciales · 2 complementarias · 3 variantes) y los flujos | Vigente |
| [Mockup inicial · nivel 1](06-diseno/mockups/nivel-1.html) | Las 11 pantallas esenciales en HTML | Vigente |
| [Brief de mockups para IA](06-diseno/04-brief-mockups-ia.md) | Documento autocontenido para una IA de diseño: pantallas, textos y datos exactos | Vigente |
| [tokens/DESIGN-dark.md](06-diseno/tokens/DESIGN-dark.md) · [tokens/DESIGN-light.md](06-diseno/tokens/DESIGN-light.md) | Fuente de verdad de los temas oscuro y claro | Vigente |

### 07 · Hackathon (histórico)
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Resumen del hackathon](07-hackathon/README.md) | Qué cambió desde el hackathon y qué falta cargar | Histórico |
| [Plan MVP 36 horas](07-hackathon/01-plan-mvp-36h.md) | Cómo se organizó la construcción del MVP | Histórico |
| [Pitch y video de demo](07-hackathon/02-pitch-y-demo.md) | Guion del pitch y del video | Histórico |

## Convenciones

- Cada documento empieza con su **estado** y la **fecha de la última revisión**.
- Marcas: ✅ decidido · ⏳ pendiente · 🔍 hipótesis a validar · 📦 histórico.
- Cada tema vive **en un solo documento**; los demás enlazan a él.
- Las decisiones se registran en [decisiones.md](decisiones.md), no en los documentos de cada tema.
- Todo en español. Los nombres de código (funciones, rutas, tokens) quedan como en el código.
