// Adaptive Übungen (SPEC Phase 3): Aus den Schwächen des Profils werden Ziele, aus den eigenen Texten
// Wort-Drills und Sätze, die diese Ziele möglichst dicht enthalten. Jede Übung trägt ihre Begründung.
import type { Analysis } from './analysis';
import type { FingerAnalysis } from './fingers';
import { KEYS, strokesFor } from './keyboard';
import type { Rhythm } from './rhythm';

export interface Target {
  /** Zeichenfolge in Kleinbuchstaben; ein Zeichen oder eine Gruppe */
  gram: string;
  weight: number;
  /** Begründung als Nebensatz nach „weil“, z. B. „„ung“ dich bremst (×1,8, n = 14)“ */
  reason: string;
}

export interface TrainingSection {
  text: string;
  breaks: number[];
  /** Was geübt wird und warum */
  note: string;
}

const pct = (x: number): string => (x * 100).toFixed(1).replace('.', ',');
const show = (g: string): string => g.replace(/ /g, '␣');

/** Ziele aus allen Auswertungen, nach Gewicht sortiert; doppelte Gruppen werden zusammengefasst. */
export function trainingTargets(a: Analysis | null, f: FingerAnalysis | null, r: Rhythm | null, max = 6): Target[] {
  const out = new Map<string, Target>();
  const add = (gram: string, weight: number, reason: string): void => {
    const g = gram.toLowerCase();
    if (g.trim().length === 0 || weight <= 0) return;
    const t = out.get(g);
    if (!t || t.weight < weight) out.set(g, { gram: g, weight: Math.max(weight, t?.weight ?? 0), reason });
  };
  for (const t of r?.trigrams ?? [])
    add(
      t.k,
      (t.ratio - 1) * Math.sqrt(t.n),
      `„${show(t.k)}“ dich bremst (×${t.ratio.toFixed(1).replace('.', ',')}, n = ${t.n})`,
    );
  for (const [list, where] of [
    [r?.starts, 'Wortanfang'],
    [r?.ends, 'Wortende'],
  ] as const)
    for (const t of list ?? [])
      add(
        t.k,
        (t.ratio - 1) * Math.sqrt(t.n) * 1.1,
        `„${t.k}“ am ${where} langsam ist (×${t.ratio.toFixed(1).replace('.', ',')}, n = ${t.n})`,
      );
  for (const b of a?.slow ?? [])
    if (!b.k.includes(' '))
      add(b.k, (b.ratio - 1) * Math.sqrt(b.n) * 0.8, `„${b.k}“ langsam ist (${Math.round(b.ms)} ms, n = ${b.n})`);
  for (const c of a?.errChars ?? [])
    if (c.k !== ' ') add(c.k, c.rate * Math.sqrt(c.n) * 6, `du dich bei „${c.k}“ oft vertippst (${c.e} von ${c.n})`);
  for (const g of f?.fingers ?? []) {
    if (!g.slow && !g.errorProne) continue;
    const why = g.slow
      ? `${g.label} langsam ist (${Math.round(g.ms!)} ms, n = ${g.timed})`
      : `${g.label} sich oft vertippt (${pct(g.errors / g.n)} %, n = ${g.n})`;
    const letters = KEYS.filter((k) => (k.hand ? `${k.hand}-${k.finger}` : 'thumb') === g.id && /\p{L}/u.test(k.base));
    for (const k of letters) add(k.base, 0.6, why);
  }
  return [...out.values()].sort((x, y) => y.weight - x.weight).slice(0, max);
}

/** Ohne Auswertung: typische Hürden der deutschen Tastatur. */
export const DEFAULT_TARGETS: Target[] = [
  ['sch', 1.2],
  ['ung', 1],
  ['ä', 1],
  ['ö', 1],
  ['ü', 1],
  ['ß', 1],
  ['ck', 0.8],
].map(([gram, weight]) => ({
  gram: gram as string,
  weight: weight as number,
  reason: 'es eine typische Hürde ist (noch zu wenig eigene Daten)',
}));

const count = (hay: string, needle: string): number => {
  let n = 0;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) n++;
  return n;
};
const typable = (s: string): boolean => Array.from(s).every((c) => strokesFor(c) !== null);

