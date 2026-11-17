// Deutsche Tastatur (ISO, QWERTZ, Belegung T1 nach DIN 2137) mit Fingerzuordnung des Zehnfingersystems.
// Grundlage für die Auswertungen nach Finger/Hand und die Fehlerarten (SPEC Phase 3).
import { matches } from './match';

export type Hand = 'left' | 'right';
export type Finger = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';
/** 0 = Zahlenreihe, 1 = obere Reihe (QWERTZ), 2 = Grundreihe (ASDF), 3 = untere Reihe (YXCV), 4 = Leertaste */
export type Row = 0 | 1 | 2 | 3 | 4;

export interface Key {
  /** Zeichen ohne Umschalttaste; bei der Leertaste ' ' */
  base: string;
  row: Row;
  /** Mitte der Taste in Tastenbreiten von links (Reihen sind versetzt) */
  x: number;
  /** null für die Leertaste (beide Daumen) */
  hand: Hand | null;
  finger: Finger;
}

/** Ein Tastendruck, ggf. mit Umschalt- oder AltGr-Taste. */
export interface Stroke {
  key: Key;
  /** Welche Umschalttaste gedrückt wird (immer die der anderen Hand), sonst null */
  shift: Hand | null;
  altGr: boolean;
  /** Tottaste: erzeugt erst mit dem folgenden Anschlag ein Zeichen */
  dead: boolean;
}

export const FINGER_NAMES: Record<Finger, string> = {
  pinky: 'kleiner Finger',
  ring: 'Ringfinger',
  middle: 'Mittelfinger',
  index: 'Zeigefinger',
  thumb: 'Daumen',
};
export const HAND_NAMES: Record<Hand, string> = { left: 'links', right: 'rechts' };

/** „linker Zeigefinger“, „rechter kleiner Finger“, „Daumen“ */
export const fingerLabel = (k: Pick<Key, 'hand' | 'finger'>): string =>
  k.hand ? `${k.hand === 'left' ? 'linker' : 'rechter'} ${FINGER_NAMES[k.finger]}` : FINGER_NAMES[k.finger];

/** Beschreibung der Anschläge für ein Zeichen, z. B. „rechter kleiner Finger + Umschalttaste links“. */
export function describeStrokes(strokes: readonly Stroke[]): string {
  return strokes
    .map(
      (s) =>
        fingerLabel(s.key) +
        (s.shift ? ` + Umschalttaste ${HAND_NAMES[s.shift]}` : '') +
        (s.altGr ? ' + AltGr' : '') +
        (s.dead ? ' (Tottaste)' : ''),
    )
    .join(', dann ');
}

/** Finger je Taste einer Reihe, von links nach rechts (L/R + 5 = kleiner Finger … 2 = Zeigefinger). */
type F = 'L5' | 'L4' | 'L3' | 'L2' | 'R2' | 'R3' | 'R4' | 'R5';
interface RowDef {
  /** Linke Kante der ersten Taste (Tab 1,5, Feststelltaste 1,75, linke Umschalttaste 1,25) */
  offset: number;
  /** je Taste: [ohne Umschalt, mit Umschalt, AltGr] */
  keys: [string, string, string][];
  fingers: F[];
}

// Die 6 gehört hier zum linken Zeigefinger (wie 5, t, g, b in derselben Spalte).
const ROWS: RowDef[] = [
  {
    offset: 0,
    keys: [
      ['^', '°', ''],
      ['1', '!', ''],
      ['2', '"', '²'],
      ['3', '§', '³'],
      ['4', '$', ''],
      ['5', '%', ''],
      ['6', '&', ''],
      ['7', '/', '{'],
      ['8', '(', '['],
      ['9', ')', ']'],
      ['0', '=', '}'],
      ['ß', '?', '\\'],
      ['´', '`', ''],
    ],
    fingers: ['L5', 'L5', 'L4', 'L3', 'L2', 'L2', 'L2', 'R2', 'R3', 'R4', 'R5', 'R5', 'R5'],
  },
  {
    offset: 1.5,
    keys: [
      ['q', 'Q', '@'],
      ['w', 'W', ''],
      ['e', 'E', '€'],
      ['r', 'R', ''],
      ['t', 'T', ''],
      ['z', 'Z', ''],
      ['u', 'U', ''],
      ['i', 'I', ''],
      ['o', 'O', ''],
      ['p', 'P', ''],
      ['ü', 'Ü', ''],
      ['+', '*', '~'],
    ],
    fingers: ['L5', 'L4', 'L3', 'L2', 'L2', 'R2', 'R2', 'R3', 'R4', 'R5', 'R5', 'R5'],
  },
  {
    offset: 1.75,
    keys: [
      ['a', 'A', ''],
      ['s', 'S', ''],
      ['d', 'D', ''],
      ['f', 'F', ''],
      ['g', 'G', ''],
      ['h', 'H', ''],
      ['j', 'J', ''],
      ['k', 'K', ''],
      ['l', 'L', ''],
      ['ö', 'Ö', ''],
      ['ä', 'Ä', ''],
      ['#', "'", ''],
    ],
    fingers: ['L5', 'L4', 'L3', 'L2', 'L2', 'R2', 'R2', 'R3', 'R4', 'R5', 'R5', 'R5'],
  },
  {
    offset: 1.25,
    keys: [
      ['<', '>', '|'],
      ['y', 'Y', ''],
      ['x', 'X', ''],
      ['c', 'C', ''],
      ['v', 'V', ''],
      ['b', 'B', ''],
      ['n', 'N', ''],
      ['m', 'M', 'µ'],
      [',', ';', ''],
      ['.', ':', ''],
      ['-', '_', ''],
    ],
    fingers: ['L5', 'L5', 'L4', 'L3', 'L2', 'L2', 'R2', 'R2', 'R3', 'R4', 'R5'],
  },
];

