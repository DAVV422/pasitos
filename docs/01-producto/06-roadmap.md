# Roadmap

> **Estado:** vigente · **Última revisión:** 2026-11-06

## 1. Etapas

| Etapa | Cuándo | Qué hacer | Objetivo | Estado |
|---|---|---|---|---|
| **0. Hackathon** | Octubre de 2026 | MVP en testnet, pitch, video de demo, primeras entrevistas | Probar la tesis | ✅ Hecho ([histórico](../07-hackathon/README.md)) |
| **1. Pilotos comunitarios** | Primeros 3 meses después del hackathon | 3–5 eventos gratis (GDG, meetups, clubes) con los contactos del equipo | Casos reales y reportes que mostrar | En curso |
| **2. Primeros ingresos** | Hacia el mes 6 | Vender el plan Programa a fundaciones, ecosistemas, universidades y cooperación. Postular al SCF | Primeros clientes pagos | Pendiente |
| **3. Ferias** | Después | Saldo en dólares y cobro por transacción en ferias comerciales | Escala | Pendiente |

## 2. Producto: del MVP a la v1 y después

| Tema | MVP del hackathon | v1 (pilotos) | Después |
|---|---|---|---|
| Red | Testnet | Testnet | Mainnet, después de una auditoría |
| Registro de puntos | Una transacción por acción, token de puntos (SAC) | Libro de movimientos anclado cada 5 min (D22) | Igual; anclaje más espaciado en eventos muy grandes |
| Cuentas de asistentes | Cuentas clásicas custodiadas por el backend | Cuenta Pasitos con correo y contraseña, sin wallet (D25, D26) | Wallet opcional con passkey en el módulo de onboarding |
| Eventos | Uno solo, configurado por script | Consola de plataforma, organizaciones, planes y varios eventos ([flujos](07-flujos-v1.md)) | Pasarela de pago |
| Equipo | — | Roles por evento y bitácora (D19) | Portales para sponsors y comercios |
| Registro de asistentes | Link de la entrada | Lista de invitados, registro abierto o mixto, check-in en la puerta (D27) | Integraciones con plataformas de entradas |
| Sin internet | No | Buena señal + procesos livianos (D24) | Cola de reclamos y sincronización por la mesa (D23) |
| Estadísticas avanzadas | Pantalla bloqueada (mock) | Paquete opcional por evento | Reportes con marca por sponsor |
| Saldo en dólares | Carga y reembolso simulados | No | Variante Feria con anchor (SEP-24) o proveedor autorizado |

## 3. Ideas para más adelante

- **Integración con Stellar Passport:** si el asistente ya tiene wallet de Passport, la reutilizamos.
- **Reputación entre eventos:** un badge intransferible de "asistente frecuente" con beneficios en el próximo evento; los puntos siguen siendo locales.
- **Transparencia de fondos:** el sponsor deposita su aporte en USDC y ve on-chain cuánto se destinó a premios.

## 4. Antes de mainnet

Checklist en [Legal y cumplimiento §3](../05-seguridad-legal/02-legal-y-cumplimiento.md#3-antes-de-mainnet).
