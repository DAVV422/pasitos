# -*- coding: utf-8 -*-
"""
Vectores de huellas compartidos (HU-102 §4).

Tercer cálculo, independiente del contrato (Rust) y de libs/firmas (TypeScript): los dos se
prueban contra el archivo que genera este script. Formato: Contrato y sellador §4.

    python tools/vectores/generar.py              # escribe libs/firmas/vectores/huellas.json
    python tools/vectores/generar.py --comprobar  # falla si el archivo no coincide (CI)
"""
import hashlib
import json
import sys
from pathlib import Path

DESTINO = Path(__file__).resolve().parents[2] / 'libs' / 'firmas' / 'vectores' / 'huellas.json'


def sha256(datos: bytes) -> bytes:
    return hashlib.sha256(datos).digest()


def jcs(valor) -> str:
    """JSON canónico (RFC 8785) para enteros, textos, listas y objetos con claves ASCII."""
    def revisar(v):
        if isinstance(v, bool) or v is None:
            return
        if isinstance(v, float):
            raise ValueError('El libro solo tiene enteros')
        if isinstance(v, dict):
            for x in v.values():
                revisar(x)
        if isinstance(v, list):
            for x in v:
                revisar(x)
    revisar(valor)
    return json.dumps(valor, sort_keys=True, separators=(',', ':'), ensure_ascii=False)


def evento_id_hash(evento_id: str) -> bytes:
    return sha256(evento_id.lower().encode('utf-8'))


def genesis(id_hash: bytes) -> bytes:
    return sha256(b'PASITOS-GENESIS-v1' + id_hash)


def huella(id_hash: bytes, n: int, anterior: bytes, raiz: bytes, conteos) -> bytes:
    cuerpo = b''.join(r.to_bytes(4, 'big') + c.to_bytes(4, 'big') for r, c in conteos)
    return sha256(b'PASITOS-LOTE-v1' + id_hash + n.to_bytes(4, 'big') + anterior + raiz + cuerpo)


def hoja(movimiento) -> bytes:
    return sha256(b'\x00' + jcs(movimiento).encode('utf-8'))


def nodo(izquierdo: bytes, derecho: bytes) -> bytes:
    return sha256(b'\x01' + izquierdo + derecho)


def niveles(hojas):
    """Todos los niveles del árbol, de las hojas a la raíz. El impar sube sin duplicarse."""
    actual = list(hojas)
    resultado = [actual]
    while len(actual) > 1:
        siguiente = [nodo(actual[i], actual[i + 1]) for i in range(0, len(actual) - 1, 2)]
        if len(actual) % 2 == 1:
            siguiente.append(actual[-1])
        actual = siguiente
        resultado.append(actual)
    return resultado


def raiz(hojas) -> bytes:
    if not hojas:
        raise ValueError('Un lote no puede estar vacío')
    return niveles(hojas)[-1][0]


def prueba(hojas, indice):
    pasos = []
    for nivel in niveles(hojas)[:-1]:
        hermano = indice ^ 1
        if hermano < len(nivel):
            pasos.append({'lado': 'izquierdo' if hermano < indice else 'derecho', 'hash': nivel[hermano].hex()})
        indice //= 2
    return pasos


def hojas_sinteticas(cantidad):
    return [sha256(f'hoja-{i}'.encode()) for i in range(cantidad)]


ASISTENTE = 'a7f3c9' + '0' * 58
FIRMA = 'MEUCIQDx4y2y0P9x8vVb7w6s5r4q3p2o1n0m9l8k7j6i5h4g3f2e1dA'

