# Setup en testnet

> **Estado:** 📦 histórico (MVP del hackathon) · **Última revisión:** 2026-11-06
> ⚠️ Setup del contrato `challenges` y del token de puntos del MVP. Se reescribe cuando exista el contrato de la v1 (D22).

## 1. Orden obligatorio

> El orden importa: los flags del emisor se ponen **antes** de que exista cualquier trustline. Si no, las trustlines viejas no tendrán clawback.

1. Crear y fondear con Friendbot: `issuer`, `organizer` (admin), `verifier` (backend), `treasury`, las mesas de canje y los asistentes de demo.
2. En `issuer`: activar `AUTH_REQUIRED`, `AUTH_REVOCABLE` y `AUTH_CLAWBACK_ENABLED` (Stellar Lab → Set Options).
3. Desplegar el SAC del asset de puntos (ej. `FORO26:issuer`) con `stellar contract asset deploy`.
4. *(Feria)* Desplegar el SAC de USDC de testnet, si no existe ya (el CLI devuelve la dirección si ya está desplegado).
5. Desplegar `challenges` e invocar `init`.
6. En el SAC de puntos, hacer `set_admin` al contrato `challenges` (firma el `issuer`).
7. Crear las trustlines de puntos (y de USDC en ferias) para las mesas de canje, los asistentes y la tesorería.
8. Llamar `add_merchant` para cada mesa de canje y `register_attendee` para cada asistente.
9. *(Feria)* Cargar USDC del faucet en `treasury`.
10. Crear los retos de demo con `create_challenge`.
11. Guardar todas las direcciones en `deploy/testnet.json` y compartirlo con el equipo.

## 2. Script reproducible

Todo el setup debe quedar en un **script reproducible** (`scripts/setup-testnet.ts` o `.sh`). Si la testnet se resetea o algo se rompe, se vuelve a correr en minutos.

## 3. Reset de demo

Una ruta o script interno (`/admin/reset-demo` o `scripts/reset-demo`) que deja los datos de demo en su estado inicial en menos de 1 minuto. Se corre antes de cada ensayo o grabación.

## 4. Datos de demo

Los datos ficticios oficiales (evento *Foro Tech 2026*, sponsors *Nimbora Cloud*, *Kodara Academy* y *Quillu Pay*, retos y catálogo) están en el [Brief de mockups §4](../06-diseno/04-brief-mockups-ia.md#4-datos-ficticios-usar-exactamente-estos). Usar siempre esos mismos datos.

## 5. Ventanas horarias

El reto de "charla de cierre" depende de la hora del ledger. **Configurar su ventana según la hora del ensayo o la grabación**, para que esté bloqueado o habilitado justo cuando se necesita.
