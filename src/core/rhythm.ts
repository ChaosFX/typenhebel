// Auswertungen aus den Rohdaten der letzten Abschnitte (SPEC Phase 3): langsame Trigramme, Wortanfänge
// und -enden, Verlangsamung nach Fehlern, Ermüdung im Verlauf eines Abschnitts; dazu der Trend über Tage.
import { IDLE_CAP } from './match';
import type { KeyEvent, LogEvent } from './session';
import { median } from './stats';

/** Was die Auswertungen von einer Session brauchen (Datensätze aus data/records erfüllen das). */
export interface RhythmSession {
  date: number;
  stats: { wpm: number; accuracy: number };
  events?: LogEvent[];
}

/** Intervalle werden wie bei den Bigrammen auf 1500 ms gekappt (SPEC §5). */
const CAP = 1500;
const cap = (dt: number): number => Math.min(dt, CAP);
const isLetter = (c: string): boolean => /\p{L}/u.test(c);

export interface SlowGroup {
  k: string;
  n: number;
  /** Median der Zeit für das 2. und 3. Zeichen in ms */
  ms: number;
  /** im Verhältnis zum Median aller Dreiergruppen */
  ratio: number;
}

export interface RhythmOptions {
  /** Mindestzahl Vorkommen einer Dreiergruppe */
  minN?: number;
  /** ab diesem Verhältnis zum Median gilt eine Gruppe als langsam */
  slowRatio?: number;
  /** Mindestzahl Fehler für die Verlangsamung danach */
  minErrors?: number;
  /** Mindestzahl Abschnitte für die Ermüdung */
  minSessions?: number;
}

export interface Rhythm {
  /** Abschnitte mit Rohdaten */
  sessions: number;
  trigrams: SlowGroup[];
  starts: SlowGroup[];
  ends: SlowGroup[];
  /** Median-Intervall nach einem Fehler (3 richtige Anschläge) gegenüber sonst; null bei zu wenig Fehlern */
  postError: { n: number; afterMs: number; baseMs: number; ratio: number } | null;
  /** Erstes gegen letztes Drittel jedes Abschnitts; null bei zu wenig Abschnitten */
  fatigue: {
    n: number;
    firstMs: number;
    lastMs: number;
    /** > 1: am Ende langsamer */
    tempoRatio: number;
    firstErr: number;
    lastErr: number;
  } | null;
}

function slowest(map: Map<string, number[]>, base: number, minN: number, slowRatio: number): SlowGroup[] {
  return [...map]
    .filter(([, xs]) => xs.length >= minN)
    .map(([k, xs]) => {
      const ms = median(xs)!;
      return { k, n: xs.length, ms, ratio: ms / base };
    })
    .filter((g) => g.ratio >= slowRatio)
    .sort((a, b) => (b.ratio - 1) * Math.sqrt(b.n) - (a.ratio - 1) * Math.sqrt(a.n))
    .slice(0, 6);
}

const push = (m: Map<string, number[]>, k: string, v: number): void => {
  const xs = m.get(k);
  if (xs) xs.push(v);
  else m.set(k, [v]);
};

/** Ein Intervall ist verwertbar: richtiger Anschlag direkt nach einem Ereignis, ohne Pause dazwischen. */
const timed = (e: KeyEvent): e is KeyEvent & { dt: number } => e.ok && e.dt !== null && e.dt < IDLE_CAP;

/** Was beim Durchgehen eines Protokolls anfällt (gemeinsam für die Auswertung und die Kurzfassung je Abschnitt). */
export interface RhythmSink {
  /** Dreiergruppe mit Zeit für das 2. und 3. Zeichen; `pos` = am Wortanfang bzw. -ende */
  group(k: string, ms: number, pos: 'start' | 'end' | null): void;
  error(): void;
  /** Intervall eines richtigen Anschlags: kurz nach einem Fehler (≤ 3) oder mit Abstand (> 5) */
  interval(ms: number, afterError: boolean): void;
  /** Anschlag im ersten bzw. letzten Drittel eines Abschnitts mit mindestens 60 Anschlägen */
  third(part: 'first' | 'last', ok: boolean, ms: number | null): void;
  /** Der Abschnitt zählt für die Ermüdung (mindestens 60 Anschläge) */
  fatigueSection(): void;
}

