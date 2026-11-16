// Mitgelieferte Bücher (public/corpus/): Index-Format und Prüfung. Wird vom Korpus-Skript erzeugt.
import type { Book, BookSource } from '../core';
import type { BookMeta } from './records';

export const CORPUS_VERSION = 1;
/** Buch-IDs mitgelieferter Bücher beginnen mit diesem Präfix. */
export const CORPUS_PREFIX = 'c:';

export interface CorpusEntry {
  id: string;
  /** Dateiname in public/corpus/ */
  file: string;
  title: string;
  author: string;
  chapters: number;
  sections: number;
  words: number;
  bytes: number;
  source: BookSource & { retrieved: string };
  note?: string;
  /** Prüfsumme der Abschnitte (wie `Book.rev`) */
  rev?: string;
}

export interface CorpusIndex {
  version: number;
  books: CorpusEntry[];
}

const isStr = (x: unknown): x is string => typeof x === 'string';

/** Index prüfen; unbekannte Version oder kaputte Einträge → leere Liste (die App läuft dann ohne Korpus). */
export function parseCorpusIndex(x: unknown): CorpusEntry[] {
  if (typeof x !== 'object' || x === null) return [];
  const idx = x as Partial<CorpusIndex>;
  if (idx.version !== CORPUS_VERSION || !Array.isArray(idx.books)) return [];
  return idx.books.filter(
    (b): b is CorpusEntry =>
      typeof b === 'object' &&
      b !== null &&
      isStr(b.id) &&
      b.id.startsWith(CORPUS_PREFIX) &&
      isStr(b.file) &&
      /^[\w-]+\.json$/.test(b.file) &&
      isStr(b.title) &&
      isStr(b.author) &&
      typeof b.sections === 'number',
  );
}

/** Heruntergeladenes Buch prüfen, bevor es gespeichert wird. */
export function checkCorpusBook(x: unknown, entry: CorpusEntry): Book {
  const b = x as Book;
  if (
    typeof b !== 'object' ||
    b === null ||
    b.id !== entry.id ||
    !Array.isArray(b.sections) ||
    !b.sections.length ||
    !b.sections.every(
      (s) => isStr(s?.text) && Array.isArray(s.breaks) && (s.lines === undefined || Array.isArray(s.lines)),
    )
  )
    throw new Error('Das Buch ist beschädigt.');
  return { ...b, created: Date.now() };
}

/**
 * Gespeicherte Korpusbücher, die nach einem Korpus-Update veraltet sind (z. B. neue Zeilenumbrüche in Versen).
 * Nur wenn die Abschnittszahl gleich geblieben ist; sonst passt der Fortschritt nicht mehr und die alte Kopie bleibt.
 */
export function outdatedCorpusBooks(owned: readonly BookMeta[], index: readonly CorpusEntry[]): CorpusEntry[] {
  const byId = new Map(owned.map((b) => [b.id, b]));
  return index.filter((e) => {
    const b = byId.get(e.id);
    return !!b && !!e.rev && b.rev !== e.rev && b.sectionCount === e.sections;
  });
}
