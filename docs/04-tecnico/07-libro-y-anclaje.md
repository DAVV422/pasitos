# Libro de movimientos y anclaje en Stellar

> **Estado:** ✅ vigente (D22) · el diseño del contrato está ⏳ pendiente · **Última revisión:** 2026-11-06
> Cómo se registran los puntos en la v1 y cómo se prueba que nadie los alteró. Reemplaza el modelo de "una transacción por acción" del MVP del hackathon (D14).
> Relacionados: [Flujos de la v1](../01-producto/07-flujos-v1.md) · [Arquitectura](01-arquitectura.md) · [Datos on-chain](03-datos-on-chain.md) · [Costos de red](04-costos-de-red.md)

## 1. La idea en una frase

> El servidor lleva un **libro de movimientos** donde solo se agregan líneas, y cada 5 minutos (configurable por evento, D53) **sella en Stellar una huella** de las líneas nuevas de todo el evento, en una sola transacción. Una página sellada no se puede arrancar ni corregir sin que se note.

**Por qué así y no una transacción por acción:**
- **Costo fijo:** se pagan unas 12 transacciones por hora de evento, sin importar si hay 50 o 50 000 personas.
- **Velocidad:** el asistente recibe su "+20" en menos de 1 segundo, porque nadie espera a la red.
- **Menos piezas:** no hay cuentas, reservas, trustlines ni llaves custodiadas de los asistentes.
- **No hay token, así que no se puede transferir:** los puntos no existen fuera del libro. Con eso, la regla D3 se cumple por diseño.

**Lo que no cambia:** el sponsor puede comprobar todo por sí mismo, sin confiar en nosotros.

## 2. Las piezas

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **Movimiento** | Una línea del libro | Base de datos, en una tabla donde solo se agregan filas |
| **Firma de la pantalla** | Cada QR lo firma la tablet que lo muestra, con una llave que se crea en la tablet y no se puede copiar | En el QR y, después, en el movimiento |
| **Firma del dispositivo del asistente** | El celular firma cada reclamo con su propia llave | En el movimiento |
| **Lote** | Los movimientos de un período de 5 minutos | Archivo público (`lote-037.json`) |
| **Huella (raíz Merkle)** | 32 bytes que resumen todo el lote. Si cambia una coma, cambia la huella | En Stellar |
| **Contrato del evento** | Guarda las huellas en orden y los topes de cada reto | Stellar · ⏳ a diseñar |

## 3. El movimiento

| Campo | Ejemplo | Nota |
|---|---|---|
| `n` | 1834 | Número correlativo dentro del evento |
| `tipo` | `reto` | `checkin` (con los puntos de bienvenida del evento, 0 por defecto, D46) · `reto` · `canje` · `anulacion` · `ajuste` · `vencimiento` |
| `asistente` | `a7f3…` | **ID anónimo:** un hash de la cuenta con una sal propia del evento. Nunca el nombre ni el correo |
| `puntos` | +20 | Negativo en canjes y vencimientos |
| `ref` | reto 7 · pantalla Sala A | O el producto y la mesa, en un canje |
| `qr` | `{pantalla, reto, franja, firma}` | Solo en los retos con QR |
| `firma_dispositivo` | `3045…` | Firma del celular del asistente |
| `quien` | `Ana Mamani (Coorg.)` | Solo en ajustes y anulaciones. En el lote público va anonimizado como *"equipo #2"* |
| `motivo` | *Falló el QR* | Solo en ajustes y anulaciones |
| `hora` | 2026-11-21T14:02:15Z | Hora del servidor, en UTC |

**El saldo de un asistente** es la suma de sus movimientos. Para no recalcularla en cada consulta, se guarda un saldo actual que se actualiza en la misma transacción de la base de datos que agrega el movimiento.

## 4. Paso a paso

