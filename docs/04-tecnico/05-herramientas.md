# Herramientas y proyectos reutilizables

> **Estado:** vigente · **Última revisión:** 2026-11-06
> Con D22, el navegador no usa nada de Stellar: solo el servidor (el sellador) habla con la red. Las herramientas de wallets y tokens quedan para la variante Feria y el módulo de onboarding.
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
| **Stellar Asset Contract (SAC)** | USDC en la variante Feria (fuera de la v1). Ya no se usa para los puntos (D22) |
| **OpenZeppelin Stellar Contracts** (`stellar-tokens`, `stellar-access`, `stellar-contract-utils`) · https://github.com/OpenZeppelin/stellar-contracts | Opción B del token (fungible + allowlist). Patrones de control de acceso y pausa para `challenges` |
| **soroban-examples** · https://github.com/stellar/soroban-examples | Referencia de patrones: token, autorización, eventos, tests |

## 3. Wallets y firma

| Herramienta | MVP / Producción | Uso |
|---|---|---|
| **@stellar/stellar-sdk** (JS) | v1 | Solo en el servidor: el sellador invoca el contrato para anclar los lotes |
| **Freighter** | MVP (solo equipo) | Wallet del organizador para firmar acciones de admin |
| **Stellar Wallets Kit** · https://github.com/Creit-Tech/Stellar-Wallets-Kit | Opcional | Si se quiere que el admin use cualquier wallet |
| **Smart Account Kit** (`smart-account-kit`) · https://github.com/kalepail/smart-account-kit | Después | Wallets con passkey para el módulo de onboarding del plan Programa |
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
| **Stellar RPC** (`simulateTransaction`, `sendTransaction`, `getEvents`) | El sellador envía los anclajes y la verificación pública lee las huellas. RPC público de testnet: `https://soroban-testnet.stellar.org` |
| **Horizon** (legacy) | Solo si hace falta historial de pagos clásicos. Preferir RPC |

## 6. Proyectos del ecosistema que podemos aprovechar

| Proyecto | Cómo lo aprovechamos |
|---|---|
| **Stellar Passport** (SCF ronda 40) | Mismo patrón de "QR en el evento → wallet con passkey". Estudiar su UX y proponer una integración |
| **IRL** (SCF ronda 38) | Referencia de lealtad para venues: cómo presentan el valor a las marcas |
| **BravePay** (SCF ronda 11) | Referencia de POS cashless con smartphone para la variante Feria |

## 7. Frontend

- Angular y NestJS, con Tailwind y PostgreSQL. El detalle y los motivos están en [Stack tecnológico](09-stack-tecnologico.md).
- Lector de QR: primero el `BarcodeDetector` nativo; si no existe, cargar `@zxing/browser` o similar solo al abrir la cámara.
- Firma de reclamos y de QR: WebCrypto (viene en el navegador).
- Avisos en vivo: Server-Sent Events (`EventSource`, viene en el navegador).
- Generador de QR: `qrcode` / `qrcode.react`.
- Gráficos del panel: Recharts.
- Íconos: Lucide.
- Fuentes: Plus Jakarta Sans e Inter (ver [Design system](../06-diseno/02-design-system.md)).
