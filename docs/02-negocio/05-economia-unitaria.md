# Economía unitaria

> **Estado:** vigente · números 🔍 a reemplazar por los costos medidos en testnet · **Última revisión:** 2026-11-03

¿Cubren los ingresos de cada plan lo que cuesta operar? Los costos de red por operación y cómo se controlan están en [Costos de red](../04-tecnico/04-costos-de-red.md). Aquí se cruzan con los planes.

## 1. Supuestos

| Supuesto | Valor | Nota |
|---|---|---|
| Transacciones por asistente | 12 sin lotes · **7,5 con claims en lote** | Registro, 5 retos, 3 canjes, 2 pagos (ferias), cierre |
| Costo por transacción | Bajo 0,001 XLM · Medio 0,01 XLM · Alto 0,05 XLM | **Reemplazar por lo medido** ([tabla de costos medidos](../04-tecnico/04-costos-de-red.md#3-costos-medidos-en-testnet)) |
| Precio del XLM | $0,30 | Variable: revisarlo el día del cálculo |
| Infraestructura fija | $100–300 al mes | Servidor, base de datos, proveedor de RPC en mainnet, monitoreo |

## 2. Costo de red por evento (con claims en lote)

| Asistentes | Bajo | Medio | Alto | Reservas bloqueadas (recuperables) |
|---|---|---|---|---|
| 100 | $0,20 | $2,20 | $11 | 200 XLM ($60) |
| 300 | $0,70 | $6,80 | $34 | 600 XLM ($180) |
| 1 000 | $2,20 | $22,50 | $113 | 2 000 XLM ($600) |
| 3 000 | $6,80 | $67,50 | $338 | 6 000 XLM ($1 800) |
| 10 000 | $22,50 | $225 | $1 125 | 20 000 XLM ($6 000) |

Las **reservas** no son un gasto: se recuperan al cerrar las cuentas, y con smart wallets con passkey desaparecen.

## 3. ¿Se cubre cada plan?

| Plan | Costo de red por evento | Ingreso por evento | ¿Se cubre? |
|---|---|---|---|
| Comunidad (300 asistentes) | ~$6,80 (alto: ~$34) | $0 | ❌ Lo subsidiamos, con presupuesto mensual y aprobación |
| Comunidad + estadísticas avanzadas | ~$6,80 | $25 | ✅ en el escenario medio |
| Programa (300 asistentes) | ~$7 (alto: ~$34) | $300–1 500 | ✅ con mucho margen |
| Feria (3 000 asistentes) | ~$68 (alto: ~$338) | 2–3 % de las ventas + expositores | ✅ si las ventas cashless superan unos $15 000 |

## 4. El costo del plan gratuito está acotado

20 eventos comunitarios de 300 asistentes al mes cuestan unos **$136** en el escenario medio (unos $680 en el alto), y las aprobaciones se limitan a un presupuesto mensual fijo. Se cubre con:
1. ingresos de los planes Programa;
2. un grant del SCF en la etapa inicial (el plan gratuito genera onboarding real a Stellar, que es lo que el SCF financia);
3. smart wallets con passkey, que eliminan las reservas, y reutilizar la wallet del asistente en sus eventos siguientes.

**Regla de equilibrio:** si 1 de cada 4 eventos comunitarios compra las estadísticas avanzadas, el plan se paga solo en el escenario medio.

## 5. Costos fijos

Con $300 al mes de infraestructura, bastan **un plan Programa al mes**, o unos 12 paquetes avanzados, para cubrir los costos fijos.

## 6. Riesgos y controles

| Riesgo | Control |
|---|---|
| **El XLM sube de precio** (cobramos en USD y gastamos en XLM) | Comprar el XLM del "tanque de comisiones" de cada evento al facturarlo. Revisar los precios cada trimestre |
| **Congestión de la red** (las comisiones suben en picos) | Comisión máxima por transacción en el backend. En congestión se encolan los claims y se priorizan los canjes y reembolsos |
| **Capital bloqueado en reservas** | Smart wallets con passkey (sin reservas) para eventos grandes, reutilizar wallets y recuperar las reservas al cierre con `account merge` |
| **El tanque de comisiones se agota** a mitad del evento | Fondearlo por adelantado con el costo estimado × 1,5. Alertas al 50 % y al 80 %. **Los reembolsos nunca se detienen** |
| **Precio por asistente en eventos masivos** | Más de 3 000 asistentes: cobrar por asistente activo (ej. $0,30–0,50) con un mínimo, para que el costo nunca crezca más rápido que el ingreso |

**Regla de precio:** el costo de red **medido** no debe superar el **15 %** del ingreso de ningún plan pago.