/** Ein Protokoll auswerten. Definitionen siehe SPEC Phase 3 (Rhythmus). */
export function scanLog(log: readonly LogEvent[], sink: RhythmSink): void {
  const text = new Map<number, string>();
  for (const e of log) if (e.kind === 'k') text.set(e.i, e.exp);
  const keys = log.filter((e): e is KeyEvent => e.kind === 'k');

  // Dreiergruppen: drei richtige Anschläge an aufeinanderfolgenden Stellen, ohne Fehler oder Pause dazwischen
  for (let j = 2; j < log.length; j++) {
    const [a, b, c] = [log[j - 2]!, log[j - 1]!, log[j]!];
    if (a.kind !== 'k' || b.kind !== 'k' || c.kind !== 'k' || !a.ok || !timed(b) || !timed(c)) continue;
    if (b.i !== a.i + 1 || c.i !== b.i + 1) continue;
    const k = (a.exp + b.exp + c.exp).toLowerCase();
    if (k.includes(' ') && k.trim().length < 2) continue; // zwei Leerzeichen: kein Muster
    const ms = cap(b.dt) + cap(c.dt);
    // Wortanfang/-ende: Gruppe liegt am Anfang bzw. Ende eines Worts mit mindestens 4 Buchstaben
    let pos: 'start' | 'end' | null = null;
    if ([...k].every(isLetter)) {
      const before = text.get(a.i - 1);
      const after1 = text.get(c.i + 1);
      const startsWord = before === undefined || !isLetter(before);
      const endsWord = after1 === undefined || !isLetter(after1);
      if (startsWord && !endsWord) pos = 'start';
      if (endsWord && !startsWord) pos = 'end';
    }
    sink.group(k, ms, pos);
  }

  // Verlangsamung nach Fehlern: die nächsten 3 richtigen Anschläge nach einem Fehler gegen alle übrigen
  let sinceError = Infinity;
  for (const e of keys) {
    if (!e.ok) {
      sink.error();
      sinceError = 0;
      continue;
    }
    sinceError++;
    if (!timed(e)) continue;
    if (sinceError <= 3) sink.interval(cap(e.dt), true);
    else if (sinceError > 5) sink.interval(cap(e.dt), false);
  }

  // Ermüdung: erstes und letztes Drittel des Abschnitts (nach Textposition)
  if (keys.length >= 60) {
    const maxI = Math.max(...keys.map((e) => e.i));
    sink.fatigueSection();
    for (const e of keys) {
      const part = e.i < maxI / 3 ? 'first' : e.i >= (2 * maxI) / 3 ? 'last' : null;
      if (part) sink.third(part, e.ok, timed(e) ? cap(e.dt) : null);
    }
  }
}

