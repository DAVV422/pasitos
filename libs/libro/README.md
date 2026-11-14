# libro

Libro de movimientos de puntos (D22, HU-101): **la única forma de mover puntos**. La usan el API (`MovimientosModule`) y el trabajador, con las mismas reglas.

- `LibroService.addMovimiento(tx, nuevo)` agrega un movimiento **dentro de la transacción de quien llama**. Bloquea el saldo y después el reto, valida saldo, tope del reto, veces por persona y tope de puntos por persona, y escribe el movimiento, la participación, el saldo y el aviso en `outbox`.
- Las reglas puras están en `libs/dominio/movimientos`; el esquema y la migración, en `libs/db`.
- La base es la última defensa: `UNIQUE` en `participaciones`, `CHECK` en `saldos` y `retos`, y triggers de solo agregar.

## Comandos

```bash
nx test libro                                  # unitarias e integración (requiere Docker)
pnpm semilla:movimientos --asistentes 50       # evento de prueba con movimientos (Hito A)
```

## Reglas

[Backend §4](../../docs/09-desarrollo/02-backend.md#4-reglas-del-libro-de-movimientos) · [Libro y anclaje](../../docs/04-tecnico/07-libro-y-anclaje.md)
