# Cómo funciona Pasitos

> **Estado:** vigente · **Última revisión:** 2026-11-03

## 1. Los cuatro participantes

| Participante | Qué usa | Qué hace |
|---|---|---|
| **Asistente** | Web en el celular (no se instala nada) | Cumple retos, gana puntos y los canjea |
| **Organizador** | Panel en la computadora | Crea retos, ve la asistencia, cierra el evento y comparte el reporte |
| **Sponsor / financiador** | Reporte web | Ve qué logró su aporte, con pruebas |
| **Mesa de canje o comercio** | Celular o tablet | Cobra en puntos (café, merch, meriendas) |

## 2. El recorrido del asistente

1. **Entra con el link o el QR de su entrada.** Sin registro ni contraseña: Pasitos le crea su cuenta automáticamente.
2. **Ve los retos del evento.** Por ejemplo: "Asiste a la charla de X" (+20 pts), "Quédate a la charla de cierre" (+30 pts), "Haz tu primera transacción en Stellar" (+40 pts).
3. **Escanea un QR** en la sala o en el stand, y en unos segundos recibe sus puntos. Algunos retos se verifican solos, sin QR.
4. **Canjea sus puntos** por café, meriendas o merch en la mesa de canje.
5. **Al cerrar el evento, los puntos vencen.** No sirven fuera del evento ni se convierten en dinero.

## 3. Retos

El mismo contrato sirve para eventos con stands y sin stands. Lo que cambia es cómo se verifica cada reto.

| Reto | Cómo se verifica | Ejemplo |
|---|---|---|
| Asistir a una charla o taller | QR rotativo en la sala | Charla de un sponsor |
| Quedarse hasta el cierre | QR en el último bloque, con ventana horaria | Retención |
| Visitar un stand | QR rotativo en el stand | Feria o foro con expositores |
| **Hacer tu primera transacción en Stellar** | **Automático:** el backend ve la transacción on-chain. No hace falta QR | Hackathon de Stellar |
| Desplegar un contrato en testnet | Automático (on-chain) | Taller de Soroban |
| Entregar el proyecto | Lo confirma el organizador | Hackathon |
| Responder la encuesta de feedback | Formulario dentro de la app | Cualquier evento |

### Mecánicas de retención

| Mecánica | Ejemplo |
|---|---|
| Permanencia | Check-in en el bloque de 17:00–19:00 → 30 pts (más que en la mañana) |
| Llegada temprana | QR en la entrada antes de las 09:30 → 50 pts |
| Racha | Asistir a los dos días → multiplicador ×1,5 |
| Encuestas | Responder la encuesta de una charla → 5–15 pts |

**Un efecto que todo organizador agradece:** con puntos, el merch se gana por participar, no por llegar primero a la mesa.

## 4. Los dos saldos

| | **Puntos** | **Saldo en dólares** |
|---|---|---|
| ¿Qué es? | Fichas del evento (un activo propio en Stellar, ej. `FORO26`) | Dólares digitales (USDC: 1 USDC = 1 dólar) |
| ¿Cómo se consigue? | Gratis, cumpliendo retos | **El asistente lo carga** (QR bancario, tarjeta o efectivo en caja) |
| ¿Dónde se usa? | **Solo dentro del evento** | En los comercios del evento |
| ¿Se convierte en dinero? | **Nunca** | Sí: lo que sobra se devuelve |
| ¿Vence? | Sí, al cierre | Nunca |
| ¿En qué eventos? | En todos | **Solo en la variante Feria.** Desactivado por defecto |

**¿Por qué dos saldos?** Si los puntos ganados gratis se pudieran cambiar por dinero, la gente haría trampa para acumularlos y el organizador terminaría regalando efectivo. Además, legalmente se parecería a emitir dinero. Separarlos protege a todos:
- los puntos generan **participación** con un costo acotado;
- el saldo en dólares es **reembolsable** siempre;
- los puntos que vencen sin usarse no le cuestan nada a nadie.

> En los planes Comunidad y Programa **solo hay puntos**. El saldo en dólares es una función para ferias y eventos con venta (ver [modelo de ingresos](../02-negocio/03-modelo-de-ingresos.md)).

## 5. El reporte para el sponsor

Al terminar, el organizador comparte un link con:
- los asistentes verificados (los que entraron con su entrada);
- las participaciones por reto y por sponsor;
- cuántos se quedaron hasta el cierre;
- los puntos emitidos, canjeados y vencidos;
- **un enlace para comprobarlo todo en la blockchain**. El sponsor no tiene que creernos: lo puede verificar.

Hay un **reporte simple gratis** y unas **estadísticas avanzadas pagas**. La diferencia está en el [Plan Comunidad](../02-negocio/04-plan-comunidad.md).

## 6. Reglas del producto que no cambian

| Regla | Por qué |
|---|---|
| **No hay transferencias de puntos entre asistentes** | Evita el robo, la presión y la reventa de puntos |
| **No hay pagos mixtos** (parte en puntos, parte en dólares) | Cada cobro es en una sola moneda; así es más simple y auditable |
| **Los puntos no salen del evento** | Circuito cerrado impuesto por la red |
| **El saldo en dólares siempre se puede reembolsar** | Incluso con el evento cerrado o el sistema en pausa |
| **Nunca hay datos personales on-chain** | La blockchain es pública y no se puede borrar |

Todas las decisiones y su historial están en [decisiones.md](../decisiones.md).
