// EPUB lesen: container.xml → OPF → Spine → XHTML-Kapitel in Lesereihenfolge (SPEC §7, Phase 1).
import { strFromU8, unzipSync } from 'fflate';
import type { RawChapter } from '../core/book';
import { extractChapter } from './xhtml';

export interface EpubBook {
  title: string;
  author: string;
  publisher?: string;
  date?: string;
  language?: string;
  chapters: RawChapter[];
}

export class EpubError extends Error {
  override name = 'EpubError';
}

const BINARY = /\.(png|jpe?g|gif|webp|svg|bmp|ttf|otf|woff2?|mp3|mp4|m4a|ogg)$/i;
const HTML_TYPES = new Set(['application/xhtml+xml', 'text/html']);

/** Elemente nach lokalem Namen, unabhängig vom Namespace-Präfix (opf:item, item, …). */
const byLocalName = (root: Document | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name);

/** Pfad relativ zu `base` (Verzeichnis mit abschließendem /) auflösen, ohne Fragment. */
export function resolvePath(base: string, href: string): string {
  const clean = decodeURIComponent(href.split('#')[0]!.split('?')[0]!);
  const parts = (clean.startsWith('/') ? clean.slice(1) : base + clean).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

function parseXml(parser: DOMParser, text: string, what: string): Document {
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new EpubError(`${what} ist kein gültiges XML.`);
  return doc;
}

function parseChapter(parser: DOMParser, text: string): Document {
  const xml = parser.parseFromString(text, 'application/xhtml+xml');
  if (!xml.getElementsByTagName('parsererror').length) return xml;
  // Nicht wohlgeformtes XHTML kommt vor – dann tolerant als HTML lesen.
  return parser.parseFromString(text, 'text/html');
}

export function readEpub(data: Uint8Array, parser: DOMParser = new DOMParser()): EpubBook {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(data, { filter: (f) => !BINARY.test(f.name) });
  } catch {
    throw new EpubError('Die Datei ist kein gültiges EPUB (ZIP-Archiv nicht lesbar).');
  }
  const lookup = new Map(Object.keys(files).map((k) => [k.toLowerCase(), k]));
  const read = (path: string): string | null => {
    const key = files[path] ? path : lookup.get(path.toLowerCase());
    const bytes = key ? files[key] : undefined;
    return bytes ? strFromU8(bytes) : null;
  };

  const containerXml = read('META-INF/container.xml');
  if (!containerXml) throw new EpubError('META-INF/container.xml fehlt – ist das ein EPUB?');
  const container = parseXml(parser, containerXml, 'container.xml');
  const opfPath = byLocalName(container, 'rootfile')[0]?.getAttribute('full-path');
  if (!opfPath) throw new EpubError('container.xml nennt keine OPF-Datei.');
  const opfText = read(opfPath);
  if (!opfText) throw new EpubError(`OPF-Datei ${opfPath} fehlt.`);
  const opf = parseXml(parser, opfText, 'Die OPF-Datei');
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const dc = (name: string): string | undefined =>
    byLocalName(opf, name)[0]?.textContent?.replace(/\s+/g, ' ').trim() || undefined;

  const manifest = new Map<string, { href: string; type: string; props: string }>();
  for (const item of byLocalName(opf, 'item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href)
      manifest.set(id, {
        href,
        type: item.getAttribute('media-type') ?? '',
        props: item.getAttribute('properties') ?? '',
      });
  }

  const chapters: RawChapter[] = [];
  const spine = byLocalName(opf, 'itemref');
  if (!spine.length) throw new EpubError('Die OPF-Datei hat keine Lesereihenfolge (spine).');
  for (const ref of spine) {
    if (ref.getAttribute('linear') === 'no') continue;
    const item = manifest.get(ref.getAttribute('idref') ?? '');
    if (!item || !HTML_TYPES.has(item.type) || /\bnav\b/.test(item.props)) continue;
    const text = read(resolvePath(opfDir, item.href));
    if (text === null) continue;
    chapters.push(extractChapter(parseChapter(parser, text), `Kapitel ${chapters.length + 1}`));
  }
  if (!chapters.length) throw new EpubError('Im EPUB wurden keine Kapitel gefunden.');

  return {
    title: dc('title') ?? 'Ohne Titel',
    author: byLocalName(opf, 'creator')
      .map((c) => c.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(', '),
    publisher: dc('publisher'),
    date: dc('date'),
    language: dc('language'),
    chapters,
  };
}
