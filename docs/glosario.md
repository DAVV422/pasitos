# Glosario

> **Estado:** vigente · **Última revisión:** 2026-11-06

## Producto y negocio

| Término | Significado |
|---|---|
| **Anclaje / sello** | Registrar en Stellar la huella de un lote de movimientos. Se hace cada 5 minutos |
| **Asistente** | Persona que va al evento y usa la app |
| **Bitácora** | Registro de las acciones del equipo (quién cambió qué y cuándo). Solo se agregan líneas |
| **Canje** | Cambiar puntos por un producto dentro del evento |
| **Check-in** | Registrar que la persona llegó al evento |
| **Circuito cerrado** | Los puntos solo existen dentro del evento: no se transfieren ni salen de él |
| **Código de asistente** | Código corto de una persona en un evento (ej. `A-0231`). No es el ID de su cuenta y cambia en cada evento (D25, D31) |
| **QR de asistente** | QR de un solo uso, que vence en 2 min, que genera el registrador en la puerta para vincular el celular de un invitado (D33) |
| **Coorganizador** | Rol que configura el evento junto al dueño (ver [Flujos §2.4](01-producto/07-flujos-v1.md#24-roles-y-permisos-d19)) |
| **Dispositivo conectado** | Tablet o celular de una sala o mesa, conectado con un QR o un enlace de un solo uso |
| **Evento demo** | Evento con datos inventados de la organización demo, para mostrar Pasitos. No sale en *Eventos* ni en las métricas (D52) |
| **Estadísticas avanzadas** | Paquete pago con análisis por hora, embudos, reportes con marca, etc. |
| **Financiador** | Quien pone dinero o recursos en un evento: sponsor, fundación, ecosistema, universidad |
| **Libro de movimientos** | Registro de todos los puntos del evento (ganados, canjeados, ajustados, vencidos). Solo se agregan líneas |
| **Lote** | Los movimientos de 5 minutos, que se sellan juntos |
| **Mesa de canje** | Punto del evento donde se cambian puntos por productos |
| **MVP** | Producto mínimo viable: la primera versión que funciona |
| **Plan Comunidad / Programa / Feria** | Los tres planes de Pasitos (ver modelo de ingresos *(interno)*) |
| **Puntos (PTS)** | Fichas del evento: se ganan con retos, se canjean dentro del evento y vencen al cierre |
| **Puntos de bienvenida** | Puntos que el evento puede dar al hacer el check-in en la puerta. Por defecto, 0 (D46) |
| **QR rotativo** | Código que cambia cada 30 segundos para evitar fotos compartidas. Hay otros modos: de un solo uso, bajo demanda y usos limitados |
| **Reporte verificable** | Informe cuyos números cualquiera puede comprobar en la blockchain |
| **Reto** | Acción que da puntos: ir a una charla, quedarse al cierre, etc. |
| **Registrador** | Rol del equipo para el personal de la puerta: hace el check-in, registra a quien llega sin inscribirse, genera los QR de asistente y atiende los avisos *No fui yo* (D19, D33) |
| **Saldo en dólares** | USDC que el asistente carga y que se reembolsa. Solo en la variante Feria |
| **SCF (Stellar Community Fund)** | Fondo de Stellar que financia proyectos construidos sobre su red |

## Blockchain y Stellar

| Término | Significado |
|---|---|
| **Anchor / SEP-24** | Entidad y estándar para cargar y retirar dinero en moneda local hacia y desde Stellar |
| **Blockchain** | Registro público que nadie puede borrar ni modificar |
| **Clawback** | Recuperar un activo de una cuenta. Se usaba en el MVP para vencer los puntos; con D22 ya no hace falta |
| **Comisión de red** | Costo mínimo por registrar algo en Stellar (lo pagamos nosotros) |
| **Huella (hash) / raíz Merkle** | Número corto que resume un lote: si cambia una coma, cambia la huella. La raíz Merkle permite además probar que un movimiento está en el lote |
| **Fee bump** | Transacción en la que otra cuenta paga la comisión (MVP) |
| **Friendbot** | Servicio que da XLM de prueba en testnet |
| **Passkey** | Inicio de sesión con huella o Face ID, sin contraseña |
| **Relayer** | Servicio que envía transacciones y paga sus comisiones (OpenZeppelin Relayer) |
| **Rent / TTL** | Lo que se paga por mantener un dato en un contrato Soroban y cuánto tiempo vive |
| **Reserva** | XLM mínimo bloqueado por cuenta y por trustline. Con D22 no hay cuentas de asistentes, así que no aplica |
| **SAC (Stellar Asset Contract)** | Contrato que permite usar un activo clásico de Stellar desde Soroban |
| **Smart contract** | Reglas automáticas en código que nadie se puede saltar |
| **Soroban** | La plataforma de contratos inteligentes de Stellar |
| **Stellar** | Blockchain especializada en pagos: rápida y barata |
| **Stellar Expert** | Buscador público para ver cualquier movimiento de Stellar |
| **Testnet / Mainnet** | Red de pruebas (dinero de juguete) / red real |
| **Trustline** | Permiso de una cuenta clásica para tener un activo concreto |
| **USDC** | Dólar digital: 1 USDC = 1 dólar |
| **Vinculación** | Asociar el navegador del celular de un asistente a su inscripción, con el enlace de invitación o el QR de asistente. Un dispositivo por invitado (D33) |
| **Wallet** | Cuenta en la blockchain donde se guardan los saldos. En la v1 los asistentes no necesitan una |
| **XLM** | La moneda propia de la red Stellar, que se usa para pagar las comisiones |
