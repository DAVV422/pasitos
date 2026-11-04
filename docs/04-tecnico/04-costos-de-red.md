# Costos de red

> **Estado:** vigente · la tabla de costos medidos está 🔍 pendiente · **Última revisión:** 2026-11-03
> La cobertura de estos costos con cada plan está en [Economía unitaria](../02-negocio/05-economia-unitaria.md).

## 1. Cómo cobra Stellar

| Concepto | Qué es | Orden de magnitud | ¿Se recupera? |
|---|---|---|---|
| **Comisión base** (operaciones clásicas: pagos, trustlines) | 100 stroops por operación | 0,00001 XLM | No |
| **Comisión de recursos** (Soroban: llamadas a contratos) | Según CPU, lecturas y escrituras, tamaño y eventos | De milésimas a centésimas de XLM por llamada | No |
| **Rent** (Soroban) | Cada dato guardado en un contrato paga por el tiempo que vive (TTL) | Se cobra al crear o extender un dato | No |
| **Reservas de cuenta** (cuentas clásicas `G…`) | Saldo mínimo bloqueado: 1 XLM por cuenta + 0,5 XLM por trustline | ~1,5 XLM por asistente con puntos; 2 XLM si además tiene USDC | ✅ **Sí**, al cerrar la cuenta |

> **Los números exactos hay que medirlos**, no suponerlos. `simulateTransaction` devuelve el costo de cada llamada antes de enviarla.

## 2. Estimación para un evento de 400 asistentes

Supuestos: unas 12 transacciones por asistente → **~4 800 transacciones**. Precio del XLM: **variable, verificarlo el día del cálculo**. Ejemplo con $0,30:

| Escenario de costo por transacción | Costo por evento | Por asistente |
|---|---|---|
| Bajo: 0,001 XLM ($0,0003) | ~$1,50 | < $0,01 |
| Alto: 0,05 XLM ($0,015) | ~$72 | $0,18 |

**Reservas:** 400 × 2 XLM = **800 XLM bloqueados** (~$240 a $0,30). Es el número más grande, **pero no es un gasto**: se recupera después del evento al quitar las trustlines y fusionar las cuentas de vuelta a la del organizador (`account merge`).

**Conclusión:** el costo no es el problema. El problema sería **no medirlo y no controlarlo**.

## 3. Costos medidos en testnet

🔍 **Pendiente de completar** con `simulateTransaction` sobre el contrato desplegado.

| Operación | Comisión de recursos (stroops) | ¿Crea datos nuevos (rent)? | Costo en XLM | Notas |
|---|---|---|---|---|
| `register_attendee` | | Sí (`Attendee`) | | |
| `claim` (primera vez) | | Sí (`Claims`) | | |
| `redeem` | | No | | |
| `pay` | | No | | Solo Feria |
| `refund` | | No | | Solo Feria |
| `payment` clásico de USDC | 100 | No | 0,00001 | Referencia |

## 4. Cómo controlamos el costo

| # | Medida | Ahorro | ¿Cuándo? |
|---|---|---|---|
| 1 | **Nosotros o el organizador pagamos todas las comisiones con fee bump.** El asistente nunca necesita XLM. Tope de comisión por transacción en el backend | Control total del gasto | MVP |
| 2 | **Presupuesto de red por evento:** la cuenta que paga comisiones se fondea con un monto fijo y el panel muestra el consumo. Alerta al 80 % | Evita sorpresas | Producción |
| 3 | **Recuperar las reservas** al cerrar: quitar trustlines y fusionar las cuentas de los asistentes | ~2 XLM por asistente | Producción |
| 4 | **Claims en lote:** el backend junta los retos completados y los envía cada 5–10 s en una sola transacción (`claim_batch`) | 10–30 veces menos transacciones de retos | Producción |
| 5 | **Datos pequeños en el contrato:** guardar solo contadores, no textos | Menos rent | MVP |
| 6 | **Smart wallets con passkey** en lugar de cuentas clásicas: no requieren reservas por cuenta ni trustlines para los SAC | Elimina las reservas bloqueadas | Producción |
| 7 | **No poner on-chain lo que no necesita confianza** ([Datos on-chain](03-datos-on-chain.md)) | Elimina transacciones innecesarias | Siempre |

**Sobre los claims en lote:** el asistente ve *"Verificando…"* unos segundos más, pero sigue siendo on-chain. Cada transacción de Soroban tiene límites de recursos, así que el tamaño máximo del lote se mide en testnet (empezar con 20).

**Por qué no hacemos todo off-chain:** sería más barato, pero perderíamos lo que justifica usar Stellar. El financiador no podría auditar las participaciones, el circuito cerrado dependería de nuestra palabra y el saldo en dólares no tendría reservas verificables.

## 5. MVP frente a producción

| Tema | MVP | Producción |
|---|---|---|
| Transacciones | Una por acción (simple y demostrable) | Claims en lote |
| Cuentas de asistentes | Clásicas, fondeadas con Friendbot | Smart wallets con passkey, sin reservas |
| Comisiones | Fee bump del organizador | Igual, con presupuesto, alertas y OpenZeppelin Relayer |
| Medición de costos | Tabla de la sección 3 | Panel de consumo de red por evento |
| Reservas | No se recuperan (testnet) | `account merge` al cierre |
