# Costos de red

> **Estado:** ✅ vigente para la v1 (D22) · la tabla de costos medidos está 🔍 pendiente · **Última revisión:** 2026-11-06
> La cobertura de estos costos con cada plan está en Economía unitaria *(interno)*.

## 1. Cómo cobra Stellar

| Concepto | Qué es | Orden de magnitud |
|---|---|---|
| **Comisión base** | 100 stroops por operación | 0,00001 XLM |
| **Comisión de recursos** (llamadas a contratos) | Según CPU, lecturas, escrituras, tamaño y eventos | De milésimas a centésimas de XLM por llamada |
| **Rent** | Cada dato guardado en un contrato paga por el tiempo que vive (TTL) | Se cobra al crear o extender un dato |

Con el libro anclado (D22) **no hay cuentas de asistentes, así que tampoco hay reservas ni trustlines.**

> **Los números exactos hay que medirlos,** no suponerlos. `simulateTransaction` devuelve el costo de cada llamada antes de enviarla.

## 2. El costo ya no depende de la cantidad de asistentes

| Momento | Transacciones |
|---|---|
| Publicación (evento + retos) | ~1–10 |
| Llaves de las pantallas | 1 por pantalla, o 1 en total si se registran en lote |
| Anclaje | **12 por hora de evento** (una cada 5 min, solo si hubo movimientos) |
| Cierre | 1–2 |

**Ejemplo: un evento de 1 día con 10 horas de actividad** → unas **135 transacciones**, sean 50 o 5 000 asistentes. Con un precio de ejemplo de $0,30 por XLM:

| Escenario de costo por transacción | Costo por evento |
|---|---|
| Bajo: 0,001 XLM | ~$0,04 |
| Alto: 0,05 XLM | ~$2 |

Comparado con el modelo del MVP (unas 4 800 transacciones para 400 asistentes, más ~800 XLM bloqueados en reservas), la diferencia es de dos órdenes de magnitud. Además, deja de crecer con el evento.

## 3. Costos medidos en testnet

🔍 **Pendiente**, cuando exista el contrato nuevo.

| Operación | Comisión de recursos (stroops) | ¿Crea datos nuevos (rent)? | Costo en XLM | Notas |
|---|---|---|---|---|
| Registrar evento y retos | | Sí | | |
| Registrar llaves de pantallas | | Sí | | |
| `anclar` | | Poco (actualiza la última huella y los conteos) | | La más frecuente |
| Cierre | | Sí | | |

## 4. Cómo controlamos el costo

| # | Medida | Cuándo |
|---|---|---|
| 1 | Nosotros pagamos todas las comisiones; los asistentes y organizadores nunca necesitan XLM | v1 |
| 2 | Tope de comisión por transacción en el sellador | v1 |
| 3 | No se ancla si en esos 5 minutos no hubo movimientos | v1 |
| 4 | Datos mínimos en el contrato: huellas y contadores, nunca textos | v1 |
| 5 | Presupuesto de red mensual y alerta al 80 %, en la consola de plataforma | v1 |
| 6 | Si un evento muy grande lo pide, anclar cada 10 minutos en lugar de 5 | Después |

**Por qué no hacemos todo off-chain:** sería todavía más barato, pero el financiador tendría que confiar en nuestra base de datos. La huella en Stellar es lo que hace que el reporte se pueda comprobar.

## 5. Variante Feria (fuera de la v1)

Los pagos con saldo en dólares (USDC) sí serían una transacción por pago, porque es dinero real que tiene que estar on-chain. Ese costo lo cubre la comisión del plan Feria (2–3 % de las ventas).
