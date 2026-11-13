# Documentación de Pasitos

> **Cada paso cuenta.** Puntos por quedarse, reportes que se pueden comprobar.
> **Última revisión:** 2026-11-13 · Para el equipo y los desarrolladores nuevos.

## Pasitos en 30 segundos

Pasitos convierte la participación en un evento en **puntos que solo valen dentro de ese evento**, y le da al organizador un **reporte verificable**, sellado en la red Stellar, para mostrarles a sus sponsors y financiadores qué logró su apoyo. Es gratis para comunidades aprobadas; pagan los financiadores que necesitan reportar, y las ferias pagan por uso.

## Orden de lectura

| Si eres… | Lee |
|---|---|
| **Nuevo en el equipo** (cualquier rol) | [Visión](01-producto/01-vision.md) → [Cómo funciona](01-producto/02-como-funciona.md) → [Flujos de la v1](01-producto/07-flujos-v1.md) → [Blockchain explicado fácil](01-producto/04-blockchain-explicado-facil.md) → [Decisiones](decisiones.md) |
| **Desarrollador de contratos** | [Libro y anclaje](04-tecnico/07-libro-y-anclaje.md) → [Arquitectura](04-tecnico/01-arquitectura.md) → [Datos on-chain](04-tecnico/03-datos-on-chain.md) → [Amenazas y pruebas](05-seguridad-legal/01-amenazas-y-pruebas.md) |
| **Desarrollador de backend** | [Flujos de la v1](01-producto/07-flujos-v1.md) → [Stack tecnológico](04-tecnico/09-stack-tecnologico.md) → [Reglas de desarrollo](09-desarrollo/README.md) → [Arquitectura](04-tecnico/01-arquitectura.md) → [Libro y anclaje](04-tecnico/07-libro-y-anclaje.md) → [Rendimiento](04-tecnico/08-rendimiento.md) |
| **Desarrollador de frontend / diseño** | [Flujos de la v1](01-producto/07-flujos-v1.md) → [Reglas de desarrollo](09-desarrollo/README.md) → [Rendimiento](04-tecnico/08-rendimiento.md) → [UX y pantallas](06-diseno/03-ux-y-pantallas.md) → [Design system](06-diseno/02-design-system.md) → [Marca](06-diseno/01-marca.md) → [Brief de mockups](06-diseno/04-brief-mockups-ia.md) |

## Índice

### Transversales
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Decisiones](decisiones.md) | Registro único de decisiones (D1…D48) | Vigente · D16, D17 y D44 ⏳ |
| [Glosario](glosario.md) | Términos de producto, negocio y blockchain | Vigente |

### 01 · Producto
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Visión y problema](01-producto/01-vision.md) | Qué es Pasitos, qué problema resuelve, por qué Stellar, objetivos | Vigente |
| [Cómo funciona](01-producto/02-como-funciona.md) | Participantes, recorrido, retos, los dos saldos, reporte, reglas del producto | Vigente |
| [Casos de uso](01-producto/03-casos-de-uso.md) | Tipos de evento y en qué etapa entra cada uno | Vigente |
| [Blockchain explicado fácil](01-producto/04-blockchain-explicado-facil.md) | Stellar y blockchain sin tecnicismos | Vigente |
| [Cómo explicar Pasitos](01-producto/05-como-explicar-pasitos.md) | Explicaciones de 10 s, 30 s y 2 min, y preguntas difíciles | Vigente |
| [Roadmap](01-producto/06-roadmap.md) | Etapas y camino del MVP a la v1 y después | Vigente |
| [Flujos de la v1](01-producto/07-flujos-v1.md) | Actores, acceso, roles, plataforma, organizador, asistente, pantallas, mesa, reporte y casos borde | ✅ Acordado |

### 04 · Técnico
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Arquitectura](04-tecnico/01-arquitectura.md) | Componentes, identidad y llaves, API por área, vistas | Vigente (v1) |
| [Libro y anclaje](04-tecnico/07-libro-y-anclaje.md) | Cómo se registran los puntos y cómo se sellan en Stellar (D22) | Vigente · contrato ⏳ |
| [Rendimiento](04-tecnico/08-rendimiento.md) | Presupuesto de peso y velocidad, y cómo se mide (D24) | Vigente |
| [Stack tecnológico](04-tecnico/09-stack-tecnologico.md) | Con qué se construye, por qué y cómo se despliega en el VPS | Vigente (D38) |
| [Subida de archivos](04-tecnico/10-subida-de-archivos.md) | Validación de imágenes y CSV (tipo real, antivirus, reencodeo), almacenamiento en el VPS y Google Maps | Vigente (D48) |
| [Datos on-chain](04-tecnico/03-datos-on-chain.md) | Qué va on-chain, qué no y cuándo | Vigente (v1) |
| [Costos de red](04-tecnico/04-costos-de-red.md) | Cómo cobra Stellar, estimaciones y controles | Vigente · medición pendiente |
| [Contrato `challenges`](04-tecnico/02-contrato-challenges.md) | Contrato y token del MVP del hackathon | 📦 Histórico |
| [Herramientas](04-tecnico/05-herramientas.md) | Qué usamos en vez de construir | Vigente |
| [Setup en testnet](04-tecnico/06-setup-testnet.md) | Despliegue del MVP del hackathon | 📦 Histórico |

