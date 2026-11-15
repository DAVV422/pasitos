# correos

Cola de correos con tope diario (T-007 §3, D57). La usan el API (encolar) y el trabajador (enviar y reprogramar).

- `CorreosService.enqueue(tx, { tipo, destinatario, datos, refId })` encola **dentro de la transacción de quien llama**. Los datos tienen el tipo que piden los textos del catálogo (`@pasitos/dominio/correos`); si falta uno, falla al encolar.
- `CorreosService.estimateEntrega(cantidad, prioridad)` dice cuántos días tarda una tanda (aviso de HU-211).
- `cupo.ts`: cálculo puro del cupo de hoy y del día de salida, con el día en hora de Bolivia.

El envío está en `apps/trabajador/src/correos`. Los textos, en `libs/dominio/src/correos/catalogo.ts` y en ningún otro lugar.
