# Qué se guarda on-chain, qué no, y cuándo

> **Estado:** ✅ vigente para la v1 (D22) · **Última revisión:** 2026-11-06
> Relacionados: [Libro y anclaje](07-libro-y-anclaje.md) · [Arquitectura](01-arquitectura.md)

## 1. Principio

> **On-chain va solo lo que alguien necesita poder verificar sin confiar en nosotros.** En la v1, eso es **la huella de cada lote del libro, los topes de los retos, las llaves públicas de las pantallas y el cierre**. Los puntos y todo lo demás se quedan off-chain.

| Quién necesita confiar | En qué | Qué lo garantiza |
|---|---|---|
| Sponsor / financiador | Que cada participación reportada existe y que no se pasó del presupuesto | Huellas encadenadas en Stellar + el contrato rechaza los lotes que pasan un tope |
| Sponsor / financiador | Que las participaciones vienen de pantallas reales del evento | Llaves públicas de las pantallas registradas antes del evento |
| Organizador | Que nadie alteró los números después | Una huella sellada no se puede cambiar |
| Asistente | Que su participación cuenta | Prueba de inclusión en su historial |

## 2. Línea de tiempo

| Momento | On-chain (Stellar) | Off-chain (servidor) |
|---|---|---|
| **Configuración** | — | Datos del evento, agenda, mapa, sponsors, retos, catálogo, invitados, equipo |
| **Publicación** | Registro del evento y de los retos con sus topes | Lista de chequeo, correos de invitación |
| **Conexión de pantallas** | Llave pública de cada pantalla (antes de que empiece el evento) | Dispositivo, lugar, quién lo conectó |
| **Registro y check-in** | — | Cuenta, inscripción, check-in, consentimientos |
| **Reto completado** | — (va en el lote siguiente) | Movimiento en el libro, saldo |
| **Canje** | — (va en el lote siguiente) | Movimiento, stock, comprobante |
| **Cada 5 minutos** | `anclar`: lote n, huella anterior, huella nueva, conteos por reto | Publicación del archivo del lote |
| **Cierre** | Último lote + cierre con la huella final y los totales | Movimientos de vencimiento, reporte |
| **Después** | — | Reporte público, archivo de datos personales según la política de privacidad |

## 3. Nunca on-chain

- Nombres, correos, teléfonos, empresas o cualquier dato personal. La blockchain es pública y no se puede borrar.
- El código de la entrada, el ID interno de la cuenta o cualquier dato que permita ligar un ID anónimo con una persona.
- La bitácora administrativa.
- Precios, facturación y acuerdos comerciales.
- Fotos, textos largos, catálogos.

Los **lotes públicos** (fuera de Stellar, en nuestro almacenamiento) llevan solo IDs anónimos. Su privacidad está en [Libro y anclaje §7](07-libro-y-anclaje.md#7-privacidad-de-los-lotes-públicos).

## 4. La blockchain como registro auditable

Después del evento, cualquiera con la dirección del contrato y los lotes públicos puede comprobar, sin pedirnos nada:
- que los números del reporte salen de lotes que nadie modificó;
- que ningún reto entregó más premios que su tope;
- que cada participación con QR la firmó una pantalla registrada antes del evento.

**Esto es lo que le entregamos al financiador.** No es una planilla que hicimos nosotros, sino un registro sellado que no podemos alterar.

## 5. Antes, en el MVP del hackathon

El MVP registraba cada acción como una transacción, con un token de puntos (asset clásico + SAC) y una cuenta por asistente. El detalle queda como referencia histórica en [Contrato `challenges`](02-contrato-challenges.md).
