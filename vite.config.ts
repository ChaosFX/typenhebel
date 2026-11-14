import { defineConfig } from 'vitest/config';

// GitHub Pages liefert unter /<repo>/ aus.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/typenhebel/',
  build: { target: 'es2022' },
  test: { include: ['tests/**/*.test.ts'] },
});
