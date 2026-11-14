import nx from '@nx/eslint-plugin';

/** Verbos técnicos en español que no pueden empezar un nombre de función (D39: verbos en inglés). */
const VERBOS_EN_ESPANOL =
  '^(crear|obtener|buscar|actualizar|borrar|eliminar|listar|guardar|enviar|validar|calcular|es|tiene|puede)[A-Z]';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vite.config.*.timestamp*',
      '**/vitest.config.*.timestamp*',
      'contracts/**',
      'libs/db/migraciones/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      // Límites entre proyectos (T-001 §4). /app nunca importa código del panel.
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: false,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'scope:asistente',
              onlyDependOnLibsWithTags: ['scope:compartido', 'scope:ui', 'scope:web'],
            },
            {
              sourceTag: 'scope:terminal',
              onlyDependOnLibsWithTags: ['scope:compartido', 'scope:ui', 'scope:web'],
            },
            {
              sourceTag: 'scope:panel',
              onlyDependOnLibsWithTags: ['scope:compartido', 'scope:ui', 'scope:web'],
            },
            {
              sourceTag: 'scope:publico',
              onlyDependOnLibsWithTags: ['scope:compartido', 'scope:ui', 'scope:web'],
            },
            {
              sourceTag: 'scope:servidor',
              onlyDependOnLibsWithTags: ['scope:compartido', 'scope:servidor', 'scope:testing'],
            },
            { sourceTag: 'scope:compartido', onlyDependOnLibsWithTags: ['scope:compartido'] },
            { sourceTag: 'scope:ui', onlyDependOnLibsWithTags: ['scope:compartido', 'scope:ui'] },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:compartido', 'scope:web'] },
            {
              sourceTag: 'scope:testing',
              onlyDependOnLibsWithTags: ['scope:compartido', 'scope:testing'],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
      // Nomenclatura (Reglas generales §2.2, D39). El prefijo is/has/can de los booleanos
      // necesita análisis de tipos (lento): se revisa en el PR.
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
        { selector: 'import', format: null },
        {
          selector: ['function', 'method'],
          format: ['camelCase'],
          custom: { regex: VERBOS_EN_ESPANOL, match: false },
        },
      ],
    },
  },
  {
    // Scripts, migraciones y el arranque de las apps pueden escribir en la consola.
    files: ['**/tools/**', '**/src/cli/**', '**/src/main.ts', '**/src/server.ts'],
    rules: { 'no-console': 'off' },
  },
];
