// Erzeugte Buchcover als SVG – ohne Bilder von außen, also ohne Rechtefragen.
// Layout und Farben folgen deterministisch aus dem Buch: gleiches Buch, gleiches Cover.

export interface CoverInput {
  id: string;
  title: string;
  author: string;
}

export interface Palette {
  name: string;
  bg: string;
  ink: string;
  accent: string;
}

/** Warme, gedeckte Leinen- und Papierfarben (Charakter: ruhig, buchartig). */
export const PALETTES: Palette[] = [
  { name: 'Bordeaux', bg: '#6b2a28', ink: '#f3e7d2', accent: '#d9a55b' },
  { name: 'Tinte', bg: '#23324a', ink: '#efe6d2', accent: '#c99a54' },
  { name: 'Moos', bg: '#3b4931', ink: '#ece3cc', accent: '#cfae6a' },
  { name: 'Ocker', bg: '#c38c3f', ink: '#2a2016', accent: '#5a2a1c' },
  { name: 'Petrol', bg: '#1f4a4c', ink: '#eee4cf', accent: '#dca76c' },
  { name: 'Schiefer', bg: '#3d3b38', ink: '#ece2cf', accent: '#c45e40' },
  { name: 'Rost', bg: '#9b3d2a', ink: '#f6ead6', accent: '#2a2420' },
  { name: 'Pergament', bg: '#ebe1cb', ink: '#2a2420', accent: '#9b3d2a' },
  { name: 'Aubergine', bg: '#45293f', ink: '#f0e3d3', accent: '#d3a05f' },
];

export const LAYOUTS = ['rahmen', 'tasten', 'initial', 'typoskript'] as const;
export type Layout = (typeof LAYOUTS)[number];
/** Layouts, aus denen automatisch gewählt wird (Dominik, 2026-11-14); die übrigen lassen sich von Hand wählen. */
export const DEFAULT_LAYOUTS: readonly Layout[] = ['rahmen', 'tasten'];
export const LAYOUT_NAMES: Record<Layout, string> = {
  rahmen: 'Rahmen',
  tasten: 'Tasten',
  initial: 'Initial',
  typoskript: 'Typoskript',
};

/** Vom Nutzer gewähltes Cover (Palette per Name, damit gespeicherte Werte Farbänderungen überstehen). */
export interface CoverChoice {
  layout: Layout;
  palette: string;
}

export const isCoverChoice = (x: unknown): x is CoverChoice =>
  typeof x === 'object' &&
  x !== null &&
  LAYOUTS.includes((x as CoverChoice).layout) &&
  PALETTES.some((p) => p.name === (x as CoverChoice).palette);

export const COVER_W = 400;
export const COVER_H = 600;

const SERIF = "Literata, 'Source Serif 4', 'Iowan Old Style', Palatino, Georgia, serif";
const MONO = "'Courier Prime', 'Courier New', Courier, monospace";

/** FNV-1a, 32 Bit, mit Abschlussmischung */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (const c of s) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  // Abschließend durchmischen (fmix32 aus MurmurHash3): FNV allein verteilt die unteren Bits schlecht.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Kleiner deterministischer Zufallsgenerator (mulberry32) */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Titel in Haupt- und Untertitel teilen („Faust: Eine Tragödie“, „Moby Dick oder Der weiße Wal“). */
export function splitTitle(title: string): { main: string; sub: string } {
  const t = title.trim().replace(/\s+/g, ' ');
  let m = /^(.+?)(?::|\s[–—-])\s+(.+)$/.exec(t);
  if (m) return { main: m[1]!, sub: m[2]! };
  m = /^(.+?)\s+(oder\s+.+)$/.exec(t);
  if (m) return { main: m[1]!, sub: m[2]! };
  return { main: t, sub: '' };
}

