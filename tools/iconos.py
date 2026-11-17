"""
Pasitos · genera los íconos de las apps a partir de la forma del logo (assets/brand/pasitos-logo.png).

En la pestaña del navegador (16–32 px) el círculo texturado del logo no se ve: el ícono usa solo
las dos flechas, redibujadas como vector con sus colores. Uso: python tools/iconos.py
Genera assets/brand/favicon.svg y, en public/ de cada app, favicon.svg, favicon.ico (16, 32 y 48)
y apple-touch-icon.png (180, con fondo claro: iOS no admite transparencia).
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
APPS = ['admin', 'plataforma', 'app', 'sala', 'mesa', 'sitio']

AMARILLO = '#ecc228'
NARANJA = '#df862d'
FONDO_TOUCH = '#fbf8f1'

# Medido sobre el logo original (1024 × 425): eje de cada flecha y ancho del trazo.
EJE = [(425, 110), (512, 211), (425, 312)]
SEPARACION = 88
ANCHO = 34
CAJA = (380, 90, 650, 335)  # la zona de las dos flechas


def contorno(eje, ancho, dx=0.0):
    """Polígono de un trazo grueso con unión en punta (miter) y extremos rectos."""
    p0, p1, p2 = [(x + dx, y) for x, y in eje]
    h = ancho / 2

    def normal(a, b):
        vx, vy = b[0] - a[0], b[1] - a[1]
        largo = math.hypot(vx, vy)
        return (-vy / largo, vx / largo)

    n1, n2 = normal(p0, p1), normal(p1, p2)

    def cruce(a, da, b, db):
        det = da[0] * db[1] - da[1] * db[0]
        t = ((b[0] - a[0]) * db[1] - (b[1] - a[1]) * db[0]) / det
        return (a[0] + da[0] * t, a[1] + da[1] * t)

    d1 = (p1[0] - p0[0], p1[1] - p0[1])
    d2 = (p2[0] - p1[0], p2[1] - p1[1])
    lado = []
    for s in (1, -1):
        a0 = (p0[0] + s * n1[0] * h, p0[1] + s * n1[1] * h)
        b0 = (p1[0] + s * n2[0] * h, p1[1] + s * n2[1] * h)
        punta = cruce(a0, d1, b0, d2)
        a2 = (p2[0] + s * n2[0] * h, p2[1] + s * n2[1] * h)
        lado.append((a0, punta, a2))
    (a0, pa, a2), (b0, pb, b2) = lado
    return [a0, pa, a2, b2, pb, b0]


FLECHAS = [(contorno(EJE, ANCHO), AMARILLO), (contorno(EJE, ANCHO, SEPARACION), NARANJA)]


def transform(lienzo, margen):
    """De las coordenadas del logo a un lienzo cuadrado, centrado y con margen."""
    x0, y0, x1, y1 = CAJA
    escala = (lienzo - 2 * margen) / max(x1 - x0, y1 - y0)
    ox = (lienzo - (x1 - x0) * escala) / 2 - x0 * escala
    oy = (lienzo - (y1 - y0) * escala) / 2 - y0 * escala
    return lambda p: (p[0] * escala + ox, p[1] * escala + oy)


def svg() -> str:
    t = transform(64, 3)
    caminos = '\n'.join(
        f'  <path fill="{color}" d="M{" L".join(f"{x:.2f} {y:.2f}" for x, y in map(t, puntos))} Z"/>'
        for puntos, color in FLECHAS
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">\n'
        '  <title>Pasitos</title>\n'
        f'{caminos}\n'
        '</svg>\n'
    )


def png(lado: int, margen: float, fondo) -> Image.Image:
    """Dibuja a 8× y reduce: bordes suaves también en 16 px."""
    grande = lado * 8
    imagen = Image.new('RGBA', (grande, grande), fondo or (0, 0, 0, 0))
    dibujo = ImageDraw.Draw(imagen)
    t = transform(grande, margen * 8)
    for puntos, color in FLECHAS:
        dibujo.polygon([t(p) for p in puntos], fill=color)
    return imagen.resize((lado, lado), Image.LANCZOS)


def main() -> None:
    contenido = svg()
    (RAIZ / 'assets/brand/favicon.svg').write_text(contenido, encoding='utf-8')
    ico = png(256, 8, None)
    touch = png(180, 30, FONDO_TOUCH).convert('RGB')
    for app in APPS:
        publico = RAIZ / 'apps' / app / 'public'
        (publico / 'favicon.svg').write_text(contenido, encoding='utf-8')
        ico.save(publico / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
        touch.save(publico / 'apple-touch-icon.png')
    png(512, 24, None).save(RAIZ / 'assets/brand/favicon-512.png')
    print('Íconos generados en', ', '.join(APPS))


if __name__ == '__main__':
    main()
