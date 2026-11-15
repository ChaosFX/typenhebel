import { describe, expect, test } from 'vitest';
import { areNeighbors, KEYS, keyOf, neighbors, strokesFor } from '../src/core';

const finger = (ch: string): string | null => {
  const k = keyOf(ch);
  return k ? `${k.hand ?? 'beide'} ${k.finger}` : null;
};

describe('keyboard (deutsche ISO-Tastatur, Zehnfingersystem)', () => {
  test('Grundreihe und Fingerzuordnung', () => {
    expect('asdf'.split('').map(finger)).toEqual(['left pinky', 'left ring', 'left middle', 'left index']);
    expect('jklö'.split('').map(finger)).toEqual(['right index', 'right middle', 'right ring', 'right pinky']);
    expect(['g', 'b', 't', '5', '6'].map(finger)).toEqual(Array(5).fill('left index'));
    expect(['h', 'n', 'z', '7'].map(finger)).toEqual(Array(4).fill('right index'));
    expect(['ä', 'ü', 'ß', '#', '-', '+'].map(finger)).toEqual(Array(6).fill('right pinky'));
    expect(['<', 'y', '^', '1', 'q'].map(finger)).toEqual(Array(5).fill('left pinky'));
    expect(finger(' ')).toBe('beide thumb');
    expect(keyOf('f')!.row).toBe(2);
    expect(KEYS).toHaveLength(13 + 12 + 12 + 11 + 1);
  });

  test('Umschalttaste der anderen Hand, AltGr', () => {
    expect(strokesFor('F')).toEqual([expect.objectContaining({ shift: 'right', altGr: false })]);
    expect(strokesFor('J')).toEqual([expect.objectContaining({ shift: 'left' })]);
    expect(strokesFor('?')![0]).toMatchObject({ shift: 'left', key: { base: 'ß' } });
    expect(strokesFor('Ä')![0]).toMatchObject({ shift: 'left', key: { base: 'ä' } });
    expect(strokesFor('@')![0]).toMatchObject({ altGr: true, shift: null, key: { base: 'q' } });
    expect(strokesFor('€')![0]).toMatchObject({ altGr: true, key: { base: 'e' } });
    expect(strokesFor('|')![0]).toMatchObject({ altGr: true, key: { base: '<' } });
    expect(strokesFor('{')![0]!.key.base).toBe('7');
  });

  test('typografische Zeichen über ihre Tastatur-Entsprechung', () => {
    expect(strokesFor('„')![0]).toMatchObject({ shift: 'right', key: { base: '2' } });
    expect(strokesFor('’')![0]).toMatchObject({ shift: 'left', key: { base: '#' } });
    expect(keyOf('–')!.base).toBe('-');
  });

  test('Tottasten und Akzente', () => {
    expect(strokesFor('é')!.map((s) => [s.key.base, s.dead, s.shift])).toEqual([
      ['´', true, null],
      ['e', false, null],
    ]);
    expect(strokesFor('è')!.map((s) => [s.key.base, s.dead, s.shift])).toEqual([
      ['´', true, 'left'],
      ['e', false, null],
    ]);
    expect(strokesFor('Ê')!.map((s) => [s.key.base, s.shift])).toEqual([
      ['^', null],
      ['e', 'right'],
    ]);
    expect(keyOf('à')!.base).toBe('a');
    expect(strokesFor('^')!.map((s) => s.key.base)).toEqual(['^', ' ']);
    expect(keyOf('^')!.base).toBe('^');
  });

  test('nicht tippbare Zeichen', () => {
    for (const ch of ['χ', 'ñ', 'œ', '½', 'ç']) expect(strokesFor(ch)).toBeNull();
  });

  test('Nachbartasten', () => {
    expect(neighbors('f').sort()).toEqual(['c', 'd', 'g', 'r', 't', 'v'].sort());
    expect(neighbors('a').sort()).toEqual(['<', 'q', 's', 'w', 'y'].sort());
    expect(neighbors('q').sort()).toEqual(['1', '2', 'a', 'w'].sort());
    expect(areNeighbors('F', 'd')).toBe(true);
    expect(areNeighbors('ö', 'ä')).toBe(true);
    expect(areNeighbors('f', 'j')).toBe(false);
    expect(areNeighbors('f', 'f')).toBe(false);
    expect(areNeighbors(' ', 'b')).toBe(false);
    expect(areNeighbors('χ', 'x')).toBe(false);
    // Nachbarschaft ist symmetrisch
    for (const a of KEYS) for (const b of KEYS) expect(areNeighbors(a.base, b.base)).toBe(areNeighbors(b.base, a.base));
  });
});
