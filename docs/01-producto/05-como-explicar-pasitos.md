# Cómo explicar Pasitos

> **Estado:** vigente · **Última revisión:** 2026-11-03

## En 10 segundos

> Pasitos da puntos a los asistentes de un evento por participar, y le da al organizador un reporte verificable para sus sponsors.

## En 30 segundos

> En los eventos, la gente se va antes del cierre y el sponsor nunca sabe qué logró su apoyo: solo recibe fotos. Con Pasitos, los asistentes cumplen retos y ganan puntos que canjean por café o merch dentro del evento. Al final, el organizador comparte un reporte con datos que el sponsor puede verificar, porque quedan registrados en la red Stellar y nadie los puede alterar.

## En 2 minutos (para un posible cliente)

1. **Pregunta:** "¿Qué le entregaste a tu último sponsor?" (deja que responda).
2. **Problema:** "La mayoría solo puede mandar fotos. El sponsor no sabe qué logró."
3. **Cómo funciona:** retos → puntos → canje dentro del evento.
4. **El reporte:** "Al final tienes un link con asistentes, participaciones por sponsor y retención, y todo se puede verificar."
5. **Precio:** "Para comunidades es gratis con aprobación. Si quieres estadísticas más completas, cuesta poco, y lo puedes incluir en el patrocinio."
6. **Cierre:** "¿Tienes un evento próximo donde lo probemos?"

## Si alguien pregunta "¿esto es cripto?"

> Usa la tecnología de Stellar por detrás para que los datos sean verificables, pero el asistente no tiene que saber nada de cripto. Entra con un QR, gana puntos y los canjea. Los puntos no son dinero.

## Cómo NO presentarlo

- ❌ "Tickets NFT en Stellar." (Hay decenas de proyectos así y casi ninguno llegó a producción.)
- ❌ "Programa de puntos de lealtad con blockchain."
- ✅ "Quien financia un evento no puede comprobar qué logró su aporte. Con Pasitos, los asistentes participan más y el organizador entrega un reporte que el sponsor verifica por sí mismo."

## Preguntas difíciles: respuestas cortas

| Pregunta | Respuesta |
|---|---|
| ¿Por qué blockchain y no una base de datos? | Con una base de datos, el sponsor tiene que confiar en nosotros. En Stellar, los números están en un registro público que nadie puede alterar, y el sponsor los comprueba por sí mismo. Cada 5 minutos sellamos en Stellar una huella del libro de movimientos: si alguien cambiara un número después, no coincidiría. Y el contrato rechaza cualquier sello que entregue más premios que el tope de un reto. |
| ¿No es lo mismo que Stellar Passport? | Passport crea wallets en eventos. Nosotros agregamos la economía del evento (puntos, canje, retención) y el reporte para financiadores. Queremos integrarnos con ellos. |
| ¿Quién paga si las comunidades no tienen dinero? | Las comunidades usan Pasitos gratis. Pagan los financiadores que necesitan reportar, y las comunidades pueden cobrarle al sponsor las estadísticas avanzadas dentro del patrocinio. |
| ¿Cuánto les cuesta la red? | Unos pocos dólares por un evento de 300 personas (ver [costos de red](../04-tecnico/04-costos-de-red.md)). Lo cubrimos con un presupuesto mensual fijo. |
| ¿Se pueden hacer trampas? | Una cuenta por entrada, un QR que cambia cada 30 segundos y un contrato que permite cada reto una sola vez. |
| ¿Quién guarda las cuentas de los asistentes? | En el MVP, nuestro servidor, y solo en la red de pruebas. En la versión real, cada asistente firma con su huella o Face ID. |
| ¿Se pueden robar o revender puntos? | No hay forma de enviar puntos a otra persona: solo se canjean en el evento. |
| ¿Los puntos son dinero? | No. No se compran, no se convierten en dinero y vencen al cierre del evento. |
| ¿Es legal en Bolivia? | Los puntos no son dinero electrónico. El saldo en dólares (solo en ferias) se opera a través de un proveedor autorizado. Ver [legal](../05-seguridad-legal/02-legal-y-cumplimiento.md). |
| ¿Y si no hay internet en el evento? | Está previsto para la versión real (vouchers firmados offline). No está en el MVP. |
