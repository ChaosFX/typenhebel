// Kurzfassung je Abschnitt (SPEC Phase 6): Die Rohdaten älterer Abschnitte entfallen (Phase 2), die Kurzfassung
// bleibt. Sie ist additiv, sodass sich jeder Zeitraum (Tag, Woche, „vor dem Training“) aus ihr summieren lässt
// und Verbesserungen je Taste, Finger, Dreiergruppe oder Fehlerart über Wochen sichtbar werden.
import { addProfiles, emptyProfile, mergeProfile, type Profile } from './analysis';
import { classifyErrors, ERROR_KIND_NAMES, type ErrorKind } from './errors';
import { scanLog } from './rhythm';
import type { LogEvent } from './session';

/** [Anzahl, Summe ms]; Zeiten wie in der Rhythmus-Auswertung auf 1500 ms je Intervall gekappt */
export type Timing = [n: number, sumMs: number];
/** [Anschläge, Fehler, Intervalle, Summe ms] */
export type Third = [n: number, err: number, timed: number, sumMs: number];

export const DIGEST_VERSION = 1;

export interface Digest {
  v: typeof DIGEST_VERSION;
  /** Profil nur dieses Abschnitts (Zeichen, Bigramme, Verwechslungen, Zeichenklassen); `sessions` = 1,
   *  Zeitsummen auf ganze ms gerundet */
  profile: Profile;
  /** Dreiergruppen; Mittelwerte statt Median, weil sich nur Summen addieren lassen */
  tri: Record<string, Timing>;
  /** Dreiergruppen am Wortanfang */
  ws: Record<string, Timing>;
  /** Dreiergruppen am Wortende */
  we: Record<string, Timing>;
  /** Fehler je Art (nur Arten, die vorkommen) */
  ek: Partial<Record<ErrorKind, number>>;
  /** Verlangsamung nach Fehlern: Fehler, Intervalle danach, Intervalle mit Abstand */
  pe: { errors: number; after: Timing; base: Timing };
  /** Ermüdung: Abschnitte mit mindestens 60 Anschlägen, erstes und letztes Drittel */
  fat: { sections: number; first: Third; last: Third };
}

// Zeitstempel haben Nachkommastellen; ganze Millisekunden genügen und halten die Kurzfassung klein.
const add = (m: Record<string, Timing>, k: string, ms: number): void => {
  const t = (m[k] ??= [0, 0]);
  t[0]++;
  t[1] += Math.round(ms);
};

export const emptyDigest = (): Digest => ({
  v: DIGEST_VERSION,
  profile: emptyProfile(),
  tri: {},
  ws: {},
  we: {},
  ek: {},
  pe: { errors: 0, after: [0, 0], base: [0, 0] },
  fat: { sections: 0, first: [0, 0, 0, 0], last: [0, 0, 0, 0] },
});

/** Kurzfassung eines Abschnitts aus seinen Tastenereignissen. */
export function digestOf(log: readonly LogEvent[]): Digest {
  const d = emptyDigest();
  d.profile = mergeProfile(null, log as LogEvent[]);
  d.profile.sessions = 1;
  for (const t of Object.values(d.profile.bg)) t[1] = Math.round(t[1]);
  d.profile.bgSum = Math.round(d.profile.bgSum);
  scanLog(log, {
    group(k, ms, pos) {
      add(d.tri, k, ms);
      if (pos === 'start') add(d.ws, k, ms);
      if (pos === 'end') add(d.we, k, ms);
    },
    error: () => void d.pe.errors++,
    interval(ms, afterError) {
      const t = afterError ? d.pe.after : d.pe.base;
      t[0]++;
      t[1] += Math.round(ms);
    },
    third(part, ok, ms) {
      const t = d.fat[part];
      t[0]++;
      if (!ok) t[1]++;
      if (ms !== null) {
        t[2]++;
        t[3] += Math.round(ms);
      }
    },
    fatigueSection: () => void d.fat.sections++,
  });
  for (const e of classifyErrors(log)) d.ek[e.kind] = (d.ek[e.kind] ?? 0) + 1;
  return d;
}

const addTimings = (dst: Record<string, Timing>, src: Record<string, Timing>): void => {
  for (const [k, [n, s]] of Object.entries(src)) {
    const t = (dst[k] ??= [0, 0]);
    t[0] += n;
    t[1] += s;
  }
};
const addArr = <T extends number[]>(a: T, b: T): T => a.map((x, i) => x + b[i]!) as T;

/** Kurzfassungen addieren, z. B. alle Abschnitte eines Tages oder einer Woche. */
export function sumDigests(ds: readonly Digest[]): Digest {
  const out = emptyDigest();
  for (const d of ds) {
    out.profile = addProfiles(out.profile, d.profile);
    addTimings(out.tri, d.tri);
    addTimings(out.ws, d.ws);
    addTimings(out.we, d.we);
    for (const [k, n] of Object.entries(d.ek) as [ErrorKind, number][]) out.ek[k] = (out.ek[k] ?? 0) + n;
    out.pe.errors += d.pe.errors;
    out.pe.after = addArr(out.pe.after, d.pe.after);
    out.pe.base = addArr(out.pe.base, d.pe.base);
    out.fat.sections += d.fat.sections;
    out.fat.first = addArr(out.fat.first, d.fat.first);
    out.fat.last = addArr(out.fat.last, d.fat.last);
  }
  return out;
}

// ---------- Prüfung beim Import ----------

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNums = (x: unknown, len: number): boolean =>
  Array.isArray(x) && x.length === len && x.every((v) => typeof v === 'number' && Number.isFinite(v));
const isTimings = (x: unknown): boolean => isObj(x) && Object.values(x).every((v) => isNums(v, 2));

/** Ist das eine gültige Kurzfassung? Unbekannte Versionen gelten als ungültig (werden neu berechnet oder verworfen). */
export function isDigest(x: unknown): x is Digest {
  if (!isObj(x) || x.v !== DIGEST_VERSION) return false;
  const p = x.profile;
  const pe = x.pe;
  const fat = x.fat;
  return (
    isObj(p) &&
    typeof p.n === 'number' &&
    isObj(p.ch) &&
    isObj(p.bg) &&
    isObj(p.cf) &&
    isObj(p.cat) &&
    isTimings(x.tri) &&
    isTimings(x.ws) &&
    isTimings(x.we) &&
    isObj(x.ek) &&
    Object.entries(x.ek).every(([k, v]) => k in ERROR_KIND_NAMES && typeof v === 'number') &&
    isObj(pe) &&
    typeof pe.errors === 'number' &&
    isNums(pe.after, 2) &&
    isNums(pe.base, 2) &&
    isObj(fat) &&
    typeof fat.sections === 'number' &&
    isNums(fat.first, 4) &&
    isNums(fat.last, 4)
  );
}
