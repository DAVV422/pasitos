# Qué se guarda on-chain, qué no, y cuándo

> **Estado:** vigente · **Última revisión:** 2026-11-03

## 1. Principio

> **On-chain va solo lo que alguien necesita poder verificar sin confiar en nosotros:** los puntos, las reglas, las pruebas de cada participación y, en ferias, el dinero. Todo lo demás, off-chain.

| Quién necesita confiar | En qué | Por eso va on-chain |
|---|---|---|
| Sponsor / financiador | Que cada participación reportada es real y que no se pasó del presupuesto | Eventos `claimed`, `max_total` |
| Organizador | Que nadie emitió puntos fuera de las reglas | Contrato con límites; emisión solo vía `claim`/`pay` |
| Mesa de canje | Que el cobro se hizo antes de entregar el producto | Eventos `redeemed` / `paid` |
| Asistente (Feria) | Que su saldo en dólares existe y se le devolverá | Saldos USDC, `refund` |

## 2. Línea de tiempo

| Momento | On-chain (Stellar) | Off-chain (backend) |
|---|---|---|
| **Antes del evento** (setup, una vez) | Crear el asset de puntos con sus flags · desplegar `challenges` · registrar las mesas de canje (`add_merchant`) · crear los retos con recompensa, tope y horario (`create_challenge`) · *(Feria)* fondear la tesorería con USDC | Datos del evento, catálogo con fotos, logos de sponsors, lista de códigos de entrada |
| **Ingreso del asistente** | Crear su cuenta y trustlines (o smart wallet) · `register_attendee` (lo autoriza a tener puntos) | Relación código de entrada ↔ wallet · nombre, email · consentimientos |
| **Carga de saldo (Feria)** | Transferencia de USDC de la tesorería al asistente | Registro del pago en moneda local, comprobante |
| **Reto completado** | `claim`: suma el contador del asistente para ese reto y el `claimed_total`, emite los puntos y el evento `claimed` | Validación del QR rotativo (firma y vencimiento) o de la verificación automática |
| **Canje con puntos** | `redeem`: puntos del asistente a la mesa + evento `redeemed` (con el ID del producto) | Nombre y foto del producto |
| **Pago con dólares (Feria)** | `pay`: USDC al comercio + puntos de cashback + evento `paid` | Comprobante para el comercio |
| **Panel en vivo** | — (solo lectura de eventos vía RPC) | Indexación de eventos, gráficos |
| **Cierre del evento** | `close_event` · `expire` (clawback de los puntos sin usar) | Reporte final para el organizador y los sponsors |
| **Después del evento** | *(Feria)* `refund` de saldos pendientes · quitar trustlines y fusionar cuentas (recuperar reservas) | Reembolso en moneda local · facturación · archivo de los datos personales según la política de privacidad |

## 3. Nunca on-chain

- Nombres, emails, teléfonos, empresas o cualquier dato personal (la blockchain es pública y no se puede borrar).
- El código de la entrada o su vínculo con la wallet.
- Precios, facturación y acuerdos comerciales.
- Fotos, textos largos, catálogos.
- El QR rotativo y su secreto de firma.

## 4. Cuánto tiempo vive cada dato del contrato

| Dato | Storage | Duración | Motivo |
|---|---|---|---|
| Configuración (admin, tokens, estado cerrado) | `instance` | Toda la vida del contrato | Se lee en cada llamada |
| Retos, comercios, asistentes registrados | `persistent` | El evento + el período de reembolsos | Tiene que sobrevivir todo el evento |
| `Claims(asistente, reto)` | `persistent` | Igual | **No usar `temporary`**: si el dato se borrara antes del cierre, el asistente podría volver a reclamar el mismo reto. El vencimiento del TTL no es un mecanismo de seguridad |
| Saldos de puntos y USDC | En el SAC (no en nuestro contrato) | Mientras existan | — |

Cuando un dato `persistent` vence su TTL, se **archiva** (no se pierde) y se puede restaurar pagando el rent de nuevo. Para un evento de 1–2 días, el TTL inicial alcanza de sobra.

## 5. La blockchain como registro auditable

Después del evento, cualquiera con la dirección del contrato puede comprobar, sin pedirnos nada:
- cuántas participaciones tuvo cada reto y que ninguno pasó su tope;
- cuántos puntos se emitieron, canjearon y vencieron;
- *(Feria)* que todos los saldos en dólares se pagaron o reembolsaron.

**Esto es lo que le entregamos al financiador.** No es una planilla que hicimos nosotros, sino un registro que no podemos alterar.
