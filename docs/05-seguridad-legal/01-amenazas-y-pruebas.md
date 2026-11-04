# Amenazas y pruebas

> **Estado:** vigente · **Última revisión:** 2026-11-03

## 1. Modelo de amenazas

| # | Amenaza | Impacto | Mitigación | ¿En el MVP? |
|---|---|---|---|---|
| T1 | Cuentas falsas que acumulan puntos con retos | Participaciones falsas en el reporte | 1 wallet por código de entrada; el backend rechaza códigos repetidos | ✅ |
| T2 | Foto del QR compartida por WhatsApp | Participaciones sin asistencia real | QR rotativo firmado con HMAC y TTL de 30 s | ✅ |
| T3 | Reclamar el mismo reto varias veces | Inflación de puntos | `max_per_user` en el contrato (no depende del backend) | ✅ |
| T4 | Reto que entrega más premios de los previstos | Merch y meriendas agotados, costo sin techo | `max_total` por reto en el contrato | ✅ |
| T5 | Puntos enviados fuera del evento | Se rompe el circuito cerrado | `AUTH_REQUIRED`: solo wallets autorizadas pueden tener puntos | ✅ |
| T6 | Llave del verifier robada | Emisión de puntos falsos | Los límites del contrato acotan el daño; `pause()`; rotar el verifier (`set_verifier` en producción) | Parcial |
| T7 | Llaves de asistentes en el backend (custodial) | Robo de saldos si se compromete el servidor | Solo testnet. En producción: passkeys, el backend no tiene llaves | ⚠️ Solo demo |
| T8 | Bug en el contrato | Pérdida o bloqueo de fondos | Tests (sección 2), pausa, auditoría antes de mainnet | Tests ✅ |
| T9 | *(Feria)* Organizador que no devuelve el saldo en dólares | Pérdida de confianza | `refund` funciona incluso pausado o cerrado; reservas 1:1 verificables on-chain | ✅ |
| T10 | Mesa o comercio que cobra y no entrega | Reclamo del asistente | El evento on-chain sirve de comprobante; el organizador puede revisarlo | Parcial |
| T11 | Datos personales expuestos | Riesgo legal | Nada personal on-chain; el sponsor solo recibe datos con consentimiento explícito y en agregado | ✅ |
| T12 | Robo o reventa de puntos entre asistentes (presión, estafas, compraventa) | Puntos que cambian de manos fuera de las reglas | No existe ninguna función para transferir entre asistentes (D3). En producción, el token solo acepta transferencias hacia comercios (opción B) | ✅ por backend; on-chain en producción |
| T13 | Reto automático manipulado (transacciones falsas para "primera transacción") | Participaciones infladas | El backend verifica que la transacción sea de la wallet registrada del asistente, y el contrato aplica `max_per_user` | ✅ |

## 2. Pruebas obligatorias

### 2.1 Tests del contrato `challenges` (Rust, `cargo test`)

| # | Caso | Resultado esperado |
|---|---|---|
| C1 | `init` dos veces | `AlreadyInitialized` |
| C2 | `claim` válido | Saldo +reward, `claimed_total` +1, evento `claimed` |
| C3 | `claim` repetido con `max_per_user = 1` | `UserLimitReached`; el saldo no cambia |
| C4 | `claim` cuando `claimed_total == max_total` | `BudgetExhausted` |
| C5 | `claim` fuera de `start..end` | `OutOfWindow` |
| C6 | `claim` en un reto inactivo | `ChallengeInactive` |
| C7 | `claim` firmado por alguien que no es el verifier | Falla de autorización |
| C8 | `claim` para una wallet no registrada | `NotAttendee` |
| C9 | `redeem` a un comercio no registrado | `NotMerchant` |
| C10 | `redeem` con `amount <= 0` | `InvalidAmount` |
| C11 | `transfer` directo de puntos a una wallet externa no autorizada | Falla en el SAC |
| C12 | `pay` válido | USDC al comercio + cashback correcto (redondeo hacia abajo) |
| C13 | Cualquier función que mueve valor con `Closed = true` | `EventClosed` |
| C14 | `refund` con `Closed = true` y con `Paused = true` | **Funciona** |
| C15 | `expire` | Saldos de puntos en 0 vía clawback |
| C16 | `pause` y luego `claim` | `Paused` |
| C17 | Acciones de admin firmadas por otra cuenta | Falla de autorización |

### 2.2 Validaciones de integración (testnet)

| # | Validación | Cómo |
|---|---|---|
| I1 | El script de setup corre de punta a punta en una testnet limpia | Correrlo desde cero |
| I2 | Un QR vencido es rechazado | Esperar 31 s y escanear |
| I3 | El flujo completo de demo corre sin intervención manual | Ensayo cronometrado |
| I4 | El panel se actualiza en menos de 10 s después de un claim | Observarlo en el ensayo |
| I5 | Los mensajes de error se entienden | Cada `Error` del contrato tiene un texto en la app |
| I6 | Funciona en Android e iOS | Prueba manual en varios celulares |
| I7 | El backend no expone ningún endpoint que transfiera puntos entre asistentes | Revisar las rutas de la API |
| I8 | Los números del reporte coinciden con los eventos on-chain | Comparar el reporte con Stellar Expert |
