# Plan Comunidad

> **Estado:** propuesta del equipo 🔍 a validar con organizadores · **Última revisión:** 2026-11-03
> Complementa el [Modelo de ingresos](03-modelo-de-ingresos.md).

## 1. La idea en una frase

Las comunidades **aprobadas por nosotros** usan Pasitos sin pagar por uso, y nosotros cubrimos las transacciones de puntos. **Solo se cobra cuando se mueve dinero real** (pagos con saldo en dólares) y cuando quieren **estadísticas avanzadas**. El reporte simple y verificable para sus sponsors es gratis.

## 2. Qué es gratis y qué se paga

| Concepto | Plan Comunidad | Quién paga el costo |
|---|---|---|
| App del asistente, retos, QR rotativo | ✅ Gratis | Nosotros |
| Puntos: emitir, canjear, vencer (transacciones en Stellar) | ✅ Gratis | **Nosotros** (dentro del presupuesto mensual, sección 6) |
| Canje de merch y meriendas con puntos | ✅ Gratis | Nosotros |
| **Reporte simple verificable** para sponsors | ✅ Gratis | Nosotros |
| Pagos con saldo en dólares (dinero real) | 💲 Comisión sobre la venta | El comercio o el organizador. **Desactivado por defecto** |
| **Estadísticas avanzadas** del evento | 💲 Monto fijo por evento | El organizador, o su sponsor como línea del patrocinio |

## 3. Requisitos para ser aprobado

| Criterio | Valor propuesto |
|---|---|
| Tipo de organizador | Comunidad sin fines de lucro, club universitario, capítulo de GDG o similar, meetup, hackathon comunitario |
| Entrada al evento | Gratuita o con un costo simbólico |
| Tamaño | Hasta **300 asistentes** por evento |
| Frecuencia | Hasta **2 eventos al mes** por comunidad |
| Responsable | Una persona identificada (nombre, contacto, redes de la comunidad) |
| Compromisos | Mostrar *"Hecho con Pasitos"* en el evento · permitir usar el evento como caso de estudio · completar una encuesta de feedback |

**Proceso:** formulario → revisión del equipo (respuesta en 48 h) → aprobación → el organizador puede crear sus eventos. Si una comunidad necesita más asistentes o eventos, lo pide y se evalúa caso por caso.

**Qué evitamos con la aprobación:** que empresas con presupuesto se presenten como comunidad para no pagar, y que el costo de red se nos escape (cada aprobación consume presupuesto, sección 6).

## 4. Reporte simple verificable (gratis)

Tiene que servirle al organizador para mostrarle a su sponsor algo **mejor que fotos**. Si no lo logra, nadie adopta el plan.

| Sección | Datos |
|---|---|
| Resumen | Nombre, fecha y lugar del evento · asistentes verificados (ingresaron con su entrada) |
| Participación | Total de retos completados · participaciones por reto (tabla) |
| Por sponsor | Participaciones en los retos de cada sponsor (ej. "142 asistentes vieron la charla de X") |
| Retención básica | Cuántos asistentes completaron el reto de cierre (un solo número) |
| Puntos | Emitidos, canjeados y vencidos |
| **Verificación** | Dirección del contrato del evento y enlace a Stellar Expert. Cualquiera puede comprobar los números sin pedirnos nada |

**Formato:** una página web pública (`/reporte/:evento`) que el organizador comparte con un link, más un PDF de una página.

**Qué NO incluye:** gráficos por hora, embudos, comparaciones, datos de contacto ni marca personalizada.

## 5. Estadísticas avanzadas (pago)

### 5.1 Qué incluyen

| Estadística | Para qué le sirve al organizador o al sponsor |
|---|---|
| Asistencia por hora (curva de todo el evento) | Ver cuándo se va la gente y qué bloque la retuvo |
| Embudo de retención (llegada → mediodía → cierre) | Medir si el evento mejoró frente al anterior |
| Asistencia por charla o taller | Saber qué temas y speakers funcionan |
| **Reporte con la marca de cada sponsor** (uno por sponsor) | El organizador entrega a cada sponsor su propio informe profesional |
| Comparación con ediciones anteriores | Mostrar crecimiento al pedir patrocinio para la próxima edición |
| Resultados de la encuesta de feedback | Satisfacción por charla y general |
| Exportación CSV | Que el organizador haga sus propios análisis |
| Datos de perfil (solo con consentimiento del asistente) | Carrera, universidad o rubro, en agregado y nunca individual |

### 5.2 Precio (hipótesis 🔍)

| Opción | Precio de referencia | Nota |
|---|---|---|
| **Paquete avanzado por evento** | **$25** por evento | Incluye todo lo de la tabla y los reportes con marca para todos los sponsors del evento |

- Cotizar en bolivianos para el mercado local (validar el monto en las entrevistas).
- Medios de pago: QR bancario local o USDC.
- **Quién paga:** el organizador, o el sponsor como línea dentro del paquete de patrocinio ("informe verificado del evento: Bs X").

## 6. Costo para nosotros y cómo se controla

Con el escenario medio de [Economía unitaria](05-economia-unitaria.md):

| Concepto | Valor |
|---|---|
| Costo de red de un evento comunitario de 300 asistentes | ~$6,80 (alto: ~$34) |
| Presupuesto mensual del plan (propuesta) | $150 → unos 20 eventos en el escenario medio |
| **Punto de equilibrio** | Si **1 de cada 4 eventos** compra el paquete avanzado ($25), el plan se paga solo en el escenario medio |

**Controles:**
1. **Las aprobaciones dependen del presupuesto del mes.** Si se agota, las nuevas solicitudes quedan en espera.
2. Tope de asistentes y de eventos por comunidad (sección 3).
3. Claims en lote, smart wallets sin reservas y **reutilización de la wallet del asistente** en sus eventos siguientes. Un asistente que va a 5 meetups de la misma comunidad no crea 5 cuentas.
4. **Fuentes para financiar el presupuesto:** ingresos del paquete avanzado, planes Programa y, al inicio, un grant del SCF.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| El reporte gratis es tan bueno que nadie compra el avanzado | El gratis responde "¿cuántos y cuántas participaciones?". El avanzado responde "¿cuándo, por qué y comparado con qué?" y trae la marca del sponsor. Validar el corte con organizadores |
| El reporte gratis es tan pobre que nadie adopta el plan | Mostrar un borrador del reporte simple a 2–3 organizadores antes de cerrarlo |
| La revisión de solicitudes se vuelve un cuello de botella | Checklist de 5 puntos; aprobación automática para comunidades que ya hicieron un evento sin problemas |
| Abuso: empresas que se presentan como comunidad | Criterios de la sección 3 + revisión + tope de asistentes |
| El costo de red sube (precio del XLM) | Presupuesto mensual fijo: se aprueban menos eventos, nunca se gasta de más |

## 8. Impacto en el producto

| Dónde | Cambio | Estado |
|---|---|---|
| Formulario de solicitud + revisión interna | Pantalla de solicitud y bandeja de aprobación para el equipo | Pendiente (producción) |
| Reporte simple (`/reporte/:evento`) | Página pública con los datos de la sección 4 y enlaces a Stellar Expert | En el MVP |
| Estadísticas avanzadas | Pestaña del panel bloqueada, con el botón "Desbloquear por $25" | Solo como pantalla bloqueada (mock) |
| Saldo en dólares | Desactivado por defecto en eventos del plan Comunidad | Un flag de configuración |

Las preguntas de validación están en la [Guía de entrevistas](../03-validacion/01-guia-de-entrevistas.md).
