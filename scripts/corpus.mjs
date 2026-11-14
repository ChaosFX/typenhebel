// Startet scripts/corpus.ts über Vite (TypeScript und Pfade wie in der App).
import process from 'node:process';
import { runnerImport } from 'vite';

const { module } = await runnerImport('./scripts/corpus.ts');
await module.main(process.argv.slice(2));
