export interface Section {
  text: string;
  /** Index des Leerzeichens nach einem Absatzende */
  breaks: number[];
  /**
   * Index des Leerzeichens am Ende einer Zeile innerhalb eines Absatzes (Verse, Mottos): Dort beginnt eine neue
   * Zeile, aber ohne Absatzabstand. Getippt wird wie am Absatzende ein Leerzeichen. Fehlt bei älteren Daten.
   */
  lines?: number[];
  /** Hinweis über dem Abschnitt (Training: was geübt wird und warum) */
  note?: string;
}

export interface Prepared {
  paragraphs: string[];
  headings: string[];
  rare: string[];
}

/** Wortzahl */
export const wc = (s: string): number => {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
};

const SPACES = /[\u00a0\u2007\u2009\u202f]/g;
const INVISIBLE = /[\u200b-\u200d\u2060\ufeff\u00ad]/g;
const PAGE_NUMBER = /^[-–—]?\s*\d{1,4}\s*[-–—]?$/;
const PARAGRAPH_END = /[.!?…:,;"“”«»]$/;
const COMMON_CHARS = /[^\p{L}\p{N}\s.,;:!?'"„“”‚‘’»«›‹()[\]\-–—/&%§€$@*+=_]/gu;
const SENTENCE_SPLIT = /(?<=[.!?]["“”»«’']?)(\s+)(?=[„"»«(A-ZÄÖÜ0-9])/u;

/**
 * Zeichen-Normalisierung (SPEC §2): NFC, Sonder-Leerzeichen, unsichtbare Zeichen, ſ → s, … → ...
 * Zeilenumbrüche bleiben erhalten.
 */
export function normalize(s: string): string {
  return s
    .normalize('NFC')
    .replace(SPACES, ' ')
    .replace(INVISIBLE, '')
    .replace(/ſ/g, 's')
    .replace(/…/g, '...')
    .replace(/\t/g, ' ');
}

/**
 * Absatz aus strukturierter Quelle (z. B. EPUB): normalisieren, Leerraum zusammenfassen.
 * Einzelne Zeilenumbrüche (aus <br>, etwa in Versen) bleiben als „\n“ erhalten.
 */
export const cleanParagraph = (s: string): string =>
  normalize(s)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();

/** Rohtext normalisieren und in Absätze und Überschriften zerlegen. */
export function prepare(raw: string): Prepared {
  const s = normalize(String(raw).replace(/\r\n?/g, '\n')).replace(/\[\d{1,3}\]/g, '');
  let blocks = s.split(/\n\s*\n/);
  if (blocks.length < 3 && s.split('\n').length > 6) blocks = s.split('\n');
  const paragraphs: string[] = [];
  const headings: string[] = [];
  for (let b of blocks) {
    b = b
      .replace(/\s*\n\s*/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    if (!b) continue;
    if (PAGE_NUMBER.test(b)) continue;
    if (b.split(' ').length <= 6 && !PARAGRAPH_END.test(b)) {
      headings.push(b);
      continue;
    }
    paragraphs.push(b);
  }
  const rare = [...new Set(paragraphs.join('').match(COMMON_CHARS) ?? [])];
  return { paragraphs, headings, rare };
}

interface Unit {
  t: string;
  /** Absatzende */
  end: boolean;
  /** Zeilenende innerhalb des Absatzes (Satzgrenze fiel auf einen Zeilenumbruch) */
  nl?: boolean;
}

/** Absätze zu Abschnitten von etwa min–max Wörtern zusammenfassen. */
export function segment(paras: string[], { min = 90, max = 200 }: { min?: number; max?: number } = {}): Section[] {
  const units: Unit[] = [];
  for (const p of paras) {
    if (wc(p) <= max) {
      units.push({ t: p, end: true });
      continue;
    }
    // Mit Gruppe im Muster liefert split abwechselnd Satz und Trennraum; der Trennraum zeigt, ob die Grenze
    // auf einen Zeilenumbruch fiel.
    const parts = p.split(SENTENCE_SPLIT);
    for (let i = 0; i < parts.length; i += 2)
      units.push({ t: parts[i]!, end: i === parts.length - 1, nl: parts[i + 1]?.includes('\n') });
  }
  const out: Section[] = [];
  let cur: Unit[] = [];
  let words = 0;
  const flush = (): void => {
    if (!cur.length) return;
    const chars: string[] = [];
    const breaks: number[] = [];
    const lines: number[] = [];
    cur.forEach((u, k) => {
      if (k > 0) {
        const prev = cur[k - 1]!;
        if (prev.end) breaks.push(chars.length);
        else if (prev.nl) lines.push(chars.length);
        chars.push(' ');
      }
      for (const ch of u.t) {
        if (ch === '\n') {
          lines.push(chars.length);
          chars.push(' ');
        } else chars.push(ch);
      }
    });
    out.push(lines.length ? { text: chars.join(''), breaks, lines } : { text: chars.join(''), breaks });
    cur = [];
    words = 0;
  };
  for (const u of units) {
    const uw = wc(u.t);
    if (words > 0 && words + uw > max) flush();
    cur.push(u);
    words += uw;
    if (u.end && words >= min) flush();
  }
  flush();
  if (out.length > 1) {
    const last = out[out.length - 1]!;
    if (wc(last.text) < min / 2) {
      const prev = out[out.length - 2]!;
      const off = Array.from(prev.text).length + 1;
      prev.text += ' ' + last.text;
      prev.breaks.push(...last.breaks.map((b) => b + off));
      if (last.lines?.length) (prev.lines ??= []).push(...last.lines.map((b) => b + off));
      out.pop();
    }
  }
  return out;
}
