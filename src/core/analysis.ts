import { IDLE_CAP } from './match';
import type { KeyEvent, LogEvent } from './session';

/** [Anzahl, Fehler] */
type Count = [n: number, err: number];
/** [Anzahl, Summe ms] */
type Timing = [n: number, sumMs: number];

/**
 * Laufend aggregiertes Profil im Format des Prototyps (localStorage `typenhebel.v1.profile`).
 * Wird in Phase 2 durch das versionierte Modell aus SPEC §4 ersetzt (mit Migration).
 */
export interface Profile {
  n: number;
  sessions: number;
  ch: Record<string, Count>;
  bg: Record<string, Timing>;
  cf: Record<string, number>;
  cat: Record<string, Count>;
  bgN: number;
  bgSum: number;
}

export interface Analysis {
  mean: number;
  slow: { k: string; n: number; ms: number; ratio: number }[];
  errChars: { k: string; n: number; e: number; rate: number }[];
  conf: { exp: string; got: string; n: number }[];
  cats: { k: string; n: number; e: number; rate: number }[];
  overall: number;
  n: number;
  sessions: number;
}

export function charClass(c: string): string {
  if (c === ' ') return 'Leerzeichen';
  if (/[äöüß]/.test(c) || /[ÄÖÜ]/.test(c)) return 'Umlaute & ß';
  if (/\p{Lu}/u.test(c)) return 'Großbuchstaben';
  if (/\p{Ll}/u.test(c)) return 'Kleinbuchstaben';
  if (/\p{N}/u.test(c)) return 'Ziffern';
  return 'Satzzeichen';
}

const lc = (c: string): string => c.toLowerCase();
const SEP = '\u0001';

export const emptyProfile = (): Profile => ({
  n: 0,
  sessions: 0,
  ch: {},
  bg: {},
  cf: {},
  cat: {},
  bgN: 0,
  bgSum: 0,
});

export function mergeProfile(p: Profile | null, log: LogEvent[]): Profile {
  const prof = p ?? emptyProfile();
  let prev: KeyEvent | null = null;
  for (const e of log) {
    if (e.kind !== 'k') {
      prev = null;
      continue;
    }
    prof.n++;
    const c = lc(e.exp);
    const ch = (prof.ch[c] ??= [0, 0]);
    ch[0]++;
    if (!e.ok) ch[1]++;
    const cl = charClass(e.exp);
    const ct = (prof.cat[cl] ??= [0, 0]);
    ct[0]++;
    if (!e.ok) ct[1]++;
    if (!e.ok) {
      const k = e.exp + SEP + e.got;
      prof.cf[k] = (prof.cf[k] ?? 0) + 1;
    }
    if (prev && prev.ok && e.ok && e.i === prev.i + 1 && e.dt !== null && e.dt < IDLE_CAP) {
      const k = lc(prev.exp) + lc(e.exp);
      const b = (prof.bg[k] ??= [0, 0]);
      const d = Math.min(e.dt, 1500);
      b[0]++;
      b[1] += d;
      prof.bgN++;
      prof.bgSum += d;
    }
    prev = e;
  }
  return prof;
}

export function analyze(
  p: Profile | null,
  { minBg = 2, minCh = 4 }: { minBg?: number; minCh?: number } = {},
): Analysis | null {
  if (!p || !p.n) return null;
  const mean = p.bgN ? p.bgSum / p.bgN : 0;
  const slow = Object.entries(p.bg)
    .filter(([, v]) => v[0] >= minBg)
    .map(([k, [n, s]]) => ({ k, n, ms: s / n, ratio: mean ? s / n / mean : 1 }))
    .filter((x) => x.ratio > 1.2)
    .sort((a, b) => (b.ratio - 1) * Math.sqrt(b.n) - (a.ratio - 1) * Math.sqrt(a.n))
    .slice(0, 6);
  const errChars = Object.entries(p.ch)
    .filter(([, v]) => v[0] >= minCh && v[1] > 0)
    .map(([k, [n, e]]) => ({ k, n, e, rate: e / n }))
    .sort((a, b) => b.rate - a.rate || b.n - a.n)
    .slice(0, 6);
  const conf = Object.entries(p.cf)
    .map(([k, n]) => {
      const [exp = '', got = ''] = k.split(SEP);
      return { exp, got, n };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const cats = Object.entries(p.cat)
    .filter(([, v]) => v[0] >= 8)
    .map(([k, [n, e]]) => ({ k, n, e, rate: e / n }))
    .sort((a, b) => b.rate - a.rate);
  const total = Object.values(p.cat).reduce((a, [n]) => a + n, 0);
  const errs = Object.values(p.cat).reduce((a, [, e]) => a + e, 0);
  return { mean, slow, errChars, conf, cats, overall: total ? errs / total : 0, n: p.n, sessions: p.sessions };
}

const pct1 = (x: number): string => (x * 100).toFixed(1).replace('.', ',');

export function hint(a: Analysis | null): string | null {
  if (!a) return null;
  const worst = a.cats[0];
  if (worst && worst.e >= 2 && worst.rate >= Math.max(0.03, a.overall * 1.6))
    return `Die meisten Fehler passieren bei „${worst.k}“ (${pct1(worst.rate)} % gegenüber Ø ${pct1(a.overall)} %). Übe das gezielt langsam und fehlerfrei.`;
  const slow = a.slow[0];
  if (slow)
    return `Die Kombination „${slow.k}“ bremst dich aus (${Math.round(slow.ms)} ms statt Ø ${Math.round(a.mean)} ms). Wiederhole sie ein paar Mal bewusst.`;
  return a.n < 1500
    ? 'Noch zu wenig Daten für klare Muster – nach ein paar Abschnitten wird die Analyse treffsicherer.'
    : null;
}
