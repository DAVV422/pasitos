# Contratos de Pasitos

Contratos Soroban (Rust). Por ahora, `evento/` es el esqueleto de la fase 0; las funciones del anclaje se agregan en HU-102 (ver *Contrato y sellador*, documento interno de la versión piloto).

## Requisitos

- Rust estable con el target `wasm32v1-none` (lo instala `rust-toolchain.toml`).
- **Stellar CLI 25.2 o superior** (`stellar --version`). `soroban-sdk` 29 solo compila a WASM con `stellar contract build`.

## Comandos

| Comando | Qué hace |
|---|---|
| `nx test contrato-evento` | Tests del contrato (`cargo test`) |
| `nx lint contrato-evento` | `cargo fmt --check` y `cargo clippy` |
| `nx build contrato-evento` | Compila el WASM (`stellar contract build`) |
