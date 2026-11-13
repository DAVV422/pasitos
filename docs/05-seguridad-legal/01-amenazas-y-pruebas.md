# Amenazas y pruebas

> **Estado:** vigente para la v1 · **Última revisión:** 2026-11-06

## 1. Modelo de amenazas (v1)

Con el libro anclado (D22), los puntos viven en el servidor y Stellar guarda las huellas. Las mitigaciones están pensadas para ese modelo.

| # | Amenaza | Impacto | Mitigación | ¿En la v1? |
|---|---|---|---|---|
| T1 | Cuentas falsas que acumulan puntos | Participaciones falsas en el reporte | Una cuenta por correo verificado; los retos requieren check-in en la puerta (D30); el reporte compara participaciones con check-ins | ✅ |
| T2 | Foto del QR compartida por WhatsApp | Participaciones sin asistencia real | QR firmado por la pantalla que cambia cada 30 s; modos de un solo uso y bajo demanda; *Generar otro* y *Pausar* sin margen de gracia (D28); los escaneos rechazados quedan en el historial | ✅ |
| T3 | Completar el mismo reto varias veces | Inflación de puntos | El servidor valida las veces por persona en la misma transacción de la base que registra el movimiento; el lote público permite comprobarlo | ✅ |
| T4 | Reto que entrega más premios de los previstos | Merch agotado, costo sin techo | Tope por reto en el servidor y **en el contrato**, que rechaza el lote que lo supera | ✅ |
| T5 | Puntos que salen del evento | Se rompe el circuito cerrado | Los puntos no son un token: solo existen en el libro del evento y vencen al cierre | ✅ por diseño |
| T6 | Robo de la llave del operador que ancla | Lotes falsos | La llave vive cifrada en el servidor (KMS más adelante) y su cuenta tiene poco XLM; el contrato solo acepta lotes encadenados y dentro de los topes; se puede pausar y cambiar la llave | ✅ |
| T7 | Llaves de asistentes custodiadas por el servidor | Robo de saldos | Ya no aplica: no hay wallets de asistentes en la v1. La llave del celular solo firma reclamos y no se puede exportar | ✅ por diseño |
| T8 | Bug en el contrato | Huellas mal registradas o lotes bloqueados | Tests, pausa, auditoría antes de mainnet. Un bug no afecta los saldos, que viven en el servidor | ⏳ con el contrato |
| T9 | *(Feria)* Organizador que no devuelve el saldo en dólares | Pérdida de confianza | Fuera de la v1. Ver [Contrato `challenges`](../04-tecnico/02-contrato-challenges.md) como referencia | — |
| T10 | Mesa que cobra y no entrega | Reclamo del asistente | Comprobante igual en las dos pantallas; historial de la mesa; anulación por un coorganizador | ✅ |
| T11 | Datos personales expuestos | Riesgo legal | Nada personal on-chain ni en los lotes públicos; IDs anónimos con sal por evento; descargas de datos registradas en la bitácora | ✅ |
| T12 | Transferencia o reventa de puntos entre asistentes | Puntos que cambian de manos | No existe ninguna ruta para transferir (D3), y los puntos no son un token que se pueda mover por fuera | ✅ por diseño |
| T13 | Reto automático manipulado | Participaciones infladas | Los retos on-chain quedan fuera de la v1. La encuesta suma una sola vez por persona | ✅ |
| T14 | Alguien externo se conecta como mesa o pantalla | Cobros falsos, QR falsos | QR o enlace de un solo uso con vencimiento; el organizador ve y desconecta cada dispositivo (D18) | ✅ |
| T15 | Check-in manual de personas que no vinieron | Asistentes falsos | Cada check-in manual registra quién lo hizo; el reporte los cuenta aparte; alerta si alguien marca a muchas personas seguidas (D20) | ✅ |
| T16 | Alterar el libro después del evento (nosotros o un atacante con acceso a la base) | Reporte falso | Las huellas en Stellar no coinciden y la verificación pública lo muestra ([Libro y anclaje §6](../04-tecnico/07-libro-y-anclaje.md#6-qué-pasa-si-alguien-intenta-hacer-trampa)) | ✅ |
| T17 | Un colaborador se da puntos o los da a sus amigos | Inflación y merch mal repartido | No se permiten ajustes a la propia cuenta; tope por ajuste; motivo obligatorio; ajustes contados aparte en el reporte; bitácora | ✅ |
| T18 | Alguien toca los controles de una pantalla de cara al público | QR pausado o regenerado por un extraño | Controles detrás de un PIN o desde el celular del operador (flujos §6.3) | ✅ |
| T19 | Acceso a la cuenta de otra persona | Canjes con puntos ajenos | Contraseña con Argon2id y rechazo de contraseñas filtradas; espera creciente y bloqueo temporal por intentos, también por IP; aviso por correo; sesiones visibles y revocables; segundo factor obligatorio en la consola de plataforma (D26) | ✅ |
| T20 | Captura de pantalla vieja de "canje hecho" para llevarse otro producto | Merch perdido | La mesa entrega solo si ve el comprobante en su propia pantalla | ✅ |
| T21 | Robo de cuenta con el enlace de *Olvidé mi contraseña* | Cuenta tomada | Enlace de un solo uso que vence en 30 min; al usarlo se cierran las demás sesiones y se avisa por correo; la respuesta no revela si el correo existe | ✅ |
| T22 | *(Piloto, D33)* Una persona junta varias entradas, o un registrador vincula entradas ajenas a su celular | Puntos y canjes falsos | Un dispositivo por invitado y una identidad por navegador; registro del dispositivo y alertas A1 a A8; historial visible para el asistente con *No fui yo* (Acceso del asistente *(interno)*) | ✅ |
| T23 | Subir un archivo malicioso (virus, imagen que es otra cosa, SVG con scripts, bomba de descompresión) | Infectar equipos o atacar el servidor | Lista cerrada de formatos sin SVG; tipo real por bytes; decodificación completa con límites; reencodeo a WebP (nunca se sirve el original); cuarentena que no se sirve. Sin antivirus en el piloto (D54) ([Subida de archivos](../04-tecnico/10-subida-de-archivos.md)) | ✅ |
| T24 | Una organización ve o modifica datos de otra por un error en el código | Filtración de datos personales | RLS en PostgreSQL además del filtro en el código; sin organización definida no se devuelve nada (D47) | ✅ |

## 2. Pruebas obligatorias

### 2.1 Pruebas de la v1

| # | Caso | Resultado esperado |
|---|---|---|
| V1 | El mismo reclamo enviado dos veces (mismo ID de envío) | Se registra una sola vez |
| V2 | Dos reclamos del mismo reto al mismo tiempo, desde dos celulares de la misma cuenta | Solo uno suma |
| V3 | Reclamo con un QR vencido, pausado, invalidado o de un solo uso ya usado | Rechazado con el motivo correcto, y queda en el historial de QR |
| V4 | Reclamo sin check-in, con *Los retos requieren check-in* activado | Rechazado |
| V5 | Reto que llega a su tope | El siguiente reclamo se rechaza; el lote no pasa el tope |
| V6 | Dos personas pagan el mismo QR de cobro | Solo la primera; la segunda ve *"Este cobro ya fue pagado"* |
| V7 | Último producto en stock con dos cobros abiertos | El stock se reserva al generar el cobro; el segundo cobro no se puede generar |
| V8 | Ajuste manual a la propia cuenta | Bloqueado |
| V9 | Cada ruta con cada rol (matriz de permisos) | Solo lo permitido en [Flujos §2.4](../01-producto/07-flujos-v1.md#24-roles-y-permisos-d19) |
| V10 | Se modifica un movimiento en la base después de anclarlo | La verificación pública marca el lote como alterado |
| V11 | El anclaje falla (Stellar caído) | Los lotes esperan y se anclan en orden al volver |
| V12 | Enlace o QR de dispositivo usado dos veces | El segundo intento falla |
| V13 | Código de verificación del correo con 6 intentos | El sexto se rechaza y hay que pedir otro |
| V14 | 10 contraseñas incorrectas seguidas en una cuenta | La cuenta se bloquea 15 min y llega un aviso por correo |
| V15 | Enlace de restablecer usado dos veces o después de 30 min | Rechazado |
| V16 | Crear una cuenta con una contraseña filtrada o común | Rechazada con un mensaje claro |
| V17 | *(Piloto)* Enlace de invitación abierto en un segundo dispositivo | No vincula; el intento queda registrado y visible para el invitado |
| V18 | *(Piloto)* Revincular a un invitado | El dispositivo anterior queda anulado al instante y sus reclamos se rechazan |
| V19 | *(Piloto)* Un navegador ya vinculado escanea el QR de asistente de otro invitado | Rechazado; alerta A2 |
| V20 | *(Piloto)* Abrir el enlace dentro del navegador de Gmail o WhatsApp | No vincula y pide abrirlo en Chrome o Safari |
| V21 | *(Piloto)* 30 días después del cierre | Los datos técnicos del dispositivo ya no existen; el nombre, el correo, la asistencia y los movimientos siguen |
| V22 | *(Piloto)* Registro en la puerta con correo | Llega el aviso *Te registraste* con el código de asistente; si rebota, se marca en la lista |
| V23 | Subir un `.png` que es un ejecutable, una imagen truncada, una bomba de descompresión, un SVG y una imagen con un programa pegado al final | Los cuatro primeros, rechazados con su código; el último se acepta, pero la imagen servida es nueva y no contiene el programa. Nada queda en la carpeta pública |
| V24 | Con la organización A definida, leer o escribir cualquier tabla con datos de la organización B | Cero filas; la escritura falla |

### 2.2 Tests del contrato `challenges` (MVP del hackathon, histórico)

> Referencia del MVP. Los tests del contrato nuevo se definen junto con su diseño.

| # | Caso | Resultado esperado |
|---|---|---|
| C1 | `init` dos veces | `AlreadyInitialized` |
| C2 | `claim` válido | Saldo +reward, `claimed_total` +1, evento `claimed` |
| C3 | `claim` repetido con `max_per_user = 1` | `UserLimitReached`; el saldo no cambia |
| C4 | `claim` cuando `claimed_total == max_total` | `BudgetExhausted` |
| C5 | `claim` fuera de `start..end` | `OutOfWindow` |
| C6 | `claim` en un reto inactivo | `ChallengeInactive` |
| C7 | `claim` firmado por alguien que no es el verifier | Falla de autorización |
| C8 | `claim` para una wallet no registrada | `NotAttendee` |
| C9 | `redeem` a un comercio no registrado | `NotMerchant` |
| C10 | `redeem` con `amount <= 0` | `InvalidAmount` |
| C11 | `transfer` directo de puntos a una wallet externa no autorizada | Falla en el SAC |
| C12 | `pay` válido | USDC al comercio + cashback correcto (redondeo hacia abajo) |
| C13 | Cualquier función que mueve valor con `Closed = true` | `EventClosed` |
| C14 | `refund` con `Closed = true` y con `Paused = true` | **Funciona** |
| C15 | `expire` | Saldos de puntos en 0 vía clawback |
| C16 | `pause` y luego `claim` | `Paused` |
| C17 | Acciones de admin firmadas por otra cuenta | Falla de autorización |

### 2.3 Validaciones antes del piloto

| # | Validación | Cómo |
|---|---|---|
| I1 | El flujo completo corre sin intervención manual: crear evento, invitar, check-in, retos, canjes, cierre, reporte | Ensayo cronometrado |
| I2 | Un QR vencido es rechazado | Esperar 36 s (30 + 5 de gracia) y escanear |
| I3 | El panel y la pantalla se actualizan en menos de 2 s después de un reclamo | Observarlo en el ensayo |
| I4 | Los mensajes de error se entienden | Cada rechazo tiene su texto en la app |
| I5 | Funciona en Android e iOS, también abriendo el enlace desde WhatsApp | Prueba manual en varios celulares |
| I6 | No existe ninguna ruta que transfiera puntos entre asistentes | Revisar las rutas de la API |
| I7 | Los números del reporte coinciden con los lotes y las huellas en Stellar | Correr la verificación pública |
| I8 | Se cumple el presupuesto de rendimiento | [Rendimiento §4](../04-tecnico/08-rendimiento.md#4-cómo-se-mide) |
| I9 | Los correos llegan a Gmail y Outlook sin caer en spam | Enviar a cuentas de prueba |
