# Pitch y video de demo

> **Estado:** 📦 histórico (hackathon de octubre de 2026). El guion del pitch es la última versión preparada (ya con el modelo de negocio actual). El slogan del pitch se actualizó a *"Cada paso cuenta"*. Sirve como base para futuras presentaciones (SCF, financiadores).

Eran **dos entregables separados**:

| | Pitch | Video de demo |
|---|---|---|
| Duración | **3 minutos** | 2–3 minutos |
| Objetivo | Convencer de que el problema es real, la solución tiene sentido, Stellar aporta y el equipo puede ejecutarla | Probar que la app funciona de verdad, on-chain |
| La app aparece | Solo un vistazo: menos de 20 s con 3 capturas | El flujo completo |

---

## Parte A · Pitch de 3 minutos

### 1. Reglas

- **3 minutos son unas 420 palabras** en español. Ensayar con cronómetro hasta bajar de 2:55.
- **Una idea por slide.**
- **La app aparece solo con 3 capturas** (menos de 20 segundos): el QR que cambia, el saldo de puntos con el mensaje de reto completado y el reporte verificable.
- **Lo más fuerte son los datos de las entrevistas** y una fecha de piloto.

### 2. Estructura (7 slides)

| # | Slide | Tiempo | Idea |
|---|---|---|---|
| 1 | Gancho | 0:00–0:15 | Todos nos fuimos de un evento antes del cierre |
| 2 | Problema | 0:15–0:45 | Quien financia un evento no puede comprobar qué logró |
| 3 | Solución + app | 0:45–1:20 | Retos → puntos → canje, más el reporte verificable |
| 4 | Por qué Stellar | 1:20–1:45 | Registro público que nadie puede alterar, rápido y barato |
| 5 | Validación | 1:45–2:10 | Entrevistas, frases y piloto |
| 6 | Modelo de negocio | 2:10–2:30 | Gratis para comunidades, pagan los financiadores |
| 7 | Equipo y cierre | 2:30–3:00 | Organizamos eventos. Slogan |

### 3. Guion (completar los `[ ]` con datos reales)

**1 · Gancho**
> ¿Quién se fue alguna vez de un evento antes de la última charla? *(pausa)* Nosotros organizamos eventos, y sabemos que a las cinco de la tarde el auditorio se ve así.

**2 · Problema**
> Y al final del evento, el organizador le manda al sponsor… fotos. BAF y Stellar patrocinan este hackathon. ¿Cuántos de nosotros hicimos nuestra primera transacción en Stellar? Hoy no lo saben con certeza. Como nos dijo [nombre, rol]: *"[frase de la entrevista]"*.

**3 · Solución**
> Pasitos convierte la participación en puntos. Los asistentes cumplen retos —ir a una charla, quedarse al cierre, hacer su primera transacción en Stellar— y canjean sus puntos por café, meriendas o merch. Esos puntos solo valen dentro del evento. *(capturas)* Y al terminar, el organizador comparte un reporte que el sponsor puede verificar por sí mismo.

**4 · Por qué Stellar**
> Usamos Stellar porque cada participación queda en un registro público que nadie puede alterar, ni nosotros. Y la red hace cumplir las reglas: los puntos no pueden salir del evento. Cada movimiento cuesta una fracción de centavo y se confirma en segundos.

**5 · Validación**
> Hablamos con [N] organizadores, [N] financiadores y [N] asistentes. El [X] % de los asistentes haría retos por merch, y [nombre del evento] ya aceptó un piloto el [fecha].

**6 · Modelo de negocio**
> Es gratis para comunidades aprobadas. Pagan quienes necesitan demostrar impacto: fundaciones, ecosistemas como Stellar, universidades. Y las ferias pagan una comisión por las ventas.

**7 · Cierre**
> Somos [nombres]. Organizamos eventos y conocemos a quienes los organizan. Pasitos: **cada paso cuenta.** Gracias.

Las respuestas a preguntas difíciles están en [Cómo explicar Pasitos](../01-producto/05-como-explicar-pasitos.md#preguntas-difíciles-respuestas-cortas).

### 4. Checklist del pitch

- [ ] Guion por debajo de 2:55 en 3 ensayos seguidos.
- [ ] Datos reales de las entrevistas en las slides 2 y 5.
- [ ] Las 3 capturas de la app pulidas.
- [ ] Respuestas a preguntas difíciles repartidas entre los tres.
- [ ] Presentación exportada a PDF por si falla internet.
- [ ] Video de demo subido y con el enlace probado en modo incógnito.

---

## Parte B · Video de demo

**Objetivo:** mostrar que todo funciona de verdad, con transacciones reales en Stellar testnet.

### 5. Guion del video

| # | Escena | Qué se ve | Narración (resumen) |
|---|---|---|---|
| 1 | Contexto | Título + "Stellar testnet" | "Esta es la app funcionando en Stellar testnet." |
| 2 | Ingreso | `/app?ticket=TICK-001` → saldo en 0 | "La asistente entra con su entrada; la cuenta se crea sola." |
| 3 | Reto | Escaneo del QR de la charla de *Nimbora Cloud* → *Verificando…* → +20 PTS; el contador de la sala sube | "Asistió a la charla: puntos verificados on-chain." |
| 4 | Antifraude | Segundo escaneo → *"Ya completaste este reto"* | "El contrato no deja reclamar dos veces." |
| 5 | QR vencido | Escaneo de una captura vieja → *"El código cambió"* | "Una foto del QR enviada por WhatsApp no sirve." |
| 6 | Reto automático | Primera transacción en Stellar → +40 PTS sin QR | "Algunos retos se verifican solos en la red." |
| 7 | Canje | `/merchant` cobra un café en puntos → aviso verde | "Los puntos se canjean dentro del evento." |
| 8 | Circuito cerrado | *"Enviar a wallet externa"* → modal de rechazo → transacción fallida en Stellar Expert | "La red rechaza la transferencia: los puntos no salen del evento." |
| 9 | Panel | `/admin` → participaciones por reto y por sponsor, enlaces a Stellar Expert | "El organizador ve todo en vivo." |
| 10 | Cierre | *Cerrar evento* → puntos en 0 | "Al cierre, los puntos vencen." |
| 11 | Reporte | `/reporte/foro-tech-2026` → "Verifícalo tú mismo" | "Y el sponsor recibe un reporte que puede comprobar." |
| (opc.) | Variante Feria | Pago en USD con cashback y reembolso | "En ferias, también se puede pagar con un saldo en dólares reembolsable." |

### 6. Cómo grabarlo

- Grabar la pantalla del celular con espejado (ej. `scrcpy` en Android o QuickTime con iPhone) junto a la pantalla de la computadora, para que se vean el celular y el panel a la vez.
- **Se pueden recortar las esperas** de confirmación (~5 s), **pero no simular resultados**: cada transacción mostrada tiene que existir en Stellar Expert. Mostrar al menos un hash completo en pantalla.
- Subtítulos o rótulos breves en cada escena (mucha gente ve los videos sin sonido).
- Correr el reset de demo antes de cada toma.
- Grabar la escena del circuito cerrado aparte y más de una vez: es la más importante.
- Configurar la ventana del reto de "charla de cierre" según la hora de grabación.

### 7. Checklist del video

- [ ] Todas las escenas grabadas en testnet con datos de demo limpios.
- [ ] Solo sponsors ficticios en pantalla (Nimbora Cloud, Quillu Pay, Kodara Academy).
- [ ] Al menos un hash de transacción visible y verificable.
- [ ] Duración dentro del límite.
- [ ] Exportado en 1080p y con el enlace probado en modo incógnito.
