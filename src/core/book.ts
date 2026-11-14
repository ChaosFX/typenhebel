import { replaceRare } from './rare';
import { cleanParagraph, segment, type Section } from './text';

export interface Chapter {
  title: string;
  /** Index des ersten Abschnitts dieses Kapitels in `Book.sections` */
  sectionStart: number;
}

export interface BookSource {
  name: string;
  url?: string;
  edition?: string;
  license?: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  source?: BookSource;
  /** Fehlt bei Texten ohne Kapitel (Demotext, eingefügter Text). */
  chapters?: Chapter[];
  sections: Section[];
  created?: number;
}

/** Kapitel mit Absätzen, wie sie ein Import (z. B. EPUB) liefert. */
export interface RawChapter {
  title: string;
  paragraphs: string[];
}

/**
 * Kapitel normalisieren und segmentieren. Leere Kapitel entfallen.
 * Abschnitte enden immer an Kapitelgrenzen.
 */
export function assembleChapters(
  raw: RawChapter[],
  { replace = false }: { replace?: boolean } = {},
): { chapters: Chapter[]; sections: Section[] } {
  const chapters: Chapter[] = [];
  const sections: Section[] = [];
  for (const ch of raw) {
    const paras = ch.paragraphs
      .map(cleanParagraph)
      .map((p) => (replace ? replaceRare(p) : p))
      .filter(Boolean);
    if (!paras.length) continue;
    chapters.push({ title: cleanParagraph(ch.title), sectionStart: sections.length });
    sections.push(...segment(paras));
  }
  return { chapters, sections };
}

/** Kapitel, zu dem ein Abschnitt gehört (Index in `chapters`), oder -1 ohne Kapitel. */
export function chapterOf(book: Pick<Book, 'chapters'>, sectionIdx: number): number {
  const chs = book.chapters;
  if (!chs?.length) return -1;
  let k = 0;
  while (k + 1 < chs.length && chs[k + 1]!.sectionStart <= sectionIdx) k++;
  return k;
}

/** Abschnittsbereich [start, end) eines Kapitels. */
export function chapterRange(book: Pick<Book, 'chapters' | 'sections'>, k: number): [number, number] {
  const chs = book.chapters ?? [];
  const start = chs[k]?.sectionStart ?? 0;
  const end = chs[k + 1]?.sectionStart ?? book.sections.length;
  return [start, end];
}