/** Grobe Breite einer Serifenschrift in em – reicht für den Zeilenumbruch ohne DOM. */
function emWidthRaw(s: string): number {
  let w = 0;
  for (const c of s) {
    if (c === ' ') w += 0.26;
    else if (/[iljtfI.,;:'!|’‘]/.test(c)) w += 0.3;
    else if (/[mwMW]/.test(c)) w += 0.85;
    else if (/[\p{Lu}0-9]/u.test(c)) w += 0.68;
    else w += 0.52;
  }
  return w;
}

/**
 * Zeilen gleichmäßig verteilen: gleiche Zeilenzahl, aber möglichst kleine längste Zeile
 * (vermeidet einzelne kurze Wörter wie „von“ in einer eigenen Zeile).
 */
function balance(words: string[], n: number, width: (s: string) => number): string[] {
  let best: string[] = [];
  let bestScore = Infinity;
  const go = (start: number, left: number, acc: string[]): void => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')];
      const ws = lines.map(width);
      // längste Zeile zählt, Ungleichheit leicht bestraft
      const score = Math.max(...ws) + 0.15 * (Math.max(...ws) - Math.min(...ws));
      if (score < bestScore) {
        bestScore = score;
        best = lines;
      }
      return;
    }
    for (let end = start + 1; end <= words.length - left + 1; end++)
      go(end, left - 1, [...acc, words.slice(start, end).join(' ')]);
  };
  if (words.length > 14) return [];
  go(0, n, []);
  return best;
}

