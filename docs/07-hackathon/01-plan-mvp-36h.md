# Plan MVP 36 horas

> **Estado:** 📦 histórico (hackathon de octubre de 2026). Se conserva tal como se planificó, con el nombre actualizado.

**Horizonte:** día 1 completo + medio día 2. Las horas son relativas al arranque (H0). Ajustar al horario real del hackathon.

## 1. Roles

| Persona | Rol | Entregables |
|---|---|---|
| **Persona 1** | Contratos y setup on-chain | Contrato `challenges`, tests, script de setup en testnet, `deploy/testnet.json` |
| **Persona 2** | Backend e integración | API, QR rotativo, wallets demo, indexador de eventos, conexión con el frontend |
| **Persona 3** | Frontend, producto y pitch | Vistas asistente/stand/comercio/panel, entrevistas, deck y guion de demo |

## 2. Cronograma

### Día 1

| Hora | Persona 1 | Persona 2 | Persona 3 |
|---|---|---|---|
| **H0–H1** | **Todos juntos:** leer la documentación de producto; congelar alcance; acordar la interfaz del contrato ([contrato](../04-tecnico/02-contrato-challenges.md)) y los endpoints | | |
| H1–H3 | **Spike del SAC:** emisor con flags, desplegar SAC, `set_admin` a un contrato de prueba, `mint` desde el contrato. Decide opción A o B | Scaffold Stellar, estructura del backend, `@stellar/stellar-sdk`, cuentas de testnet | **Entrevistas:** llamadas a organizadores y sponsors, enviar formulario a asistentes ([guía de entrevistas](../03-validacion/01-guia-de-entrevistas.md)) |
| H3–H8 | `challenges`: storage, `init`, `register_attendee`, `add_merchant`, `create_challenge`, `claim` + tests C1–C8 | QR rotativo con HMAC, `POST /attendees`, `POST /claims` contra un mock del contrato | Vista asistente (saldo, escanear, retos) y vista stand (QR rotativo) con datos falsos |
| H8–H9 | **Checkpoint 1 (todos, 30 min):** ¿`claim` funciona en testnet de punta a punta? Si no, Persona 2 ayuda a Persona 1 | | |
| H9–H13 | `redeem`, `pay`, `refund`, `close_event`, `expire`, `pause` + tests C9–C17 | Wallets demo (crear cuenta, trustlines, fee bump), `/redeem`, `/pay`, `/refund`, `/balances` | Vista comercio (QR de cobro) y catálogo de canje |
| H13–H15 | Script de setup reproducible + `deploy/testnet.json` + medir el costo de cada operación con `simulateTransaction` ([costos de red](../04-tecnico/04-costos-de-red.md#3-costos-medidos-en-testnet)) | Indexador `getEvents` → base de datos | Panel organizador/sponsor (visitas por reto, asistentes por hora) |
| **H15** | **Checkpoint 2 (todos):** flujo completo en testnet: registrar → claim → redeem → pay → refund. Lista de bugs priorizada | | |
| H15–H18 | Corregir bugs del contrato | Integración real frontend ↔ backend ↔ contrato | Conectar vistas a la API real; mensajes de error |
| H18–H24 | **Descanso.** Mínimo 5 horas de sueño por persona, escalonado si hace falta | | |

### Día 2

| Hora | Persona 1 | Persona 2 | Persona 3 |
|---|---|---|---|
| H24–H27 | Correr el setup desde cero en testnet limpia (I1). Datos de demo: 3 retos con tarifas distintas, 2 comercios, 3 asistentes, sponsors ficticios | Pulir el panel en vivo; tarifas por reto; logs; errores del indexador | Deck de 7 slides ([pitch](02-pitch-y-demo.md), parte A) con las citas de las entrevistas; pulir las 3 pantallas que salen en el pitch |
| **H27** | **CONGELAMIENTO DE CÓDIGO.** Después de esta hora solo se corrigen bugs que rompan el video de demo | | |
| H27–H30 | **Grabar el video de demo** ([pitch](02-pitch-y-demo.md), parte B) con Persona 2. Escena del circuito cerrado varias veces | Grabación del video + verificar que corre en los tres celulares (I6) | Capturas finales para el pitch; ensayos del pitch cronometrados (mínimo 3, menos de 2:55) |
| H30–H33 | Repositorio: README de cómo correr, direcciones de contratos, enlaces a Stellar Expert | Edición del video (recortar esperas, rótulos), despliegue del frontend y backend | Ajustes del deck y del guion tras los ensayos |
| H33–H36 | **Todos:** ensayo final del pitch, revisar el video exportado y su enlace, entregar | | |

## 3. Prioridades si falta tiempo (qué se recorta primero)

Recortar de abajo hacia arriba:

1. **Imprescindible:** `claim` con límites + QR rotativo + vista asistente + vista stand.
2. **Imprescindible:** `redeem` + transferencia externa rechazada (circuito cerrado).
3. **Muy importante:** panel del sponsor con visitas verificadas.
4. **Importante:** `pay` con USDC + cashback y `refund`.
5. **Deseable:** `close_event` + `expire` en vivo.
6. **Extra:** passkeys con `smart-account-kit`, retiro SEP-24 con el test anchor, integración con Stellar Passport.

## 4. Definición de "listo"

El MVP está listo para grabar el video de demo cuando una persona que no es del equipo puede, con su propio celular:

- [ ] Registrarse con un código de entrada de demo.
- [ ] Escanear el QR de un stand y ver sus puntos subir.
- [ ] Ver que un segundo escaneo del mismo reto es rechazado.
- [ ] Canjear puntos por un producto en un comercio.
- [ ] Ver que enviar puntos a una wallet externa falla.
- [ ] Pagar con saldo USD y ver el cashback.
- [ ] Pedir el reembolso del saldo restante.

Y el sponsor ve en el panel, en menos de 10 segundos, sus leads por reto con el costo calculado según la tarifa de cada uno.

## 5. Reglas del equipo

- Las interfaces acordadas en H0–H1 no cambian sin avisar a los tres.
- Todo en la rama `main` pasa el build. Trabajar en ramas cortas y fusionar seguido.
- Si alguien lleva más de 45 minutos bloqueado, pide ayuda.
- El pitch (3 min, la app solo de forma superficial) y el video de demo son entregables separados. El código tiene que alcanzar para **grabar** el video, no para una demo en vivo en el escenario.
- Las decisiones de producto están en [decisiones.md](../decisiones.md). No se reabren sin acuerdo de los tres.
