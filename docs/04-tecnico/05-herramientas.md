# Herramientas y proyectos reutilizables

> **Estado:** vigente · **Última revisión:** 2026-11-03
> Todo lo que se pueda reutilizar se reutiliza. Esta lista dice qué usar y para qué.

## 1. Base del proyecto

| Herramienta | Para qué | Enlace |
|---|---|---|
| **Scaffold Stellar** | Plantilla con contratos Soroban + frontend React ya conectados | https://scaffoldstellar.org |
| **Stellar CLI** | Compilar, desplegar e invocar contratos; desplegar el SAC (`stellar contract asset deploy`) | https://developers.stellar.org/docs/tools/cli |
| **soroban-sdk** (Rust) | Escribir el contrato `challenges` | https://docs.rs/soroban-sdk |
| **Stellar Laboratory** | Crear la cuenta emisora, poner flags, probar transacciones a mano | https://lab.stellar.org |
| **Friendbot** | Fondear cuentas de testnet con XLM | `https://friendbot.stellar.org/?addr=G...` |
| **Stellar Expert (testnet)** | Ver transacciones y el rechazo del circuito cerrado; enlaces del reporte | https://stellar.expert/explorer/testnet |

## 2. Contratos y librerías

| Herramienta | Uso en el proyecto |
|---|---|
| **Stellar Asset Contract (SAC)** | Token de puntos (opción A) y USDC. No hay que escribir un contrato de token |
| **OpenZeppelin Stellar Contracts** (`stellar-tokens`, `stellar-access`, `stellar-contract-utils`) · https://github.com/OpenZeppelin/stellar-contracts | Opción B del token (fungible + allowlist). Patrones de control de acceso y pausa para `challenges` |
| **soroban-examples** · https://github.com/stellar/soroban-examples | Referencia de patrones: token, autorización, eventos, tests |

## 3. Wallets y firma

| Herramienta | MVP / Producción | Uso |
|---|---|---|
| **@stellar/stellar-sdk** (JS) | MVP | Backend: crear cuentas y trustlines, firmar e invocar contratos, fee bump |
| **Freighter** | MVP (solo equipo) | Wallet del organizador para firmar acciones de admin |
| **Stellar Wallets Kit** · https://github.com/Creit-Tech/Stellar-Wallets-Kit | Opcional | Si se quiere que el admin use cualquier wallet |
| **Smart Account Kit** (`smart-account-kit`) · https://github.com/kalepail/smart-account-kit | Producción | Wallets con passkey: el asistente firma con huella o Face ID |
| **OpenZeppelin Relayer** · https://docs.openzeppelin.com/relayer/stellar | Producción | Fee sponsorship: el asistente no necesita XLM. **Reemplaza a Launchtube, que está deprecado; no usar Launchtube** |

## 4. Dinero: USDC y rampas (solo Feria)

| Herramienta | Uso |
|---|---|
| **USDC de testnet (Circle)** | Emisor en testnet: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Se obtiene en el faucet de Circle (https://faucet.circle.com, elegir Stellar Testnet; tiene captcha, se hace a mano) |
| **Test anchor** · https://testanchor.stellar.org | Demo de retiro con SEP-24 (depósito y retiro interactivos) |
| **SEP-24 / SEP-10** | Estándares para conectar un anchor real (carga y retiro en moneda local) |
| **MoneyGram Access** | Carga y retiro en efectivo vía anchors donde opere. Verificar la cobertura en Bolivia |

## 5. Datos e indexación

| Herramienta | Uso |
|---|---|
| **Stellar RPC** (`getEvents`, `simulateTransaction`, `sendTransaction`) | El backend lee los eventos del contrato para el panel y el reporte. RPC público de testnet: `https://soroban-testnet.stellar.org` |
| **Horizon** (legacy) | Solo si hace falta historial de pagos clásicos. Preferir RPC |

## 6. Proyectos del ecosistema que podemos aprovechar

| Proyecto | Cómo lo aprovechamos |
|---|---|
| **Stellar Passport** (SCF ronda 40) | Mismo patrón de "QR en el evento → wallet con passkey". Estudiar su UX y proponer una integración |
| **IRL** (SCF ronda 38) | Referencia de lealtad para venues: cómo presentan el valor a las marcas |
| **BravePay** (SCF ronda 11) | Referencia de POS cashless con smartphone para la variante Feria |

## 7. Frontend

- React + Vite (viene con Scaffold Stellar) y Tailwind.
- Lector de QR en el navegador: `html5-qrcode` o `@zxing/browser`.
- Generador de QR: `qrcode` / `qrcode.react`.
- Gráficos del panel: Recharts.
- Íconos: Lucide.
- Fuentes: Plus Jakarta Sans e Inter (ver [Design system](../06-diseno/02-design-system.md)).
