// Adaptive Übungen: Ziele aus den Auswertungen, Drills und Sätze aus eigenen Texten, immer mit Begründung.
import { describe, expect, test } from 'vitest';
import {
  analyze,
  analyzeFingers,
  analyzeRhythm,
  buildTraining,
  DEFAULT_TARGETS,
  mergeProfile,
  pickSentences,
  seeded,
  sentencesOf,
  Session,
  trainingTargets,
  wordDrill,
  wordsOf,
  type Target,
} from '../src/core';

const PARAS = [
  'Die Zeitung meldet eine Wanderung durch den Wald. Eine Schule plant die Rettung der alten Mühle am Bach. Der Lehrer schreibt eine Ordnung für die Sammlung.',
  'Am Abend kommt die Meldung über die Landung. Die Kinder spielen im Garten, während der Hund schläft. Niemand wusste, wohin die Reise führen würde.',
  'Die Forschung zur Bildung verlangt Geduld und Übung. Eine Warnung erreichte die Siedlung erst spät in der Nacht. Das χ ist kein deutsches Zeichen, sagt er.',
];
const ung: Target = { gram: 'ung', weight: 2, reason: '„ung“ dich bremst (n = 14)' };

describe('Texte zerlegen', () => {
  test('Sätze: nur tippbare, mittellange', () => {
    const s = sentencesOf(PARAS);
    expect(s).toContain('Die Zeitung meldet eine Wanderung durch den Wald.');
    expect(s.some((x) => x.includes('χ'))).toBe(false);
    expect(s.every((x) => x.length >= 30 && x.length <= 220)).toBe(true);
  });
  test('Wörter: eindeutig, nur Buchstaben', () => {
    const w = wordsOf(PARAS);
    expect(w).toContain('Wanderung');
    expect(new Set(w).size).toBe(w.length);
    expect(w.every((x) => /^\p{L}{3,16}$/u.test(x))).toBe(true);
  });
});

describe('Übungen bauen', () => {
  test('Wort-Drill enthält nur Wörter mit dem Ziel', () => {
    const d = wordDrill(wordsOf(PARAS), ung, seeded(1))!;
    const words = d.split(' ');
    expect(words.length).toBeGreaterThanOrEqual(4);
    expect(words.every((w) => w.toLowerCase().includes('ung'))).toBe(true);
    expect(d.length).toBeLessThanOrEqual(140);
    expect(wordDrill(wordsOf(PARAS), { ...ung, gram: 'qxz' }, seeded(1))).toBeNull();
  });

  test('Sätze: die mit den meisten Zielen zuerst, Länge begrenzt', () => {
    const s = pickSentences(sentencesOf(PARAS), [ung], seeded(2));
    expect(s.join(' ').length).toBeLessThanOrEqual(360);
    const count = (x: string): number => x.toLowerCase().split('ung').length - 1;
    expect(count(s[0]!)).toBeGreaterThanOrEqual(2);
    expect(s.every((x) => count(x) >= 1)).toBe(true);
  });

  test('Trainingsplan: Drill, Sätze, Drill – jeweils mit Begründung', () => {
    const umlaut: Target = { gram: 'ü', weight: 1, reason: 'du dich bei „ü“ oft vertippst (5 von 40)' };
    const plan = buildTraining([ung, umlaut], PARAS, seeded(3));
    expect(plan.map((p) => p.note)).toEqual([
      'Wort-Drill „ung“ – weil „ung“ dich bremst (n = 14)',
      'Sätze mit „ung“, „ü“ – aus deinen Texten',
      'Wort-Drill „ü“ – weil du dich bei „ü“ oft vertippst (5 von 40)',
    ]);
    // reproduzierbar mit gleichem Startwert
    expect(buildTraining([ung, umlaut], PARAS, seeded(3))).toEqual(plan);
  });

  test('ohne passende Wörter entfällt der Drill', () => {
    const plan = buildTraining([{ gram: 'qxz', weight: 1, reason: 'x' }, ung], PARAS, seeded(4));
    expect(plan.map((p) => p.note.split(' – ')[0])).toEqual(['Sätze mit „qxz“, „ung“', 'Wort-Drill „ung“']);
  });

  test('Standardziele ohne Auswertung', () => {
    expect(trainingTargets(null, null, null)).toEqual([]);
    expect(buildTraining(DEFAULT_TARGETS, PARAS, seeded(5)).length).toBeGreaterThanOrEqual(2);
  });
});

test('Ziele aus echten Auswertungen: langsames „ung“ steht vorne', () => {
  const text = PARAS.slice(0, 2).join(' ') + ' ';
  const logs = Array.from({ length: 3 }, () => {
    const s = new Session(text.repeat(2), { strict: true });
    let t = 0;
    s.chars.forEach((ch, i) => {
      const c = s.chars;
      const slow = (ch === 'n' && c[i - 1] === 'u') || (ch === 'g' && c[i - 1] === 'n' && c[i - 2] === 'u');
      s.type(ch, (t += slow ? 450 : 150));
    });
    return s.log;
  });
  const profile = logs.reduce((p, l) => mergeProfile(p, l), mergeProfile(null, []));
  const rhythm = analyzeRhythm(logs.map((events) => ({ date: 0, stats: { wpm: 0, accuracy: 1 }, events })));
  const targets = trainingTargets(analyze(profile), analyzeFingers(profile), rhythm);
  expect(targets[0]).toMatchObject({
    gram: 'ung',
    reason: expect.stringMatching(/^„ung“ am Wortende langsam ist \(×\d,\d, n = \d+\)$/),
  });
  expect(targets.length).toBeLessThanOrEqual(6);
  expect(new Set(targets.map((t) => t.gram)).size).toBe(targets.length);
});
