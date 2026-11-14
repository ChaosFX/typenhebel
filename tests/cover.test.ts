// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import {
  coverStyle,
  coverSvg,
  DEFAULT_LAYOUTS,
  fitText,
  isCoverChoice,
  LAYOUTS,
  PALETTES,
  randomCover,
  splitTitle,
} from '../src/core/cover';

const BOOKS = [
  { id: 'demo', title: 'Demotext', author: 'Typenhebel' },
  { id: 'b1', title: 'Die Welt von Gestern', author: 'Stefan Zweig' },
  { id: 'b2', title: 'Faust: Eine Tragödie', author: 'Johann Wolfgang von Goethe' },
  { id: 'b3', title: 'Die Brüder Karamasow', author: 'Fjodor Michailowitsch Dostojewski' },
  { id: 'b4', title: 'Moby Dick oder Der weiße Wal', author: 'Herman Melville' },
  { id: 'x', title: 'Tom & Jerry <script>"', author: 'A <b> & "C"' },
];

const parse = (svg: string): Document => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('splitTitle', () => {
  test.each([
    ['Faust: Eine Tragödie', 'Faust', 'Eine Tragödie'],
    ['Moby Dick oder Der weiße Wal', 'Moby Dick', 'oder Der weiße Wal'],
    ['Schachnovelle – Erzählung', 'Schachnovelle', 'Erzählung'],
    ['Die Welt von Gestern', 'Die Welt von Gestern', ''],
    ['  Effi   Briest ', 'Effi Briest', ''],
  ])('%s', (t, main, sub) => {
    expect(splitTitle(t)).toEqual({ main, sub });
  });
});

describe('fitText', () => {
  test('kurzer Titel: eine Zeile, größte Schrift', () => {
    expect(fitText('Faust', 270)).toEqual({ size: 60, lines: ['Faust'] });
  });
  test('verteilt Zeilen ausgewogen statt gierig', () => {
    const { lines } = fitText('Die Welt von Gestern', 320, { sizes: [52] });
    expect(lines).toEqual(['Die Welt', 'von Gestern']);
  });
  test('verkleinert, bis ein langes Wort passt, und hält maxLines ein', () => {
    const r = fitText('Donaudampfschifffahrtsgesellschaftskapitän und andere Geschichten', 270);
    expect(r.size).toBeLessThan(30);
    expect(r.lines.length).toBeLessThanOrEqual(4);
  });
  test('Laufweite macht Zeilen enger', () => {
    const a = fitText('JOHANN WOLFGANG VON GOETHE', 290, { sizes: [17] });
    const b = fitText('JOHANN WOLFGANG VON GOETHE', 290, { sizes: [17], tracking: 0.17 });
    expect(b.lines.length).toBeGreaterThan(a.lines.length);
  });
});

describe('coverSvg', () => {
  test('alle Layouts und Paletten ergeben gültiges SVG mit maskiertem Text', () => {
    for (const b of BOOKS)
      for (const layout of LAYOUTS)
        for (const p of PALETTES) {
          const svg = coverSvg(b, { layout, palette: p.name });
          const doc = parse(svg);
          expect(doc.querySelector('parsererror')).toBeNull();
          expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 400 600');
          expect(svg).not.toContain('<script');
          expect(svg).not.toContain('<b>');
        }
  });
  test('Titel und Autor stehen im Bild und im Alternativtext', () => {
    const doc = parse(coverSvg(BOOKS[2]!, { layout: 'rahmen' }));
    const text = doc.documentElement.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Faust');
    expect(text).toContain('Eine Tragödie');
    expect(text).toContain('GOETHE');
    expect(doc.documentElement.getAttribute('aria-label')).toBe('Faust: Eine Tragödie – Johann Wolfgang von Goethe');
  });
  test('deterministisch: gleiches Buch, gleiches Cover', () => {
    for (const b of BOOKS) expect(coverSvg(b)).toBe(coverSvg({ ...b }));
  });
});

describe('Cover-Wahl', () => {
  test('automatisch nur aus den Standard-Layouts, Farben gestreut', () => {
    const styles = Array.from({ length: 60 }, (_, i) => coverStyle({ id: 'b' + i, title: 'Titel ' + i, author: '' }));
    expect(styles.every((s) => DEFAULT_LAYOUTS.includes(s.layout))).toBe(true);
    expect(new Set(styles.map((s) => s.layout)).size).toBe(DEFAULT_LAYOUTS.length);
    expect(new Set(styles.map((s) => s.palette)).size).toBeGreaterThan(5);
  });
  test('Würfeln liefert immer eine andere, gültige Kombination', () => {
    let seq = [0, 0, 0, 0, 0.5, 0.5];
    const rand = () => seq.shift() ?? 0.9;
    const cur = { layout: LAYOUTS[0], palette: PALETTES[0]!.name };
    const next = randomCover(cur, rand);
    expect(next).not.toEqual(cur);
    expect(isCoverChoice(next)).toBe(true);
    seq = [];
    for (let i = 0; i < 50; i++) expect(isCoverChoice(randomCover(cur))).toBe(true);
  });
  test('isCoverChoice weist Unbekanntes ab', () => {
    expect(isCoverChoice({ layout: 'rahmen', palette: 'Moos' })).toBe(true);
    expect(isCoverChoice({ layout: 'kreise', palette: 'Moos' })).toBe(false);
    expect(isCoverChoice({ layout: 'rahmen', palette: 'Neon' })).toBe(false);
    expect(isCoverChoice(null)).toBe(false);
  });
});
