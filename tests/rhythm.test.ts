// Akzeptanz Phase 3: eingebaute Schwächen in synthetischen Abschnitten müssen gefunden werden.
import { describe, expect, test } from 'vitest';
import { analyzeRhythm, dailyTrend, rhythmAdvice, Session, type RhythmSession } from '../src/core';

const TEXT =
  'Die Zeitung meldet eine Wanderung durch den Wald. Eine Schule plant die Rettung der alten Mühle am Bach. ' +
  'Der Lehrer schreibt eine Ordnung für die Sammlung. Am Abend kommt die Meldung über die Landung. ';

/** Abschnitt tippen: `delay(i, chars)` je Zeichen, `wrongAt` erzeugt vorher einen Vertipper. */
function session(
  delay: (i: number, chars: string[]) => number,
  wrongAt: (i: number) => boolean = () => false,
  date = Date.UTC(2026, 10, 15, 10),
): RhythmSession {
  const s = new Session(TEXT, { strict: true });
  let t = 0;
  s.chars.forEach((ch, i) => {
    if (wrongAt(i)) s.type('#', (t += 200));
    s.type(ch, (t += delay(i, s.chars)));
  });
  return { date, stats: s.stats(), events: s.log };
}

const steady = (): number => 150;

describe('Rhythmus', () => {
  test('langsames „ung“ am Wortende wird gefunden', () => {
    const slowUng = (i: number, c: string[]): number =>
      (c[i] === 'n' && c[i - 1] === 'u') || (c[i] === 'g' && c[i - 1] === 'n' && c[i - 2] === 'u') ? 400 : 150;
    const r = analyzeRhythm([session(slowUng), session(slowUng)])!;
    expect(r.trigrams[0]).toMatchObject({ k: 'ung', ms: 800 });
    expect(r.ends.map((g) => g.k)).toEqual(['ung']);
    expect(r.starts).toEqual([]);
    expect(rhythmAdvice(r)).toEqual([expect.stringMatching(/^„ung“ bremst dich: 800 ms statt 300 ms .*\(n = \d+\)/)]);
  });

  test('langsamer Wortanfang „sch“', () => {
    const slowSch = (i: number, c: string[]): number => {
      const isStart = (j: number): boolean => j === 0 || !/\p{L}/u.test(c[j - 1]!);
      return (c[i - 1]?.toLowerCase() === 's' && isStart(i - 1)) || (c[i - 2]?.toLowerCase() === 's' && isStart(i - 2))
        ? 450
        : 150;
    };
    const r = analyzeRhythm([session(slowSch), session(slowSch)], { minN: 2 })!;
    expect(r.starts.map((g) => g.k)).toContain('sch');
    expect(r.ends.map((g) => g.k)).not.toContain('sch');
  });

  test('Verlangsamung nach Fehlern', () => {
    const errs = (i: number): boolean => i % 25 === 10;
    const slowAfter = (i: number): number => (i % 25 >= 10 && i % 25 <= 12 ? 400 : 150);
    const r = analyzeRhythm([session(slowAfter, errs), session(slowAfter, errs)])!;
    expect(r.postError).toMatchObject({ baseMs: 150 });
    expect(r.postError!.ratio).toBeGreaterThan(2);
    expect(r.postError!.n).toBeGreaterThanOrEqual(10);
    expect(rhythmAdvice(r)[0]).toMatch(/^Nach einem Fehler .*\(n = \d+ Fehler\)/);

    // ohne Verlangsamung: Verhältnis ~1, kein Hinweis
    const calm = analyzeRhythm([session(steady, errs), session(steady, errs)])!;
    expect(calm.postError!.ratio).toBeCloseTo(1, 1);
    expect(rhythmAdvice(calm)).toEqual([]);
  });

  test('Ermüdung: gegen Ende langsamer', () => {
    const tiring = (i: number, c: string[]): number => (i > (2 * c.length) / 3 ? 220 : 150);
    const r = analyzeRhythm(Array.from({ length: 5 }, () => session(tiring)))!;
    expect(r.fatigue).toMatchObject({ n: 5, firstMs: 150, lastMs: 220 });
    expect(rhythmAdvice(r)[0]).toMatch(
      /^Gegen Ende eines Abschnitts lässt du nach: 47 % langsamer.*\(n = 5 Abschnitte\)/,
    );
    // zu wenige Abschnitte: keine Aussage
    expect(analyzeRhythm([session(tiring)])!.fatigue).toBeNull();
  });

  test('gleichmäßiges Tippen: keine Auffälligkeiten', () => {
    const r = analyzeRhythm(Array.from({ length: 5 }, () => session(steady)))!;
    expect(r.trigrams).toEqual([]);
    expect(r.fatigue!.tempoRatio).toBe(1);
    expect(r.postError).toBeNull();
    expect(rhythmAdvice(r)).toEqual([]);
    expect(analyzeRhythm([{ date: 0, stats: { wpm: 1, accuracy: 1 } }])).toBeNull();
  });
});

test('Trend über Tage: Median je Tag, nur die letzten Tage', () => {
  const at = (d: number, h: number, wpm: number, accuracy = 0.98): RhythmSession => ({
    date: new Date(2026, 10, d, h).getTime(),
    stats: { wpm, accuracy },
  });
  const t = dailyTrend([at(14, 9, 30), at(15, 9, 40), at(13, 9, 20), at(15, 22, 44, 0.9), at(15, 23, 60)], 2);
  expect(t).toEqual([
    { day: '2026-11-14', sessions: 1, wpm: 30, accuracy: 0.98 },
    { day: '2026-11-15', sessions: 3, wpm: 44, accuracy: expect.closeTo((0.98 + 0.9 + 0.98) / 3, 6) },
  ]);
});
