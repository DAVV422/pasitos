# Roadmap

> **Estado:** vigente · **Última revisión:** 2026-11-03

## 1. Etapas

| Etapa | Cuándo | Qué hacer | Objetivo | Estado |
|---|---|---|---|---|
| **0. Hackathon** | Octubre de 2026 | MVP en testnet, pitch, video de demo, primeras entrevistas | Probar la tesis | ✅ Hecho ([histórico](../07-hackathon/README.md)) |
| **1. Pilotos comunitarios** | Primeros 3 meses después del hackathon | 3–5 eventos gratis (GDG, meetups, clubes) con los contactos del equipo | Casos reales y reportes que mostrar | En curso |
| **2. Primeros ingresos** | Hacia el mes 6 | Vender el plan Programa a fundaciones, ecosistemas, universidades y cooperación. Postular al SCF | Primeros clientes pagos | Pendiente |
| **3. Ferias** | Después | Saldo en dólares y cobro por transacción en ferias comerciales | Escala | Pendiente |

## 2. Producto: del MVP a producción

| Tema | MVP (hoy) | Producción |
|---|---|---|
| Red | Testnet | Mainnet, después de una auditoría |
| Wallets | Cuentas clásicas custodiadas por el backend | Smart wallets con passkey (`smart-account-kit`); el asistente firma con huella o Face ID |
| Comisiones | Fee bump del organizador | OpenZeppelin Relayer, con presupuesto y alertas |
| Token de puntos | Asset clásico + SAC (opción A) | Token propio que solo acepta transferencias hacia comercios (opción B) |
| Transacciones de retos | Una por acción | Claims en lote (`claim_batch`) |
| Eventos | Uno solo, configurado por script | Varios eventos: contrato *factory* + panel para organizadores |
| Plan Comunidad | Se menciona | Formulario de solicitud y bandeja de aprobación |
| Estadísticas avanzadas | Pantalla bloqueada (mock) | Panel completo y reportes con marca por sponsor |
| Sin internet | No | Vouchers firmados en el teléfono que se liquidan al recuperar la conexión |
| Saldo en dólares | Carga y reembolso simulados | Carga con QR bancario o tarjeta vía anchor (SEP-24) o proveedor autorizado |

## 3. Ideas para más adelante

- **Integración con Stellar Passport:** si el asistente ya tiene wallet de Passport, la reutilizamos.
- **Reputación entre eventos:** un badge intransferible de "asistente frecuente" con beneficios en el próximo evento; los puntos siguen siendo locales.
- **Reutilizar la wallet del asistente** en sus eventos siguientes.
- **Transparencia de fondos:** el sponsor deposita su aporte en USDC y ve on-chain cuánto se destinó a premios.

## 4. Antes de mainnet

Checklist en [Legal y cumplimiento §3](../05-seguridad-legal/02-legal-y-cumplimiento.md#3-antes-de-mainnet).
