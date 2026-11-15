// Akzeptanz Phase 3: Synthetisch erzeugte Anschläge mit eingebauter Schwäche – die Analyse muss sie finden.
import { describe, expect, test } from 'vitest';
import { analyzeFingers, fingerAdvice, keyOf, median, mergeProfile, Session, smoothRate, wilson } from '../src/core';

const TEXT =
  'Franz jagt im komplett verwahrlosten Taxi quer durch Bayern. Zwölf Boxkämpfer jagen Viktor quer über den großen Sylter Deich. ';

/** Abschnitte abtippen; `delay` und `wrong` bestimmen je Zeichen Tempo und Vertipper (deterministisch). */
function profileOf(
  rounds: number,
  delay: (ch: string) => number,
  wrong: (ch: string, nth: number) => boolean = () => false,
) {
  let p = null;
  const seen = new Map<string, number>();
  for (let r = 0; r < rounds; r++) {
    const s = new Session(TEXT.repeat(3), { strict: true });
    let t = 0;
    for (const ch of s.chars) {
      const nth = (seen.get(ch) ?? 0) + 1;
      seen.set(ch, nth);
      if (wrong(ch, nth)) s.type(ch === 'x' ? 'y' : 'x', (t += delay(ch)));
      s.type(ch, (t += delay(ch)));
    }
    p = mergeProfile(p, s.log);
  }
  return p!;
}

const fingerOf = (ch: string): string => {
  const k = keyOf(ch)!;
  return k.hand ? `${k.hand}-${k.finger}` : 'thumb';
};

describe('Statistik', () => {
  test('Median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
  test('Wilson-Intervall enthält die Quote und wird mit mehr Daten enger', () => {
    const [lo1, hi1] = wilson(2, 20);
    const [lo2, hi2] = wilson(20, 200);
    expect(lo1).toBeLessThan(0.1);
    expect(hi1).toBeGreaterThan(0.1);
    expect(hi2 - lo2).toBeLessThan(hi1 - lo1);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
  test('Glättung zieht kleine Stichproben zum Durchschnitt', () => {
    expect(smoothRate(1, 2, 0.02)).toBeLessThan(0.05);
    expect(smoothRate(100, 1000, 0.02)).toBeCloseTo(0.0962, 3);
  });
});

describe('Finger und Hände', () => {
  test('künstlich langsamer Ringfinger links wird gefunden – und nur er', () => {
    const p = profileOf(4, (ch) => (fingerOf(ch) === 'left-ring' ? 300 : 150));
    const a = analyzeFingers(p)!;
    const slow = a.fingers.filter((f) => f.slow).map((f) => f.id);
    expect(slow).toEqual(['left-ring']);
    const ring = a.fingers.find((f) => f.id === 'left-ring')!;
    expect(ring.ms).toBe(300);
    expect(a.fingers.find((f) => f.id === 'right-index')!.ms).toBe(150);
    expect(fingerAdvice(a)[0]).toMatch(/^Ringfinger links ist langsamer .*300 ms statt Ø \d+ ms .*\(n = \d+\)/);
    expect(a.fingers.some((f) => f.errorProne)).toBe(false);
  });

  test('fehleranfälliger kleiner Finger rechts wird gefunden – und nur er', () => {
    // Der Text hat nur wenige Zeichen für den kleinen Finger rechts (p, ö, ü, ä, ß): mehr Runden für genug Daten
    const p = profileOf(
      12,
      () => 150,
      (ch, nth) => fingerOf(ch) === 'right-pinky' && nth % 4 === 0,
    );
    const a = analyzeFingers(p)!;
    expect(a.fingers.filter((f) => f.errorProne).map((f) => f.id)).toEqual(['right-pinky']);
    expect(a.fingers.some((f) => f.slow)).toBe(false);
    expect(fingerAdvice(a)).toEqual([
      expect.stringMatching(/^Kleiner Finger rechts vertippt sich häufiger: .* \(n = \d+\)/),
    ]);
    // Hände und Reihen werden mitgezählt (ß liegt auf der Zahlenreihe)
    expect(a.hands.map((h) => h.id)).toEqual(['left', 'right']);
    expect(a.rows.map((r) => r.label)).toEqual([
      'Zahlenreihe',
      'Obere Reihe',
      'Grundreihe',
      'Untere Reihe',
      'Leertaste',
    ]);
    expect(a.n).toBe(a.fingers.reduce((s, f) => s + f.n, 0));
  });

  test('ohne genug Daten keine Aussage', () => {
    const p = profileOf(1, (ch) => (fingerOf(ch) === 'left-ring' ? 300 : 150));
    const a = analyzeFingers(p, { minTimed: 1000 })!;
    expect(a.fingers.some((f) => f.slow)).toBe(false);
    expect(fingerAdvice(a)).toEqual([]);
    expect(analyzeFingers(null)).toBeNull();
  });
});
