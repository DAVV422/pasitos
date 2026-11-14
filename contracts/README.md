# Contratos de Pasitos

Contratos Soroban (Rust). `evento/` es el contrato de cada evento (HU-102): guarda los topes de los retos, las llaves de las pantallas y la última huella encadenada de los lotes, y rechaza un lote fuera de orden, que no encadena o que pasa un tope. **No tiene función de actualización.**

Las huellas se calculan igual que en `libs/firmas`; los dos se prueban con `libs/firmas/vectores/huellas.json`, que genera `pnpm vectores` (un tercer cálculo, en Python).

## Requisitos

- Rust estable con el target `wasm32v1-none` (lo instala `rust-toolchain.toml`).
- **Stellar CLI 25.2 o superior** (`stellar --version`). `soroban-sdk` 29 solo compila a WASM con `stellar contract build`.

## Comandos

| Comando | Qué hace |
|---|---|
| `nx test contrato-evento` | Tests del contrato (`cargo test`) |
| `nx lint contrato-evento` | `cargo fmt --check` y `cargo clippy` |
| `nx build contrato-evento` | Compila el WASM (`stellar contract build`) |
| `pnpm stellar:levantar` | Red local de Stellar en Docker (`http://127.0.0.1:8000/rpc`) |
| `pnpm stellar:cuentas --red local\|testnet` | Cuentas operador y admin de prueba, fondeadas con Friendbot. Las llaves quedan en la configuración de Stellar CLI del equipo, nunca en el repositorio |
| `pnpm contrato:instalar --red local\|testnet` | Compila, sube el WASM e imprime `STELLAR_WASM_HASH` |
| `pnpm contrato:probar --red local\|testnet` | Despliega una instancia de prueba y llama a `version()` |

## Versiones instaladas en testnet

El WASM se instala una vez por versión. Cada evento crea su instancia desde este hash.

| Versión | Fecha | `STELLAR_WASM_HASH` |
|---|---|---|
| 1 | 2026-11-14 | `a19525a85de6ae78a39c5c765e13d1bf77d23f15c7d69f528375bb24cbc68451` |
