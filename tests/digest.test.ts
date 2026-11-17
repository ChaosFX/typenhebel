// Kurzfassung je Abschnitt (SPEC Phase 6): additiv und verträglich mit den Auswertungen aus den Rohdaten.
import { describe, expect, test } from 'vitest';
import {
  analyzeRhythm,
  classifyErrors,
  countErrorKinds,
  digestOf,
  emptyDigest,
  isDigest,
  mergeProfile,
  Session,
  sumDigests,
  type LogEvent,
} from '../src/core';

const TEXT =
  'Die Zeitung meldet eine Wanderung durch den Wald. Eine Schule plant die Rettung der alten Mühle am Bach. ' +
  'Der Lehrer schreibt eine Ordnung für die Sammlung. Am Abend kommt die Meldung über die Landung.';

/** Abschnitt tippen; `ung` ist langsam, an jeder 17. Stelle ein Vertipper. */
function log(seed = 0): LogEvent[] {
  const s = new Session(TEXT, { strict: true });
  let t = 0;
  s.chars.forEach((ch, i) => {
    if ((i + seed) % 17 === 0) s.type('#', (t += 200));
    const slow =
      (ch === 'n' && s.chars[i - 1] === 'u') || (ch === 'g' && s.chars[i - 1] === 'n' && s.chars[i - 2] === 'u');
    // Nachkommastellen wie bei echten Zeitstempeln
    s.type(ch, (t += slow ? 400 : 150.25 + ((i * 7 + seed) % 30)));
  });
  return s.log;
}

describe('Kurzfassung', () => {
  const logs = [log(0), log(3), log(5)];
  const digests = logs.map(digestOf);
  const sum = sumDigests(digests);

  test('Summe der Profile = Profil aus allen Rohdaten (Zeiten auf ganze ms je Abschnitt gerundet)', () => {
    const direct = logs.reduce((p, l) => mergeProfile(p, l), mergeProfile(null, []));
    direct.sessions = logs.length;
    const { bg, bgSum, ...rest } = sum.profile;
    const { bg: dbg, bgSum: dSum, ...drest } = direct;
    expect(rest).toEqual(drest);
    expect(Object.keys(bg).sort()).toEqual(Object.keys(dbg).sort());
    for (const [k, [n, ms]] of Object.entries(bg)) {
      expect(n).toBe(dbg[k]![0]);
      expect(Math.abs(ms - dbg[k]![1])).toBeLessThanOrEqual(logs.length / 2);
      expect(Number.isInteger(ms)).toBe(true);
    }
    expect(Math.abs(bgSum - dSum)).toBeLessThanOrEqual(logs.length / 2);
  });

  test('Dreiergruppen: Anzahl wie in der Rhythmus-Auswertung, langsames „ung“ erkennbar', () => {
    const r = analyzeRhythm(
      logs.map((events) => ({ date: 0, stats: { wpm: 0, accuracy: 1 }, events })),
      { minN: 1, minSessions: 1 },
    )!;
    const ung = sum.tri.ung!;
    expect(r.trigrams.find((g) => g.k === 'ung')?.n).toBe(ung[0]);
    expect(ung[1] / ung[0]).toBe(800);
    expect(sum.we.ung).toEqual(ung);
    expect(sum.ws.ung).toBeUndefined();
    expect(r.postError?.n).toBe(sum.pe.errors);
    expect(r.fatigue?.n).toBe(sum.fat.sections);
  });

  test('Fehlerarten wie aus den Rohdaten', () => {
    const counts = countErrorKinds(logs.flatMap((l) => classifyErrors(l)));
    for (const [k, n] of Object.entries(counts)) expect(sum.ek[k as keyof typeof counts] ?? 0).toBe(n);
  });

  test('Ermüdung und Verlangsamung nach Fehlern werden mitgezählt', () => {
    expect(sum.fat.sections).toBe(3);
    expect(sum.fat.first[0]).toBeGreaterThan(0);
    expect(sum.fat.last[2]).toBeGreaterThan(0);
    expect(sum.pe.after[0]).toBeGreaterThan(0);
    expect(sum.pe.base[0]).toBeGreaterThan(0);
  });

  test('Summe ist assoziativ und neutral gegenüber der leeren Kurzfassung', () => {
    expect(sumDigests([sumDigests(digests.slice(0, 2)), digests[2]!])).toEqual(sum);
    expect(sumDigests([emptyDigest(), ...digests])).toEqual(sum);
    expect(sumDigests([])).toEqual(emptyDigest());
  });

  test('übersteht JSON und bleibt klein', () => {
    const json = JSON.stringify(digests[0]);
    expect(isDigest(JSON.parse(json))).toBe(true);
    // ~1500 Zeichen sollen deutlich unter den Rohdaten bleiben
    expect(json.length).toBeLessThan(JSON.stringify(logs[0]).length / 2);
  });

  test('isDigest lehnt Beschädigtes und fremde Versionen ab', () => {
    const d = digestOf(logs[0]!);
    expect(isDigest(null)).toBe(false);
    expect(isDigest({ ...d, v: 2 })).toBe(false);
    expect(isDigest({ ...d, tri: { ab: [1] } })).toBe(false);
    expect(isDigest({ ...d, ek: { erfunden: 1 } })).toBe(false);
    expect(isDigest({ ...d, fat: { ...d.fat, last: [0, 0, 0] } })).toBe(false);
    expect(isDigest({ ...d, profile: { n: 1 } })).toBe(false);
  });

  test('leeres Protokoll', () => {
    const d = digestOf([]);
    expect(isDigest(d)).toBe(true);
    expect(d.profile.n).toBe(0);
  });
});
