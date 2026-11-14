# @pasitos/firmas

Huellas del libro, JSON canónico (RFC 8785), raíz Merkle, pruebas de inclusión e ID anónimo (HU-102). Funciona igual en Node y en el navegador (`crypto.subtle`, sin `Buffer`). Las firmas P-256 y el QR `PX1` llegan en la fase 3.

**Vectores compartidos:** `vectores/huellas.json` lo genera `pnpm vectores` (`tools/vectores/generar.py`, un cálculo independiente en Python). Lo prueban esta librería y el contrato en Rust; no se edita a mano.

## Comandos

| Comando | Qué hace |
|---|---|
| `nx test firmas` | Tests |
| `nx lint firmas` | Lint |

## Reglas

Las del repositorio: [AGENTS.md](../../AGENTS.md) y [docs/09-desarrollo/](../../docs/09-desarrollo/README.md).
