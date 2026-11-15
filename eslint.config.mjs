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
        cronAdd: 'readonly',
        onBootstrap: 'readonly',
        onRecordAuthRequest: 'readonly',
        onRecordRequestEmailChangeRequest: 'readonly',
        onMailerRecordVerificationSend: 'readonly',
        onMailerRecordPasswordResetSend: 'readonly',
        onMailerRecordEmailChangeSend: 'readonly',
        onMailerRecordAuthAlertSend: 'readonly',
        migrate: 'readonly',
        __hooks: 'readonly',
        $app: 'readonly',
        $apis: 'readonly',
        $dbx: 'readonly',
        $mails: 'readonly',
        $os: 'readonly',
        $security: 'readonly',
        BoolField: 'readonly',
        ForbiddenError: 'readonly',
        Record: 'readonly',
        SelectField: 'readonly',
        module: 'readonly',
        require: 'readonly',
      },
    },
  },
];
