/**
 * Los textos de la landing (HU-404), en un solo lugar: se cambian aquí sin tocar la página.
 * Borrador en docs/version-piloto/implementacion/fase-4/textos.md. Tono: Marca §6 (cercano,
 * honesto, concreto; nada de "tokens" ni "wallet").
 */
export const TEXTOS_LANDING = {
  portada: {
    slogan: 'Cada paso cuenta.',
    apoyo: 'Puntos por quedarse, reportes que se pueden comprobar.',
    bajada:
      'Los asistentes ganan puntos por participar y los canjean por premios, desde el celular y sin descargar nada. Tú y tus sponsors saben, de verdad, cuánta gente participó.',
    principal: 'Quiero usar Pasitos en mi evento',
    secundario: 'Cómo funciona',
  },
  problema: {
    titulo: 'Lo que pasa en muchos eventos',
    items: [
      'La gente se va antes del cierre.',
      'El merch se lo llevan unos pocos.',
      'Al sponsor solo le llegan fotos.',
    ],
  },
  comoFunciona: {
    titulo: 'Cómo funciona',
    pasos: [
      {
        titulo: 'Retos',
        texto:
          'Cada charla, stand o actividad tiene su reto: escanear el QR de la pantalla, mandar una foto o pasar por la mesa del sponsor.',
      },
      {
        titulo: 'Puntos',
        texto:
          'Cada reto suma puntos en el celular del asistente. Los canjea en la mesa por merch, meriendas o lo que ponga el organizador.',
      },
      {
        titulo: 'Reporte verificable',
        texto:
          'Al cerrar, el organizador recibe un reporte con la asistencia y la participación por charla y por sponsor, para compartirlo.',
      },
    ],
    roles: [
      {
        para: 'Asistente',
        titulo: 'Participa y gana',
        texto:
          'Abres tu entrada en el celular, escaneas los QR de las charlas y los stands, cumples retos y canjeas tus puntos por premios. Sin instalar nada.',
      },
      {
        para: 'Organizador',
        titulo: 'Arma tu evento en una tarde',
        texto:
          'Cargas la agenda, los retos y los premios, invitas a tu equipo y conectas las pantallas. El día del evento, la puerta, los canjes y las alertas se ven en vivo.',
      },
      {
        para: 'Sponsor',
        titulo: 'Sabe cuánta gente pasó por tu stand',
        texto:
          'Recibes un reporte con las visitas a tu stand y las participaciones en tus retos. Sin nombres ni datos personales: solo números que se pueden comprobar.',
      },
    ],
  },
  verificable: {
    titulo: 'Números que nadie puede inflar',
    texto:
      'Cada participación queda sellada en Stellar, una red pública que nadie controla ni puede modificar. Por eso cualquiera puede comprobar, con un botón, que el reporte del evento es el mismo que se registró en el momento.',
    nota: 'En el piloto usamos la red de pruebas de Stellar.',
  },
  preguntas: {
    titulo: 'Preguntas frecuentes',
    items: [
      {
        pregunta: '¿Cuánto cuesta?',
        respuesta:
          'Durante el piloto, nada. Lo usamos gratis con los primeros eventos para aprender con ellos.',
      },
      {
        pregunta: '¿Los asistentes tienen que instalar una app?',
        respuesta: 'No. Pasitos funciona en el navegador del celular: abren su enlace y listo.',
      },
      {
        pregunta: '¿Qué datos guardan de los asistentes?',
        respuesta:
          'Solo lo necesario para el evento: el nombre y, si quieren, el correo. Los datos técnicos del celular se borran 30 días después del evento. El detalle está en la política de privacidad.',
      },
      {
        pregunta: '¿Qué es Stellar? ¿Hay que pagar algo con criptomonedas?',
        respuesta:
          'Stellar es una red pública donde guardamos una huella de los números del evento, para que se puedan comprobar. Nadie paga ni recibe criptomonedas: los puntos no son dinero.',
      },
      {
        pregunta: '¿Y si no hay buena señal en el lugar?',
        respuesta:
          'La app guarda la información del evento en el celular, y las pantallas siguen mostrando sus QR aunque se les corte la conexión. Para ganar y canjear puntos, el celular sí necesita internet.',
      },
    ],
  },
  contacto: {
    titulo: '¿Quieres usar Pasitos en tu evento?',
    bajada: 'Cuéntanos de tu evento y te escribimos para armarlo juntos.',
  },
  pie: 'Hecho en Bolivia sobre la red Stellar · Piloto en su red de pruebas.',
} as const;
