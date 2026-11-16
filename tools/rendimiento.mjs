// Pruebas con límite de tiempo, solas (sin las demás suites en paralelo, que las vuelven poco
// confiables): el tiempo de respuesta al entrar (HU-201) y el CSV de 5 000 filas (HU-210).
// Uso: pnpm rendimiento. Requiere Docker.
import { spawnSync } from 'node:child_process';

const PRUEBAS = [
  ['apps/api', 'src/modules/auth/auth.int.spec.ts', '-t', 'el tiempo de respuesta'],
  ['apps/trabajador', 'src/invitados/operaciones.int.spec.ts', '-t', '5 000 filas'],
];

let fallo = false;
for (const [carpeta, ...argumentos] of PRUEBAS) {
  const resultado = spawnSync(
    'npx',
    ['vitest', 'run', ...argumentos.map((a) => (a.includes(' ') ? `"${a}"` : a))],
    {
      cwd: carpeta,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PASITOS_RENDIMIENTO: '1' },
    },
  );
  fallo ||= resultado.status !== 0;
}
process.exit(fallo ? 1 : 0);
