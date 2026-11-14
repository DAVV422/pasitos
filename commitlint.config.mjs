/** Conventional Commits, descripción en español (Reglas generales §6). */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'perf', 'ci']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