/** Sätze aus Absätzen: an Satzzeichen getrennt, 30–220 Zeichen, vollständig tippbar. */
export function sentencesOf(paras: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const p of paras)
    for (const s of p.split(/(?<=[.!?…])\s+(?=\p{Lu}|[„»"])/u)) {
      const t = s.trim();
      if (t.length >= 30 && t.length <= 220 && typable(t)) out.add(t);
    }
  return [...out];
}

/** Wörter aus Absätzen: nur Buchstaben, 3–16 Zeichen, tippbar. */
export function wordsOf(paras: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const p of paras)
    for (const w of p.match(/\p{L}+/gu) ?? []) if (w.length >= 3 && w.length <= 16 && typable(w)) out.add(w);
  return [...out];
}

function score(text: string, targets: readonly Target[]): number {
  const t = text.toLowerCase();
  return targets.reduce((s, x) => s + x.weight * count(t, x.gram), 0);
}

/** Zufall mit Startwert, damit Tests reproduzierbar sind. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
}

/** Wort-Drill: Wörter, die das Ziel enthalten, gemischt; null, wenn zu wenige passen. */
export function wordDrill(words: readonly string[], target: Target, rand: () => number, maxChars = 140): string | null {
  const hits = words.filter((w) => w.toLowerCase().includes(target.gram));
  if (hits.length < 4) return null;
  // Bevorzugt Wörter, in denen das Ziel mehrfach oder in kurzen Wörtern vorkommt; etwas Zufall für Abwechslung
  const ranked = hits
    .map((w) => ({ w, s: count(w.toLowerCase(), target.gram) / Math.sqrt(w.length) + rand() * 0.3 }))
    .sort((a, b) => b.s - a.s);
  const picked: string[] = [];
  let len = 0;
  for (const { w } of ranked) {
    if (len + w.length + 1 > maxChars) continue;
    picked.push(w);
    len += w.length + 1;
    if (picked.length >= 16) break;
  }
  return picked.length >= 4 ? shuffle(picked, rand).join(' ') : null;
}

/** Sätze mit möglichst vielen Zielen; jedes erfasste Ziel zählt danach weniger (für Abwechslung). */
export function pickSentences(
  sentences: readonly string[],
  targets: readonly Target[],
  rand: () => number,
  maxChars = 360,
): string[] {
  const w = targets.map((t) => ({ ...t }));
  const pool = shuffle([...sentences], rand);
  const picked: string[] = [];
  let len = 0;
  while (len < maxChars * 0.6) {
    let best: string | null = null;
    let bestScore = 0;
    for (const s of pool) {
      if (picked.includes(s) || len + s.length + 1 > maxChars) continue;
      const sc = score(s, w) / Math.sqrt(s.length);
      if (sc > bestScore) {
        best = s;
        bestScore = sc;
      }
    }
    if (!best) break;
    picked.push(best);
    len += best.length + 1;
    const low = best.toLowerCase();
    for (const t of w) t.weight *= Math.pow(0.6, count(low, t.gram));
  }
  return picked;
}

const plain = (text: string, note: string): TrainingSection => ({ text, breaks: [], note });

/**
 * Trainingsplan: Wort-Drill zum stärksten Ziel, Sätze zu allen Zielen, Drill zum nächsten Ziel.
 * Abschnitte, für die die Texte nichts Passendes hergeben, entfallen.
 */
export function buildTraining(
  targets: readonly Target[],
  paras: readonly string[],
  rand: () => number = Math.random,
): TrainingSection[] {
  const words = wordsOf(paras);
  const out: TrainingSection[] = [];
  const drill = (t: Target): void => {
    const d = wordDrill(words, t, rand);
    if (d) out.push(plain(d, `Wort-Drill „${show(t.gram)}“ – weil ${t.reason}`));
  };
  const [first, ...rest] = targets;
  if (first) drill(first);
  const sentences = pickSentences(sentencesOf(paras), targets, rand);
  if (sentences.length) {
    const named = targets
      .slice(0, 3)
      .map((t) => `„${show(t.gram)}“`)
      .join(', ');
    out.push(plain(sentences.join(' '), `Sätze mit ${named} – aus deinen Texten`));
  }
  const second = rest.find((t) => t.gram !== first?.gram);
  if (second) drill(second);
  return out;
}
