/**
 * Catálogo único de correos (T-007 §4, ajuste 17 de la fase 2). **Los textos de todos los correos
 * viven solo aquí**: cambiar un asunto o un párrafo es tocar este archivo y nada más.
 * La versión legible para revisar está en docs/version-piloto/implementacion/fase-2/correos.md.
 *
 * Formato de los textos:
 * - `{variable}`: se reemplaza por el dato (escapado en el HTML). Si falta, el correo no se arma.
 * - `[ … ]`: parte opcional; se muestra solo si todas sus variables tienen valor (`Hola[, {nombre}].`).
 * - `**…**`: negrita. No hay otro formato.
 *
 * Las variables tienen tipos derivados de los textos (`DatosCorreo<'restablecer_password'>`): si un
 * texto suma `{fecha}` y quien encola no la manda, no compila.
 */

/** Prioridades del tope diario (D57, Infraestructura §10.1). */
export const PRIORIDADES_CORREO = {
  seguridad: 1,
  equipo: 2,
  puerta: 3,
  invitaciones: 4,
} as const;
export type PrioridadCorreo = (typeof PRIORIDADES_CORREO)[keyof typeof PRIORIDADES_CORREO];

export interface DefinicionCorreo {
  readonly prioridad: PrioridadCorreo;
  readonly asunto: string;
  readonly parrafos: readonly string[];
  readonly boton?: { readonly texto: string; readonly enlace: string };
  /** Aviso corto debajo del botón y del enlace escrito. */
  readonly bajoBoton?: string;
  /** Por qué le llega este correo. */
  readonly pie: string;
}

/** Lo común a todos los correos. */
export const COMUN_CORREOS = {
  remitenteNombre: 'Pasitos',
  eslogan: 'Pasitos · Cada paso cuenta',
  textoEnlace: 'Si el botón no funciona, copia este enlace en tu navegador:',
  zonaHoraria: 'America/La_Paz',
} as const;

/** Variables que pone el trabajador al enviar (de la configuración), no quien encola. */
export const VARIABLES_DEL_SISTEMA = ['correoSoporte'] as const;

/** Qué va a hacer cada rol, para `invitacion_equipo` (`{queHace}`). */
export const QUE_HACE_POR_ROL = {
  coorganizador: 'Vas a poder configurar el evento y su equipo',
  registrador: 'Vas a recibir a los asistentes en la puerta',
  operador_mesa: 'Vas a entregar los premios en la mesa de canje',
  operador_stand: 'Vas a manejar las pantallas de tu stand',
  financiador: 'Vas a ver el reporte del evento',
} as const;

