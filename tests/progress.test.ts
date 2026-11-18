// Verbesserungen zeigen (SPEC Phase 6): Vergleich zweier Zeiträume aus den Kurzfassungen.
import { describe, expect, test } from 'vitest';
import { compareDigests, compareWeeks, describeChange, digestOf, Session, weekWindows, type Change } from '../src/core';

const TEXT =
  'Die Zeitung meldet eine Wanderung durch den Wald. Eine Schule plant die Rettung der alten Mühle am Bach. ' +
  'Der Lehrer schreibt eine Ordnung für die Sammlung. Am Abend kommt die Meldung über die Landung.';

/** Abschnitt tippen: `ung` mit `ungMs` je Anschlag, sonst etwa 150–180 ms; alle `errEvery` Zeichen ein Vertipper vor „e“. */
function log(seed: number, ungMs: number, errEvery = 0): ReturnType<typeof digestOf> {
  const s = new Session(TEXT, { strict: true });
  let t = 0;
  let es = 0;
  s.chars.forEach((ch, i) => {
    if (errEvery && ch === 'e' && es++ % errEvery === 0) s.type('w', (t += 200));
    const slow =
      (ch === 'n' && s.chars[i - 1] === 'u') || (ch === 'g' && s.chars[i - 1] === 'n' && s.chars[i - 2] === 'u');
    s.type(ch, (t += slow ? ungMs : 150 + ((i * 7 + seed) % 30)));
  });
  return digestOf(s.log);
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const find = (xs: Change[], dim: Change['dim'], id: string, metric: Change['metric'] = 'tempo'): Change | undefined =>
  xs.find((c) => c.dim === dim && c.id === id && c.metric === metric);

describe('Vergleich zweier Zeiträume', () => {
  test('„ung“ von langsam auf normal, „e“ mit weniger Fehlern; nichts Unbewegtes wird genannt', () => {
    const before = range(5).map((i) => log(i, 450, 2));
    const after = range(5).map((i) => log(i + 10, 170, 0));
    const r = compareDigests(before, after)!;
    const ung = find(r.improvements, 'trigram', 'ung')!;
    expect(ung).toBeDefined();
    expect(ung.slowToNormal).toBe(true);
    expect(ung.after).toBeLessThan(ung.before);
    expect(describeChange(ung)).toMatch(/^‚ung‘ von langsam auf normal \(\d+ → \d+ ms, n = \d+\/\d+\)$/);

    const e = find(r.improvements, 'char', 'e', 'errors')!;
    expect(e.after).toBe(0);
    expect(describeChange(e)).toMatch(/^e 100 % weniger Fehler \(\d+,\d % → 0,0 %, n = \d+\/\d+\)$/);
    expect(find(r.improvements, 'errorKind', 'neighbor', 'errors')).toBeDefined();
    // gleichmäßig getippte Zeichen bewegen sich kaum: kein Eintrag
    expect(find([...r.improvements, ...r.declines], 'char', 'd')).toBeUndefined();
    expect(r.declines).toEqual([]);
    expect(r.before.sessions).toBe(5);
    expect(r.before.rate).toBeGreaterThan(r.after.rate);
  });

  test('Rückschritte landen in der eigenen Liste', () => {
    const r = compareDigests(
      range(5).map((i) => log(i, 170)),
      range(5).map((i) => log(i, 450)),
    )!;
    const ung = find(r.declines, 'trigram', 'ung')!;
    expect(ung.normalToSlow).toBe(true);
    expect(describeChange(ung)).toContain('von normal auf langsam');
    expect(r.improvements.find((c) => c.id === 'ung')).toBeUndefined();
  });

  test('zu wenig Daten: keine Aussage, auch bei großem Unterschied', () => {
    const r = compareDigests([log(0, 450, 2)], [log(1, 170)], { minTri: 50, minNChar: 1000, minTimedChar: 1000 })!;
    expect(r.improvements.filter((c) => c.dim !== 'errorKind' && c.dim !== 'finger')).toEqual([]);
    expect(compareDigests([], [log(0, 170)])).toBeNull();
  });

  test('kleine Schwankung trotz vieler Daten: unter der Mindestveränderung', () => {
    const r = compareDigests(
      range(8).map((i) => log(i, 170)),
      range(8).map((i) => log(i + 3, 180)),
    )!;
    expect(find([...r.improvements, ...r.declines], 'trigram', 'ung')).toBeUndefined();
  });

  test('höchstens `limit` Einträge, stärkste zuerst', () => {
    const r = compareDigests(
      range(5).map((i) => log(i, 450, 2)),
      range(5).map((i) => log(i, 170)),
      { limit: 3 },
    )!;
    expect(r.improvements).toHaveLength(3);
    expect(r.improvements[0]!.z).toBeGreaterThanOrEqual(r.improvements[2]!.z);
  });
});

describe('Wochen', () => {
  const now = new Date(2026, 10, 18, 15, 0).getTime();
  test('Fenster: letzte 7 Tage inkl. heute, 7 Tage davor', () => {
    const { from, split } = weekWindows(now);
    expect(new Date(split)).toEqual(new Date(2026, 10, 12));
    expect(new Date(from)).toEqual(new Date(2026, 10, 5));
  });
  test('über die Sommerzeitumstellung hinweg', () => {
    const { from, split } = weekWindows(new Date(2026, 2, 31, 9).getTime());
    expect(new Date(split)).toEqual(new Date(2026, 2, 25));
    expect(new Date(from)).toEqual(new Date(2026, 2, 18));
  });
  test('ordnet Abschnitte zu, ignoriert ältere und solche ohne Kurzfassung', () => {
    const at = (y: number, m: number, d: number): number => new Date(y, m, d, 12).getTime();
    const items = [
      { date: at(2026, 10, 1), digest: log(0, 170) },
      ...range(4).map((i) => ({ date: at(2026, 10, 6 + i), digest: log(i, 450, 2) })),
      { date: at(2026, 10, 13) },
      ...range(4).map((i) => ({ date: at(2026, 10, 14 + i), digest: log(i, 170) })),
    ];
    const r = compareWeeks(items, now)!;
    expect(r.before.sessions).toBe(4);
    expect(r.after.sessions).toBe(4);
    expect(find(r.improvements, 'trigram', 'ung')).toBeDefined();
    expect(compareWeeks(items.slice(5), now)).toBeNull();
  });
});
