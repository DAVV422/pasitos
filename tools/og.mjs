#!/usr/bin/env node
/**
 * Pasitos · arma la imagen para compartir del sitio (Open Graph, 1200 × 630; HU-404 §3):
 * apps/sitio/public/og-pasitos.png. Se corre a mano cuando cambia el texto o el logo.
 *
 * Uso: node tools/og.mjs
 */
import { resolve } from 'node:path';
import sharp from 'sharp';

const SALIDA = resolve(import.meta.dirname, '../apps/sitio/public/og-pasitos.png');

// Colores de libs/ui/src/estilos/tokens.css (tema claro, D36).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f8fafc"/>
  <rect x="0" y="590" width="1200" height="40" fill="#fef3c7"/>
  <g transform="translate(96 120) scale(4.2)">
    <path fill="#ecc228" d="M9.90 12.36 L26.54 31.68 L9.90 50.99 L15.43 55.76 L36.18 31.68 L15.43 7.60 Z"/>
    <path fill="#df862d" d="M28.80 12.36 L45.44 31.68 L28.80 50.99 L34.34 55.76 L55.08 31.68 L34.34 7.60 Z"/>
  </g>
  <text x="400" y="230" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="64" font-weight="800" fill="#0b0f19">Pasitos</text>
  <text x="400" y="330" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="58" font-weight="800" fill="#0b0f19">Cada paso cuenta.</text>
  <text x="400" y="400" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#475569">Puntos por quedarse,</text>
  <text x="400" y="442" font-family="Inter, Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#475569">reportes que se pueden comprobar.</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(SALIDA);
process.stdout.write(`Listo: ${SALIDA}\n`);
