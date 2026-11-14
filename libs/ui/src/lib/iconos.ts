/**
 * Íconos de los mockups (estilo Lucide), los mismos de docs/06-diseno/mockups.
 * Se guardan como datos (no como HTML) para que también se dibujen en el servidor (SSR).
 * Se agregan aquí a medida que las pantallas los necesiten (T-004 §4).
 */
export type ElementoSvg =
  | { readonly t: 'path'; readonly d: string }
  | { readonly t: 'circle'; readonly cx: string; readonly cy: string; readonly r: string }
  | {
      readonly t: 'rect';
      readonly x?: string;
      readonly y?: string;
      readonly width: string;
      readonly height: string;
      readonly rx?: string;
    };

export const ICONOS = {
  scan: [
    { t: 'path', d: 'M3 7V5a2 2 0 0 1 2-2h2' },
    { t: 'path', d: 'M17 3h2a2 2 0 0 1 2 2v2' },
    { t: 'path', d: 'M21 17v2a2 2 0 0 1-2 2h-2' },
    { t: 'path', d: 'M7 21H5a2 2 0 0 1-2-2v-2' },
    { t: 'path', d: 'M7 12h10' },
  ],
  trophy: [
    { t: 'path', d: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6' },
    { t: 'path', d: 'M18 9h1.5a2.5 2.5 0 0 0 0-5H18' },
    { t: 'path', d: 'M4 22h16' },
    { t: 'path', d: 'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22' },
    { t: 'path', d: 'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22' },
    { t: 'path', d: 'M18 2H6v7a6 6 0 0 0 12 0V2Z' },
  ],
  gift: [
    { t: 'rect', x: '3', y: '8', width: '18', height: '4', rx: '1' },
    { t: 'path', d: 'M12 8v13' },
    { t: 'path', d: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7' },
    { t: 'path', d: 'M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5' },
  ],
  history: [
    { t: 'path', d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' },
    { t: 'path', d: 'M3 3v5h5' },
    { t: 'path', d: 'M12 7v5l4 2' },
  ],
  check: [
    { t: 'circle', cx: '12', cy: '12', r: '10' },
    { t: 'path', d: 'm9 12 2 2 4-4' },
  ],
  shieldx: [
    {
      t: 'path',
      d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    },
    { t: 'path', d: 'm14.5 9.5-5 5' },
    { t: 'path', d: 'm9.5 9.5 5 5' },
  ],
  clock: [
    { t: 'circle', cx: '12', cy: '12', r: '10' },
    { t: 'path', d: 'M12 6v6l4 2' },
  ],
  lock: [
    { t: 'rect', width: '18', height: '11', x: '3', y: '11', rx: '2' },
    { t: 'path', d: 'M7 11V7a5 5 0 0 1 10 0v4' },
  ],
  x: [
    { t: 'path', d: 'M18 6 6 18' },
    { t: 'path', d: 'm6 6 12 12' },
  ],
  back: [{ t: 'path', d: 'm15 18-6-6 6-6' }],
  users: [
    { t: 'path', d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' },
    { t: 'circle', cx: '9', cy: '7', r: '4' },
    { t: 'path', d: 'M22 21v-2a4 4 0 0 0-3-3.87' },
    { t: 'path', d: 'M16 3.13a4 4 0 0 1 0 7.75' },
  ],
  user: [
    { t: 'circle', cx: '12', cy: '8', r: '5' },
    { t: 'path', d: 'M20 21a8 8 0 0 0-16 0' },
  ],
  search: [
    { t: 'circle', cx: '11', cy: '11', r: '8' },
    { t: 'path', d: 'm21 21-4.3-4.3' },
  ],
  alert: [
    { t: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { t: 'path', d: 'M12 9v4' },
    { t: 'path', d: 'M12 17h.01' },
  ],
  info: [
    { t: 'circle', cx: '12', cy: '12', r: '10' },
    { t: 'path', d: 'M12 16v-4' },
    { t: 'path', d: 'M12 8h.01' },
  ],
  plus: [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'M12 5v14' },
  ],
  refresh: [
    { t: 'path', d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' },
    { t: 'path', d: 'M21 3v5h-5' },
    { t: 'path', d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' },
    { t: 'path', d: 'M8 16H3v5' },
  ],
  send: [
    {
      t: 'path',
      d: 'M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z',
    },
    { t: 'path', d: 'm21.85 2.15-10.94 10.94' },
  ],
  ticket: [
    {
      t: 'path',
      d: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
    },
    { t: 'path', d: 'M13 5v2' },
    { t: 'path', d: 'M13 17v2' },
    { t: 'path', d: 'M13 11v2' },
  ],
  monitor: [
    { t: 'rect', width: '20', height: '14', x: '2', y: '3', rx: '2' },
    { t: 'path', d: 'M8 21h8' },
    { t: 'path', d: 'M12 17v4' },
  ],
  cal: [
    { t: 'rect', width: '18', height: '18', x: '3', y: '4', rx: '2' },
    { t: 'path', d: 'M16 2v4' },
    { t: 'path', d: 'M8 2v4' },
    { t: 'path', d: 'M3 10h18' },
  ],
  pin: [
    {
      t: 'path',
      d: 'M20 10c0 4.99-5.54 10.19-7.4 11.8a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0',
    },
    { t: 'circle', cx: '12', cy: '10', r: '3' },
  ],
  ext: [
    { t: 'path', d: 'M15 3h6v6' },
    { t: 'path', d: 'M10 14 21 3' },
    { t: 'path', d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' },
  ],
  copy: [
    { t: 'rect', width: '14', height: '14', x: '8', y: '8', rx: '2' },
    { t: 'path', d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' },
  ],
  arrow: [
    { t: 'path', d: 'M5 12h14' },
    { t: 'path', d: 'm12 5 7 7-7 7' },
  ],
  file: [
    { t: 'path', d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
    { t: 'path', d: 'M14 2v4a2 2 0 0 0 2 2h4' },
    { t: 'path', d: 'M16 13H8' },
    { t: 'path', d: 'M16 17H8' },
    { t: 'path', d: 'M10 9H8' },
  ],
  image: [
    { t: 'rect', width: '18', height: '18', x: '3', y: '3', rx: '2' },
    { t: 'circle', cx: '9', cy: '9', r: '2' },
    { t: 'path', d: 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21' },
  ],
  camoff: [
    { t: 'path', d: 'm2 2 20 20' },
    { t: 'path', d: 'M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16' },
    { t: 'path', d: 'M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5' },
    { t: 'path', d: 'M14.12 15.12A3 3 0 1 1 9.88 10.88' },
  ],
  wifioff: [
    { t: 'path', d: 'M12 20h.01' },
    { t: 'path', d: 'M8.5 16.43a5 5 0 0 1 7 0' },
    { t: 'path', d: 'M5 12.86a10 10 0 0 1 5.17-2.69' },
    { t: 'path', d: 'M19 12.86a10 10 0 0 0-2-1.39' },
    { t: 'path', d: 'M2 8.82a15 15 0 0 1 4.18-2.65' },
    { t: 'path', d: 'M22 8.82a15 15 0 0 0-11.29-3.76' },
    { t: 'path', d: 'm2 2 20 20' },
  ],
  keyboard: [
    { t: 'rect', width: '20', height: '16', x: '2', y: '4', rx: '2' },
    { t: 'path', d: 'M6 8h.01' },
    { t: 'path', d: 'M10 8h.01' },
    { t: 'path', d: 'M14 8h.01' },
    { t: 'path', d: 'M18 8h.01' },
    { t: 'path', d: 'M8 12h.01' },
    { t: 'path', d: 'M12 12h.01' },
    { t: 'path', d: 'M16 12h.01' },
    { t: 'path', d: 'M7 16h10' },
  ],
  badge: [
    {
      t: 'path',
      d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z',
    },
    { t: 'path', d: 'm9 12 2 2 4-4' },
  ],
} as const satisfies Record<string, readonly ElementoSvg[]>;

export type NombreIcono = keyof typeof ICONOS;
