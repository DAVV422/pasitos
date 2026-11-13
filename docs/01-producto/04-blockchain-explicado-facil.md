# Blockchain explicado fácil

> **Estado:** vigente · **Última revisión:** 2026-11-06
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
- **Es muy barata:** sellar un evento completo cuesta unos centavos.
- **Tiene contratos inteligentes** que hacen cumplir reglas, como "este reto no puede entregar más de 300 premios".
- **Tiene dólares digitales (USDC)** listos para usar, para la futura variante Feria.

### Cómo la usa Pasitos: el libro sellado

Pasitos **no escribe cada punto en la blockchain**. Lleva su propio **libro de movimientos** y, cada 5 minutos, le pide a Stellar que **selle una huella** de las páginas nuevas, como un notario que pone su sello. Una página sellada no se puede arrancar ni corregir sin que se note.

Así, el asistente recibe sus puntos al instante, el costo no crece con la cantidad de gente y el sponsor igual puede comprobarlo todo. Versión técnica: [Libro y anclaje](../04-tecnico/07-libro-y-anclaje.md).

## 3. Conceptos que vas a escuchar

| Palabra | Qué significa, en simple | Ejemplo en Pasitos |
|---|---|---|
| **Wallet (billetera)** | Una cuenta en la blockchain donde se guardan saldos | En la v1 los asistentes no necesitan una |
| **Transacción** | Cada registro que se escribe en el cuaderno | "Sello del lote 37 del Foro Tech" |
| **Huella (hash)** | Un número corto que resume un documento. Si el documento cambia una coma, la huella cambia | Lo que Pasitos sella en Stellar cada 5 minutos |
| **Token / activo** | Una ficha digital | Nuestros puntos **no** son un token: viven en el libro del evento |
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
- El contrato **rechaza** cualquier sello que entregue más premios que el tope de un reto.
- Cada participación lleva la firma de una pantalla del evento, registrada en Stellar antes de empezar.

## 5. Qué va en la blockchain y qué no

**Regla:** en la blockchain va **solo lo que alguien necesita poder comprobar**. Todo lo demás se guarda en nuestro servidor.

| ✅ En la blockchain (público y permanente) | ❌ En nuestro servidor (privado) |
|---|---|
| La huella de cada lote de movimientos | Nombres, correos, teléfonos |
| El tope de cada reto | Los movimientos en sí (en archivos públicos, con IDs anónimos) |
| Las llaves públicas de las pantallas | Fotos, catálogo, textos |
| El cierre del evento y sus totales | Precios y facturación |
| *(Feria, más adelante)* Saldo en dólares y reembolsos | La bitácora del equipo |

> **Nunca se guardan datos personales en la blockchain**, porque es pública y no se puede borrar.

Versión técnica: [Datos on-chain](../04-tecnico/03-datos-on-chain.md).

## 6. El "circuito cerrado"

Los puntos **solo existen dentro del libro del evento**. No son un token, así que no se pueden enviar a ninguna cuenta de afuera ni transferir a otra persona, y vencen al cierre.

## 7. Algo que hay que decir con honestidad

El sello en Stellar prueba que **nadie alteró los números después** y que cada participación viene de una pantalla real del evento. No puede impedir que un organizador invente asistentes, pero lo hace **detectable**, porque el reporte compara las participaciones con los check-ins. Por eso decimos "verificable", no "imposible de falsear".