const FINGER_OF: Record<F, [Hand, Finger]> = {
  L5: ['left', 'pinky'],
  L4: ['left', 'ring'],
  L3: ['left', 'middle'],
  L2: ['left', 'index'],
  R2: ['right', 'index'],
  R3: ['right', 'middle'],
  R4: ['right', 'ring'],
  R5: ['right', 'pinky'],
};

/** Tottasten der deutschen Belegung: ^, ´ und ` (Umschalt + ´) */
const DEAD = new Set(['^', '´', '`']);

export const SPACE: Key = { base: ' ', row: 4, x: 7.5, hand: null, finger: 'thumb' };
export const KEYS: readonly Key[] = [
  ...ROWS.flatMap((r, row) =>
    r.keys.map((k, i): Key => {
      const [hand, finger] = FINGER_OF[r.fingers[i]!];
      return { base: k[0], row: row as Row, x: r.offset + i + 0.5, hand, finger };
    }),
  ),
  SPACE,
];

const other = (h: Hand): Hand => (h === 'left' ? 'right' : 'left');
const stroke = (key: Key, layer: 0 | 1 | 2, dead = false): Stroke => ({
  key,
  shift: layer === 1 ? other(key.hand!) : null,
  altGr: layer === 2,
  dead,
});

/** Zeichen → direkter Tastendruck (ohne Tottasten-Kombinationen) */
const DIRECT = new Map<string, Stroke>([[' ', stroke(SPACE, 0)]]);
ROWS.forEach((r, row) =>
  r.keys.forEach((k) => {
    const key = KEYS.find((x) => x.row === row && x.base === k[0])!;
    k.forEach((ch, layer) => {
      if (ch) DIRECT.set(ch, stroke(key, layer as 0 | 1 | 2, DEAD.has(ch)));
    });
  }),
);

/** Buchstaben mit Akzent: Tottaste + Grundbuchstabe */
const ACCENTS: Record<string, string> = { '̀': '`', '́': '´', '̂': '^' };

/** Typografische Zeichen tippt man über ihre Tastatur-Entsprechung („ → ", – → -). */
function typedForm(ch: string): string {
  for (const t of ['"', "'", '-']) if (ch !== t && matches(ch, t)) return t;
  return ch;
}

/**
 * Anschläge, die ein Zeichen auf der deutschen Tastatur erzeugen; null, wenn es dort nicht direkt tippbar ist.
 * Tottasten allein brauchen danach die Leertaste, Akzentbuchstaben (é, ê, à) Tottaste + Buchstabe.
 */
export function strokesFor(ch: string): Stroke[] | null {
  const t = typedForm(ch);
  const s = DIRECT.get(t);
  if (s) return s.dead ? [s, DIRECT.get(' ')!] : [s];
  const [letter, mark, ...rest] = Array.from(t.normalize('NFD'));
  const dead = mark && !rest.length ? DIRECT.get(ACCENTS[mark] ?? '') : undefined;
  const base = letter ? DIRECT.get(letter) : undefined;
  return dead && base && /\p{L}/u.test(letter!) ? [dead, base] : null;
}

/** Taste, die das Zeichen erzeugt (bei Akzenten der Buchstabe, nicht die Tottaste). */
export function keyOf(ch: string): Key | null {
  const s = strokesFor(ch);
  if (!s) return null;
  return (s.length > 1 && s[0]!.dead && s[1]!.key !== SPACE ? s[1]! : s[0]!).key;
}

/** Ob zwei Tasten auf der Tastatur aneinandergrenzen (gleiche Reihe oder versetzt darüber/darunter). */
export function adjacent(a: Key, b: Key): boolean {
  if (a === b || a.row === 4 || b.row === 4) return false;
  const dr = Math.abs(a.row - b.row);
  const dx = Math.abs(a.x - b.x);
  return dr === 0 ? dx === 1 : dr === 1 && dx < 1;
}

/** Ob die Zeichen auf benachbarten Tasten liegen (Umschalt-/AltGr-Ebene egal). */
export function areNeighbors(a: string, b: string): boolean {
  const ka = keyOf(a);
  const kb = keyOf(b);
  return !!ka && !!kb && adjacent(ka, kb);
}

/** Grundzeichen der Nachbartasten, z. B. f → d, g, r, t, c, v */
export function neighbors(ch: string): string[] {
  const k = keyOf(ch);
  return k ? KEYS.filter((x) => adjacent(k, x)).map((x) => x.base) : [];
}
