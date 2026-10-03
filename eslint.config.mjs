import { defineConfig, globalIgnores } from 'eslint/config';
import parser from '@typescript-eslint/parser';
import typescript from '@typescript-eslint/eslint-plugin';
import hooks from 'eslint-plugin-react-hooks';
import accessibility from 'eslint-plugin-jsx-a11y';
export default defineConfig([
  globalIgnores(['.next/**', 'coverage/**', 'next-env.d.ts', 'node_modules/**']),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': typescript, 'react-hooks': hooks, 'jsx-a11y': accessibility },
    rules: { ...typescript.configs.recommended.rules, ...hooks.configs.recommended.rules, ...accessibility.configs.recommended.rules },
  },
]);
