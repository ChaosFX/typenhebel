import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// GitHub Pages liefert unter /<repo>/ aus.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/typenhebel/',
  plugins: [svelte()],
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
