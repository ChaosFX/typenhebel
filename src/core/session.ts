import { IDLE_CAP, matches } from './match';

export interface KeyEvent {
  kind: 'k';
  i: number;
  exp: string;
  got: string;
  ok: boolean;
  /** ms seit Start ohne Pausen */
  t: number;
  /** kumulierte aktive Zeit (Leerlauf gekappt) */
  at: number;
  /** ms seit letztem Ereignis, null nach Pause/Start */
  dt: number | null;
}

export interface BackspaceEvent {
  kind: 'b';
  i: number;
  t: number;
  at: number;
  dt: number | null;
}

export type LogEvent = KeyEvent | BackspaceEvent;

export interface SessionStats {
  total: number;
  good: number;
  errors: number;
  backspaces: number;
  accuracy: number;
  wpm: number;
  raw: number;
  consistency: number | null;
  durationMs: number;
  chars: number;
  bestStreak: number;
}

export type CharState = 'ok' | 'bad' | '';

export class Session {
  readonly chars: string[];
  readonly strict: boolean;
  pos = 0;
  typed: { got: string; ok: boolean }[] = [];
  log: LogEvent[] = [];
  start: number | null = null;
  lastT: number | null = null;
  at = 0;
  pausedAt: number | null = null;
  pauseTotal = 0;
  streak = 0;
  best = 0;
  done = false;

  constructor(text: string, { strict = true }: { strict?: boolean } = {}) {
    this.chars = Array.from(text);
    this.strict = strict;
  }

  get cursor(): number {
    return this.strict ? this.pos : this.typed.length;
  }

  stateAt(i: number): CharState {
    if (this.strict) return i < this.pos ? 'ok' : '';
    const x = this.typed[i];
    return x ? (x.ok ? 'ok' : 'bad') : '';
  }

  correctCount(): number {
    return this.strict ? this.pos : this.typed.filter((x) => x.ok).length;
  }

  private stamp(t: number): { dt: number | null; wall: number } {
    if (this.start === null) this.start = t;
    const dt = this.lastT === null ? null : t - this.lastT;
    if (dt !== null) this.at += Math.min(dt, IDLE_CAP);
    this.lastT = t;
    return { dt, wall: t - this.start - this.pauseTotal };
  }

  type(got: string, t: number): { i: number; ok: boolean; exp: string } | null {
    if (this.done || this.pausedAt !== null) return null;
    const i = this.cursor;
    if (i >= this.chars.length) return null;
    const exp = this.chars[i]!;
    const ok = matches(exp, got);
    const { dt, wall } = this.stamp(t);
    this.log.push({ kind: 'k', i, exp, got, ok, t: wall, at: this.at, dt });
    if (ok) {
      this.streak++;
      this.best = Math.max(this.best, this.streak);
    } else this.streak = 0;
    if (this.strict) {
      if (ok) this.pos++;
    } else this.typed.push({ got, ok });
    this.done = this.strict
      ? this.pos >= this.chars.length
      : this.typed.length === this.chars.length && this.typed.every((x) => x.ok);
    return { i, ok, exp };
  }

  backspace(t: number): { i: number } | null {
    if (this.strict || this.done || this.pausedAt !== null || !this.typed.length) return null;
    const { dt, wall } = this.stamp(t);
    const i = this.typed.length - 1;
    this.typed.pop();
    this.log.push({ kind: 'b', i, t: wall, at: this.at, dt });
    return { i };
  }

  pause(t: number): void {
    if (this.start === null || this.done || this.pausedAt !== null) return;
    this.pausedAt = t;
  }

  resume(t: number): void {
    if (this.pausedAt === null) return;
    this.pauseTotal += t - this.pausedAt;
    this.pausedAt = null;
    this.lastT = null;
  }

  stats(): SessionStats {
    const keys = this.log.filter((e): e is KeyEvent => e.kind === 'k');
    const total = keys.length;
    const good = keys.filter((e) => e.ok).length;
    const backspaces = this.log.length - total;
    const at = this.log.length ? this.log[this.log.length - 1]!.at : 0;
    const minutes = Math.max(at, 1000) / 60000;
    const dts = keys.filter((e) => e.dt !== null && e.dt < IDLE_CAP).map((e) => e.dt!);
    let consistency: number | null = null;
    if (dts.length > 5) {
      const m = dts.reduce((a, b) => a + b, 0) / dts.length;
      const sd = Math.sqrt(dts.reduce((a, b) => a + (b - m) * (b - m), 0) / dts.length);
      const cv = m > 0 ? sd / m : 0;
      consistency = Math.max(0, 100 * (1 - Math.tanh(cv + Math.pow(cv, 3) / 3 + Math.pow(cv, 5) / 5)));
    }
    return {
      total,
      good,
      errors: total - good,
      backspaces,
      accuracy: total ? good / total : 1,
      wpm: this.correctCount() / 5 / minutes,
      raw: total / 5 / minutes,
      consistency,
      durationMs: at,
      chars: this.chars.length,
      bestStreak: this.best,
    };
  }
}

/** Gleitender Tempoverlauf in WPM über Fenster von `win` Anschlägen. */
export function series(log: LogEvent[], win = 20, step = 5): number[] {
  const keys = log.filter((e) => e.kind === 'k');
  const out: number[] = [];
  for (let k = win; k < keys.length; k += step) {
    const d = keys[k]!.at - keys[k - win]!.at;
    if (d > 0) out.push(Math.min(200, win / 5 / (d / 60000)));
  }
  return out;
}