export function analyzeRhythm(sessions: readonly RhythmSession[], opts: RhythmOptions = {}): Rhythm | null {
  const { minN = 4, slowRatio = 1.25, minErrors = 10, minSessions = 5 } = opts;
  const logs = sessions.map((s) => s.events).filter((e): e is LogEvent[] => !!e?.length);
  if (!logs.length) return null;

  const tri = new Map<string, number[]>();
  const starts = new Map<string, number[]>();
  const ends = new Map<string, number[]>();
  const after: number[] = [];
  const base: number[] = [];
  let errors = 0;
  const thirds = { firstMs: [] as number[], lastMs: [] as number[], first: [0, 0], last: [0, 0] };
  let fatigueSessions = 0;

  const sink: RhythmSink = {
    group(k, ms, pos) {
      push(tri, k, ms);
      if (pos === 'start') push(starts, k, ms);
      if (pos === 'end') push(ends, k, ms);
    },
    error: () => void errors++,
    interval: (ms, afterError) => void (afterError ? after : base).push(ms),
    third(part, ok, ms) {
      thirds[part][0]!++;
      if (!ok) thirds[part][1]!++;
      if (ms !== null) thirds[part === 'first' ? 'firstMs' : 'lastMs'].push(ms);
    },
    fatigueSection: () => void fatigueSessions++,
  };
  for (const log of logs) scanLog(log, sink);

  const all = [...tri.values()].flat();
  const triBase = median(all) ?? 0;
  const afterMs = median(after);
  const baseMs = median(base);
  const firstMs = median(thirds.firstMs);
  const lastMs = median(thirds.lastMs);
  return {
    sessions: logs.length,
    trigrams: triBase ? slowest(tri, triBase, minN, slowRatio) : [],
    starts: triBase ? slowest(starts, triBase, minN, slowRatio) : [],
    ends: triBase ? slowest(ends, triBase, minN, slowRatio) : [],
    postError:
      errors >= minErrors && afterMs !== null && baseMs
        ? { n: errors, afterMs, baseMs, ratio: afterMs / baseMs }
        : null,
    fatigue:
      fatigueSessions >= minSessions && firstMs && lastMs
        ? {
            n: fatigueSessions,
            firstMs,
            lastMs,
            tempoRatio: lastMs / firstMs,
            firstErr: thirds.first[1]! / Math.max(1, thirds.first[0]!),
            lastErr: thirds.last[1]! / Math.max(1, thirds.last[0]!),
          }
        : null,
  };
}

export interface DayPoint {
  /** Tag im Format JJJJ-MM-TT (Ortszeit) */
  day: string;
  sessions: number;
  /** Median WPM des Tages */
  wpm: number;
  /** mittlere Genauigkeit des Tages (0..1) */
  accuracy: number;
}

const dayKey = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Verlauf über die letzten `days` Übungstage (alle Abschnitte, auch ohne Rohdaten). */
export function dailyTrend(sessions: readonly RhythmSession[], days = 14): DayPoint[] {
  const by = new Map<string, RhythmSession[]>();
  for (const s of sessions) {
    const k = dayKey(s.date);
    const xs = by.get(k);
    if (xs) xs.push(s);
    else by.set(k, [s]);
  }
  return [...by]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-days)
    .map(([day, xs]) => ({
      day,
      sessions: xs.length,
      wpm: median(xs.map((s) => s.stats.wpm))!,
      accuracy: xs.reduce((a, s) => a + s.stats.accuracy, 0) / xs.length,
    }));
}

const pct = (x: number): string => Math.round(x * 100) + ' %';

/** Hinweise mit Begründung („weil …, n = …“). */
export function rhythmAdvice(r: Rhythm | null): string[] {
  if (!r) return [];
  const out: string[] = [];
  if (r.postError && r.postError.ratio >= 1.3)
    out.push(
      `Nach einem Fehler brauchst du eine Weile, um wieder in den Takt zu kommen: ${Math.round(r.postError.afterMs)} ms statt ${Math.round(r.postError.baseMs)} ms je Anschlag (n = ${r.postError.n} Fehler). Fehler kurz wahrnehmen und ruhig weitertippen.`,
    );
  if (r.fatigue && (r.fatigue.tempoRatio >= 1.15 || r.fatigue.lastErr >= r.fatigue.firstErr * 1.5 + 0.01))
    out.push(
      `Gegen Ende eines Abschnitts lässt du nach: ${pct(r.fatigue.tempoRatio - 1)} langsamer, ${(r.fatigue.lastErr * 100).toFixed(1).replace('.', ',')} % statt ${(r.fatigue.firstErr * 100).toFixed(1).replace('.', ',')} % Fehler (n = ${r.fatigue.n} Abschnitte). Kürzere Einheiten mit Pausen helfen.`,
    );
  const t = r.trigrams[0];
  if (t)
    out.push(
      `„${t.k.replace(/ /g, '␣')}“ bremst dich: ${Math.round(t.ms)} ms statt ${Math.round(t.ms / t.ratio)} ms für die Dreiergruppe (n = ${t.n}).`,
    );
  return out;
}
