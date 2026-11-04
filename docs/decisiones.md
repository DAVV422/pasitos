# Registro de decisiones

> **Estado:** vigente · **Última revisión:** 2026-11-03
> Única fuente de verdad sobre las decisiones del proyecto. Una decisión tomada no se reabre sin acuerdo del equipo. Para cambiarla, se agrega una nueva entrada que la reemplace.

**Estados:** ✅ Vigente · ⏳ Pendiente · ❌ Descartada / reemplazada

## Decisiones

| # | Tema | Estado | Decisión | Fecha |
|---|---|---|---|---|
| D1 | **Nombre** | ✅ Vigente | **Pasitos**. Reemplaza a *Ticket Events* y *Stayr* | 2026-11-03 |
| D2 | Pitch y demo | ✅ Vigente | Pitch de 3 minutos con la app solo de forma superficial (menos de 20 s); demo completa en un video aparte | Oct 2026 |
| D3 | **Transferencias entre asistentes** | ✅ Vigente | No se permiten, para evitar robo y reventa de puntos. Ni en la UI ni en el backend. En producción, el bloqueo pasa al contrato del token (opción B) | Oct 2026 |
| D4 | Cobro al sponsor on-chain | ❌ Descartada | Era un cálculo en el panel (`leads × tarifa`). Ya no aplica con el modelo D9 | Oct 2026 |
| D5 | Sponsors de demo | ✅ Vigente | Ficticios: Nimbora Cloud, Quillu Pay, Kodara Academy. Organizador ficticio: Comunidad Dev La Paz | Oct 2026 |
| D6 | **Pago mixto** | ✅ Vigente | No. Un cobro = una moneda (puntos o dólares) | Oct 2026 |
| D7 | Tarifa por lead configurable | ❌ Descartada | Reemplazada por D9. `max_total` pasa a ser el presupuesto de premios del reto | 2026-11-03 |
| D8 | Licencia anual para sponsors | ❌ Descartada | Reemplazada por D9: pocas empresas locales pagarían licencias | 2026-11-03 |
| D9 | **Modelo de negocio** | ✅ Vigente | Gratis para comunidades aprobadas → pagan los financiadores que necesitan reportar (plan Programa) → las ferias pagan por uso. Ver [modelo de ingresos](02-negocio/03-modelo-de-ingresos.md) | 2026-11-03 |
| D10 | **Saldo en dólares** (el que carga el asistente) | ✅ Vigente | Solo en la variante Feria, desactivado por defecto. Los planes Comunidad y Programa usan solo puntos | 2026-11-03 |
| D11 | **Design system** | ✅ Vigente | La fuente de verdad son [tokens/DESIGN-dark.md](06-diseno/tokens/DESIGN-dark.md) y [tokens/DESIGN-light.md](06-diseno/tokens/DESIGN-light.md), basados en el logo | 2026-11-03 |
| D12 | **Slogan** | ✅ Vigente | *"Cada paso cuenta."* · Frase de apoyo: *"Puntos por quedarse, reportes que se pueden comprobar."* Reemplaza a *"Que se queden. Que se note."* | 2026-11-03 |
| D13 | Logo | ✅ Vigente | Dos flechas, amarilla y naranja ([marca](06-diseno/01-marca.md)). Faltan los archivos vectoriales | 2026-11-03 |
| D14 | Token de puntos | ✅ Vigente | MVP: asset clásico + SAC (opción A). Producción: token propio con allowlist (opción B) | Oct 2026 |
| D15 | Idioma de la documentación | ✅ Vigente | Todo en español. Público: el equipo y los desarrolladores nuevos | 2026-11-03 |
| D16 | Plan Comunidad | ⏳ Pendiente | Aprobado como propuesta; falta validar con organizadores el corte entre el reporte gratis y las estadísticas pagas | — |
| D17 | Precios iniciales | ⏳ Pendiente | Los del [modelo de ingresos](02-negocio/03-modelo-de-ingresos.md), a ajustar con las entrevistas | — |

## Notas

**Sobre D3:** en el MVP el bloqueo es efectivo porque el backend custodia las llaves y no expone ninguna función para transferir entre asistentes. Pero **la red Stellar sí lo permitiría** si alguien firmara un `transfer` con la llave del asistente, porque ambos están autorizados en el asset. Cuando cada asistente firme con su propia passkey, el bloqueo tiene que pasar al contrato (D14, opción B).

**Sobre D9:** el análisis del modelo anterior (sponsor que paga por lead) se descartó porque los patrocinios locales son chicos y muchos eventos no tienen stands. El resumen de por qué está en [Clientes y segmentos §1](02-negocio/02-clientes-y-segmentos.md#1-punto-de-partida-qué-pasa-en-bolivia).
