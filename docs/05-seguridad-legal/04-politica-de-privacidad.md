# Política de privacidad de Pasitos

> **Estado:** 📝 versión para el piloto, **antes de constituir la empresa** · ✅ aprobada · 🔍 conviene una revisión legal antes de los eventos con público abierto y al constituirse · **Última revisión:** 2026-11-19
> ✅ **Aprobada el 19/11/2026.** Puesta al día con lo que la app hace desde la fase 3: el **carnet**, las **fotos de los retos**, el **autorregistro**, los **grupos** y el formulario de contacto. El responsable es el equipo del proyecto (ver los [Términos §13](03-terminos-y-condiciones.md#13-si-pasitos-se-constituye-como-empresa)). Las notas para el equipo están en el [anexo](#anexo-notas-para-el-equipo-no-se-publica), que no se publica.
> **Lo que va entre llaves** (`{correoPrivacidad}`, `{sitio}`, `{vigenteDesde}`) se completa solo con [`libs/dominio/src/legal/config.ts`](../../libs/dominio/src/legal/config.ts). Después de cambiar este texto: `pnpm legal`.

---

**Versión:** piloto 1.1 · **Vigente desde:** {vigenteDesde}

En Pasitos te explicamos qué datos tuyos usamos, para qué, por cuánto tiempo y qué puedes hacer con ellos. Lo escribimos en palabras simples.

## 1. Quiénes somos

**Pasitos** es una plataforma para eventos en la que los asistentes ganan puntos por participar y los canjean por productos dentro del evento.

Es un **proyecto en etapa piloto**, desarrollado por un equipo de personas en Bolivia, que **todavía no es una empresa constituida**. Mientras dure el piloto, el responsable de tus datos es **el equipo del proyecto Pasitos** ("Pasitos" o "nosotros"). Cuando Pasitos se constituya como empresa, esa empresa asumirá esta política y te lo avisaremos.

Contacto para temas de privacidad: **{correoPrivacidad}**.

**Quién decide sobre tus datos:**
- El **organizador del evento** decide a quién invita, qué datos carga, si pide el carnet, qué retos hay y cómo usa las fotos autorizadas. Pasitos usa esos datos **por cuenta del organizador**, para que el evento funcione.
- Pasitos usa por **cuenta propia** los datos técnicos de tu dispositivo, para la seguridad de la plataforma y para evitar trampas (sección 3).

## 2. Qué datos usamos

### Si participas como asistente

| Dato | De dónde viene | Obligatorio |
|---|---|---|
| Nombre | De la lista del organizador, de lo que le dices al registrador o de lo que escribes al registrarte con el QR del evento | Sí |
| Correo electrónico | De la lista del organizador, del registrador o de lo que escribes | No |
| **Carnet de identidad** | Lo escribes tú, si el evento lo pide, o el registrador desde tu documento | **Solo si el evento lo pide** |
| Código de asistente (por ejemplo `A-0231`) | Lo crea Pasitos para ese evento | Sí |
| Grupo (por ejemplo *VIP*) | Lo asigna el organizador | No |
| Asistencia: cuándo llegaste y quién te registró | El registrador o el QR de registro | Sí |
| Movimientos de puntos: retos completados, canjes, ajustes | Tu uso de la app | Sí |
| **Fotos de los retos** y si autorizaste su uso en redes | Tú, al completar un reto con foto | Solo si haces esos retos |
| **Datos técnicos de tu dispositivo** (sección 3) | Tu navegador, al vincularlo y al usar la app | Sí |

### El carnet de identidad

Algunos eventos piden el carnet para **comprobar que cada persona participa una sola vez** y para entregar ciertos premios.
- **Se guarda cifrado.** La persona del equipo que lo verifica lo ve completo **solo en la pantalla de verificación**, para compararlo con tu documento. En el resto del panel se ve oculto (`•••567`).
- **No sale nunca** en el reporte, en Stellar, en los registros técnicos ni en los correos.
- El mismo carnet **no se puede verificar en dos cuentas** del mismo evento.
- **Se borra 30 días después del cierre** del evento. Después solo queda que tu carnet fue verificado, no el número.

### Las fotos de los retos

- **Las ve el equipo del reto y el organizador,** para darte los puntos.
- Al procesarla, **le quitamos los datos ocultos** (la ubicación GPS, el modelo de la cámara) y guardamos un resumen de la imagen para detectar fotos repetidas entre cuentas.
- **Usarla en redes es aparte:** solo si lo autorizaste. Puedes **retirar la autorización** cuando quieras en *Mi cuenta → Mis fotos*: deja de estar en las descargas para redes. Si ya se había descargado, avisamos al organizador para que no la publique.
- **Se borran del servidor:** las inapropiadas 7 días después del cierre, las que no autorizaste 30 días después y las autorizadas 90 días después. Queda que mandaste una foto, sin la imagen.

### Si formas parte del equipo de un evento o de Pasitos

Nombre, correo, rol, contraseña (guardada cifrada, nunca la vemos), tu segundo factor si lo usas y el registro de las acciones que haces en la plataforma (bitácora).

### Si nos escribes desde el formulario de contacto

Nombre, correo, organización, datos del evento que nos cuentes y tu mensaje. Solo los usamos para responderte, y los borramos a los **12 meses**.

### Lo que no usamos

- Tu ubicación GPS, tus contactos ni nada fuera de Pasitos.
- Datos de pago: en el piloto no hay pagos.
- Cookies de publicidad o de seguimiento entre sitios.

## 3. Datos técnicos de tu dispositivo

Tu entrada en Pasitos queda **vinculada al navegador de tu celular**. Para que nadie use tu entrada ni junte varias, registramos:

- **Al vincular tu celular:**
  - un identificador de dispositivo creado por Pasitos;
  - una llave de seguridad que se crea en tu navegador y no sale de él;
  - el tipo y la versión del navegador y del sistema operativo;
  - la marca y el modelo del celular, cuando el navegador los informa;
  - el tamaño de pantalla, el idioma y la zona horaria;
  - algunas características técnicas del equipo;
  - tu dirección IP y tu proveedor de internet;
  - un resumen (huella) de esos datos.
- **Cada vez que ganas o canjeas puntos:** el identificador de dispositivo, la IP, la hora y el resultado.
- **Intentos fallidos:** por ejemplo, si alguien intenta abrir tu enlace de invitación en otro celular.

**Para qué:** solo para detectar y frenar trampas, y para que tú y el organizador puedan ver si alguien usó tu entrada. **No los usamos para publicidad ni para crear perfiles, y no se los damos a sponsors.** El organizador ve las alertas y el modelo de tu celular, pero no tu IP ni la huella.

**Cuánto tiempo:** se borran automáticamente **30 días después del cierre** del evento.

## 4. Para qué usamos tus datos

| Para qué | Datos |
|---|---|
| Dejarte entrar al evento y a la app | Nombre, correo, código de asistente, dispositivo |
| Registrar tu asistencia, tus puntos y tus canjes | Asistencia y movimientos |
| Comprobar que participas una sola vez, si el evento lo pide | Carnet |
| Darte los puntos de los retos con foto y, si lo autorizaste, usar la foto en redes | Fotos |
| Avisarte: invitación, confirmación de que te registraste, recordatorio la víspera | Correo, si lo diste |
| Evitar trampas y proteger tu entrada | Datos técnicos del dispositivo, fotos repetidas, carnet repetido |
| Darle al organizador y a los sponsors el **reporte del evento** | Solo totales, por ejemplo *"287 asistentes, 140 en la charla de las 10:00"*. Nunca tu nombre, tu correo ni tu carnet |
| Guardar tu **historial de participación**, para que más adelante lo veas en tu cuenta (sección 7) | Nombre, correo, asistencia y movimientos |
| Atender reclamos y resolver problemas | Lo necesario para cada caso |

**Cuándo podemos usarlos:**
- Con **tu consentimiento**, que das al aceptar esta política cuando vinculas tu celular o te registras, y al autorizar el uso de una foto.
- Porque son **necesarios para prestarte el servicio** que pediste al participar del evento.
- Por **seguridad de la plataforma**, en el caso de los datos técnicos.

Tratamos tus datos conforme a la **Constitución Política del Estado** y las normas bolivianas que se aplican a los servicios digitales.

## 5. El registro en Stellar

Para que nadie pueda inflar los números del evento, Pasitos guarda cada pocos minutos una **huella** de los movimientos de puntos en **Stellar**, una red pública que nadie puede modificar. En el piloto se usa su **red de pruebas (testnet)**.

- **En Stellar no hay datos personales:** ni tu nombre, ni tu correo, ni tu carnet, ni tu dispositivo, ni tus fotos. Solo huellas y totales.
- El **archivo público de cada lote** usa un identificador anónimo distinto en cada evento, no tu nombre. En eventos de menos de 30 personas, solo se publican los totales.
- Lo que se registra en Stellar **no se puede borrar**, por la forma en que funciona la red. Por eso nunca registramos ahí nada que te identifique.
- **La relación entre tu nombre y ese identificador anónimo nunca se publica.** Solo la conoce Pasitos.

## 6. Con quién compartimos tus datos

- **El organizador del evento:** tu nombre, correo, código, grupo, asistencia, puntos, canjes, tus fotos, si autorizaste su uso, y las alertas de seguridad de tu entrada. Tu carnet, solo oculto (`•••567`).
- **El equipo del evento**, según su rol. Por ejemplo, el registrador ve tu nombre y tu correo parcialmente oculto (`va•••@gmail.com`); quien verifica carnets ve el tuyo completo solo en esa pantalla; el responsable de un reto ve las fotos de ese reto.
- **Sponsors y financiadores:** solo los totales del reporte, nunca tus datos personales.
- **El público, si el organizador lo publica:** el reporte del evento (solo totales) y, si autorizaste su uso, tu foto en las redes del organizador o de Pasitos.
- **Proveedores que nos ayudan a operar.** Solo usan los datos para darnos su servicio. **Algunos están fuera de Bolivia:**
  - **Servidores:** Hetzner, en **Alemania**. Ahí se guardan la base de datos y las fotos.
  - **Red de distribución y protección del sitio:** Cloudflare. Todo el tráfico pasa por sus servidores, que ven tu dirección IP para entregar el contenido y frenar ataques.
  - **Copias de seguridad:** Google Drive. Las copias se cifran antes de subirse: Google no puede leer su contenido.
  - **Envío de correos:** Resend, cuando lo activemos para los correos de Pasitos.
  - **Monitoreo de errores:** Sentry, cuando se active. Recibe los errores técnicos de la app, sin tu nombre, tu correo, tu carnet ni tu dirección IP.
  - **Mapas:** Google Maps. La app muestra una imagen del mapa que genera Pasitos, así que Google no recibe tus datos. Solo si tocas *Cómo llegar* se abre Google Maps, con sus propias condiciones.
- **Autoridades,** solo si una ley u orden judicial lo exige.

**No vendemos tus datos.**

## 7. Cuánto tiempo los guardamos

| Datos | Cuánto tiempo |
|---|---|
| **Datos técnicos del dispositivo** (sección 3) | Se borran **30 días después del cierre** del evento |
| **Número del carnet** | Se borra **30 días después del cierre**. Queda solo que fue verificado |
| **Fotos de los retos** | Inapropiadas: **7 días** después del cierre. Sin autorización de uso: **30 días**. Con autorización: **90 días** |
| Mensajes del formulario de contacto | **12 meses** |
| Nombre, correo, código, grupo, asistencia y movimientos | **Se conservan** como tu historial de participación y para los reportes del evento |
| Bitácora del equipo | **Se conserva** |
| Reporte del evento (solo totales) | Mientras el organizador lo mantenga publicado |
| Huellas en Stellar | Para siempre. No contienen datos personales |
| Cuentas del equipo | Mientras estén activas. Si pides darla de baja, la cerramos; en la bitácora queda tu nombre junto a lo que hiciste |

**Tu historial y tu futura cuenta:** si diste tu correo, cuando Pasitos tenga cuentas personales podrás crear la tuya con ese correo, verificarlo y ver los eventos en los que participaste. Un historial solo se asocia a una cuenta **después de verificar que el correo es tuyo**.

## 8. Tus derechos

Puedes pedirnos:
- **Saber** qué datos tuyos tenemos.
- **Corregirlos** si están mal, por ejemplo tu nombre, tu correo o tu carnet. El nombre, el correo y el carnet (si todavía no se verificó) los puedes corregir tú en *Mi cuenta → Mis datos*.
- **Borrar** tus fotos, tu carnet y los datos técnicos de tu dispositivo antes de los plazos, una vez cerrado el evento.
- **Retirar la autorización** de uso de una foto, en *Mi cuenta → Mis fotos*.
- **Oponerte** a que usemos tus datos para algo en particular.

Escríbenos a **{correoPrivacidad}**. Te responderemos en un plazo de **15 días hábiles**. Si la consulta es sobre un evento, podemos pedirle ayuda al organizador.

En la app, en *Mi cuenta → Mi dispositivo*, ves qué celular tiene tu entrada, el historial de cambios y si alguien intentó usarla desde otro dispositivo.

## 9. Cómo cuidamos tus datos

- Conexiones cifradas (HTTPS); contraseñas del equipo y carnets guardados cifrados.
- Tu celular firma cada movimiento con una llave que no sale de tu navegador.
- Cada persona del equipo ve solo lo que su rol necesita, y sus acciones quedan registradas.
- Las descargas de listas de invitados y de fotos quedan registradas.

Ningún sistema es perfecto. Si ocurre un incidente que afecte tus datos, te avisaremos a ti, o al organizador, lo antes posible.

## 10. Cookies y almacenamiento del navegador

Pasitos guarda en tu navegador **solo lo necesario para funcionar**: la sesión, el identificador de dispositivo, la llave de seguridad, las fotos que todavía no se enviaron y una copia de la información del evento para que la app cargue rápido. **No usamos cookies de publicidad ni de analítica de terceros.**

Si borras los datos del navegador, pierdes el acceso, pero no tus puntos: pide un acceso nuevo en la puerta.

## 11. Datos que no pedimos

Como asistente, solo te pedimos tu **nombre** y, si quieres, tu **correo**. **El carnet, solo si el evento lo pide**, y las fotos, solo en los retos que las piden. **No pedimos tu edad, tu teléfono, tu dirección ni datos de pago.**

**Menores de edad:** el piloto no pide la edad. Si un menor participa, lo hace con el permiso de sus padres o tutores, y las fotos donde aparezcan menores solo se mandan con ese permiso.

## 12. Cambios a esta política

Si cambiamos esta política, publicaremos la nueva versión con su fecha, y las anteriores siguen disponibles. Si el cambio es importante, te lo avisaremos en la app o por correo antes de que se aplique.

## 13. Contacto

**Equipo del proyecto Pasitos** · {correoPrivacidad} · Sitio: {sitio}.

---

## Anexo: notas para el equipo (no se publica)

- **Sin empresa constituida:** el responsable es el equipo del proyecto. En la práctica, si hubiera un reclamo, responden las personas del equipo. Por eso esta versión:
  - pide solo los datos necesarios y borra pronto los sensibles (carnet, fotos, datos técnicos);
  - no cobra nada (piloto gratuito) y no promete lo que no se puede cumplir;
  - dice que la empresa, cuando exista, asume todo (Términos §13).
- **Antes de publicar:** crear los correos `hola@` y `privacidad@` del dominio. Con **Cloudflare Email Routing** (gratis, en la misma cuenta del dominio) se reenvían a un correo del equipo sin tener un servidor de correo.
- **Cambios en el código que pide esta versión** (fase 4):
  - **borrar el número del carnet** (`ci_cifrado`, `ci_ultimos` y `ci_hash_verificado`) 30 días después del cierre, conservando `ci_verificado_at` (HU-409, ajuste 11);
  - borrar las fotos, el carnet y los datos técnicos **a pedido**, antes de los plazos: una acción de soporte desde la consola, con bitácora.
- **Pendiente de revisión legal** 🔍:
  - el marco boliviano aplicable a datos personales en servicios digitales (Constitución, art. 21 y art. 130 —acción de protección de privacidad—; Ley 164 de Telecomunicaciones y TIC y su reglamento, D. S. 1793);
  - los datos que salen del país (servidores en Alemania, Cloudflare, Google Drive);
  - si conservar el nombre y el correo sin plazo, para el historial y los reportes, requiere ofrecer un derecho de borrado también para esos datos;
  - si el acuerdo con el organizador necesita una cláusula de encargo de tratamiento.

  Ver [Legal y cumplimiento](02-legal-y-cumplimiento.md).
- **La sección 3 sale de** Acceso del asistente §6 *(interno)*. Si cambia lo que se registra, hay que actualizar esta política.
- **El borrado a los 30 días** tiene que ser un proceso automático, verificado en las pruebas (V21).
- **Asociar el historial a una cuenta futura** exige verificar el correo, porque el correo que se anota en la puerta no está verificado.
