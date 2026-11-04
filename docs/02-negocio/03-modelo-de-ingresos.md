# Modelo de ingresos

> **Estado:** vigente (modelo oficial) · precios 🔍 a validar · **Última revisión:** 2026-11-03

## 1. Resumen

**Gratis para comunidades aprobadas → pagan los financiadores que necesitan reportar → las ferias pagan por uso.**

## 2. Planes

| Plan | Para quién | Precio (hipótesis) | Qué incluye |
|---|---|---|---|
| **Comunidad** (con aprobación) | Segmento A | **Gratis por uso**: nosotros cubrimos las transacciones de puntos | App, retos, puntos, canje de merch y meriendas, **reporte simple verificable**. Detalle en [Plan Comunidad](04-plan-comunidad.md) |
| ↳ Estadísticas avanzadas | Comunidades que las quieran | **$25 por evento** (opcional; puede pagarlo el sponsor) | Asistencia por hora, retención, asistencia por charla, reporte con la marca de cada sponsor, comparación entre ediciones, encuestas, exportación CSV |
| ↳ Pagos con dinero real | Si el evento vende algo | Comisión sobre la venta (ej. 2 %) | Saldo en dólares y reembolsos. **Desactivado por defecto** |
| **Programa** | Segmento B | **$300–1 500** por evento o programa | Todo lo anterior + retos on-chain a medida (primera transacción, despliegue de contrato) + métricas de onboarding + reporte de impacto + soporte el día del evento |
| **Feria** | Segmento C | **2–3 % de las ventas cashless** + $10–30 por expositor | Saldo cashless en dólares, panel de visitas por expositor, reembolso del saldo sobrante |

> Los precios están en USD como referencia. Para el mercado local conviene cotizar en bolivianos y validar los montos en las entrevistas.

## 3. El truco para que el organizador no pague de su bolsillo

El organizador comunitario agrega una línea a su propuesta de patrocinio, por ejemplo *"Informe verificado del evento: Bs X"*, y **la paga el sponsor**. Así consigue los datos que quiere mostrar sin poner dinero.

## 4. Qué estamos cobrando realmente

Los datos on-chain son **públicos por diseño**: eso es lo que hace verificable el reporte. Alguien con conocimientos técnicos podría calcular parte de las estadísticas leyendo los eventos del contrato. **Lo que se paga no es el acceso a los datos, sino el análisis:**
- cruzarlos con información off-chain (nombres de charlas, horarios, encuestas, perfiles con consentimiento);
- presentarlos en gráficos e informes listos para un sponsor;
- comparar entre ediciones.

Hay que decirlo así si alguien pregunta: es coherente con la transparencia y no promete algo que no se puede cumplir.

## 5. El saldo en dólares queda fuera de los planes Comunidad y Programa

El saldo que **carga el asistente** (USDC) solo se activa en la variante Feria y con un proveedor autorizado. Razones:
- en la mayoría de los eventos comunitarios la comida es gratis, así que casi no se usaría;
- es el único punto donde hay dinero real en movimiento y requiere custodia, reembolsos y revisión legal ([legal](../05-seguridad-legal/02-legal-y-cumplimiento.md)).

**No contamos con la comisión en dólares como ingreso principal** de los planes Comunidad ni Programa.

## 6. Riesgos del modelo

| Riesgo | Mitigación |
|---|---|
| El segmento B es chico en Bolivia | Es regional: los ecosistemas blockchain hacen eventos en toda LATAM. El producto no depende de un país |
| Superposición con **Stellar Passport** | Diferenciarse en la economía del evento (puntos, canje, retención) y en el reporte para financiadores. **Proponerles una integración** |
| Las comunidades usan el plan gratis y nadie paga | El plan gratis tiene tope. Las estadísticas avanzadas y los reportes con marca son pagos. El valor que se vende de verdad es el del segmento B |
| Saldo en dólares en ferias: tema legal | Solo con un proveedor autorizado y fuera de los planes Comunidad y Programa |

La cobertura de los costos de red con cada plan está en [Economía unitaria](05-economia-unitaria.md).
