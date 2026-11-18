// Verbesserungen zeigen (SPEC Phase 6): zwei Zeiträume aus den Kurzfassungen vergleichen, je Zeichen, Finger,
// Dreiergruppe und Fehlerart. Eine Veränderung wird nur genannt, wenn beide Zeiträume genug Daten haben und der
// Unterschied deutlich größer ist als der Zufall kleiner Zahlen.
import { sumDigests, type Digest } from './digest';
import { ERROR_KIND_NAMES, type ErrorKind } from './errors';
import { analyzeFingers } from './fingers';

export type ChangeDim = 'char' | 'finger' | 'trigram' | 'errorKind';
export type ChangeMetric = 'tempo' | 'errors';

export interface Change {
  dim: ChangeDim;
  metric: ChangeMetric;
  /** Zeichen, Finger-ID, Dreiergruppe oder Fehlerart */
  id: string;
  label: string;
  /** mittleres Intervall in ms bzw. Fehlerquote (0..1) */
  before: number;
  after: number;
  nBefore: number;
  nAfter: number;
  /** relative Veränderung (after / before − 1); negativ = weniger Zeit bzw. weniger Fehler = besser */
  rel: number;
  better: boolean;
  /** Abstand zum Zufall (z-Wert), zum Sortieren */
  z: number;
  /** Dreiergruppe war langsam und ist jetzt im normalen Bereich (bzw. umgekehrt) */
  slowToNormal?: boolean;
  normalToSlow?: boolean;
}

export interface Overall {
  sessions: number;
  /** mittleres Intervall in ms */
  ms: number | null;
  /** Fehlerquote 0..1 */
  rate: number;
  n: number;
}

export interface ProgressReport {
  before: Overall;
  after: Overall;
  improvements: Change[];
  declines: Change[];
}

export interface ProgressOptions {
  /** Mindestzahl gemessener Intervalle je Zeitraum (Zeichen; Finger wie Phase 3: 40) */
  minTimedChar?: number;
  minTimedFinger?: number;
  /** Mindestzahl Dreiergruppen je Zeitraum */
  minTri?: number;
  /** Mindestzahl Anschläge je Zeitraum für Fehlerquoten (Zeichen; Finger wie Phase 3: 150) */
  minNChar?: number;
  minNFinger?: number;
  /** kleinste relative Veränderung, die genannt wird */
  minRel?: number;
  /** z-Schwelle (1,96 ≈ 95 %) */
  z?: number;
  /** Streuung einzelner Intervalle relativ zum Mittel (Variationskoeffizient), für die Tempo-Schwelle */
  cv?: number;
  /** ab diesem Verhältnis zum Mittel aller Dreiergruppen gilt eine Gruppe als langsam (wie Phase 3) */
  slowRatio?: number;
  /** höchstens so viele Einträge je Liste */
  limit?: number;
}

const DEFAULTS: Required<ProgressOptions> = {
  minTimedChar: 20,
  minTimedFinger: 40,
  minTri: 8,
  minNChar: 50,
  minNFinger: 150,
  minRel: 0.1,
  z: 1.96,
  cv: 0.4,
  slowRatio: 1.25,
  limit: 6,
};

type Pair = [n: number, x: number];

/**
 * Tempo: Mittelwerte zweier Zeiträume. Ohne Einzelwerte kennen wir die Streuung nicht; wir nehmen einen typischen
 * Variationskoeffizienten an. Standardfehler des Unterschieds relativ zum früheren Mittel ≈ cv·√(1/n₁ + 1/n₂).
 */
function tempoChange(
  a: Pair,
  b: Pair,
  min: number,
  o: Required<ProgressOptions>,
): Pick<Change, 'before' | 'after' | 'nBefore' | 'nAfter' | 'rel' | 'better' | 'z'> | null {
  const [n1, s1] = a;
  const [n2, s2] = b;
  if (n1 < min || n2 < min) return null;
  const before = s1 / n1;
  const after = s2 / n2;
  if (!before) return null;
  const rel = after / before - 1;
  const z = Math.abs(rel) / (o.cv * Math.sqrt(1 / n1 + 1 / n2));
  if (Math.abs(rel) < o.minRel || z < o.z) return null;
  return { before, after, nBefore: n1, nAfter: n2, rel, better: rel < 0, z };
}

