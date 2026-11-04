# Blockchain explicado fácil

> **Estado:** vigente · **Última revisión:** 2026-11-03
> Para cualquier persona del equipo. No hace falta saber de blockchain.

## 1. ¿Qué es una blockchain?

Imagina un **cuaderno de registros público** con estas reglas:
- **Cualquiera lo puede leer.**
- **Lo que se escribe no se puede borrar ni modificar**, ni siquiera quien lo escribió.
- **No lo controla una sola persona o empresa**: miles de computadoras guardan una copia y se ponen de acuerdo sobre lo que está escrito.

Eso es una blockchain. Sirve para registrar cosas importantes (pagos, saldos, participaciones) de forma que **nadie tenga que confiar en nadie**, porque todos pueden revisar el mismo cuaderno.

## 2. ¿Qué es Stellar?

**Stellar es una blockchain especializada en pagos.** Pasitos la usa porque:
- **Es rápida:** cada registro se confirma en unos 5 segundos.
- **Es muy barata:** registrar un movimiento cuesta una fracción de centavo.
- **Tiene dólares digitales (USDC)** listos para usar.
- **Permite crear "fichas" con reglas propias**, por ejemplo: "estas fichas solo pueden estar en cuentas autorizadas por el evento".

## 3. Conceptos que vas a escuchar

| Palabra | Qué significa, en simple | Ejemplo en Pasitos |
|---|---|---|
| **Wallet (billetera)** | Una cuenta en la blockchain donde se guardan saldos | Cada asistente tiene una. Pasitos se la crea sola |
| **Transacción** | Cada movimiento que se escribe en el cuaderno | "Valeria ganó 20 puntos" |
| **Token / activo** | Una ficha digital | Nuestros puntos son una ficha propia del evento |
| **Smart contract (contrato inteligente)** | Reglas automáticas escritas en código que nadie se puede saltar | "Cada persona puede ganar este reto una sola vez" |
| **USDC** | Dólar digital. Cada USDC está respaldado por un dólar real | El saldo en dólares (solo en ferias) |
| **Testnet** | La red de pruebas de Stellar. Todo funciona igual, pero el dinero es de juguete | Nuestro MVP funciona aquí |
| **Comisión de red** | El pequeño costo por escribir un movimiento en el cuaderno | Lo pagamos nosotros; el asistente nunca lo ve |
| **Stellar Expert** | Un buscador público de la red: como ver el comprobante de un movimiento | El enlace de verificación del reporte |

Más términos en el [glosario](../glosario.md).

## 4. ¿Por qué blockchain y no una base de datos normal?

Esta pregunta **siempre** aparece. La respuesta:

> Si los datos los guardamos solo nosotros, el sponsor tiene que **confiar** en nosotros y en el organizador. En Stellar, los números quedan en un registro público que **nadie puede alterar**, ni nosotros. El sponsor los **comprueba** por sí mismo.

Además:
- Las reglas de los puntos (vencen, no salen del evento, un reto por persona) las **hace cumplir la red**, no nuestra palabra.
- Cada asistente sale con una wallet real de Stellar: para un ecosistema como Stellar, eso es **gente nueva usando su red**.

## 5. Qué va en la blockchain y qué no

**Regla:** en la blockchain va **solo lo que alguien necesita poder comprobar**. Todo lo demás se guarda en nuestro servidor.

| ✅ En la blockchain (público y permanente) | ❌ En nuestro servidor (privado) |
|---|---|
| Puntos ganados y canjeados | Nombres, emails, teléfonos |
| Reglas de cada reto (recompensa, límite, horario) | Relación entre la entrada y la wallet |
| Cada participación verificada | Fotos, catálogo, textos |
| Saldo en dólares y reembolsos (ferias) | Precios y facturación |
| Cierre del evento y vencimiento de los puntos | El código secreto del QR |

> **Nunca se guardan datos personales en la blockchain**, porque es pública y no se puede borrar.

Versión técnica: [Datos on-chain](../04-tecnico/03-datos-on-chain.md).

## 6. El "circuito cerrado"

Los puntos **solo pueden estar en cuentas autorizadas por el evento**: asistentes y mesas de canje. Si alguien intenta enviarlos a una cuenta de afuera, **la red Stellar rechaza el movimiento**. No lo bloquea nuestra app: lo bloquea la red. Y el intento rechazado queda registrado y se puede ver públicamente.

## 7. Algo que hay que decir con honestidad

En el MVP, nuestro servidor guarda las llaves de las cuentas de los asistentes, y solo en la red de pruebas. En la versión real, cada asistente firmará con su **huella o Face ID (passkey)** y nadie más tendrá sus llaves.
