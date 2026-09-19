import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'bin/**',
      'generated/**',
      'pb_data/**',
      '.runtime/**',
      'backups/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'vitest.config.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['pb_hooks/**/*.js', 'pb_hooks/**/*.cjs', 'pb_migrations/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        routerAdd: 'readonly',
        migrate: 'readonly',
        __hooks: 'readonly',
        $apis: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
];