```
ANTES DEL EVENTO
 1. Al publicar el evento, se registran en Stellar los retos con sus topes.
 2. Cada pantalla genera su llave al conectarse. Su llave pública se registra en Stellar
    ANTES de que empiece el evento. Así nadie, ni nosotros, puede inventar después
    firmas de una pantalla.
 3. Cuando el asistente entra a la app, su celular genera su llave. El servidor guarda la pública.

DURANTE EL EVENTO · ejemplo: Valeria escanea en la Sala A a las 10:02:15
 4. La pantalla muestra QR = {Sala A, reto 7, franja 20431, firma de la pantalla}.
 5. El celular arma el reclamo = {QR + cuenta + ID único del envío} y lo firma.
 6. El servidor comprueba:
      firma de la pantalla · QR vigente (no pausado, no invalidado, no usado si es de un uso)
      check-in hecho · no completó el reto antes · al reto le queda presupuesto · evento en curso
 7. Agrega el movimiento #1834 y actualiza el saldo (60 → 80) en una sola transacción de la base.
    Responde "+20" en menos de 1 s.

CADA 5 MINUTOS · sellado automático
 8. Toma los movimientos nuevos (por ejemplo, del #1700 al #2111) y calcula la huella H37.
 9. Envía a Stellar: lote 37 · huella anterior H36 · huella H37 · cuántas participaciones sumó cada reto.
10. El contrato comprueba que sea el lote siguiente, que encadene con H36 y que ningún
    reto pase su tope. Si algo no cuadra, rechaza el lote.
11. Se publica lote-037.json.
12. En el historial de Valeria, el movimiento pasa a "Registrado en Stellar ✓".

AL CIERRE
13. Movimientos de vencimiento de los puntos sin usar, último lote y cierre en Stellar
    con la huella final y los totales.
```

**Si Stellar o nuestra conexión fallan,** los lotes esperan en cola y se envían en orden al volver. La app sigue funcionando. Un retraso en el anclaje se ve en el reporte, con la hora en que se ancló cada lote.

## 5. Cómo se verifica

La página **Verificar este reporte** (y un script abierto que hace lo mismo) sigue estos pasos:
1. Lee del contrato las huellas, los topes y las llaves públicas de las pantallas.
2. Descarga los lotes públicos y **recalcula cada huella**. Tienen que coincidir con las de Stellar.
3. Revisa la **firma de la pantalla** en cada movimiento con QR.
4. Comprueba que **ningún ID anónimo repita un reto** más veces de las permitidas, y que **las sumas den los totales del reporte**.

**Prueba de inclusión:** el celular de cada asistente guarda una prueba corta (unos 10 hashes) de que su movimiento está en un lote sellado. Con ella, la app muestra *"Tu participación está en el reporte ✓"*.

## 6. Qué pasa si alguien intenta hacer trampa

| Intento | Resultado |
|---|---|
| Editar o borrar un movimiento ya sellado | La huella deja de coincidir con la de Stellar: **se detecta** |
| Agregar movimientos a un lote viejo | **No se puede:** el contrato solo acepta el lote siguiente |
| Entregar más premios que el tope de un reto | **El contrato rechaza el lote** |
| Inventar firmas de una pantalla | **Imposible sin la tablet:** su llave pública se registró antes del evento |
| Inventar asistentes que "escanean" QR reales (el servidor ve todos los QR) | **Posible, pero detectable:** más participaciones que check-ins, cuentas sin check-in o firmas de dispositivos que no corresponden a nadie que haya entrado. Por eso lo decimos como **"verificable"**, no "imposible" |
| Un colaborador se da puntos | Bloqueado: no se pueden hacer ajustes a la propia cuenta. Los ajustes salen aparte en el reporte |
| Ajustes manuales en masa | Tope por ajuste, motivo obligatorio y conteo separado en el reporte |

## 7. Privacidad de los lotes públicos

- Los lotes no llevan nombres, correos, códigos de entrada ni direcciones IP.
- El ID anónimo usa una **sal propia de cada evento**. La misma persona tiene un ID distinto en cada evento, así que no se la puede seguir entre eventos.
- En eventos de **menos de 30 personas** se publican solo los totales por reto y las huellas, sin el detalle de cada movimiento. Con tan poca gente, los horarios podrían identificar a alguien.

## 8. Qué tendrá que hacer el contrato

⏳ Su diseño se define después de acordar los flujos. Como mínimo, tendrá que:
- registrar un evento con su operador (la cuenta del servidor que ancla) y su administrador;
- registrar los retos con su tope, y permitir subir el tope pero no bajarlo por debajo de lo entregado;
- registrar las llaves públicas de las pantallas antes de que empiece el evento;
- aceptar **lotes en orden**, encadenados con el anterior y con los conteos por reto, y **rechazar** los que pasen un tope;
- registrar el cierre con la huella final y los totales;
- permitir pausar y cambiar la llave del operador.

Lo que **no** hará: guardar saldos de personas, emitir tokens ni tener cuentas de asistentes.
