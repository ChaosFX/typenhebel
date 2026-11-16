// Fließtext aus einem XHTML-Kapitel gewinnen (SPEC §7, Phase 1).
// Überschriften werden zum Kapiteltitel (nicht getippt), Absätze und Zeilenumbrüche (<br>, etwa in Versen) bleiben erhalten,
// Fußnoten, Seitenzahlen, Navigation und Bilder fallen weg, Kursiv/Fett wird zu reinem Text.
import type { RawChapter } from '../core/book';

const OPS_NS = 'http://www.idpf.org/2007/ops';

const SKIP_TAGS = new Set([
  'head',
  'script',
  'style',
  'nav',
  'aside',
  'img',
  'svg',
  'math',
  'figure',
  'audio',
  'video',
  'object',
  'iframe',
  'rt',
  'rp',
  'template',
]);
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BLOCKS = new Set([
  'p',
  'div',
  'li',
  'blockquote',
  'tr',
  'dd',
  'dt',
  'pre',
  'section',
  'article',
  'header',
  'footer',
  'ul',
  'ol',
  'dl',
  'table',
  'tbody',
  'thead',
  'tfoot',
  'hr',
  'address',
  'center',
  'body',
]);
const CELLS = new Set(['td', 'th']);
const SKIP_CLASSES = /\b(footnotes?|endnotes?|fn|fnote|note|noteref|pagenum|page-?number|pagebreak)\b/i;
const SKIP_TYPES = /\b(footnotes?|endnotes?|rearnotes?|note|noteref|pagebreak)\b/;
const SKIP_ROLES = /\bdoc-(footnote|endnote|endnotes|noteref|pagebreak|backlink)\b/;
const FOOTNOTE_MARK = /^\W*[\d*†‡]+\W*$/u;
/** Vorspann: Titelei, Impressum, Inhaltsverzeichnis. Daraus bleibt nur ein Motto. */
const FRONT_TITLES = /^(titelseite|titelblatt|titel|title ?page|impressum|inhalt|inhaltsverzeichnis|cover|copyright)$/i;
const FRONT_TYPES = /\b(titlepage|cover|copyright-page|toc|frontmatter|colophon|imprint)\b/;
const MOTTO_CLASSES = /\b(motto|epigraph)\b/i;
/** Von Konvertern erzeugte Nummern-Überschriften („Kapitel 3“) – nur Titel, wenn es keine bessere gibt. */
const GENERIC_HEADING = /^(kapitel|chapter)\s+\d+$/i;

const epubType = (el: Element): string => el.getAttributeNS(OPS_NS, 'type') ?? el.getAttribute('epub:type') ?? '';

function skipElement(el: Element): boolean {
  const tag = el.localName.toLowerCase();
  if (SKIP_TAGS.has(tag)) return true;
  if (SKIP_CLASSES.test(el.getAttribute('class') ?? '')) return true;
  if (SKIP_TYPES.test(epubType(el))) return true;
  if (SKIP_ROLES.test(el.getAttribute('role') ?? '')) return true;
  if (tag === 'sup' && FOOTNOTE_MARK.test(el.textContent ?? '')) return true;
  if (tag === 'a' && /^#(fn|ftn|note|footnote)/i.test(el.getAttribute('href') ?? '')) return true;
  return false;
}

const isMotto = (el: Element): boolean =>
  MOTTO_CLASSES.test(el.getAttribute('class') ?? '') || /\bepigraph\b/.test(epubType(el));

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** Wie squash, aber Zeilenumbrüche aus <br> (als „\n“) bleiben stehen; mehrere hintereinander zählen als einer. */
const squashLines = (s: string): string =>
  s
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();

/** Überschriftentext; Zeilenumbrüche (<br>) trennen Zeilen mit „ – “ (nach Doppelpunkt nur Leerzeichen). */
function headingText(el: Element): string {
  const lines: string[] = [''];
  const walk = (node: Node): void => {
    if (node.nodeType === 3 || node.nodeType === 4) lines[lines.length - 1] += node.nodeValue ?? '';
    else if (node.nodeType === 1 && !skipElement(node as Element)) {
      if ((node as Element).localName.toLowerCase() === 'br') lines.push('');
      else for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    }
  };
  walk(el);
  return lines
    .map(squash)
    .filter(Boolean)
    .reduce((a, l) => (a ? a + (a.endsWith(':') ? ' ' : ' – ') + l : l), '');
}

/**
 * Kapitel aus einem geparsten XHTML-Dokument lesen.
 * @param fallbackTitle Titel, falls das Dokument keine Überschrift hat
 */
export function extractChapter(doc: Document, fallbackTitle: string): RawChapter {
  const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement;
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const mottos: string[] = [];
  let buf = '';
  let mottoDepth = 0;

  const flush = (): void => {
    const p = squashLines(buf);
    buf = '';
    if (!p) return;
    paragraphs.push(p);
    if (mottoDepth > 0) mottos.push(p);
  };

  const walk = (node: Node): void => {
    if (node.nodeType === 3 || node.nodeType === 4) {
      // Zeilenumbrüche im Quelltext sind nur Leerraum; echte Umbrüche kommen aus <br>.
      buf += (node.nodeValue ?? '').replace(/\s+/g, ' ');
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (skipElement(el)) return;
    const tag = el.localName.toLowerCase();
    if (tag === 'br') {
      buf += '\n';
      return;
    }
    if (HEADINGS.has(tag)) {
      flush();
      const h = headingText(el);
      if (h) headings.push(h);
      return;
    }
    const block = BLOCKS.has(tag);
    const motto = isMotto(el);
    if (block) flush();
    if (CELLS.has(tag) && squash(buf)) buf += ' ';
    if (motto) mottoDepth++;
    for (let c = el.firstChild; c; c = c.nextSibling) walk(c);
    if (block) flush();
    if (motto) mottoDepth--;
  };
  walk(body);
  flush();

  const docTitle = squash(doc.getElementsByTagName('title')[0]?.textContent ?? '');
  const title = headings.find((h) => !GENERIC_HEADING.test(h)) ?? headings[0] ?? (docTitle || fallbackTitle);
  const front =
    FRONT_TITLES.test(title) || FRONT_TYPES.test(epubType(body)) || FRONT_TYPES.test(epubType(doc.documentElement));
  if (front) return { title: mottos.length ? 'Motto' : title, paragraphs: mottos };
  return { title, paragraphs };
}
