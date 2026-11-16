import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  checkCorpusBook,
  CORPUS_VERSION,
  outdatedCorpusBooks,
  parseCorpusIndex,
  type CorpusEntry,
} from '../src/data/corpus';

const entry = (over: Partial<CorpusEntry> = {}): CorpusEntry => ({
  id: 'c:test',
  file: 'test.json',
  title: 'Test',
  author: 'A',
  chapters: 1,
  sections: 1,
  words: 3,
  bytes: 100,
  source: { name: 'Q', retrieved: '2026-11-14' },
  ...over,
});

describe('parseCorpusIndex', () => {
  test('nimmt gültige Einträge, verwirft kaputte', () => {
    const books = [entry(), entry({ id: 'fremd' }), entry({ id: 'c:x', file: '../geheim.json' }), { id: 'c:y' }, null];
    expect(parseCorpusIndex({ version: CORPUS_VERSION, books }).map((b) => b.id)).toEqual(['c:test']);
  });
  test('unbekannte Version oder Unsinn → leer', () => {
    expect(parseCorpusIndex({ version: 99, books: [entry()] })).toEqual([]);
    expect(parseCorpusIndex('x')).toEqual([]);
    expect(parseCorpusIndex(null)).toEqual([]);
  });
});

describe('checkCorpusBook', () => {
  const book = { id: 'c:test', title: 'Test', author: 'A', sections: [{ text: 'Ein Satz.', breaks: [] }] };
  test('gültiges Buch bekommt ein Ladedatum', () => {
    expect(checkCorpusBook(book, entry()).created).toBeGreaterThan(0);
  });
  test('falsche ID oder fehlender Text wird abgewiesen', () => {
    expect(() => checkCorpusBook({ ...book, id: 'c:anders' }, entry())).toThrow();
    expect(() => checkCorpusBook({ ...book, sections: [] }, entry())).toThrow();
    expect(() => checkCorpusBook({ ...book, sections: [{ text: 1 }] }, entry())).toThrow();
  });
});

const INDEX = 'public/corpus/index.json';
describe.skipIf(!fs.existsSync(INDEX))('ausgelieferter Korpus', () => {
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const books = parseCorpusIndex(idx);
  test('Index vollständig gültig', () => {
    expect(books.length).toBe(idx.books.length);
    expect(books.length).toBeGreaterThan(0);
  });
  test.each(books.map((b) => [b.id, b] as const))('%s: Datei passt zum Index', (_id, e) => {
    const raw = fs.readFileSync('public/corpus/' + e.file, 'utf8');
    const b = checkCorpusBook(JSON.parse(raw), e);
    expect(b.sections.length).toBe(e.sections);
    expect(b.chapters?.length ?? 0).toBe(e.chapters);
    expect(Buffer.byteLength(raw)).toBe(e.bytes);
    expect(b.source?.name).toBe(e.source.name);
    // keine Zeichen, die das Tippen blockieren (seltene Zeichen wurden ersetzt)
    const text = b.sections.map((s) => s.text).join(' ');
    expect(text).not.toMatch(/[Ͱ-ϿЀ-ӿ]/);
  });
  test('Die Welt von Gestern: 18 Kapitel', () => {
    expect(books.find((b) => b.id === 'c:zweig-welt-von-gestern')?.chapters).toBe(18);
  });
  test('Zeittafel und Namensregister sind nicht enthalten', () => {
    for (const id of ['horvath-jugend-ohne-gott', 'dostojewski-karamasow']) {
      const b = JSON.parse(fs.readFileSync(`public/corpus/${id}.json`, 'utf8'));
      const titles = b.chapters.map((c: { title: string }) => c.title);
      expect(titles).not.toContain('Zeittafel');
      expect(titles).not.toContain('Anhang: Namensregister');
    }
  });
});

describe('outdatedCorpusBooks', () => {
  const meta = (id: string, rev: string | undefined, sectionCount = 1) => ({
    id,
    title: 'T',
    author: 'A',
    rev,
    sectionCount,
  });
  test('erneuert nur gespeicherte Bücher mit anderer Revision und gleicher Abschnittszahl', () => {
    const index = [
      entry({ id: 'c:alt', rev: 'neu' }),
      entry({ id: 'c:aktuell', rev: 'neu' }),
      entry({ id: 'c:anders', rev: 'neu', sections: 2 }),
      entry({ id: 'c:fremd', rev: 'neu' }),
      entry({ id: 'c:ohne', rev: undefined }),
    ];
    const owned = [meta('c:alt', undefined), meta('c:aktuell', 'neu'), meta('c:anders', 'x'), meta('c:ohne', 'x')];
    expect(outdatedCorpusBooks(owned, index).map((e) => e.id)).toEqual(['c:alt']);
  });
});

test.skipIf(!fs.existsSync(INDEX))('Korpus: jedes Buch trägt seine Revision, Faust hat Verszeilen', () => {
  const idx = JSON.parse(fs.readFileSync(INDEX, 'utf8')) as { books: CorpusEntry[] };
  for (const e of idx.books) {
    const b = JSON.parse(fs.readFileSync('public/corpus/' + e.file, 'utf8')) as { rev?: string };
    expect(e.rev).toMatch(/^[0-9a-f]{12}$/);
    expect(b.rev).toBe(e.rev);
  }
  const faust = JSON.parse(fs.readFileSync('public/corpus/goethe-faust.json', 'utf8')) as {
    sections: { text: string; lines?: number[] }[];
  };
  const first = faust.sections[0]!;
  const chars = Array.from(first.text);
  expect(chars.slice(0, first.lines![0]).join('')).toBe('Ihr naht euch wieder, schwankende Gestalten,');
});
