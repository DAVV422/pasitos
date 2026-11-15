import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/libro',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'libro',
    watch: false,
    globals: true,
    environment: 'node',
    // Pruebas de integración con PostgreSQL en Docker: bajo carga, 5 s no alcanzan.
    testTimeout: 30_000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/libro',
      provider: 'v8' as const,
    },
  },
}));
