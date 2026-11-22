/**
 * Catálogo de acciones de la bitácora (HU-213 §2, D35): `<objeto>.<verbo>` en inglés y el texto en
 * español que ve el dueño. Toda escritura del equipo y de la consola usa una de estas.
 */
export const ACCIONES_BITACORA = {
  // Evento
  'evento.create': 'Creó el evento',
  'evento.update': 'Editó el evento',
  'evento.publish': 'Publicó el evento',
  'evento.open': 'Abrió el evento',
  'evento.pause': 'Pausó el evento',
  'evento.resume': 'Reanudó el evento',
  'evento.close': 'Cerró el evento',
  'evento.cierre_programar': 'Programó el cierre del evento',
  'evento.ubicacion.update': 'Cambió la ubicación',
  'evento.intervalo_anclaje.update': 'Cambió cada cuánto se ancla en Stellar',
  // Reporte (HU-402)
  'reporte.publicar': 'Compartió el reporte con un enlace público',
  'reporte.despublicar': 'Dejó de compartir el reporte',
  'reporte.cambiar_enlace': 'Cambió el enlace público del reporte',
  'reporte.descargar': 'Descargó el reporte',
  'reporte.regenerar': 'Regeneró el reporte',
  // Contenido
  'lugar.create': 'Creó un lugar',
  'lugar.update': 'Editó un lugar',
  'lugar.delete': 'Borró un lugar',
  'actividad.create': 'Creó una actividad de la agenda',
  'actividad.update': 'Editó una actividad de la agenda',
  'actividad.delete': 'Borró una actividad de la agenda',
  'sponsor.create': 'Agregó un sponsor',
  'sponsor.update': 'Editó un sponsor',
  'sponsor.delete': 'Quitó un sponsor',
  'pregunta.create': 'Agregó una pregunta frecuente',
  'pregunta.update': 'Editó una pregunta frecuente',
  'pregunta.delete': 'Borró una pregunta frecuente',
  'preguntas.reorder': 'Reordenó las preguntas frecuentes',
  'archivo.upload': 'Subió un archivo',
  'archivo.replace': 'Reemplazó un archivo',
  // Retos y catálogo
  'reto.create': 'Creó un reto',
  'reto.update': 'Editó un reto',
  'reto.delete': 'Borró un reto',
  'reto.deactivate': 'Desactivó un reto',
  'reto.activate': 'Activó un reto',
  'premio.create': 'Agregó un premio',
  'premio.update': 'Editó un premio',
  'premio.delete': 'Borró un premio',
  'premio.hide': 'Ocultó un premio',
  'premio.show': 'Volvió a mostrar un premio',
  // Equipo
  'miembro.invite': 'Invitó a un miembro del equipo',
  'miembro.resend': 'Reenvió una invitación al equipo',
  'miembro.accept': 'Aceptó la invitación al equipo',
  'miembro.update': 'Cambió el rol o las terminales de un miembro',
  'miembro.remove': 'Quitó a un miembro del equipo',
  // Terminales
  'pantalla.create': 'Creó una pantalla',
  'pantalla.update': 'Editó una pantalla',
  'pantalla.connect': 'Conectó una pantalla',
  'pantalla.disconnect': 'Desconectó una pantalla',
  'pantalla.replace': 'Reemplazó la tablet de una pantalla',
  'pantalla.control': 'Usó los controles de una pantalla',
  'puntos.ajustar': 'Ajustó puntos',
  'reto.otorgar': 'Otorgó un reto a mano',
  'canje.anular': 'Anuló un canje',
  // HU-412.
  'canje.manual': 'Canjeó un premio a mano',
  'mesa.create': 'Creó una mesa',
  'mesa.update': 'Editó una mesa',
  'mesa.connect': 'Conectó una mesa',
  'mesa.disconnect': 'Desconectó una mesa',
  // Invitados
  'asistente.create': 'Agregó un invitado',
  'asistente.update': 'Editó un invitado',
  'asistente.cancel': 'Anuló a un invitado',
  'importacion.confirm': 'Importó invitados',
  'invitaciones.send': 'Envió invitaciones',
  'invitacion.resend': 'Reenvió una invitación',
  'invitaciones.enlaces.view': 'Vio o descargó enlaces de invitación',
  'invitados.export': 'Descargó la lista de invitados',
  // Puerta
  'puerta.config.update': 'Cambió la configuración de la puerta',
  'asistente.check_in': 'Marcó presente a un invitado',
  'asistente.check_in_anular': 'Deshizo el check-in de un invitado',
  'acceso.create': 'Generó un QR de asistente',
  'asistente.revincular': 'Cambió el celular de un invitado',
  'asistente.registrar_puerta': 'Registró a alguien en la puerta',
  'asistente.autoregistro': 'Se registró con un QR',
  'asistente.editar_datos': 'Editó sus datos',
  'ci.verify': 'Verificó un carnet',
  'ci.reject': 'Marcó que un carnet no coincide',
  'ci.unverify': 'Deshizo la verificación de un carnet',
  'foto.descargar': 'Descargó las fotos para redes',
  'foto.retirar_autorizacion': 'Retiró la autorización de uso de su foto',
  'foto.aprobar': 'Aprobó una foto',
  'foto.rechazar': 'Rechazó una foto',
  'foto.anular': 'Deshizo la aprobación de una foto',
  'grupo.create': 'Creó un grupo',
  'grupo.update': 'Editó un grupo',
  'grupo.delete': 'Borró un grupo',
  'grupo.agregar': 'Agregó personas a un grupo',
  'grupo.quitar': 'Quitó a una persona de un grupo',
  'qr_registro.create': 'Creó un QR de registro',
  'qr_registro.update': 'Editó un QR de registro',
  'qr_registro.invalidate': 'Invalidó un QR de registro',
  'qr_registro.download': 'Descargó un QR de registro para imprimir',
  'alerta.atender': 'Tomó un aviso para atenderlo',
  'alerta.resolver': 'Resolvió un aviso',
  // Plataforma (evento_id nulo, salvo las que tocan un evento)
  'organizacion.create': 'Creó una organización',
  'organizacion.update': 'Editó una organización',
  'organizacion.suspend': 'Suspendió una organización',
  'organizacion.reactivate': 'Reactivó una organización',
  'organizacion.dueno.invite': 'Invitó al dueño de una organización',
  'organizacion.dueno.accept': 'Aceptó ser dueño de una organización',
  'plataforma.usuario.create': 'Nombró a una persona de Pasitos',
  // HU-410: la bandeja de contactos.
  'contacto.ver': 'Vio un mensaje de contacto',
  'contacto.actualizar': 'Actualizó un mensaje de contacto',
  'plataforma.usuario.update': 'Cambió el rol de una persona de Pasitos',
  'plataforma.usuario.accept': 'Aceptó el acceso a la consola',
  'plataforma.evento_prueba.create': 'Creó un evento de prueba',
  'usuario.segundo_factor.reset': 'Restableció el segundo factor de una persona',
} as const satisfies Record<string, string>;

export type AccionBitacora = keyof typeof ACCIONES_BITACORA;

export function isAccionBitacora(valor: string): valor is AccionBitacora {
  return Object.hasOwn(ACCIONES_BITACORA, valor);
}

export function getTextoAccion(accion: string): string {
  return isAccionBitacora(accion) ? ACCIONES_BITACORA[accion] : accion;
}