MOVIMIENTOS = [
    {'n': 1, 'tipo': 'checkin', 'asistente': ASISTENTE, 'puntos': 0, 'hora': '2026-11-21T13:00:05Z'},
    {'n': 2, 'tipo': 'reto', 'asistente': ASISTENTE, 'puntos': 20, 'reto': 7, 'pantalla': 2,
     'qr': {'e': 3, 'f': 20431, 'firma': FIRMA}, 'hora': '2026-11-21T14:02:15Z'},
    {'n': 3, 'tipo': 'reto', 'asistente': ASISTENTE, 'puntos': 15, 'reto': 2, 'pantalla': 1,
     'qr': {'e': 1, 'u': 'k3J9xQ', 'firma': FIRMA}, 'hora': '2026-11-21T14:10:00Z'},
    {'n': 4, 'tipo': 'canje', 'asistente': ASISTENTE, 'puntos': -30, 'hora': '2026-11-21T15:00:00Z'},
    {'n': 5, 'tipo': 'anulacion', 'asistente': ASISTENTE, 'puntos': 30, 'anula': 4,
     'autor': 'equipo #2', 'hora': '2026-11-21T15:05:00Z'},
    {'n': 6, 'tipo': 'ajuste', 'asistente': ASISTENTE, 'puntos': -5, 'autor': 'equipo #1',
     'motivo': 'Compensación', 'hora': '2026-11-21T16:00:00Z'},
    {'n': 7, 'tipo': 'vencimiento', 'asistente': ASISTENTE, 'puntos': -30, 'hora': '2026-11-21T20:00:00Z'},
]

JCS = [
    {'b': 1, 'a': 2, 'c': {'z': 1, 'y': [3, 2, 1]}},
    {'motivo': 'Falló el QR · ñandú', 'texto': 'comillas " y barra \\ y\nsalto'},
    {'vacio': {}, 'lista': [], 'negativo': -42, 'cero': 0},
]

EVENTOS = ['0193a6f2-7c1e-7b3a-9f10-2d4c5e6f7a8b', '0193A6F2-7C1E-7B3A-9F10-AAAAAAAAAAAA']

LOTES = [
    [[2, 41], [7, 128]],
    [],
    [[1, 1]],
    [[2, 0], [3, 5]],
    [[1, 10], [2, 10], [7, 10]],
]


def generar():
    eventos = []
    for evento_id in EVENTOS:
        id_hash = evento_id_hash(evento_id)
        eventos.append({'eventoId': evento_id, 'eventoIdHash': id_hash.hex(), 'genesis': genesis(id_hash).hex()})

    hojas_mov = [{'movimiento': m, 'jcs': jcs(m), 'hoja': hoja(m).hex()} for m in MOVIMIENTOS]

    raices = []
    for cantidad in [1, 2, 3, 4, 5, 7, 16]:
        hs = hojas_sinteticas(cantidad)
        raices.append({'hojas': [h.hex() for h in hs], 'raiz': raiz(hs).hex()})

    siete = hojas_sinteticas(7)
    pruebas = [{'hojas': [h.hex() for h in siete], 'indice': i, 'prueba': prueba(siete, i), 'raiz': raiz(siete).hex()}
               for i in [0, 3, 6]]

    id_hash = evento_id_hash(EVENTOS[0])
    anterior = genesis(id_hash)
    cadena = []
    for n, conteos in enumerate(LOTES, start=1):
        r = raiz(hojas_sinteticas(n + 2))
        h = huella(id_hash, n, anterior, r, conteos)
        cadena.append({'n': n, 'huellaAnterior': anterior.hex(), 'raiz': r.hex(), 'conteos': conteos, 'huella': h.hex()})
        anterior = h

    lote_movimientos = [hoja(m) for m in MOVIMIENTOS]

    return {
        'version': 1,
        'descripcion': 'Vectores de huellas de Pasitos (Contrato y sellador §4). Generado por tools/vectores/generar.py; no editar a mano.',
        'eventos': eventos,
        'jcs': [{'entrada': e, 'salida': jcs(e)} for e in JCS],
        'hojas': hojas_mov,
        'raizMovimientos': raiz(lote_movimientos).hex(),
        'raices': raices,
        'pruebas': pruebas,
        'cadena': {'eventoId': EVENTOS[0], 'eventoIdHash': id_hash.hex(), 'lotes': cadena},
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    contenido = json.dumps(generar(), ensure_ascii=False, indent=2) + '\n'
    if '--comprobar' in sys.argv:
        actual = DESTINO.read_text(encoding='utf-8') if DESTINO.exists() else ''
        if actual != contenido:
            sys.stderr.write(f'{DESTINO} no coincide con lo que genera este script. Corre: python tools/vectores/generar.py\n')
            sys.exit(1)
        sys.stdout.write('Vectores al día.\n')
        return
    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    DESTINO.write_bytes(contenido.encode('utf-8'))
    sys.stdout.write(f'Escrito {DESTINO}\n')


if __name__ == '__main__':
    main()
