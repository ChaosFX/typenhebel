// @vitest-environment happy-dom
import fs from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { assembleChapters, chapterOf, chapterRange } from '../src/core/book';
import { findRare } from '../src/core/rare';
import { wc } from '../src/core/text';
import { EpubError, readEpub, resolvePath } from '../src/epub/import';
import { extractChapter } from '../src/epub/xhtml';
import { CHAPTER_ONE_START, makeEpub } from './fixtures/make-epub';

describe('resolvePath', () => {
  test('relativ, ../, URL-kodiert, Fragment', () => {
    expect(resolvePath('OPS/', 'text/kapitel%20eins.xhtml#x')).toBe('OPS/text/kapitel eins.xhtml');
    expect(resolvePath('OPS/text/', '../img/a.png')).toBe('OPS/img/a.png');
    expect(resolvePath('', 'a.xhtml')).toBe('a.xhtml');
  });
});

describe('readEpub (synthetisch)', () => {
  const book = readEpub(makeEpub());
  const all = book.chapters.flatMap((c) => c.paragraphs).join('\n');

  test('Metadaten', () => {
    expect(book.title).toBe('Testbuch');
    expect(book.author).toBe('Erika Muster');
    expect(book.publisher).toBe('Testverlag');
  });

  test('Spine-Reihenfolge, Navigation und linear="no" übersprungen', () => {
    expect(book.chapters.map((c) => c.title)).toEqual(['Motto', 'Erstes Kapitel', 'Zweites Kapitel']);
  });

  test('Titelseite: nur das Motto bleibt', () => {
    expect(book.chapters[0]!.paragraphs).toEqual(['»Erst die Sicherheit, dann das Tempo.«', 'Unbekannt']);
    expect(all).not.toContain('Erstausgabe');
  });

  test('Motto am Kapitelanfang bleibt, Verse mit Leerzeichen verbunden', () => {
    expect(book.chapters[1]!.paragraphs.slice(0, 2)).toEqual(['Erste Zeile zweite Zeile', 'Goethe']);
  });

  test('Fußnoten, Verweisnummern, Seitenanker und Bilder entfernt; Kursiv wird Text', () => {
    expect(book.chapters[1]!.paragraphs[2]).toBe(CHAPTER_ONE_START);
    expect(book.chapters[1]!.paragraphs[3]).toBe('Ein kursives Wort und eine Verweisnummer im Text.');
    expect(all).not.toMatch(/Fußnote darf|Endnote|Bild/);
  });

  test('Tabellenzeilen werden Absätze, kurze Absätze bleiben erhalten', () => {
    expect(book.chapters[2]!.paragraphs.slice(0, 3)).toEqual(['Hiob.', 'hebräisch', 'χητος griechisch']);
  });

  test('kaputte Dateien werden verständlich abgewiesen', () => {
    expect(() => readEpub(new Uint8Array([1, 2, 3]))).toThrow(EpubError);
  });
});

describe('extractChapter: Kapiteltitel', () => {
  const chapter = (body: string) =>
    extractChapter(new DOMParser().parseFromString(`<html><body>${body}</body></html>`, 'text/html'), 'Kapitel 9');

  test('erzeugte Nummern-Überschrift weicht der echten, <br> wird zu „ – “', () => {
    const c = chapter('<h1>Kapitel 3</h1><h4>Zweites Kapitel<br/> <span>Der Schwarze Hund</span></h4><p>Text.</p>');
    expect(c.title).toBe('Zweites Kapitel – Der Schwarze Hund');
    expect(c.paragraphs).toEqual(['Text.']);
    expect(chapter('<h4>Neunzehntes Kapitel<br/>Jim erzählt:<br/>Die Garnison</h4>').title).toBe(
      'Neunzehntes Kapitel – Jim erzählt: Die Garnison',
    );
  });

  test('sonst gilt die erste Überschrift; eine Nummern-Überschrift allein bleibt Titel', () => {
    expect(chapter('<h1>Erster Teil</h1><h2>Erstes Buch</h2><p>Text.</p>').title).toBe('Erster Teil');
    expect(chapter('<h1>Kapitel 3</h1><p>Text.</p>').title).toBe('Kapitel 3');
  });
});