### 05 · Seguridad y legal
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Amenazas y pruebas](05-seguridad-legal/01-amenazas-y-pruebas.md) | Modelo de amenazas y pruebas de la v1 | Vigente (v1) |
| [Legal y cumplimiento](05-seguridad-legal/02-legal-y-cumplimiento.md) | Checklist legal, datos, antes de mainnet | Revisión legal 🔍 |
| [Términos y condiciones](05-seguridad-legal/03-terminos-y-condiciones.md) | Reglas de uso para asistentes y equipo, y textos cortos para la app | 📝 Borrador · revisión legal 🔍 |
| [Política de privacidad](05-seguridad-legal/04-politica-de-privacidad.md) | Qué datos se usan, para qué, cuánto tiempo y los derechos de cada persona | 📝 Borrador · revisión legal 🔍 |

### 06 · Diseño
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Marca](06-diseno/01-marca.md) | Nombre, slogan, logo, colores, tono | Vigente · faltan archivos del logo |
| [Design system](06-diseno/02-design-system.md) | Reglas comunes y tokens semánticos de los dos temas | Vigente |
| [UX y pantallas](06-diseno/03-ux-y-pantallas.md) | Vistas, estados, mensajes de error, requisitos | Vigente |
| [Inventario de vistas](06-diseno/05-inventario-de-vistas.md) | Todas las pantallas por perfil y nivel (1 esenciales · 2 complementarias · 3 variantes) y los flujos | Vigente |
| [Mockup · nivel 1](06-diseno/mockups/nivel-1.html) | Las 11 pantallas esenciales en HTML | Vigente |
| [Mockup · nivel 2](06-diseno/mockups/nivel-2.html) | Estados, errores, gestión del evento y sitio público (36 vistas) | Vigente |
| [Brief de mockups para IA](06-diseno/04-brief-mockups-ia.md) | Documento autocontenido para una IA de diseño: pantallas, textos y datos exactos | Vigente |
| [tokens/DESIGN-dark.md](06-diseno/tokens/DESIGN-dark.md) · [tokens/DESIGN-light.md](06-diseno/tokens/DESIGN-light.md) | Fuente de verdad de los temas oscuro y claro | Vigente |

### 09 · Desarrollo
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Índice de desarrollo](09-desarrollo/README.md) | Cómo usar estas reglas | 📝 Propuesta |
| [Reglas generales](09-desarrollo/01-reglas-generales.md) | Principios, nomenclatura (D39), TypeScript, código limpio, git, tests | 📝 Propuesta · nomenclatura ✅ |
| [Backend](09-desarrollo/02-backend.md) | Estructura NestJS, capas, patrones, libro de movimientos, base de datos, logs | 📝 Propuesta |
| [Frontend](09-desarrollo/03-frontend.md) | Estructura Angular, componentes, estado, manejo de errores, accesibilidad | 📝 Propuesta |
| [Respuestas y errores del API](09-desarrollo/04-respuestas-y-errores.md) | Formato de éxito y error, catálogo de códigos, idempotencia (D40) | Vigente (D40) |

### 07 · Hackathon (histórico)
| Documento | Para qué sirve | Estado |
|---|---|---|
| [Resumen del hackathon](07-hackathon/README.md) | Qué cambió desde el hackathon y qué falta cargar | Histórico |
| [Plan MVP 36 horas](07-hackathon/01-plan-mvp-36h.md) | Cómo se organizó la construcción del MVP | Histórico |
| [Pitch y video de demo](07-hackathon/02-pitch-y-demo.md) | Guion del pitch y del video | Histórico |

### Documentación interna

Estos documentos **no se publican en GitHub** (están en `.gitignore`). El equipo los tiene en su copia local, con su índice en `docs/INTERNO.md`:
- **02 · Negocio:** mercado y competencia, clientes y segmentos, modelo de ingresos y precios, plan Comunidad y economía unitaria.
- **03 · Validación:** guía de entrevistas, hipótesis y resultados (incluye datos de personas entrevistadas).
- **Versión piloto:** alcance, acceso del asistente y plan de implementación.
- **08 · Financiamiento:** postulaciones a fondos (Instawards, SCF).

En los documentos públicos, las referencias a estos documentos aparecen como texto marcado *(interno)*.

**Protección antes de cada commit.** El repositorio trae una revisión automática (`.githooks/pre-commit`) que frena el commit si se intenta subir documentación interna, archivos de secretos (`.env`, `.pem`, `.key`, `.stellar/`) o texto que parece una llave de Stellar, una contraseña o un correo personal. Cada persona la activa **una vez** en su copia:

```
git config core.hooksPath .githooks
```

## Convenciones

- Cada documento empieza con su **estado** y la **fecha de la última revisión**.
- Marcas: ✅ decidido · ⏳ pendiente · 🔍 hipótesis a validar · 📦 histórico.
- Cada tema vive **en un solo documento**; los demás enlazan a él.
- Las decisiones se registran en [decisiones.md](decisiones.md), no en los documentos de cada tema.
- Todo en español. Los nombres de código (funciones, rutas, tokens) quedan como en el código.
- **Público o interno:** lo que no debe estar en un repositorio público (precios, datos de personas, planes internos, postulaciones) va en una carpeta interna, listada en `.gitignore`.
