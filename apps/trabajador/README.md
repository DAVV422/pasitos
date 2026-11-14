# Trabajador

Aplicación NestJS sin HTTP para las colas de pg-boss (esquema `pgboss`). Hoy corre el **sellador** y los trabajos del contrato (HU-103); después se suman correos, borrado a los 30 días y reportes.

- `tick-sellador`, cada minuto: encola `anchor-lote` para cada evento con contrato.
- `stellar`, de a un trabajo por vez en todo el sistema (y con un candado de PostgreSQL): `anchor-lote`, `deploy-contrato`, `sync-retos`, `register-pantallas` y `close-contrato`.
- Cada lote pasa por `armado` → `enviado` → `confirmado` (o `rechazado`, que detiene el sellado de ese evento y alerta). Cada ejecución empieza mirando el estado, así que un reinicio retoma donde quedó.
- `check-saldo-operador`, cada hora: alerta si el saldo alcanza para menos de 30 días y, debajo de 1 000 XLM, pide más a Friendbot (HU-104).
- **Costo de red (HU-104):** cada intento enviado queda en `transacciones_stellar`. Si la simulación de un `anchor` pide más que `STELLAR_COMISION_MAX_STROOPS`, el lote espera al ciclo siguiente (alerta a los 30 min); la preparación del contrato tiene su propio tope; el cierre se envía igual y alerta. El tick alerta al pasar el 80 % y el 100 % del presupuesto del mes.
- **Al cerrar el contrato (HU-105):** guarda `evidencia-stellar.json` en `ARCHIVOS_DIR/publicos/<organización>/<evento>/`, con el estado del contrato y el XDR de cada transacción que entró, y su SHA-256 en `eventos.evidencia_sha256`.
- El intervalo de anclaje de cada evento se lee en cada ciclo: un cambio vale desde el minuto siguiente.
- La llave del operador se lee de `STELLAR_OPERADOR_LLAVE_ARCHIVO` y solo vive en memoria. `STELLAR_RED=mainnet` no arranca (D50).

## Comandos

| Comando | Qué hace |
|---|---|
| `nx serve trabajador` | Arranca en desarrollo (lee `.env`) |
| `nx build trabajador` | Build de producción |
| `nx test trabajador` | Tests |
| `nx lint trabajador` | Lint |
| `pnpm stellar:trabajo <trabajo> --evento <slug> [--directo]` | Encola un trabajo de Stellar, o lo corre en el momento con `--directo` |
| `pnpm stellar:medir --red <red>` | Mide el costo de cada operación del contrato (crea contratos de prueba; no toca la base) |
| `pnpm stellar:verificar --evento <slug> [--evidencia <archivo>]` | Recalcula las huellas desde los movimientos y las compara con el contrato o con la evidencia. Sale con 1 si algo no coincide |
| `pnpm plataforma intervalo --evento <slug> --minutos <n\|plataforma> --motivo "…"` | Cambia el intervalo de anclaje (lo deja en la bitácora). Vive en el API |
| `pnpm sellador:rearmar --evento <slug> --lote <n> --motivo "…"` | Rearma un lote rechazado con los mismos movimientos (queda en la bitácora) |

**Para probar con la red local:** `pnpm stellar:levantar`, `pnpm stellar:cuentas --red local`, `pnpm contrato:instalar --red local` y copiar al `.env` lo que imprimen. La prueba `red-local.int.spec.ts` corre si están las variables `STELLAR_PRUEBAS_*` (en el CI, el job *Sellador con red local*).

## Reglas

Las del repositorio: [AGENTS.md](../../AGENTS.md) y [docs/09-desarrollo/](../../docs/09-desarrollo/README.md).
