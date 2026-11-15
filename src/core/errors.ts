// Fehlerarten (SPEC Phase 3): jeder falsche Anschlag wird anhand seines Umfelds im Protokoll eingeordnet.
import { areNeighbors, keyOf } from './keyboard';
import { matches } from './match';
import type { KeyEvent, LogEvent } from './session';

export type ErrorKind =
  | 'neighbor'
  | 'transposition'
  | 'omission'
  | 'double'
  | 'shift'
  | 'umlaut'
  /** Folgefehler: direkt nach einem anderen Fehler (Verrutschen, Nachtippen) */
  | 'consequential'
  | 'other';

export const ERROR_KIND_NAMES: Record<ErrorKind, string> = {
  neighbor: 'Nachbartaste',
  transposition: 'Vertauschung',
  omission: 'Auslassung',
  double: 'Doppelanschlag',
  shift: 'Umschalttaste',
  umlaut: 'Umlaut/ß',
  consequential: 'Folgefehler',
  other: 'Sonstige',
};

export interface ClassifiedError {
  /** Index des Ereignisses im Protokoll */
  at: number;
  i: number;
  exp: string;
  got: string;
  kind: ErrorKind;
}

const UMLAUT_BASE: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 's' };
const umlautBase = (c: string): string | undefined => UMLAUT_BASE[c.toLowerCase()];

/** Umlaut/ß mit Grundbuchstaben oder einem anderen Umlaut verwechselt (ä ↔ a, ö ↔ ü, ß ↔ s). */
function isUmlautError(exp: string, got: string): boolean {
  const be = umlautBase(exp);
  const bg = umlautBase(got);
  if (be === undefined && bg === undefined) return false;
  return (be ?? exp.toLowerCase()) === (bg ?? got.toLowerCase()) || (be !== undefined && bg !== undefined);
}

/** Gleiche Taste, falsche Ebene: Groß/klein oder Umschaltzeichen (ß ↔ ?, . ↔ :). */
function isShiftError(exp: string, got: string): boolean {
  if (exp.toLowerCase() === got.toLowerCase()) return true;
  const ke = keyOf(exp);
  return ke !== null && ke === keyOf(got);
}

/**
 * Ordnet alle falschen Anschläge eines Protokolls ein. Funktioniert im strikten und im freien Modus;
 * den Text liest es aus den Soll-Zeichen der Ereignisse. Reihenfolge der Prüfungen: Folgefehler, Umschalttaste,
 * Umlaut, Doppelanschlag, Vertauschung/Auslassung, Nachbartaste, Sonstige.
 *
 * Grenzen: Im strikten Modus wartet der Cursor; wer das nächste Zeichen zu früh tippt und dann korrigiert,
 * gilt als Vertauschung. Eine Auslassung wird erkannt, wenn danach so weitergetippt wird, als fehlte das Zeichen.
 */
export function classifyErrors(log: readonly LogEvent[]): ClassifiedError[] {
  const text = new Map<number, string>();
  for (const e of log) if (e.kind === 'k') text.set(e.i, e.exp);
  const is = (i: number, got: string | undefined): boolean => {
    const c = text.get(i);
    return c !== undefined && got !== undefined && matches(c, got);
  };

  const out: ClassifiedError[] = [];
  log.forEach((e, at) => {
    if (e.kind !== 'k' || e.ok) return;
    const prev = log[at - 1];
    const prevKey = prev?.kind === 'k' ? prev : undefined;
    const next = log.slice(at + 1).find((x): x is KeyEvent => x.kind === 'k');
    let kind: ErrorKind;
    if (prevKey && !prevKey.ok) kind = 'consequential';
    else if (isShiftError(e.exp, e.got)) kind = 'shift';
    else if (isUmlautError(e.exp, e.got)) kind = 'umlaut';
    else if (prevKey && prevKey.got === e.got && is(e.i - 1, e.got)) kind = 'double';
    else if (is(e.i + 1, e.got) && next && is(e.i, next.got)) kind = 'transposition';
    else if (is(e.i + 1, e.got) && (!next || is(e.i + 2, next.got))) kind = 'omission';
    else if (areNeighbors(e.exp, e.got)) kind = 'neighbor';
    else kind = 'other';
    out.push({ at, i: e.i, exp: e.exp, got: e.got, kind });
  });
  return out;
}

/** Anzahl je Fehlerart */
export function countErrorKinds(errors: readonly ClassifiedError[]): Record<ErrorKind, number> {
  const c = Object.fromEntries(Object.keys(ERROR_KIND_NAMES).map((k) => [k, 0])) as Record<ErrorKind, number>;
  for (const e of errors) c[e.kind]++;
  return c;
}