/** Text in Zeilen umbrechen; liefert die größte Schriftgröße, bei der alles passt. `tracking` = Laufweite in em. */
export function fitText(
  text: string,
  maxWidth: number,
  {
    sizes = [60, 54, 48, 44, 40, 36, 32, 28, 25, 22, 19],
    maxLines = 4,
    tracking = 0,
  }: { sizes?: number[]; maxLines?: number; tracking?: number } = {},
): { size: number; lines: string[] } {
  const words = text.split(' ').filter(Boolean);
  const emWidth = (x: string): number => emWidthRaw(x) + tracking * Array.from(x).length;
  for (const size of sizes) {
    const lines: string[] = [];
    let cur = '';
    let ok = true;
    for (const w of words) {
      if (emWidth(w) * size > maxWidth) {
        ok = false;
        break;
      }
      const next = cur ? cur + ' ' + w : w;
      if (emWidth(next) * size <= maxWidth) cur = next;
      else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    if (ok && lines.length <= maxLines) {
      const bal = lines.length > 1 ? balance(words, lines.length, (x) => emWidth(x) * size) : [];
      return { size, lines: bal.length && bal.every((l) => emWidth(l) * size <= maxWidth) ? bal : lines };
    }
  }
  const size = sizes[sizes.length - 1]!;
  return { size, lines: [text] };
}

function textBlock(
  lines: string[],
  {
    x,
    y,
    size,
    lh = 1.12,
    anchor = 'middle',
    fill,
    weight = 600,
    family = SERIF,
    extra = '',
  }: {
    x: number;
    y: number;
    size: number;
    lh?: number;
    anchor?: 'start' | 'middle' | 'end';
    fill: string;
    weight?: number;
    family?: string;
    extra?: string;
  },
): string {
  const tspans = lines
    .map((l, i) => `<tspan x="${x}" y="${(y + i * size * lh).toFixed(1)}">${esc(l)}</tspan>`)
    .join('');
  return `<text font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${tspans}</text>`;
}

/** Kleines Typenhebel-Zeichen (Hebel mit Type) als Verlagssignet. */
function mark(cx: number, cy: number, s: number, color: string): string {
  return `<g transform="translate(${cx - 24 * s} ${cy - 24 * s}) scale(${s})" fill="none" stroke="${color}">
<path d="M3 44.5 H8 C19 44.5 25.5 35 32 16" stroke-width="2.6" stroke-linecap="round"/>
<g transform="rotate(22 33.5 11)"><rect x="27.5" y="4.5" width="12" height="13" rx="2.6" stroke-width="1.9"/></g>
<circle cx="39.6" cy="15.6" r="2.4" fill="${color}" stroke="none"/></g>`;
}

const authorCaps = (a: string): string => a.toUpperCase();

function layoutRahmen(b: CoverInput, p: Palette): string {
  const { main, sub } = splitTitle(b.title);
  const t = fitText(main, 270, { maxLines: 4 });
  const s = sub ? fitText(sub, 270, { sizes: [24, 22, 20, 18, 16], maxLines: 3 }) : null;
  const a = fitText(authorCaps(b.author), 290, { sizes: [17, 15, 13, 12], maxLines: 2, tracking: 0.17 });
  const blockH = t.lines.length * t.size * 1.12 + (s ? 18 + s.lines.length * s.size * 1.25 : 0);
  const y0 = 290 - blockH / 2 + t.size * 0.8;
  let out = `<rect width="${COVER_W}" height="${COVER_H}" fill="${p.bg}"/>
<rect x="22" y="22" width="356" height="556" fill="none" stroke="${p.accent}" stroke-width="2.5"/>
<rect x="31" y="31" width="338" height="538" fill="none" stroke="${p.accent}" stroke-width="0.8"/>
<text x="200" y="104" font-family="${SERIF}" font-size="26" fill="${p.accent}" text-anchor="middle">⁂</text>`;
  out += textBlock(t.lines, { x: 200, y: y0, size: t.size, fill: p.ink });
  if (s)
    out += textBlock(s.lines, {
      x: 200,
      y: y0 + (t.lines.length - 1) * t.size * 1.12 + 18 + s.size * 1.25,
      size: s.size,
      lh: 1.25,
      fill: p.ink,
      weight: 400,
      extra: 'font-style="italic" opacity="0.85"',
    });
  const ay = 482 - (a.lines.length - 1) * a.size * 0.6;
  const ry = Math.min(452, ay - a.size - 12);
  out += `<line x1="170" y1="${ry}" x2="230" y2="${ry}" stroke="${p.accent}" stroke-width="1.5"/>`;
  out += textBlock(a.lines, {
    x: 200,
    y: ay,
    size: a.size,
    lh: 1.35,
    fill: p.ink,
    weight: 500,
    extra: 'letter-spacing="2.5"',
  });
  out += mark(200, 532, 0.95, p.accent);
  return out;
}

function layoutInitial(b: CoverInput, p: Palette, r: () => number): string {
  const { main, sub } = splitTitle(b.title);
  const initial = Array.from(main.replace(/^(Der|Die|Das|Ein|Eine)\s+/, ''))[0] ?? '?';
  const t = fitText(main, 320, { maxLines: 3, sizes: [52, 46, 42, 38, 34, 30, 27, 24] });
  const s = sub ? fitText(sub, 320, { sizes: [22, 20, 18, 16], maxLines: 2 }) : null;
  const a = fitText(b.author, 320, { sizes: [20, 18, 16, 14], maxLines: 2 });
  const rot = (r() * 16 - 8).toFixed(1);
  let out = `<rect width="${COVER_W}" height="${COVER_H}" fill="${p.bg}"/>
<text x="${250 + r() * 40}" y="610" font-family="${SERIF}" font-size="520" font-weight="700" fill="${p.accent}" opacity="0.32" text-anchor="middle" transform="rotate(${rot} 260 420)">${esc(initial)}</text>
<rect x="40" y="48" width="44" height="5" fill="${p.accent}"/>`;
  const y0 = 100 + t.size * 0.8;
  out += textBlock(t.lines, { x: 40, y: y0, size: t.size, fill: p.ink, anchor: 'start', weight: 700 });
  let y = y0 + (t.lines.length - 1) * t.size * 1.12;
  if (s) {
    y += 14 + s.size * 1.2;
    out += textBlock(s.lines, {
      x: 40,
      y,
      size: s.size,
      lh: 1.25,
      fill: p.ink,
      anchor: 'start',
      weight: 400,
      extra: 'font-style="italic" opacity="0.85"',
    });
    y += (s.lines.length - 1) * s.size * 1.25;
  }
  out += textBlock(a.lines, { x: 40, y: y + 40, size: a.size, fill: p.accent, anchor: 'start', weight: 500 });
  return out;
}

function layoutTyposkript(b: CoverInput, p: Palette, r: () => number): string {
  const { main, sub } = splitTitle(b.title);
  // Hintergrund: eine mit der Schreibmaschine getippte Seite aus dem Titel
  const src = (b.title + ' · ' + b.author + ' · ').replace(/\s+/g, ' ');
  const rows: string[] = [];
  let k = Math.floor(r() * src.length);
  for (let row = 0; row < 34; row++) {
    let line = '';
    for (let i = 0; i < 44; i++) line += src[(k + i) % src.length];
    k += 7 + Math.floor(r() * 5);
    const y = 26 + row * 17.4;
    const jitter = (r() * 2 - 1).toFixed(2);
    rows.push(`<text x="${12 + Number(jitter)}" y="${y.toFixed(1)}">${esc(line)}</text>`);
  }
  const t = fitText(main, 250, { maxLines: 4, sizes: [44, 40, 36, 32, 29, 26, 23, 20] });
  const s = sub ? fitText(sub, 250, { sizes: [18, 16, 15, 14], maxLines: 3 }) : null;
  const a = fitText(authorCaps(b.author), 240, { sizes: [14, 13, 12, 11], maxLines: 2, tracking: 0.16 });
  const tH = t.lines.length * t.size * 1.1;
  const sH = s ? 12 + s.lines.length * s.size * 1.3 : 0;
  const aH = 22 + a.lines.length * a.size * 1.4;
  const h = 56 + tH + sH + aH;
  const top = 300 - h / 2;
  let out = `<rect width="${COVER_W}" height="${COVER_H}" fill="${p.bg}"/>
<g font-family="${MONO}" font-size="15" fill="${p.ink}" opacity="0.13">${rows.join('')}</g>
<rect x="56" y="${top.toFixed(1)}" width="288" height="${h.toFixed(1)}" fill="${p.ink}" />
<rect x="64" y="${(top + 8).toFixed(1)}" width="272" height="${(h - 16).toFixed(1)}" fill="none" stroke="${p.bg}" stroke-width="1"/>`;
  let y = top + 30 + t.size * 0.8;
  out += textBlock(t.lines, { x: 200, y, size: t.size, lh: 1.1, fill: p.bg });
  y += (t.lines.length - 1) * t.size * 1.1;
  if (s) {
    y += 12 + s.size * 1.3;
    out += textBlock(s.lines, {
      x: 200,
      y,
      size: s.size,
      lh: 1.3,
      fill: p.bg,
      weight: 400,
      extra: 'font-style="italic"',
    });
    y += (s.lines.length - 1) * s.size * 1.3;
  }
  out += textBlock(a.lines, {
    x: 200,
    y: y + 22 + a.size * 1.2,
    size: a.size,
    lh: 1.4,
    fill: p.accent === p.bg ? p.bg : p.accent,
    weight: 600,
    extra: 'letter-spacing="2"',
  });
  return out;
}

function layoutTasten(b: CoverInput, p: Palette, r: () => number): string {
  // Raster aus Schreibmaschinentasten; die Buchstaben des Titels sind hervorgehoben
  const { main, sub } = splitTitle(b.title);
  const letters = new Set(Array.from(main.toUpperCase()).filter((c) => /\p{L}/u.test(c)));
  const rowsKeys = ['1234567890ß', 'QWERTZUIOPÜ', 'ASDFGHJKLÖÄ', 'YXCVBNM,.-'];
  let keys = '';
  const off = [0, 12, 20, 32];
  rowsKeys.forEach((row, ri) => {
    Array.from(row).forEach((c, ci) => {
      const cx = 38 + off[ri]! + ci * 31;
      const cy = 70 + ri * 33;
      const hit = letters.has(c);
      keys += `<circle cx="${cx}" cy="${cy}" r="12.5" fill="${hit ? p.accent : 'none'}" stroke="${p.ink}" stroke-opacity="${hit ? 0 : 0.35}" stroke-width="1.2"/>`;
      keys += `<text x="${cx}" y="${cy + 4.5}" font-family="${MONO}" font-size="12.5" font-weight="700" text-anchor="middle" fill="${hit ? p.bg : p.ink}" opacity="${hit ? 1 : 0.45}">${esc(c)}</text>`;
    });
  });
  void r;
  const t = fitText(main, 320, { maxLines: 4, sizes: [54, 48, 44, 40, 36, 32, 28, 25, 22] });
  const s = sub ? fitText(sub, 320, { sizes: [21, 19, 17, 15], maxLines: 2 }) : null;
  const a = fitText(b.author, 320, { sizes: [19, 17, 15, 13], maxLines: 2 });
  let y = 300 + t.size * 0.8;
  let out = `<rect width="${COVER_W}" height="${COVER_H}" fill="${p.bg}"/>${keys}
<line x1="40" y1="250" x2="360" y2="250" stroke="${p.ink}" stroke-opacity="0.35" stroke-width="1"/>`;
  out += textBlock(t.lines, { x: 40, y, size: t.size, fill: p.ink, anchor: 'start', weight: 700 });
  y += (t.lines.length - 1) * t.size * 1.12;
  if (s) {
    y += 12 + s.size * 1.2;
    out += textBlock(s.lines, {
      x: 40,
      y,
      size: s.size,
      lh: 1.25,
      fill: p.ink,
      anchor: 'start',
      weight: 400,
      extra: 'font-style="italic" opacity="0.85"',
    });
  }
  out += textBlock(a.lines, {
    x: 40,
    y: 548 - (a.lines.length - 1) * a.size * 1.2,
    size: a.size,
    lh: 1.2,
    fill: p.accent,
    anchor: 'start',
    weight: 500,
  });
  return out;
}

export interface CoverOptions {
  layout?: Layout;
  /** Name aus PALETTES */
  palette?: string;
}

/** Automatische Wahl von Layout und Farbe für ein Buch (deterministisch). */
export function coverStyle(b: CoverInput): CoverChoice {
  const h = hash(b.id + '\u0000' + b.title);
  return {
    layout: DEFAULT_LAYOUTS[h % DEFAULT_LAYOUTS.length]!,
    palette: PALETTES[(h >>> 8) % PALETTES.length]!.name,
  };
}

/** Zufälliges anderes Cover („Würfeln“): andere Kombination als `current`. */
export function randomCover(current: CoverChoice, rand: () => number = Math.random): CoverChoice {
  for (;;) {
    const c = {
      layout: LAYOUTS[Math.floor(rand() * LAYOUTS.length)]!,
      palette: PALETTES[Math.floor(rand() * PALETTES.length)]!.name,
    };
    if (c.layout !== current.layout || c.palette !== current.palette) return c;
  }
}

const paletteByName = (name: string): Palette => PALETTES.find((p) => p.name === name) ?? PALETTES[0]!;

/** Cover als eigenständiges SVG (viewBox 400 × 600). */
export function coverSvg(b: CoverInput, opts: CoverOptions = {}): string {
  const style = coverStyle(b);
  const layout = opts.layout ?? style.layout;
  const p = paletteByName(opts.palette ?? style.palette);
  const r = rng(hash(b.title + b.author));
  const body =
    layout === 'rahmen'
      ? layoutRahmen(b, p)
      : layout === 'initial'
        ? layoutInitial(b, p, r)
        : layout === 'typoskript'
          ? layoutTyposkript(b, p, r)
          : layoutTasten(b, p, r);
  const label = esc(`${b.title} – ${b.author}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COVER_W} ${COVER_H}" role="img" aria-label="${label}">${body}</svg>`;
}
