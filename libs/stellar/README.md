# stellar

Cliente de Stellar detrás de un puerto (HU-103 §2). Lo usa el trabajador; el API solo leerá.

- `StellarPort`: preparar (simular, armar y firmar), enviar, consultar el resultado, leer el contrato y el saldo del operador.
- `RpcStellar`: adaptador con el RPC de Soroban y `@stellar/stellar-sdk`. Cada transacción vale 60 s. La llave del operador es un campo privado: no sale en logs ni al serializar.
- `ErrorContratoStellar`: el contrato rechazó la llamada (código y nombre de `contracts/evento/src/errores.rs`). `StellarNoDisponible`: la red no respondió; se reintenta.
- `FakeStellar` (`@pasitos/stellar/pruebas`): el contrato en memoria con las mismas reglas, para los tests. Simula caídas, transacciones que no entran y respuestas perdidas.

## Comandos

| Comando | Qué hace |
|---|---|
| `nx lint stellar` | Lint |

Las pruebas del adaptador contra una red real están en `apps/trabajador` (`red-local.int.spec.ts`).
