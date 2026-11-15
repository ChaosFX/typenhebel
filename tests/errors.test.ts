import { describe, expect, test } from 'vitest';
import { classifyErrors, countErrorKinds, Session } from '../src/core';

/** Tippfolge abspielen; '\b' ist die Rücktaste. Liefert die Fehlerarten in Reihenfolge. */
function kinds(text: string, keys: string, strict: boolean): string[] {
  const s = new Session(text, { strict });
  let t = 0;
  for (const k of Array.from(keys)) {
    t += 150;
    if (k === '\b') s.backspace(t);
    else s.type(k, t);
  }
  return classifyErrors(s.log).map((e) => `${e.exp}>${e.got}:${e.kind}`);
}

describe('Fehlerarten, strikter Modus (Cursor wartet)', () => {
  const strict = (text: string, keys: string): string[] => kinds(text, keys, true);

  test('Nachbartaste', () => {
    expect(strict('fein', 'gfein')).toEqual(['f>g:neighbor']);
  });
  test('Umschalttaste: Groß/klein und Zeichen derselben Taste', () => {
    expect(strict('Haus', 'hHaus')).toEqual(['H>h:shift']);
    expect(strict('wo?', 'woß?')).toEqual(['?>ß:shift']);
    expect(strict('„Ja', '2"Ja')).toEqual(['„>2:shift']);
  });
  test('Umlaut und ß', () => {
    expect(strict('für', 'fuür')).toEqual(['ü>u:umlaut']);
    expect(strict('Maß', 'Masß')).toEqual(['ß>s:umlaut']);
    expect(strict('öl', 'äöl')).toEqual(['ö>ä:umlaut']);
  });
  test('Doppelanschlag', () => {
    expect(strict('fg', 'ffg')).toEqual(['g>f:double']);
  });
  test('Vertauschung: nächstes Zeichen zu früh, dann korrigiert', () => {
    expect(strict('die', 'deie')).toEqual(['i>e:transposition']);
  });
  test('Auslassung: weitergetippt, als fehlte das Zeichen', () => {
    // „und so“ als „ud …“: n ausgelassen, Leerzeichen hinterher ist Folgefehler
    expect(strict('und so', 'ud nd so')).toEqual(['n>d:omission', 'n> :consequential']);
    // sofort korrigiert, ist das im strikten Modus nicht von einer Vertauschung zu unterscheiden
    expect(strict('und', 'udnd')).toEqual(['n>d:transposition']);
  });
  test('Folgefehler und Sonstige', () => {
    expect(strict('ab', 'axqb')).toEqual(['b>x:other', 'b>q:consequential']);
  });
});

describe('Fehlerarten, freier Modus (Fehler bleiben stehen)', () => {
  const free = (text: string, keys: string): string[] => kinds(text, keys, false);

  test('klassische Vertauschung „teh“', () => {
    expect(free('the', 'teh\b\bhe')).toEqual(['h>e:transposition', 'e>h:consequential']);
  });
  test('Auslassung mit verschobenem Rest', () => {
    expect(free('haus', 'hus\b\baus')).toEqual(['a>u:omission', 'u>s:consequential']);
  });
  test('Doppelanschlag', () => {
    expect(free('ab', 'aa\bb')).toEqual(['b>a:double']);
  });
  test('Nachbartaste nach Korrektur bleibt eigener Fehler', () => {
    expect(free('dort', 'di\bort')).toEqual(['o>i:neighbor']);
  });
});

test('Zählung je Fehlerart', () => {
  const s = new Session('Haus', { strict: true });
  ['h', 'H', 'a', 'u', 's'].forEach((k, n) => s.type(k, n * 100));
  const c = countErrorKinds(classifyErrors(s.log));
  expect(c.shift).toBe(1);
  expect(Object.values(c).reduce((a, b) => a + b, 0)).toBe(1);
});
