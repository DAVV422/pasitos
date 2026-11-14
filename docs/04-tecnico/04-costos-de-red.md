# Costos de red

> **Estado:** ✅ vigente para la v1 (D22) · costos medidos en testnet el 2026-11-14 · **Última revisión:** 2026-11-14
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

Medido el **2026-11-14** en testnet con `pnpm stellar:medir --red testnet` (HU-104), contrato versión 1 (WASM de 15 411 bytes). La comisión cobrada incluye la base y la de recursos; la estimada es la que pide la simulación antes de enviar.

| Operación | Cobrada (stroops) | Cobrada (XLM) | Estimada (stroops) | ¿Crea datos nuevos (rent)? |
|---|---|---|---|---|
| Instalar el WASM (una vez por versión) | 39 310 | 0,0039 | 46 823 | No: el código ya estaba instalado; la primera vez se suma el rent del código |
| Crear la instancia con 1 reto | 333 006 | 0,0333 | 386 813 | Sí (2 datos) |
| Crear la instancia con 10 retos | 957 922 | 0,0958 | 1 103 256 | Sí (11) |
| Crear la instancia con 50 retos | 3 736 144 | 0,3736 | 4 289 197 | Sí (51) |
| `add_pantallas` con 10 llaves | 1 113 498 | 0,1113 | 1 282 073 | Sí (10) |
| `anchor` con 1 reto en los conteos | 5 867 | 0,0006 | 10 739 | No |
| `anchor` con 10 retos en los conteos | 20 725 | 0,0021 | 25 597 | No |
| `anchor` con 50 retos en los conteos | 87 506 | 0,0088 | 93 231 | No |
| `close` con 10 retos | 299 436 | 0,0299 | 348 265 | No (actualiza la instancia) |
| Extender ~6 meses un contrato cerrado (instancia, 10 retos y 10 pantallas) | 11 056 854 | 1,1057 | 12 719 485 | No |
| Extender ~6 meses el código (WASM) | ~249 000 000 | ~24,9 | | No. Se paga una vez para **todos** los eventos, no por contrato |

**Qué se aprende:**
- **Lo caro es crear datos, no anclar.** Un `anchor` cuesta entre 0,0006 y 0,009 XLM. Crear el contrato y registrar las pantallas cuestan de 15 a 50 veces más porque pagan el rent de cada dato nuevo.
- **El costo de `anchor` crece con los retos que tuvieron movimientos en el lote**, no con los asistentes: con 50 retos escribe unos 8 KB.
- **Mantener un contrato cerrado** con todos sus datos cuesta ~1,1 XLM cada 6 meses. Sin extenderlo, sus datos se archivan unos 31 días después del último uso; por eso la evidencia del evento se guarda aparte al cerrar (HU-105).
- El valor del código sale de restar la extensión de la instancia sola (0,26 XLM) a la primera medición de instancia y código juntos (25,21 XLM).

**Topes del sellador (HU-104 §2), con esta medición:** `STELLAR_COMISION_MAX_STROOPS` = 1 000 000 para `anchor` (unas 10 veces el más caro medido) y `STELLAR_COMISION_MAX_PREPARACION_STROOPS` = 10 000 000 para crear el contrato, sumar retos y registrar pantallas (2,3 veces la instancia con 50 retos). El cierre no tiene tope: se envía igual y alerta.

**Estimación por evento con estos valores** (10 retos, 10 pantallas, 10 horas con anclaje cada 5 minutos):

| Parte | XLM |
|---|---|
| Crear el contrato y registrar las pantallas | 0,21 |
| 120 `anchor` | 0,25 |
| Cierre | 0,03 |
| **Total del evento** | **~0,49** (unos USD 0,15 con el XLM a USD 0,30) |
| Mantenerlo 6 meses más | +1,11 |

Queda dentro del escenario bajo de §2. La configuración de comisiones de testnet suele seguir a la de mainnet, pero **se vuelve a medir antes de pasar a mainnet**.

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
