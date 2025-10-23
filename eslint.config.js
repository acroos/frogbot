import globals from 'globals'
import { defineConfig } from 'eslint/config'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default defineConfig([
  // TypeScript files
  {
    files: ['**/*.ts'],
    plugins: {
      '@typescript-eslint': tseslint,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: './tsconfig.json',
      },
      globals: globals.node,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
    },
  },
])
