/**
 * Catálogo único de códigos de error del API (D40).
 * Fuente: docs/09-desarrollo/04-respuestas-y-errores.md §4.3.
 * Agregar un código es parte del PR que lo usa.
 */
export const CATALOGO_ERRORES = {
  // Generales
  VALIDACION: { status: 400, title: 'Datos inválidos', mensaje: 'Revisa los campos marcados.' },
  NO_ENCONTRADO: { status: 404, title: 'No encontrado', mensaje: 'No encontramos lo que buscas.' },
  EVENTO_SIN_PAGINA_PUBLICA: {
    status: 404,
    title: 'Sin página pública',
    mensaje: 'Este evento no tiene página pública.',
  },
  DEMASIADOS_INTENTOS: {
    status: 429,
    title: 'Demasiados intentos',
    mensaje: 'Espera un momento e intenta de nuevo.',
  },
  ERROR_INTERNO: {
    status: 500,
    title: 'Error interno',
    mensaje: 'Algo salió mal. Intenta de nuevo.',
  },
  SERVICIO_NO_DISPONIBLE: {
    status: 503,
    title: 'Servicio no disponible',
    mensaje: 'El servicio no está disponible en este momento.',
  },
  IDEMPOTENCIA_CONFLICTO: {
    status: 409,
    title: 'Operación ya enviada',
    mensaje: 'Esta operación ya se envió con otros datos.',
  },
  // Equipo y sesión
  NO_AUTENTICADO: {
    status: 401,
    title: 'No autenticado',
    mensaje: 'Inicia sesión para continuar.',
  },
  SESION_VENCIDA: {
    status: 401,
    title: 'Sesión vencida',
    mensaje: 'Tu sesión venció. Inicia sesión de nuevo.',
  },
  TERMINAL_DESCONECTADA: {
    status: 401,
    title: 'Terminal desconectada',
    mensaje: 'Esta pantalla se desconectó. Pide que la conecten de nuevo.',
  },
  SIN_PERMISO: { status: 403, title: 'Sin permiso', mensaje: 'No tienes permiso para esto.' },
  CREDENCIALES_INVALIDAS: {
    status: 401,
    title: 'Correo o contraseña incorrectos',
    mensaje: 'El correo o la contraseña no son correctos.',
  },
  SEGUNDO_FACTOR_REQUERIDO: {
    status: 401,
    title: 'Falta el segundo factor',
    mensaje: 'Confirma tu identidad con tu segundo factor.',
  },
  CODIGO_INVALIDO: {
    status: 401,
    title: 'Código incorrecto',
    mensaje: 'El código no es correcto o ya venció. Prueba con el que muestra tu app ahora.',
  },
  PASSWORD_INSEGURA: {
    status: 422,
    title: 'Contraseña insegura',
    mensaje: 'Elige otra contraseña: esta es muy corta o muy conocida.',
  },
  ENLACE_VENCIDO: {
    status: 422,
    title: 'Enlace vencido',
    mensaje: 'Este enlace ya no sirve. Pide uno nuevo.',
  },
  ENLACE_YA_USADO: {
    status: 409,
    title: 'Enlace ya usado',
    mensaje: 'Este enlace ya se usó. Si eras tú, entra con tu cuenta.',
  },
  INVITACION_EQUIPO_OTRO_CORREO: {
    status: 403,
    title: 'La invitación es para otra cuenta',
    mensaje: 'Esta invitación es para otro correo. Entra con esa cuenta.',
  },
  ROL_NO_PERMITIDO: {
    status: 403,
    title: 'Rol no permitido',
    mensaje: 'No puedes invitar, cambiar ni quitar a alguien con ese rol.',
  },
  // Archivos (Subida de archivos §6)
  ARCHIVO_MUY_GRANDE: {
    status: 413,
    title: 'Archivo muy grande',
    mensaje: 'El archivo supera el tamaño máximo.',
  },
  ARCHIVO_TIPO_NO_PERMITIDO: {
    status: 422,
    title: 'Tipo de archivo no permitido',
    mensaje: 'Este tipo de archivo no está permitido. Usa PNG, JPEG o WebP.',
  },
  ARCHIVO_CORRUPTO: {
    status: 422,
    title: 'Archivo dañado',
    mensaje: 'No pudimos abrir el archivo. Puede estar dañado.',
  },
  ARCHIVO_INVALIDO: {
    status: 400,
    title: 'Archivo inválido',
    mensaje: 'El archivo no cumple los requisitos.',
  },
  // Contenido
  LUGAR_EN_USO: {
    status: 409,
    title: 'Lugar en uso',
    mensaje: 'Este lugar se usa en otra parte. Quita esa referencia primero.',
  },
  RECURSO_EN_USO: {
    status: 409,
    title: 'En uso',
    mensaje: 'Se usa en otra parte. Quita esa referencia primero.',
  },
  // Invitados
  ASISTENTE_YA_REGISTRADO: {
    status: 409,
    title: 'Ya está en la lista',
    mensaje: 'Esa persona ya está en la lista.',
  },
  ASISTENTE_POSIBLE_DUPLICADO: {
    status: 409,
    title: 'Posible duplicado',
    mensaje: 'Hay alguien con un nombre muy parecido en la lista.',
  },
  INVITACION_YA_USADA: {
    status: 409,
    title: 'Invitación ya usada',
    mensaje: 'Esta persona ya abrió su invitación. Si cambió de celular, se hace en la puerta.',
  },
  // Acceso del asistente (HU-306, API §2.1 y §12)
  DISPOSITIVO_YA_VINCULADO: {
    status: 409,
    title: 'Navegador con otra entrada',
    mensaje: 'Este navegador ya tiene otra entrada en este evento.',
  },
  DISPOSITIVO_NO_VINCULADO: {
    status: 403,
    title: 'Entrada abierta en otro celular',
    mensaje: 'Este celular no tiene tu acceso. Pídelo en la puerta.',
  },
  NAVEGADOR_NO_SOPORTADO: {
    status: 422,
    title: 'Navegador no soportado',
    mensaje: 'Abre el enlace en Chrome o Safari, no dentro de otra app.',
  },
  // Puerta (HU-301, HU-302)
  CHECK_IN_YA_HECHO: {
    status: 409,
    title: 'Ya está presente',
    mensaje: 'Esta persona ya está presente.',
  },
  ALERTA_YA_ATENDIDA: {
    status: 409,
    title: 'Aviso tomado',
    mensaje: 'Otra persona ya está atendiendo este aviso.',
  },
  REGISTRO_PUERTA_CERRADO: {
    status: 422,
    title: 'Registro cerrado',
    mensaje: 'El registro en la puerta está cerrado para este evento.',
  },
  LIMITE_REGISTRO_ALCANZADO: {
    status: 422,
    title: 'Límite de registros',
    mensaje: 'Se alcanzó el límite de registros en puerta.',
  },
  ASISTENTE_CANCELADO: {
    status: 422,
    title: 'Fuera de la lista',
    mensaje: 'Esta persona ya no está en la lista del evento.',
  },
  MOTIVO_REQUERIDO: {
    status: 422,
    title: 'Falta el motivo',
    mensaje: 'Esta persona ya tiene un celular vinculado. Indica el motivo para cambiarlo.',
  },
  QR_ASISTENTE_VENCIDO: {
    status: 422,
    title: 'Acceso vencido',
    mensaje: 'El código venció. Pide al registrador que lo genere de nuevo.',
  },
  FIRMA_INVALIDA: {
    status: 403,
    title: 'Firma inválida',
    mensaje: 'No pudimos verificar tu celular. Pide ayuda en la puerta.',
  },
  IMPORTACION_INVALIDA: {
    status: 422,
    title: 'Archivo no válido',
    mensaje: 'No encontramos la columna del nombre.',
  },
  OPERACION_NO_LISTA: {
    status: 409,
    title: 'Operación no lista',
    mensaje: 'La operación todavía no terminó o ya venció.',
  },
  // Catálogo
  STOCK_MENOR_A_COMPROMETIDO: {
    status: 422,
    title: 'Stock menor a lo comprometido',
    mensaje: 'El stock no puede ser menor que lo reservado y lo ya entregado.',
  },
  PREMIO_CON_CANJES: {
    status: 409,
    title: 'Premio con canjes',
    mensaje: 'Este premio ya tuvo canjes. Puedes ocultarlo.',
  },
  // Evento
  EVENTO_NO_PUBLICABLE: {
    status: 422,
    title: 'Falta completar el evento',
    mensaje: 'Todavía falta completar algo para publicar el evento.',
  },
  EVENTO_SIN_CONTRATO: {
    status: 409,
    title: 'Todavía no está en Stellar',
    mensaje: 'Todavía estamos registrando el evento en Stellar. Prueba en un minuto.',
  },
  VERIFICACION_FALLIDA: {
    status: 422,
    title: 'Verificación fallida',
    mensaje: 'No pudimos comprobar que no eres un robot. Recarga la página.',
  },
  CONFIRMACION_INVALIDA: {
    status: 422,
    title: 'Confirmación inválida',
    mensaje: 'Escribe CERRAR para confirmar.',
  },
  TRANSICION_NO_PERMITIDA: {
    status: 409,
    title: 'Cambio de estado no permitido',
    mensaje: 'El evento no está en un estado que permita este cambio. Recarga la página.',
  },
  EVENTO_NO_ACTIVO: {
    status: 422,
    title: 'Evento no activo',
    mensaje: 'El evento no está en curso.',
  },
  EVENTO_CERRADO: {
    status: 422,
    title: 'Evento cerrado',
    mensaje: 'El evento ya cerró. Los puntos vencieron.',
  },
  // Retos y puntos
  QR_INVALIDO: {
    status: 422,
    title: 'QR no válido',
    mensaje: 'Este QR no es de Pasitos o no es de este evento.',
  },
  AJUSTE_PROPIO: {
    status: 403,
    title: 'Ajuste propio',
    mensaje: 'No puedes ajustar tus propios puntos.',
  },
  YA_ANULADO: {
    status: 409,
    title: 'Ya anulado',
    mensaje: 'Esto ya se anuló.',
  },
  PIN_INVALIDO: {
    status: 403,
    title: 'PIN incorrecto',
    mensaje: 'El PIN no es correcto.',
  },
  QR_VENCIDO: {
    status: 422,
    title: 'QR vencido',
    mensaje: 'Este QR ya venció. Escanea el que se ve ahora en la pantalla.',
  },
  QR_REGISTRO_INVALIDO: {
    status: 404,
    title: 'QR de registro inválido',
    mensaje: 'Este QR no es de Pasitos o está incompleto. Busca a alguien del equipo.',
  },
  QR_REGISTRO_VENCIDO: {
    status: 422,
    title: 'QR de registro vencido',
    mensaje: 'Este QR ya cambió. Escanea el que se ve ahora.',
  },
  QR_REGISTRO_INACTIVO: {
    status: 422,
    title: 'QR de registro inactivo',
    mensaje: 'Este QR ya no está activo. Busca a alguien del equipo.',
  },
  QR_NO_ASIGNADO: {
    status: 403,
    title: 'QR de otra persona',
    mensaje: 'Este QR de registro lo muestra otra persona o una tablet.',
  },
  PERMISO_REGISTRO_VENCIDO: {
    status: 422,
    title: 'Permiso de registro vencido',
    mensaje: 'Pasó mucho tiempo. Vuelve a escanear el QR.',
  },
  GRUPO_EN_USO: {
    status: 409,
    title: 'Grupo en uso',
    mensaje: 'Este grupo tiene personas, retos, premios o QR de registro. Quítalos primero.',
  },
  SOLO_PARA_GRUPO: {
    status: 403,
    title: 'Solo para un grupo',
    mensaje: 'Esto es solo para las personas de un grupo.',
  },
  CI_YA_VERIFICADO: {
    status: 409,
    title: 'Carnet ya verificado',
    mensaje: 'Este carnet ya está verificado y no se puede cambiar.',
  },
  CI_VERIFICADO_EN_OTRA_CUENTA: {
    status: 409,
    title: 'Carnet en otra cuenta',
    mensaje: 'Este carnet ya se verificó en otra cuenta del evento.',
  },
  NO_VERIFICA_CI: {
    status: 403,
    title: 'No verifica carnets',
    mensaje: 'No tienes permiso para verificar carnets en este evento.',
  },
  VERIFICACION_CI_INACTIVA: {
    status: 422,
    title: 'Verificación apagada',
    mensaje: 'La verificación de carnet no está activada en este evento.',
  },
  FOTO_EN_REVISION: {
    status: 409,
    title: 'Foto en revisión',
    mensaje: 'Ya tienes una foto en revisión en este reto. Espera la respuesta.',
  },
  INTENTOS_AGOTADOS: {
    status: 422,
    title: 'Sin intentos',
    mensaje: 'Ya usaste todos los intentos de este reto.',
  },
  AUTORIZACION_REQUERIDA: {
    status: 422,
    title: 'Falta la autorización',
    mensaje: 'Este reto es para difusión: marca la autorización de uso para enviar tu foto.',
  },
  FOTO_NO_DISPONIBLE: {
    status: 404,
    title: 'Foto no disponible',
    mensaje: 'Esta foto no existe o no te toca revisarla.',
  },
  FOTO_YA_TOMADA: {
    status: 409,
    title: 'Foto tomada',
    mensaje: 'Esta foto la está revisando otra persona.',
  },
  FOTO_YA_REVISADA: {
    status: 409,
    title: 'Foto ya revisada',
    mensaje: 'Esta foto ya se revisó.',
  },
  CONFIRMAR_RIESGO: {
    status: 422,
    title: 'Falta confirmar el riesgo',
    mensaje: 'Un QR fijo se puede copiar y compartir. Marca «Entiendo los riesgos» para crearlo.',
  },
  QR_YA_USADO: {
    status: 409,
    title: 'QR usado',
    mensaje: 'Este código ya fue usado.',
  },
  SIN_CHECK_IN: {
    status: 422,
    title: 'Falta el check-in',
    mensaje: 'Primero marca tu asistencia en la puerta.',
  },
  RETO_YA_COMPLETADO: {
    status: 409,
    title: 'Reto ya completado',
    mensaje: 'Ya completaste este reto.',
  },
  RETO_NO_DISPONIBLE: {
    status: 422,
    title: 'Reto no disponible',
    mensaje: 'Este reto no está activo ahora.',
  },
  RETO_CON_PARTICIPACIONES: {
    status: 409,
    title: 'Reto con participaciones',
    mensaje: 'Este reto ya tiene participaciones. Puedes desactivarlo.',
  },
  TOPE_NO_BAJA: {
    status: 422,
    title: 'El tope solo sube',
    mensaje: 'Una vez publicado, el tope de un reto solo puede subir.',
  },
  TOPE_ALCANZADO: {
    status: 422,
    title: 'Tope alcanzado',
    mensaje: 'Este reto ya entregó todos sus premios.',
  },
  TOPE_PUNTOS_PERSONA: {
    status: 422,
    title: 'Máximo de puntos alcanzado',
    mensaje: 'Llegaste al máximo de puntos de este evento.',
  },
  // Canjes
  SALDO_INSUFICIENTE: {
    status: 409,
    title: 'Saldo insuficiente',
    mensaje: 'Te faltan puntos para este canje.',
  },
  PREMIO_AGOTADO: {
    status: 409,
    title: 'Premio agotado',
    mensaje: 'Este premio se agotó.',
  },
  CANJE_VENCIDO: {
    status: 422,
    title: 'Cobro vencido',
    mensaje: 'El cobro venció. Pide que generen uno nuevo.',
  },
  CANJE_YA_CONFIRMADO: {
    status: 409,
    title: 'Cobro pagado',
    mensaje: 'Este canje ya se confirmó.',
  },
  MAXIMO_POR_PERSONA: {
    status: 422,
    title: 'Máximo por persona',
    mensaje: 'Ya canjeaste el máximo de este premio.',
  },
} as const satisfies Record<string, DefinicionError>;

export interface DefinicionError {
  readonly status: number;
  readonly title: string;
  readonly mensaje: string;
}

export type CodigoError = keyof typeof CATALOGO_ERRORES;

/** Error de un campo, solo en `VALIDACION`. */
export interface ErrorDeCampo {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

/** Cuerpo de una respuesta de error (Problem Details, RFC 9457, con extensiones). */
export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly code: CodigoError;
  readonly detail: string;
  readonly traceId: string;
  readonly errors?: readonly ErrorDeCampo[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** `urn:pasitos:error:<codigo-en-kebab>` mientras no exista el dominio. */
export function buildTipoError(code: CodigoError): string {
  return `urn:pasitos:error:${code.toLowerCase().replaceAll('_', '-')}`;
}

export function isCodigoError(valor: string): valor is CodigoError {
  return Object.hasOwn(CATALOGO_ERRORES, valor);
}