export const CORREOS = {
  // ── Seguridad (HU-201, HU-202) ─────────────────────────────────────────────
  restablecer_password: {
    prioridad: 1,
    asunto: 'Restablece tu contraseña de Pasitos',
    parrafos: [
      'Hola, {nombre}.',
      'Pediste cambiar tu contraseña. El enlace vale 30 minutos y sirve una sola vez.',
      'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
    ],
    boton: { texto: 'Elegir contraseña nueva', enlace: '{enlace}' },
    pie: 'Te llega este correo porque alguien pidió cambiar la contraseña de tu cuenta de Pasitos.',
  },
  password_cambiada: {
    prioridad: 1,
    asunto: 'Cambiaste tu contraseña de Pasitos',
    parrafos: [
      'Hola, {nombre}.',
      'Tu contraseña se cambió el {fecha} a las {hora}. Cerramos tus otras sesiones.',
      'Si no fuiste tú, escríbenos a {correoSoporte} enseguida.',
    ],
    pie: 'Te llega este correo porque cambió la contraseña de tu cuenta de Pasitos.',
  },
  cuenta_bloqueada: {
    prioridad: 1,
    asunto: 'Bloqueamos tu cuenta de Pasitos por 15 minutos',
    parrafos: [
      'Hola, {nombre}.',
      'Hubo 10 intentos seguidos de entrar a tu cuenta con una contraseña incorrecta, así que la bloqueamos 15 minutos.',
      'Si fuiste tú, espera y prueba de nuevo, o restablece tu contraseña. Si no fuiste tú, cambia tu contraseña apenas puedas.',
    ],
    boton: { texto: 'Restablecer mi contraseña', enlace: '{enlace}' },
    pie: 'Te llega este correo para cuidar tu cuenta de Pasitos.',
  },
  segundo_factor_restablecido: {
    prioridad: 1,
    asunto: 'Restablecimos tu segundo factor en Pasitos',
    parrafos: [
      'Hola, {nombre}.',
      'Como lo pediste, borramos tu segundo factor y cerramos tus sesiones. La próxima vez que entres vas a configurar uno nuevo.',
      'Si no lo pediste, escríbenos a {correoSoporte}.',
    ],
    boton: { texto: 'Entrar a Pasitos', enlace: '{enlace}' },
    pie: 'Te llega este correo para cuidar tu cuenta de Pasitos.',
  },

  // ── Equipo (HU-202, HU-203) ────────────────────────────────────────────────
  invitacion_organizacion: {
    prioridad: 2,
    asunto: 'Te invitamos a organizar eventos con Pasitos',
    parrafos: [
      'Hola, {nombre}.',
      '{quienInvita}, de Pasitos, te invitó a administrar **{organizacion}**. Desde tu cuenta vas a crear tus eventos, sumar a tu equipo y ver tus reportes.',
      'El enlace vale 7 días.',
    ],
    boton: { texto: 'Aceptar la invitación', enlace: '{enlace}' },
    pie: 'Te llega este correo porque Pasitos te invitó a administrar una organización.',
  },
  invitacion_plataforma: {
    prioridad: 2,
    asunto: 'Te sumamos al equipo de Pasitos',
    parrafos: [
      'Hola, {nombre}.',
      '{quienInvita} te dio acceso a la consola de Pasitos como **{rol}**.',
      'El enlace vale 7 días. Al entrar vas a configurar tu segundo factor.',
    ],
    boton: { texto: 'Aceptar la invitación', enlace: '{enlace}' },
    pie: 'Te llega este correo porque te dieron acceso a la consola de Pasitos.',
  },
  rol_plataforma_asignado: {
    prioridad: 2,
    asunto: 'Ahora tienes acceso a la consola de Pasitos',
    parrafos: [
      'Hola, {nombre}.',
      '{quienInvita} te dio acceso a la consola de Pasitos como **{rol}**.',
      'Entra con tu cuenta de siempre; vas a necesitar tu segundo factor.',
    ],
    boton: { texto: 'Entrar a la consola', enlace: '{enlace}' },
    pie: 'Te llega este correo porque te dieron acceso a la consola de Pasitos.',
  },
  invitacion_equipo: {
    prioridad: 2,
    asunto: '{quienInvita} te invitó al equipo de {evento}',
    parrafos: [
      'Hola[, {nombre}].',
      '{quienInvita} te invitó como **{rol}** en **{evento}** ({fecha}). {queHace}.',
      'El enlace vale 7 días. Si no esperabas esta invitación, ignora este correo.',
    ],
    boton: { texto: 'Aceptar la invitación', enlace: '{enlace}' },
    pie: 'Te llega este correo porque {quienInvita} te invitó al equipo de {evento}.',
  },

  // ── Invitaciones a asistentes (HU-211) ─────────────────────────────────────
  invitacion_evento: {
    prioridad: 4,
    asunto: 'Tu entrada para {evento}',
    parrafos: [
      'Hola, {nombre}.',
      'Ya estás en la lista de **{evento}**, el {fecha} en {lugar}.',
      'Abre este enlace **en tu celular** para tener tu entrada: vas a ver la agenda, los retos y, el día del evento, vas a ganar {nombrePuntos} participando.',
      'Tu código de asistente es **{codigo}**. El enlace es personal: no lo compartas.',
    ],
    boton: { texto: 'Abrir mi entrada', enlace: '{enlace}' },
    bajoBoton:
      'Si lo abres desde Gmail o WhatsApp y no funciona, cópialo y ábrelo en Chrome o Safari.',
    pie: 'Te llega este correo porque {organizacion} te inscribió en {evento}.',
  },

  // ── Puerta (HU-303, V22) ───────────────────────────────────────────────────
  // Es solo un aviso: no hay que confirmar nada (D35).
  registro_puerta: {
    prioridad: 3,
    asunto: 'Te registraste en {evento}',
    parrafos: [
      'Hola, {nombre}.',
      'Te registraste en **{evento}**, el {fecha} en {lugar}.',
      'Tu código de asistente es **{codigo}**. Si en la puerta te lo piden, dilo así.',
      'Es solo un aviso: no tienes que confirmar nada.',
    ],
    pie: 'Te llega este correo porque te registraste en la puerta de {evento} con esta dirección.',
  },
} as const satisfies Record<string, DefinicionCorreo>;

export type TipoCorreo = keyof typeof CORREOS;
export const TIPOS_CORREO = Object.keys(CORREOS) as TipoCorreo[];

// ── Tipos de las variables, derivados de los textos ─────────────────────────

type TextosDe<D> =
  | (D extends { readonly asunto: infer A } ? A : never)
  | (D extends { readonly parrafos: readonly (infer P)[] } ? P : never)
  | (D extends { readonly pie: infer X } ? X : never)
  | (D extends { readonly bajoBoton: infer X } ? X : never)
  | (D extends { readonly boton: { readonly texto: infer T; readonly enlace: infer E } }
      ? T | E
      : never);

type VariablesEn<S> = S extends `${string}{${infer V}}${infer R}` ? V | VariablesEn<R> : never;
type OpcionalesEn<S> = S extends `${string}[${infer Dentro}]${infer R}`
  ? VariablesEn<Dentro> | OpcionalesEn<R>
  : never;

type DelSistema = (typeof VARIABLES_DEL_SISTEMA)[number];
type Todas<T extends TipoCorreo> = VariablesEn<TextosDe<(typeof CORREOS)[T]>>;
type Opcionales<T extends TipoCorreo> = OpcionalesEn<TextosDe<(typeof CORREOS)[T]>>;

/** Los datos que hay que mandar al encolar un correo de tipo `T`. */
export type DatosCorreo<T extends TipoCorreo> = {
  readonly [K in Exclude<Todas<T>, Opcionales<T> | DelSistema>]: string;
} & {
  readonly [K in Exclude<Opcionales<T>, DelSistema>]?: string;
};
