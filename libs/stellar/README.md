# stellar

Cliente de Stellar detrás de un puerto (HU-103 §2). Lo usa el trabajador; el API solo leerá.

- `StellarPort`: preparar (simular, armar y firmar), enviar, consultar el resultado, leer el contrato y el saldo del operador.
- `RpcStellar`: adaptador con el RPC de Soroban y `@stellar/stellar-sdk`. Cada transacción vale 60 s. La llave del operador es un campo privado: no sale en logs ni al serializar.
- `ErrorContratoStellar`: el contrato rechazó la llamada (código y nombre de `contracts/evento/src/errores.rs`). `StellarNoDisponible`: la red no respondió; se reintenta.
- `TransaccionesStellarRepository` (HU-104): una fila en `transacciones_stellar` por cada intento enviado, con la comisión estimada, la cobrada y los recursos de la simulación. `getCostoRed({ eventoId, mes })` da el costo por evento, por mes y por operación.
- `FakeStellar` (`@pasitos/stellar/pruebas`): el contrato en memoria con las mismas reglas, para los tests. Simula caídas, transacciones que no entran, respuestas perdidas, comisiones altas y saldo bajo.

## Comandos

| Comando | Qué hace |
|---|---|
| `nx test stellar` | Tests |
| `nx lint stellar` | Lint |
| `pnpm stellar:medir --red testnet` | Mide el costo de cada operación del contrato e imprime la tabla de [Costos de red §3](../../docs/04-tecnico/04-costos-de-red.md#3-costos-medidos-en-testnet) |

Las pruebas del adaptador contra una red real están en `apps/trabajador` (`red-local.int.spec.ts`).
