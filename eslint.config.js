import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import globals from 'globals';

const typescriptConfigs = tsPlugin.configs['flat/recommended'];

export default [
  {
    ignores: ['dist'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  js.configs.recommended,
  ...typescriptConfigs,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'react-refresh': reactRefreshPlugin,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