describe('assembleChapters', () => {
  const raw = readEpub(makeEpub()).chapters;

  test('Kapitel beginnen an Abschnittsgrenzen, Verweise stimmen', () => {
    const { chapters, sections } = assembleChapters(raw);
    expect(chapters.length).toBe(3);
    expect(chapters[0]!.sectionStart).toBe(0);
    for (let k = 1; k < chapters.length; k++)
      expect(chapters[k]!.sectionStart).toBeGreaterThan(chapters[k - 1]!.sectionStart);
    expect(sections[chapters[1]!.sectionStart]!.text.startsWith('Erste Zeile')).toBe(true);
    expect(chapterOf({ chapters }, chapters[2]!.sectionStart)).toBe(2);
    expect(chapterOf({ chapters }, chapters[2]!.sectionStart - 1)).toBe(1);
    expect(chapterRange({ chapters, sections }, 2)).toEqual([chapters[2]!.sectionStart, sections.length]);
  });

  test('seltene Zeichen: Warnung und Ersatz', () => {
    const plain = assembleChapters(raw).sections.map((s) => s.text);
    expect(findRare(plain).map((r) => r.ch)).toEqual(expect.arrayContaining(['χ', 'Æ', 'œ', 'ç', '½']));
    const replaced = assembleChapters(raw, { replace: true }).sections.map((s) => s.text);
    expect(findRare(replaced)).toEqual([]);
    expect(replaced.join(' ')).toContain('chetos griechisch');
    expect(replaced.join(' ')).toContain('Aequator, ein Coeur und ein Facade-Wort, dazu 1/2 Liter');
  });

  test('Bücher ohne Kapitel', () => {
    expect(chapterOf({}, 3)).toBe(-1);
  });
});

// Akzeptanz Phase 1 mit den echten Beispielen (liegen nur lokal in samples/, nicht im Repo)
const ZWEIG = 'samples/die-welt-von-gestern.epub';
describe.skipIf(!fs.existsSync(ZWEIG))('Akzeptanz: Die Welt von Gestern', () => {
  // Erst in beforeAll lesen: Der describe-Rumpf läuft auch, wenn die Tests übersprungen werden.
  let book: ReturnType<typeof readEpub>;
  let chapters: ReturnType<typeof assembleChapters>['chapters'];
  let sections: ReturnType<typeof assembleChapters>['sections'];
  let text: string;
  beforeAll(() => {
    book = readEpub(new Uint8Array(fs.readFileSync(ZWEIG)));
    ({ chapters, sections } = assembleChapters(book.chapters));
    text = sections.map((s) => s.text).join('\n');
  });

  test('vollständig geladen, 18 Kapitel', () => {
    expect(book.title).toBe('Die Welt von Gestern');
    expect(book.author).toBe('Stefan Zweig');
    expect(chapters.length).toBe(18);
    expect(chapters[1]!.title).toBe('Vorwort');
    expect(chapters[17]!.title).toBe('Die Agonie des Friedens');
    expect(sections.reduce((n, s) => n + wc(s.text), 0)).toBeGreaterThan(130000);
  });

  test('keine Fußnotenreste, keine Titelei, Mottos erhalten', () => {
    expect(text).not.toMatch(/Benedetto Croce war erst|Gedächtnistäuschung|Bermann-Fischer|Titelseite/);
    expect(text).toContain('»Begegnen wir der Zeit, wie sie uns sucht.«');
    expect(text).toContain('Still und ruhig auferzogen Wirft man uns auf einmal in die Welt');
  });

  test('Abschnittslängen im Rahmen', () => {
    for (const s of sections) expect(wc(s.text)).toBeLessThanOrEqual(200);
  });
});
