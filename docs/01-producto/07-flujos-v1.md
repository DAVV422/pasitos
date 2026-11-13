# Flujos de la v1

> **Estado:** ✅ acordado (D25–D32 confirmadas el 2026-11-06) · **Última revisión:** 2026-11-06
> Define qué hace la plataforma en su primera versión, quién hace cada cosa y con qué reglas. Se acuerda **antes** de diseñar pantallas y antes de definir el contrato.
> Relacionados: [Decisiones](../decisiones.md) · [Libro de movimientos y anclaje](../04-tecnico/07-libro-y-anclaje.md) · [Rendimiento](../04-tecnico/08-rendimiento.md) · [Arquitectura](../04-tecnico/01-arquitectura.md)

Las decisiones de este documento están resumidas en la [sección 12](#12-decisiones-de-este-documento).

## 0. Supuestos de la v1

- **Piloto en un evento pequeño** (hasta unos 500 asistentes) **con buena señal** (D24). Si la red falla, la app no se rompe, pero no hay modo sin conexión.
- **Web app**, sin nada que instalar. El asistente usa el celular, las salas y mesas una tablet o un celular, y los paneles una computadora.
- **Los puntos viven en el libro de movimientos** del servidor. Stellar recibe una huella cada 5 minutos (D22). Nadie espera a la blockchain.
- **Fuera de la v1:** variante Feria (saldo en dólares), wallets del asistente, modo sin conexión, portales para sponsors y comercios. Ver la [sección 11](#11-fuera-de-la-v1).

## 1. Actores y aplicaciones

| Actor | Aplicación | Ruta | Dispositivo | Cómo entra |
|---|---|---|---|---|
| **Administrador de Pasitos** | Consola de plataforma | `/plataforma` | Computadora | Correo y contraseña, más un segundo factor obligatorio (passkey o app de códigos) |
| **Dueño, coorganizador, registrador, financiador** | Panel del organizador | `/admin` | Computadora (el registrador, desde el celular) | Correo y contraseña (segundo factor opcional) |
| **Operador de mesa** | Mesa de canje | `/mesa` | Tablet o celular | Dispositivo conectado con QR o enlace de un solo uso (D18) |
| **Pantalla de sala o stand** | Pantalla | `/sala` | Tablet o monitor | Dispositivo conectado con QR o enlace de un solo uso (D18) |
| **Asistente** | App del asistente | `/app` | Celular | Enlace personal de invitación (la primera vez), o correo y contraseña |
| **Cualquier persona** | Sitio público y reporte | `/` · `/reporte/:evento` | Cualquiera | Sin cuenta |

## 2. Identidad y acceso

### 2.1 Identificador único: el correo (D25)

| Opción | A favor | En contra |
|---|---|---|
| **Correo** ✅ elegido | Universal, verificarlo es gratis, sirve para invitaciones y avisos, casi todos los inscritos a un evento ya lo dieron | Algunas personas mayores no lo usan seguido; errores de tipeo; correos compartidos en familia |
| Teléfono | Todos lo tienen; WhatsApp es el canal real en Bolivia | Verificar por SMS o WhatsApp cuesta por mensaje; se cambia de número; dato más sensible |
| Documento de identidad | Único de verdad | Dato muy sensible, no se puede verificar en línea, nadie lo quiere dar en un meetup |
| Sin identificador (solo el link de la entrada) | Cero fricción | Si se pierde el celular, se pierde la cuenta; no hay historial entre eventos |

**Decisión:**
- **El correo verificado identifica a la persona** en toda la plataforma: una cuenta Pasitos por correo, que sirve para todos los eventos. Los puntos siguen siendo de cada evento.
- El correo se guarda **en minúsculas y sin espacios**. No se tocan los puntos ni los `+` (`ana.m@` y `anam@` son cuentas distintas).
- **Invitado sin correo:** el organizador o un registrador pueden crear a una persona solo con su nombre. Existe solo dentro de ese evento y entra con su tarjeta impresa o con el QR que le muestra el registrador. Si después da un correo, se le agrega. Si ese correo ya tenía cuenta, las dos se unen.
- **El teléfono es un dato opcional,** no un identificador. Sirve para avisos por WhatsApp más adelante.

**Código de asistente (D31):**
- Cada inscripción a un evento tiene un **código de asistente** corto, por ejemplo `A-0231`.
- **No es el ID de la cuenta:** cambia de un evento a otro, no da acceso a nada por sí solo y no se usa en los lotes públicos (ahí van IDs anónimos, ver [Libro y anclaje](../04-tecnico/07-libro-y-anclaje.md)).
- Aparece en *Mi entrada*, en la tarjeta impresa y en la lista de invitados.
- **En la v1** sirve para buscar a la persona en el check-in, en los ajustes y en los reclamos. **Después**, para otorgarle puntos durante el evento (sección 11).
- Si el organizador importa la lista desde otra plataforma de entradas, el código original (por ejemplo `TICK-001`) se guarda aparte como *código externo* y también se puede buscar.

### 2.2 Inicio de sesión con contraseña (D26)

**Crear la cuenta:**
- **Por invitación** (al evento o al equipo): al abrir su enlace personal por primera vez, el correo queda verificado, porque abrirlo desde el correo prueba que es suyo. La persona solo **define su contraseña** en el mismo paso en que acepta los términos.
- **Por registro abierto:** escribe su correo y una contraseña, y verifica el correo con el **código de 6 dígitos o el botón** que le llega (vence en 10 minutos, 5 intentos, hasta 5 reenvíos por hora). Sin verificar el correo, la cuenta no puede inscribirse ni ganar puntos.

**La contraseña:**
- Mínimo **8 caracteres**. No se exigen mayúsculas ni símbolos, que solo llevan a contraseñas peores.
- Se rechazan las contraseñas filtradas o muy comunes (`12345678`, `pasitos2026`), y se muestra cuán segura es mientras se escribe.
- Se puede pegar y usar el administrador de contraseñas del celular, y hay un botón para verla.
- Se guarda con **Argon2id**. Nunca se guarda ni se registra en texto, tampoco en la bitácora.

**Intentos fallidos:**
- Después de 5 fallos seguidos en una cuenta, cada intento espera un poco más. A los 10, la cuenta se bloquea 15 minutos y se avisa por correo a su dueño.
- También hay un límite por IP, contra los ataques que prueban listas de contraseñas filtradas en muchas cuentas.
- El mensaje nunca dice si el correo existe: *"El correo o la contraseña no coinciden"*.

**Olvidé mi contraseña:**
- Llega un **enlace de un solo uso que vence en 30 minutos**.
- Al cambiarla, se cierran las demás sesiones y llega un aviso por correo.
- **En pleno evento,** quien no recuerda su contraseña no tiene que esperar el correo: después del check-in, el registrador le muestra un **QR de un solo uso** que abre la sesión en su celular (4.6).

**Segundo factor:**
- **Obligatorio** en la consola de plataforma: passkey (huella o Face ID) o una app de códigos.
- **Opcional** en el panel del organizador, y se le recomienda al dueño.
- Los asistentes no lo usan.

**Sesiones:**
- El asistente queda conectado 30 días en ese celular. El panel del organizador pide volver a entrar cada 12 horas sin uso. La consola de plataforma pide el segundo factor cada 8 horas.
- En **Mi cuenta**, cada persona ve en qué dispositivos tiene la sesión abierta y puede cerrarlas, y puede cambiar su contraseña (pide la actual).

**Correos que llegan:** se usa un proveedor de correo transaccional con SPF, DKIM y DMARC configurados. La pantalla dice *"Revisa también tu carpeta de spam"* y permite reenviar a los 60 segundos.

### 2.3 Dispositivos conectados: pantallas y mesas (D18)

- Se conectan con un **QR de un solo uso** (vence en 2 minutos) o un **enlace de un solo uso** (vence en 24 horas).
- El panel muestra cada dispositivo con su nombre, su lugar o mesa, quién lo conectó y si está en línea. El botón **Desconectar** lo saca al instante.
- Al conectar una pantalla se define un **PIN de 4 dígitos para sus controles** (sección 6.3), porque la pantalla queda de cara al público.

### 2.4 Roles y permisos (D19)

**Plataforma:** *Administrador de Pasitos* (todo) y *Soporte de Pasitos* (lectura y acciones de ayuda, sección 3.8).

**Evento** (una persona tiene un rol por evento; puede tener otro rol en otro evento):

| Acción | Dueño | Coorg. | Registrador | Operador de mesa | Operador de stand | Financiador |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Plan, facturación y transferir el evento | ✅ | — | — | — | — | — |
| Cerrar el evento | ✅ | — | — | — | — | — |
| Configurar el evento y publicarlo | ✅ | ✅ | — | — | — | — |
| Crear y editar retos, agenda, mapa, stands y catálogo | ✅ | ✅ | — | — | — | — |
| Invitar y quitar colaboradores | ✅ | ✅ ¹ | — | — | — | — |
| Conectar y desconectar pantallas y mesas | ✅ | ✅ | — | — | — | — |
| Cargar invitados y enviar invitaciones | ✅ | ✅ | — | — | — | — |
| Buscar invitados y hacer check-in | ✅ | ✅ | ✅ | — | — | — |
| Registrar en la puerta a quien no estaba inscrito (si está activado) | ✅ | ✅ | ✅ | — | — | — |
| Vincular o revincular el celular de un asistente | ✅ | ✅ | ✅ | — | — | — |
| Ajustes manuales de puntos y anular canjes | ✅ | ✅ | — | — | — | — |
| Cobrar canjes | ✅ | ✅ | — | ✅ ² | — | — |
| Controlar pantallas (pausar, generar otro QR, mostrar QR) | ✅ | ✅ | — | — | ✅ ² | — |
| Panel en vivo | ✅ | ✅ | Solo asistencia | — | Sus pantallas | ✅ lectura |
| Bitácora | ✅ | ✅ | — | — | — | — |
| Reporte y estadísticas | ✅ | ✅ | — | — | — | ✅ lectura |
| Descargar datos personales (lista de invitados) | ✅ | ✅ | — | — | — | — |

¹ Un coorganizador no puede nombrar ni quitar a otro coorganizador ni al dueño.
² Solo en las mesas o pantallas que tiene asignadas.

**Reglas:**
- **Nadie puede darse puntos a sí mismo.** Los ajustes manuales a la propia cuenta están bloqueados, aunque la persona también sea asistente.
- **El dueño no se puede quitar,** solo transferir el evento a otra persona, que tiene que aceptar.
- **Organización:** el dueño de la organización es dueño de todos sus eventos. Los demás roles se asignan por evento.
- **Operador de stand (D29):** es un rol nuevo, que se agrega a los de D19. Lo necesitan los modos de QR de la sección 6: alguien del stand, por ejemplo personal de un sponsor, tiene que poder pausar o mostrar un QR sin tener acceso al resto del panel.

## 3. Consola de plataforma (equipo de Pasitos)

### 3.1 Iniciar sesión
Correo y contraseña, y un **segundo factor obligatorio**: passkey (huella o Face ID) o una app de códigos. Toda acción queda en la bitácora de plataforma.

### 3.2 Solicitudes del plan Comunidad
1. Una comunidad llena el formulario del sitio público (P2).
2. La solicitud entra a la bandeja como **Pendiente**.
3. El administrador la revisa y elige:
   - **Aprobar:** se crea la organización y se invita al dueño por correo.
   - **Rechazar:** se envía un correo con el motivo.
   - **Pedir más información:** se envía un correo y la solicitud queda en espera.
4. La aprobación respeta el **presupuesto mensual** del plan gratuito. Si se agota, las nuevas solicitudes quedan en espera.

**Casos borde:**
- **Solicitud duplicada** (misma comunidad o mismo correo): se marca y se enlaza con la anterior.
- **El dueño no acepta la invitación:** se reenvía. A los 14 días, la solicitud vuelve a Pendiente.

### 3.3 Crear una organización directamente
Para ventas del plan Programa. Se cargan los datos de la organización, el correo del dueño (que recibe la invitación) y su plan.

### 3.4 Planes
- Cada plan tiene:
  - **Nombre.**
  - **Modalidad de cobro:** gratis, por evento o porcentaje de ventas.
  - **Precio.**
  - **Límites:** asistentes por evento, eventos activos a la vez, colaboradores, pantallas y mesas.
  - **Módulos incluidos:** estadísticas avanzadas, retos on-chain, reporte con marca, soporte el día del evento.
- **Los planes tienen versiones.** Si se cambia un plan, se crea una versión nueva y las suscripciones existentes conservan la suya.
- **Los módulos se pueden vender sueltos** por evento, como el paquete de estadísticas avanzadas.

### 3.5 Suscripciones y cobros
- **Suscripción:** organización + versión del plan + vigencia.
- **Cobros:** cargos por evento o por módulo (un evento Programa, un paquete de estadísticas).
- **Estados:** *Activa*, *Por vencer* (aviso al dueño 15 días antes), *Vencida*, *Suspendida*, *Cancelada*.
- **Pago en la v1: manual.** El administrador registra cada pago con fecha, monto, método y comprobante. La pasarela de pago queda para después.
- **Si una suscripción vence:** la organización no puede crear ni publicar eventos nuevos. **Un evento en curso nunca se corta,** y los reportes siguen visibles.
- **Si un evento supera un límite del plan** (por ejemplo, más asistentes): se avisa al dueño y al administrador, pero **no se bloquea a nadie en pleno evento**. La diferencia se cobra o se perdona después.

### 3.6 Dashboard
- **Organizaciones:** activas y en prueba.
- **Eventos:** en borrador, publicados, en curso y cerrados.
- **Uso:** asistentes y movimientos del mes.
- **Pendientes:** solicitudes y suscripciones por vencer.
- **Dinero:** ingresos del mes y **costo de red del mes** (XLM gastado en anclajes).
- **Salud del sistema:** anclajes atrasados, correos rebotados, errores del servidor.

### 3.7 Reportes
- **Disponibles:** ingresos por período y por plan; uso por organización (eventos, asistentes, movimientos); costo de red por evento; embudo de solicitudes (recibidas, aprobadas, con evento realizado).
- Todos se pueden exportar en CSV.

### 3.8 Ayudar a un organizador
- **Ver como:** el administrador entra al evento en **modo lectura**. Queda en la bitácora del evento y se avisa al dueño.
- **Otras acciones:** reenviar la invitación del dueño, cambiar al dueño cuando perdió el acceso a su correo (con verificación manual, que queda registrada), y suspender una organización por abuso.

## 4. Organizador

### 4.1 Ciclo de vida del evento

```
Borrador ──Publicar──▶ Publicado ──llega la hora / Abrir──▶ En curso ──Cerrar──▶ Cerrado ──90 días──▶ Archivado
                                                             │  ▲
                                                          Pausar / Reanudar
```

| Estado | Qué ven los asistentes | Qué se puede cambiar |
|---|---|---|
| **Borrador** | Nada | Todo. Se puede usar el **modo prueba** |
| **Publicado** | Información, agenda y retos (todavía sin puntos). El registro está abierto si el modo lo permite | Todo |
| **En curso** | Todo; se ganan y canjean puntos | Ver las reglas de abajo |
| **Pausado** | *"Pausamos un momento. Tus puntos están seguros"* | Configuración. No se ganan ni canjean puntos |
| **Cerrado** | El historial y el reporte. Los puntos vencieron | Nada. Solo se puede compartir el reporte |
| **Archivado** | El reporte público sigue disponible | Nada |

**Reglas con el evento en curso:**
- Un reto con participaciones **no se borra; se desactiva**.
- El tope de un reto se puede subir, pero **no bajar por debajo de lo ya entregado**.
- Si cambia la recompensa de un reto o el precio de un producto, el cambio vale solo para lo que venga después.
- Todo cambio queda en la bitácora.

**Antes de publicar,** el panel muestra una lista de chequeo:
- Fechas válidas.
- Al menos un reto.
- Cada reto con QR tiene su pantalla.
- Hay una mesa con catálogo, si hay canje.
- El modo de registro está elegido.
- El tamaño del evento entra en el plan.

**Modo prueba (recomendado):** en Borrador, el organizador puede probar todo: crear asistentes de prueba, escanear y canjear. Los movimientos de prueba se borran al publicar y nunca van al reporte ni a Stellar.

### 4.2 Configurar el evento

| Sección | Contenido |
|---|---|
| **Datos** | Nombre, fechas, horario, lugar, logo, nombre de los puntos |
| **Información para asistentes** | Agenda (actividad, hora, lugar, expositor, sponsor, reto asociado), mapa (imagen del plano con puntos numerados), lugares (salas, stands, mesa, baños), stands y sponsors (logo, descripción, enlace), preguntas frecuentes, contacto, wifi |
| **Retos** | Tipo, recompensa, tope total, veces por persona, horario, lugar y pantalla, modo de QR (sección 6.2) |
| **Pantallas** | Cada pantalla pertenece a un lugar y muestra los retos de ese lugar según el horario |
| **Mesa de canje** | Dispositivos conectados, catálogo (precio, stock, máximo por persona) |
| **Registro** | Modo de registro (4.5), campos del formulario, cupo, fecha límite, aprobación, check-in (4.6) |
| **Equipo** | Colaboradores y roles (4.3) |
| **Reglas** | *Los retos requieren check-in* (activado por defecto, D30), tope de puntos que puede ganar una persona (opcional) |

### 4.3 Equipo y colaboradores
1. El dueño o un coorganizador elige **Invitar**: correo, rol y alcance (qué mesas o pantallas, si el rol lo pide).
2. La persona recibe un correo con un enlace que **vence en 7 días**.
3. Abre el enlace y acepta. Si no tenía cuenta, define su contraseña en ese paso; si ya tenía, entra con la suya. Queda **Activo**.

- **Estados:** *Invitado* · *Activo* · *Vencido* · *Revocado*.
- **Acciones:** cambiar el rol, reenviar la invitación, quitar. Al quitar a alguien, sus sesiones se cierran al instante.

**Casos borde:**
- **La persona entra con otro correo:** la invitación es para el correo invitado, así que no la ve. Hay que invitar al correo correcto.
- **Colaborador de varios eventos:** usa la misma cuenta, con un rol en cada evento.
- **Un colaborador que también asiste:** puede ganar puntos como asistente, pero no puede ajustarse puntos a sí mismo.

### 4.4 Bitácora
**Qué se registra:** toda acción que cambia algo, por ejemplo:
- configuración, retos, agenda y catálogo;
- equipo y dispositivos;
- invitados y check-ins;
- ajustes de puntos y anulaciones;
- controles de pantalla (pausar, generar otro QR, mostrar QR);
- cierre del evento;
- **descargas de datos personales** (quién descargó la lista de invitados, y cuándo).

| Campo | Ejemplo |
|---|---|
| Cuándo | 21/11 10:42:13 |
| Quién | *Luis Condori (Registrador)* o *Tablet Sala A (conectada por Ana Mamani)* |
| Acción | *Check-in manual* |
| Sobre qué | *Valeria Quispe · A-0231* |
| Antes → después | *Registrado → Presente* |
| Desde dónde | Dispositivo y ubicación aproximada |

**Reglas de la bitácora:**
- **Solo se agregan líneas.** Nadie las edita ni las borra, tampoco el dueño ni nosotros.
- Se puede filtrar por persona, tipo de acción y fecha, y exportar en CSV.
- **Se conserva sin plazo** (D35). Lo único que se borra son los datos técnicos del dispositivo, 30 días después del cierre: la bitácora guarda el modelo del dispositivo, no su huella ni su IP.

**Bitácora y libro no son lo mismo:**
- El **libro de movimientos** registra los puntos (D22).
- La **bitácora** registra las acciones administrativas.
- Un ajuste manual aparece en los dos.

### 4.5 Modos de registro de asistentes (D27)

El organizador elige uno por evento:

| Modo | Cómo llega la gente | Para qué evento |
|---|---|---|
| **Lista de invitados** | El organizador carga la lista (CSV o una por una). Cada persona recibe su **enlace personal** por correo desde Pasitos, o el organizador descarga los enlaces y QR para mandarlos por WhatsApp o imprimirlos | Eventos cerrados, con inscripción previa en otra plataforma |
| **Registro abierto** | Enlace y QR público del evento (para afiches y redes). La persona crea su cuenta con correo y contraseña (o entra con la suya), verifica el correo y completa el formulario. Opciones: cupo máximo, fecha límite y aprobación manual | Meetups abiertos |
| **Mixto** | Los invitados entran con su enlace; el resto se registra con el enlace público, con aprobación si se activa | La mayoría |

**Además, en cualquier modo:**
- **Registro en la puerta** (activable): el registrador registra a quien llega sin inscribirse. El nombre es obligatorio y el correo opcional, y queda anotado quién lo registró. La persona queda **presente** al instante.
- **Tope del registro en la puerta,** configurable por el organizador: *sin límite* (por defecto), *tope del evento* (por ejemplo, 50 personas), *tope por registrador* (por ejemplo, 20 cada uno), o los dos topes a la vez. Al llegar al tope, el registrador ve *"Llegaste al tope de registros en la puerta. Pide a un coorganizador que lo amplíe"*. El dueño o un coorganizador lo pueden subir en pleno evento, y el cambio queda en la bitácora.

**Por defecto en el piloto:** lista de invitados + registro en la puerta.

#### Flujo A · Invitación
1. El organizador carga la lista. El sistema marca los correos inválidos y los duplicados antes de guardar.
2. Pulsa **Enviar invitaciones**. Se envían por tandas y cada persona muestra su estado: *Enviada* o *Rebotó*.
3. La persona abre su enlace personal. **La primera vez entra directo**: abrir el enlace desde su correo prueba que el correo es suyo.
4. Define su contraseña (si no tenía cuenta), acepta los términos y el uso de sus datos, y queda **Registrada**.
5. Desde ese momento, el enlace ya no da acceso directo: en otro dispositivo se entra con correo y contraseña.

#### Flujo B · Registro abierto
1. La persona escanea el QR del afiche o abre el enlace del evento.
2. Escribe su correo y una contraseña, y verifica el correo con el código que le llega. Si ya tenía cuenta, entra con su contraseña.
3. Completa su nombre y los campos extra, y acepta los términos.
4. Queda **Registrada**, o **Pendiente de aprobación** si el organizador lo activó.
5. Recibe un correo de confirmación con el acceso a su entrada.

**Estados de una inscripción:**
- *Invitado* → *Registrado* → *Presente*.
- También pueden quedar *Pendiente de aprobación*, *Rechazado* o *Cancelado*.
- **"No vino"** no lo marca nadie: es quien quedó *Registrado* sin check-in al cierre.

**Casos borde:**
- **El correo del invitado rebotó:** se marca en la lista para corregirlo o entregar el enlace a mano.
- **La invitación se reenvía a otra persona antes de usarse:** esa persona entra como el invitado. El riesgo se acepta, y en la puerta el registrador ve el nombre y lo compara.
- **El registro abierto alcanzó el cupo:** el formulario dice *"Cupo completo"*. Lista de espera: no en la v1.
- **Alguien no invitado abre la app** en un evento de solo lista: *"No encontramos tu correo en la lista de este evento. Habla con el organizador"*.

### 4.6 Lista de invitados y check-in

**La lista:**
- Buscador por nombre, correo o código de asistente.
- Filtros por estado.
- Contadores: invitados, registrados, presentes y no vinieron.
- Exportación (queda en la bitácora).

**Formas de hacer check-in** (el organizador activa las que quiera):

| Forma | Cómo | Cuándo conviene |
|---|---|---|
| **Escanear su entrada** | El registrador escanea con su celular el QR de *Mi entrada* del asistente. Su pantalla muestra el nombre para compararlo | Es la más rápida con fila |
| **Buscar por nombre** (D20) | El registrador busca a la persona y toca **Marcar como presente** | Personas mayores, celular sin batería, o que no encuentran su entrada |
| **Auto check-in** | El asistente escanea el QR de la pantalla de la entrada | Eventos grandes y con poco personal. Es lo que menos controla. **No entra en el piloto** |

**Reglas:**
- **Homónimos:** junto al nombre se muestra parte del correo (`va•••@gmail.com`) y el código de asistente.
- **Ya estaba presente:** se muestra quién la marcó y a qué hora. No se duplica.
- **Deshacer un check-in:** se pide un motivo, y queda en la bitácora.
- **Con *Los retos requieren check-in* activado,** el asistente ve los retos, pero no gana puntos hasta pasar por la puerta: *"Primero registra tu llegada en la entrada"*. Esto frena las granjas de entradas.
- **Después del check-in, si la persona todavía no entró a la app,** el registrador le muestra un **QR de un solo uso** para entrar sin escribir su contraseña, o le imprime una tarjeta con su código de asistente si no tiene celular (D31).
- **Control del check-in manual:** el reporte lo cuenta aparte (*"23 de 287 por check-in manual"*). Si alguien del equipo marca a muchas personas seguidas, se genera una alerta (T15).

### 4.7 Ajustes de puntos y anulaciones
- **Ajuste manual:**
  - Suma o resta puntos a un asistente, con un **motivo obligatorio** (*Falló el QR*, *Compensación*, *Corrección*, *Reto otorgado por el equipo*).
  - Tiene un tope por ajuste (por ejemplo, 100 pts).
  - Se registra en el libro como *ajuste* y en la bitácora, y el reporte lo muestra aparte.
- **Reto otorgado por el equipo** (por ejemplo, "entregó su proyecto"): el organizador elige a las personas en una lista, o las busca por su código de asistente, y se les suman los puntos. En la v1 es también la forma de darle un reto a alguien sin celular. Es un ajuste con el reto asociado, y respeta el tope del reto.
- **Anular un canje:** devuelve los puntos y el stock, y pide un motivo. Solo pueden hacerlo el dueño o un coorganizador.

### 4.8 Panel en vivo
- **Muestra:** asistencia por hora, presentes, participaciones por reto (con su tope consumido), canjes, stock bajo, pantallas y mesas en línea o desconectadas.
- **Actualización:** en vivo con avisos pequeños, sin recargar (ver [Rendimiento](../04-tecnico/08-rendimiento.md)).

### 4.9 Cierre del evento
1. **Opcional:** aviso en la app a los asistentes, 30 minutos antes: *"Los puntos vencen a las 19:00. ¡Canjéalos!"*
2. El dueño cierra el evento escribiendo `CERRAR`. Desde ese momento no se ganan ni canjean puntos.
3. Los puntos sin usar vencen. Es un movimiento más del libro.
4. Se sella el último lote y se registra el cierre en Stellar.
5. Se genera el reporte, y el dueño lo comparte con un enlace público o invitando a financiadores como lectores.

El cierre **no se puede deshacer**. Para no olvidarlo, se puede **programar** a una hora.

## 5. Asistente

### 5.1 Entrar
- Por su enlace personal, o por el QR o enlace del evento con su correo (sección 4.5).
- Si tiene varios eventos, ve **Mis eventos**, y se abre el que está en curso.

### 5.2 Qué ve en la app

| Sección | Qué muestra |
|---|---|
| **Inicio** | Saldo de puntos, *Ahora y a continuación* en la agenda, retos disponibles en este momento y avisos del organizador |
| **Agenda** | Actividades por día y lugar, con hora, expositor, sponsor y si dan puntos (*"Esta charla da +20 pts"*). Marca qué está pasando ahora |
| **Mapa** | El plano del lugar con puntos numerados y la lista de lugares: salas, stands, mesa de canje, baños, salida. Sin mapas interactivos en la v1 |
| **Stands y sponsors** | Logo, descripción, enlace, dónde está en el mapa y sus retos |
| **Retos** | Cada reto con su estado: *Disponible*, *Completado ✓*, *Desde las HH:MM*, *Agotado*, y cómo se completa |
| **Canjear** | Catálogo con precio, stock (*"Quedan pocos"*) y dónde está la mesa |
| **Historial** | Movimientos con su estado: *Confirmado* → *Registrado en Stellar ✓* |
| **Mi entrada** | Su QR personal para el check-in y su código de asistente (`A-0231`) |
| **Información** | Preguntas frecuentes, contacto del organizador, wifi, cómo funcionan los puntos |
| **Mi cuenta** | Tamaño de texto, tema, cambiar contraseña, sesiones abiertas, salir |

El botón **Escanear código QR** está siempre a mano. Cómo se organiza la navegación se resuelve en el diseño.

### 5.3 Ganar puntos con un QR
1. El asistente toca **Escanear** y apunta al QR de la pantalla.
2. Su celular envía el reclamo firmado (ver [Libro y anclaje](../04-tecnico/07-libro-y-anclaje.md)).
3. El servidor valida y responde en menos de 1 segundo: **+20 pts**. El contador de la pantalla sube.

**Si algo falla, el asistente ve esto:**

| Caso | Mensaje |
|---|---|
| Ya completó el reto | *"Ya completaste este reto a las 10:31"* |
| El QR cambió o se pausó | *"El código cambió. Escanéalo de nuevo"* |
| El QR de un solo uso ya lo usó otra persona | *"Este código ya fue usado"* |
| Fuera de horario | *"Este reto se habilita a las 17:00"* |
| El reto agotó sus premios | *"Este reto ya entregó todos sus premios"* |
| No hizo check-in | *"Primero registra tu llegada en la entrada"* |
| Evento pausado o cerrado | *"Pausamos un momento"* / *"El evento ya cerró"* |
| Falla de red | Reintenta solo. Si no puede: *"No pudimos conectar. Intenta de nuevo"* |

### 5.4 Retos sin QR
- **Encuesta dentro de la app:** suma los puntos al enviarla.
- **Otorgado por el equipo:** sección 4.7.
- **Retos on-chain** (*"Haz tu primera transacción en Stellar"*): **no en la v1**. Requieren una wallet; quedan para el módulo de onboarding del plan Programa.

### 5.5 Canjear: como pagar con QR
Es el mismo gesto que un pago con QR bancario, que la gente ya conoce:

1. La mesa elige uno o varios productos y genera el **QR de cobro**. Vence en 2 minutos y reserva el stock mientras tanto.
2. El asistente lo escanea y ve **qué compra, cuánto cuesta, en qué mesa y cuánto le queda**.
3. Toca **Confirmar canje**.
4. El servidor comprueba el saldo, el stock y el máximo por persona, y descuenta los puntos.
5. **Las dos pantallas muestran el mismo código de comprobante** (por ejemplo, `C-4821`). La mesa entrega **solo si lo ve en su propia pantalla**. Así, una captura de pantalla vieja no sirve para pedir otro producto.

**Casos borde:**
- **Saldo insuficiente:** el botón queda desactivado y dice *"Te faltan 30 pts"*.
- **Sin stock:** no puede pasar después de generar el QR, porque el stock quedó reservado.
- **Pasaron 2 minutos:** el QR vence, el stock se libera y no se descontó nada.
- **El QR ya lo pagó otra persona** (cada cobro sirve una sola vez): *"Este cobro ya fue pagado"*.
- **Máximo por persona:** *"Puedes canjear 1 polera por persona"*.
- **Doble toque en Confirmar:** se cobra una sola vez.

Se descartó para la v1 la opción inversa, donde el asistente arma su pedido y la mesa lo escanea. Suma pasos y obliga a la mesa a tener cámara apuntando al público.

## 6. Pantalla de sala o stand

### 6.1 Conectar y asignar
- Se conecta con un QR o un enlace de un solo uso (D18), y queda asignada a un **lugar** (*Sala A*, *Stand Kodara*).
- **Muestra sola el reto que toca según la agenda.** Si no hay ninguno, muestra *"En espera · el próximo reto empieza a las 15:00"*.
- Puede haber dos pantallas para el mismo reto, por ejemplo dos puertas de entrada.

### 6.2 Modos de QR (D28)

El organizador elige el modo en cada reto:

| Modo | Cómo funciona | Para qué | Ejemplo |
|---|---|---|---|
| **Por tiempo** (rotativo) | Cambia cada 15, 30 o 60 segundos (30 por defecto). Mucha gente puede escanear el mismo QR mientras está vigente | Retos para todo un público | Charla, cierre, llegada temprana |
| **De un solo uso** | Gana el primero que lo escanea. Al usarse, la pantalla muestra uno nuevo al instante | Retos uno a uno, con fila | Demo en un stand, visita guiada |
| **Bajo demanda** | La pantalla no muestra nada hasta que el operador toca **Mostrar QR**. Aparece un QR de un solo uso que vence en 60 segundos y después vuelve a la espera | Cuando solo una persona se lo ganó | Ganador de una trivia, quien terminó un taller |
| **Usos limitados** | Igual que *por tiempo*, pero solo los primeros N escaneos | Cupos | Los primeros 10 en llegar al taller |

**En cualquier modo,** una persona completa cada reto como máximo las veces que el reto permite (normalmente una).

**Descartado:** el QR impreso y fijo. Se puede fotografiar y mandar por WhatsApp, y eso le quita valor al reporte.

### 6.3 Controles del operador
| Control | Qué hace |
|---|---|
| **Generar otro ahora** | Invalida el QR actual al instante, sin el margen de gracia, y muestra uno nuevo |
| **Pausar** | Oculta el QR y lo invalida. La pantalla dice *"En pausa"*. **Reanudar** muestra uno nuevo |
| **Mostrar QR** | Solo en el modo bajo demanda |
| **Cambiar de reto** | Si el lugar tiene más de un reto activo a la vez |

**¿Desde dónde se controla?** La pantalla está de cara al público. Si los botones estuvieran a la vista, cualquiera podría tocarlos. Por eso:
- En la pantalla, los controles se abren con un botón discreto y el **PIN de 4 dígitos**.
- **O desde el celular del operador:** en su panel ve *Mis pantallas* y las controla a distancia.

**Margen de gracia:** cuando el QR cambia solo, el anterior sigue valiendo 5 segundos, para quien escaneó justo en el cambio. Cuando el operador pausa o genera otro, **no hay margen**.

### 6.4 Qué muestra la pantalla
- **En el centro:** el QR grande con su código corto, el nombre del reto y sus puntos.
- **Según el modo:** la cuenta regresiva (en el modo por tiempo) o los usos que quedan.
- **Abajo:** el contador en vivo (*"47 personas"*).
- **Cuando hay QR, puede cambiar a uno de estos estados:** *En pausa*, *En espera*, *Agotado* o *Sin conexión*.

**Si la pantalla pierde la conexión,** sigue mostrando el QR (lo genera la propia tablet) y avisa *"Contador sin conexión"*. Cuando vuelve la conexión, se sincroniza.

### 6.5 Historial de QR
- **De cada QR que se mostró se guarda:** pantalla, reto, modo, cuándo empezó, cómo terminó (*venció*, *se usó*, *lo invalidó* fulano, *pausa*).
- **De cada escaneo,** se guardan los **aceptados y los rechazados**, con su motivo: vencido, ya usado, ya completado, fuera de horario, sin check-in.
- **Por qué importan los rechazados:** muchos escaneos de QR ya vencidos poco después de cada cambio indican que alguien está mandando fotos.
- **Quién lo ve:** el operador de stand ve el resumen de sus pantallas; el dueño y los coorganizadores ven todo. Los controles (pausar, generar otro) también quedan en la bitácora.

## 7. Mesa de canje
1. **Conectar:** con un QR o un enlace de un solo uso (D18).
2. **Cobrar:** sección 5.5. La mesa ve el comprobante y entrega.
3. **Cancelar un cobro** antes de que lo confirmen: el stock se libera.
4. **Historial de la mesa:** los canjes de hoy con su comprobante, para resolver reclamos.
5. **Cuadre:** resumen por producto (entregados, puntos cobrados, stock que queda), para contarlo contra lo físico al final del día.
6. **Algo salió mal** (se entregó otro producto, se cobró dos veces): la mesa no puede anular. Pide la anulación a un coorganizador (sección 4.7).
7. **Stock bajo:** aviso en la mesa y en el panel.

## 8. Financiador

- Recibe una invitación como **Financiador**, de solo lectura, o el enlace público del reporte.
- Ve el reporte y, si el plan lo incluye, las estadísticas avanzadas.
- Tiene la página **Verificar este reporte** (sección 9).

## 9. Reporte y verificación

**Qué muestra el reporte:**
- Asistentes presentes, con los check-ins manuales contados aparte.
- Participaciones por reto y por sponsor, con su tope.
- Retención: quiénes se quedaron hasta el cierre.
- Puntos ganados, canjeados, ajustados a mano y vencidos.
- El enlace a Stellar.

**Verificar este reporte:**
- Recalcula las huellas de todos los lotes y las compara con las de Stellar.
- Revisa las firmas de las pantallas y los topes de cada reto.
- Dice con claridad si todo coincide o qué no coincide.

Ver [Libro y anclaje §5](../04-tecnico/07-libro-y-anclaje.md#5-cómo-se-verifica).

**Cada asistente** puede ver en su historial *"Tu participación está en el reporte ✓"*.

**Privacidad:**
- El reporte muestra solo datos agregados.
- En eventos de menos de 30 personas, no se publica el detalle por movimiento, solo los totales.

## 10. Correos que envía la plataforma (v1)

| Correo | A quién |
|---|---|
| Verificar el correo (código y botón) | Quien crea su cuenta por registro abierto |
| Restablecer la contraseña (enlace de 30 min) | Quien la olvidó |
| Aviso de seguridad: contraseña cambiada o cuenta bloqueada por intentos | El dueño de la cuenta |
| Invitación al evento, con su enlace personal | Invitados |
| Confirmación de registro, con su entrada | Quien se registró (también en la puerta, si dio su correo). Solo informa; no pide confirmar nada |
| Invitación al equipo | Colaboradores |
| Solicitud aprobada, rechazada o con pedido de información | Comunidades que pidieron el plan |
| Reporte listo | Dueño y financiadores |
| Suscripción por vencer | Dueño de la organización |

Opcional y configurable: recordatorio el día anterior al evento. **No se envía publicidad.**

## 11. Fuera de la v1

- Variante Feria: saldo en dólares, pagos en USD, reembolsos.
- Wallets de Stellar para asistentes y retos on-chain (módulo de onboarding del plan Programa).
- Modo sin conexión completo y sincronización a través de la mesa (D23).
- Portales para que sponsors y comercios gestionen sus propios retos y productos.
- Pasarela de pago para las suscripciones.
- Lista de espera, venta de entradas, mapas interactivos, notificaciones push.
- **Otorgar puntos por código de asistente (D31):**
  - Un operador de pantalla o de stand escribe el código de asistente, o escanea el QR de *Mi entrada* o de la tarjeta impresa, y le otorga el reto de ese lugar.
  - Antes de confirmar, ve el nombre de la persona para compararlo.
  - Respeta las mismas reglas que un escaneo (topes, veces por persona, horario, check-in). Va al libro como *otorgado por* ese operador, a la bitácora, y el reporte lo cuenta aparte.
  - Alerta si un operador otorga muchos seguidos, como en el check-in manual (T15).
  - Sirve para personas sin celular o con el celular sin batería.

## 12. Decisiones de este documento

Confirmadas el 2026-11-06. El detalle está en [decisiones.md](../decisiones.md).

| # | Tema | Decisión |
|---|---|---|
| D25 | Identificador de la persona | Correo verificado, con invitados sin correo dentro de un evento, y un código de asistente por evento (2.1) |
| D26 | Inicio de sesión | Correo y contraseña, con el correo verificado. Segundo factor obligatorio en la consola de plataforma (2.2) |
| D27 | Modos de registro | Lista, abierto o mixto, más registro en la puerta activable. Piloto: lista + puerta (4.5) |
| D28 | Modos de QR | Por tiempo, de un solo uso, bajo demanda y usos limitados. Sin QR impreso (6.2) |
| D29 | Rol *Operador de stand* | Se agrega a D19 (2.4) |
| D30 | Los retos requieren check-in | Configurable, activado por defecto (4.6) |
| D31 | Personas sin celular | Sin modo *Escanear asistente* en la v1. Después, otorgar puntos por código de asistente (11) |
| D32 | Cobro de suscripciones | Manual en la v1, registrado por el administrador (3.5) |