/** Fehlerquoten: Zwei-Stichproben-z-Test für Anteile; im schlechteren Zeitraum mindestens 3 Fehler. */
function rateChange(
  a: Pair,
  b: Pair,
  min: number,
  o: Required<ProgressOptions>,
): Pick<Change, 'before' | 'after' | 'nBefore' | 'nAfter' | 'rel' | 'better' | 'z'> | null {
  const [n1, e1] = a;
  const [n2, e2] = b;
  if (n1 < min || n2 < min || Math.max(e1, e2) < 3) return null;
  const before = e1 / n1;
  const after = e2 / n2;
  const p = (e1 + e2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = Math.abs(after - before) / se;
  const rel = before ? after / before - 1 : 1;
  if (Math.abs(rel) < o.minRel || z < o.z) return null;
  return { before, after, nBefore: n1, nAfter: n2, rel, better: after < before, z };
}

/** Zeit je Zeichen: Intervalle der Zeichenpaare, die auf dieses Zeichen enden (wie die Fingerauswertung). */
function charTiming(d: Digest): Map<string, Pair> {
  const m = new Map<string, Pair>();
  for (const [pair, [n, s]] of Object.entries(d.profile.bg)) {
    const c = Array.from(pair).at(-1) ?? '';
    const t = m.get(c) ?? m.set(c, [0, 0]).get(c)!;
    t[0] += n;
    t[1] += s;
  }
  return m;
}

const triMean = (d: Digest): number => {
  let n = 0;
  let s = 0;
  for (const [k, x] of Object.values(d.tri)) {
    n += k;
    s += x;
  }
  return n ? s / n : 0;
};

const charLabel = (c: string): string => (c === ' ' ? 'Leertaste' : c);

function overall(d: Digest, sessions: number): Overall {
  const { profile: p } = d;
  const errors = Object.values(p.ch).reduce((a, [, e]) => a + e, 0);
  return { sessions, ms: p.bgN ? p.bgSum / p.bgN : null, rate: p.n ? errors / p.n : 0, n: p.n };
}

/** Zwei Zeiträume vergleichen. Ohne Daten in einem der beiden Zeiträume: null. */
export function compareDigests(
  beforeDs: readonly Digest[],
  afterDs: readonly Digest[],
  opts: ProgressOptions = {},
): ProgressReport | null {
  if (!beforeDs.length || !afterDs.length) return null;
  const o = { ...DEFAULTS, ...opts };
  const A = sumDigests(beforeDs);
  const B = sumDigests(afterDs);
  const out: Change[] = [];

  // Zeichen: Tempo und Fehler
  const ta = charTiming(A);
  const tb = charTiming(B);
  for (const [c, t] of ta) {
    const u = tb.get(c);
    if (!u) continue;
    const ch = tempoChange(t, u, o.minTimedChar, o);
    if (ch) out.push({ dim: 'char', metric: 'tempo', id: c, label: charLabel(c), ...ch });
  }
  for (const [c, x] of Object.entries(A.profile.ch)) {
    const y = B.profile.ch[c];
    if (!y) continue;
    const ch = rateChange(x, y, o.minNChar, o);
    if (ch) out.push({ dim: 'char', metric: 'errors', id: c, label: charLabel(c), ...ch });
  }

  // Finger
  const fa = analyzeFingers(A.profile);
  const fb = analyzeFingers(B.profile);
  for (const f of fa?.fingers ?? []) {
    const g = fb?.fingers.find((x) => x.id === f.id);
    if (!g) continue;
    const t = tempoChange([f.timed, (f.ms ?? 0) * f.timed], [g.timed, (g.ms ?? 0) * g.timed], o.minTimedFinger, o);
    if (t) out.push({ dim: 'finger', metric: 'tempo', id: f.id, label: f.label, ...t });
    const e = rateChange([f.n, f.errors], [g.n, g.errors], o.minNFinger, o);
    if (e) out.push({ dim: 'finger', metric: 'errors', id: f.id, label: f.label, ...e });
  }

  // Dreiergruppen, mit Einordnung langsam/normal gegenüber dem Mittel des jeweiligen Zeitraums
  const ma = triMean(A);
  const mb = triMean(B);
  for (const [k, t] of Object.entries(A.tri)) {
    const u = B.tri[k];
    if (!u) continue;
    const ch = tempoChange(t, u, o.minTri, o);
    if (!ch) continue;
    const wasSlow = ma > 0 && ch.before / ma >= o.slowRatio;
    const isSlow = mb > 0 && ch.after / mb >= o.slowRatio;
    out.push({
      dim: 'trigram',
      metric: 'tempo',
      id: k,
      label: k,
      ...ch,
      ...(wasSlow && !isSlow && { slowToNormal: true }),
      ...(!wasSlow && isSlow && { normalToSlow: true }),
    });
  }

  // Fehlerarten je Anschlag
  for (const kind of Object.keys(ERROR_KIND_NAMES) as ErrorKind[]) {
    const ch = rateChange([A.profile.n, A.ek[kind] ?? 0], [B.profile.n, B.ek[kind] ?? 0], 1, o);
    if (ch) out.push({ dim: 'errorKind', metric: 'errors', id: kind, label: ERROR_KIND_NAMES[kind], ...ch });
  }

  const byZ = (x: Change, y: Change): number => y.z - x.z;
  return {
    before: overall(A, beforeDs.length),
    after: overall(B, afterDs.length),
    improvements: out
      .filter((c) => c.better)
      .sort(byZ)
      .slice(0, o.limit),
    declines: out
      .filter((c) => !c.better)
      .sort(byZ)
      .slice(0, o.limit),
  };
}

const DAY = 86_400_000;
const startOfDay = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** Beginn des Tages `days` Tage vor `t` (Ortszeit, sommerzeitfest). */
const daysBack = (t: number, days: number): number => startOfDay(startOfDay(t) - days * DAY + DAY / 2);

/** Zeitfenster: die letzten 7 Tage (inkl. heute) und die 7 Tage davor. */
export function weekWindows(now: number): { from: number; split: number } {
  return { from: daysBack(now, 13), split: daysBack(now, 6) };
}

/** „Seit letzter Woche“: letzte 7 Tage gegen die 7 Tage davor. */
export function compareWeeks(
  items: readonly { date: number; digest?: Digest }[],
  now: number,
  opts?: ProgressOptions,
): ProgressReport | null {
  const { from, split } = weekWindows(now);
  const before: Digest[] = [];
  const after: Digest[] = [];
  for (const s of items) {
    if (!s.digest || s.date < from) continue;
    (s.date < split ? before : after).push(s.digest);
  }
  return compareDigests(before, after, opts);
}

// ---------- Text ----------

const pct = (x: number): string => `${Math.round(Math.abs(x) * 100)} %`;
const pct1 = (x: number): string => (x * 100).toFixed(1).replace('.', ',') + ' %';
const show = (k: string): string => k.replace(/ /g, '␣');

/** Aussage und Belege getrennt, z. B. [„ä 18 % schneller“, „212 → 174 ms, n = 40/52“]. */
export function changeParts(c: Change): [what: string, detail: string] {
  const name = c.dim === 'trigram' ? `‚${show(c.label)}‘` : c.label;
  const n = `n = ${c.nBefore}/${c.nAfter}`;
  if (c.metric === 'tempo') {
    // schneller = weniger Zeit je Anschlag; in Prozent Zeitersparnis
    const what = c.slowToNormal
      ? 'von langsam auf normal'
      : c.normalToSlow
        ? 'von normal auf langsam'
        : `${pct(c.rel)} ${c.better ? 'schneller' : 'langsamer'}`;
    return [`${name} ${what}`, `${Math.round(c.before)} → ${Math.round(c.after)} ms, ${n}`];
  }
  const subject = c.dim === 'errorKind' ? `${name}:` : name;
  const amount = c.before ? `${pct(c.rel)} ` : '';
  return [`${subject} ${amount}${c.better ? 'weniger' : 'mehr'} Fehler`, `${pct1(c.before)} → ${pct1(c.after)}, ${n}`];
}

/** Satz zu einer Veränderung, z. B. „ä 18 % schneller (212 → 174 ms, n = 40/52)“. */
export function describeChange(c: Change): string {
  const [what, detail] = changeParts(c);
  return `${what} (${detail})`;
}
