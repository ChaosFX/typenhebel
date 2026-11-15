import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'prototype/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.svelte'] },
    },
  },
  {
    // Cover-SVGs kommen aus core/cover.ts, das alle Texte maskiert.
    files: ['src/components/CoverDialog.svelte', 'src/components/LibraryDialog.svelte'],
    rules: { 'svelte/no-at-html-tags': 'off' },
  },
  {
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Zustand wird unveränderlich ersetzt ($state.raw); lokale Map/Set sind keine reaktiven Quellen.
      'svelte/prefer-svelte-reactivity': 'off',
      // {' '} erzwingt ein Leerzeichen, das Svelte an Blockgrenzen sonst entfernt.
      'svelte/no-useless-mustaches': 'off',
      // `const { sections: _s, ...meta } = book` zum Weglassen von Feldern
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    },
  },
);
