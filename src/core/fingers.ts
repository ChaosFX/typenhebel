// Auswertung nach Finger, Hand, Reihe und Taste (SPEC Phase 3). Grundlage ist das Profil über alle Abschnitte:
// Fehler je Zeichen (ch) und Zeit je Zeichenpaar (bg); die Zeit eines Paars zählt für den Finger des zweiten Zeichens.
import type { Profile } from './analysis';
import { FINGER_NAMES, HAND_NAMES, KEYS, keyOf, type Key } from './keyboard';
import { smoothRate, wilson } from './stats';

export interface GroupStat {
  id: string;
  label: string;
  /** Anschläge */
  n: number;
  errors: number;
  /** geglättete Fehlerquote (zum Vergleichen und Darstellen) */
  rate: number;
  /** Wilson-Intervall der rohen Fehlerquote */
  lo: number;
  hi: number;
  /** gemessene Intervalle (richtige Anschläge direkt nach einem richtigen) */
  timed: number;
  /** mittleres Intervall in ms, null ohne Daten */
  ms: number | null;
  /** Intervall im Verhältnis zum Durchschnitt aller Anschläge */
  ratio: number | null;
  /** deutlich langsamer als der Durchschnitt, mit genug Messungen */
  slow: boolean;
  /** Fehlerquote auch im ungünstigsten Fall über dem Durchschnitt */
  errorProne: boolean;
}

export interface KeyStat {
  key: Key;
  n: number;
  errors: number;
  rate: number;
}

export interface FingerAnalysis {
  fingers: GroupStat[];
  hands: GroupStat[];
  rows: GroupStat[];
  keys: KeyStat[];
  /** Fehlerquote und Intervall über alle Anschläge, die einer Taste zugeordnet werden konnten */
  rate: number;
  meanMs: number;
  n: number;
}

export interface FingerOptions {
  /** ab so vielen Messungen wird „langsam“ bewertet */
  minTimed?: number;
  /** ab so vielen Anschlägen wird „fehleranfällig“ bewertet */
  minN?: number;
  /** ab diesem Verhältnis zum Durchschnitt gilt eine Gruppe als langsam */
  slowRatio?: number;
}

const FINGER_ORDER = [
  'left-pinky',
  'left-ring',
  'left-middle',
  'left-index',
  'thumb',
  'right-index',
  'right-middle',
  'right-ring',
  'right-pinky',
];
const ROW_NAMES = ['Zahlenreihe', 'Obere Reihe', 'Grundreihe', 'Untere Reihe', 'Leertaste'];

const fingerId = (k: Key): string => (k.hand ? `${k.hand}-${k.finger}` : 'thumb');
function fingerLabel(id: string): string {
  if (id === 'thumb') return 'Daumen';
  const [hand, finger] = id.split('-') as [keyof typeof HAND_NAMES, keyof typeof FINGER_NAMES];
  const f = FINGER_NAMES[finger];
  return `${f[0]!.toUpperCase()}${f.slice(1)} ${HAND_NAMES[hand]}`;
}

interface Acc {
  n: number;
  errors: number;
  timed: number;
  sumMs: number;
}
const acc = (): Acc => ({ n: 0, errors: 0, timed: 0, sumMs: 0 });

export function analyzeFingers(p: Profile | null, opts: FingerOptions = {}): FingerAnalysis | null {
  const { minTimed = 40, minN = 150, slowRatio = 1.15 } = opts;
  if (!p?.n) return null;
  const byKey = new Map<Key, Acc>();
  const get = (k: Key): Acc => byKey.get(k) ?? byKey.set(k, acc()).get(k)!;

  for (const [ch, [n, e]] of Object.entries(p.ch)) {
    const k = keyOf(ch);
    if (!k) continue;
    const a = get(k);
    a.n += n;
    a.errors += e;
  }
  for (const [pair, [n, sum]] of Object.entries(p.bg)) {
    const k = keyOf(Array.from(pair).at(-1) ?? '');
    if (!k) continue;
    const a = get(k);
    a.timed += n;
    a.sumMs += sum;
  }

  const total = [...byKey.values()].reduce((t, a) => {
    t.n += a.n;
    t.errors += a.errors;
    t.timed += a.timed;
    t.sumMs += a.sumMs;
    return t;
  }, acc());
  if (!total.n) return null;
  const rate = total.errors / total.n;
  const meanMs = total.timed ? total.sumMs / total.timed : 0;

  const group = (id: string, label: string, a: Acc): GroupStat => {
    const [lo, hi] = wilson(a.errors, a.n);
    const ms = a.timed ? a.sumMs / a.timed : null;
    const ratio = ms !== null && meanMs ? ms / meanMs : null;
    return {
      id,
      label,
      n: a.n,
      errors: a.errors,
      rate: smoothRate(a.errors, a.n, rate),
      lo,
      hi,
      timed: a.timed,
      ms,
      ratio,
      slow: ratio !== null && a.timed >= minTimed && ratio >= slowRatio,
      errorProne: a.n >= minN && a.errors >= 3 && lo > rate,
    };
  };
  const sumBy = (pick: (k: Key) => string): Map<string, Acc> => {
    const m = new Map<string, Acc>();
    for (const [k, a] of byKey) {
      const id = pick(k);
      const g = m.get(id) ?? m.set(id, acc()).get(id)!;
      g.n += a.n;
      g.errors += a.errors;
      g.timed += a.timed;
      g.sumMs += a.sumMs;
    }
    return m;
  };

  const fingerAcc = sumBy(fingerId);
  const handAcc = sumBy((k) => k.hand ?? 'thumb');
  const rowAcc = sumBy((k) => String(k.row));
  return {
    fingers: FINGER_ORDER.filter((id) => fingerAcc.has(id)).map((id) => group(id, fingerLabel(id), fingerAcc.get(id)!)),
    hands: (['left', 'right'] as const)
      .filter((h) => handAcc.has(h))
      .map((h) => group(h, `Hand ${HAND_NAMES[h]}`, handAcc.get(h)!)),
    rows: [0, 1, 2, 3, 4]
      .filter((r) => rowAcc.has(String(r)))
      .map((r) => group(String(r), ROW_NAMES[r]!, rowAcc.get(String(r))!)),
    keys: KEYS.filter((k) => byKey.has(k)).map((k) => {
      const a = byKey.get(k)!;
      return { key: k, n: a.n, errors: a.errors, rate: smoothRate(a.errors, a.n, rate) };
    }),
    rate,
    meanMs,
    n: total.n,
  };
}

const pct = (x: number): string => (x * 100).toFixed(1).replace('.', ',');

/** Empfehlungen mit Begründung („weil …, n = …“); höchstens je eine für Tempo und Fehler. */
export function fingerAdvice(a: FingerAnalysis | null): string[] {
  if (!a) return [];
  const out: string[] = [];
  const slow = a.fingers.filter((f) => f.slow).sort((x, y) => y.ratio! - x.ratio!)[0];
  if (slow)
    out.push(
      `${slow.label} ist langsamer als deine anderen Finger: ${Math.round(slow.ms!)} ms statt Ø ${Math.round(a.meanMs)} ms je Anschlag (n = ${slow.timed}). Übe Wörter mit seinen Tasten bewusst gleichmäßig.`,
    );
  const prone = a.fingers.filter((f) => f.errorProne).sort((x, y) => y.lo - x.lo)[0];
  if (prone)
    out.push(
      `${prone.label} vertippt sich häufiger: ${pct(prone.errors / prone.n)} % statt Ø ${pct(a.rate)} % (n = ${prone.n}). Langsamer werden, bis die Tasten sicher sitzen.`,
    );
  return out;
}
