import { describe, expect, test } from 'vitest';
import { migrateLegacyKeys } from '../src/data/store';
import { MemoryStorage } from './fixtures/memory-storage';

describe('migrateLegacyKeys', () => {
  test('übernimmt Prototyp-Daten unter neuem Präfix und entfernt alte Schlüssel', () => {
    const s = new MemoryStorage();
    s.setItem('anschlag.v1.profile', '{"n":5}');
    s.setItem('anschlag.v1.progress', '{"demo":2}');
    s.setItem('fremd', 'x');
    expect(migrateLegacyKeys(s)).toBe(2);
    expect(s.getItem('typenhebel.v1.profile')).toBe('{"n":5}');
    expect(s.getItem('typenhebel.v1.progress')).toBe('{"demo":2}');
    expect(s.getItem('anschlag.v1.profile')).toBeNull();
    expect(s.getItem('fremd')).toBe('x');
  });

  test('überschreibt vorhandene neue Daten nicht', () => {
    const s = new MemoryStorage();
    s.setItem('anschlag.v1.profile', 'alt');
    s.setItem('typenhebel.v1.profile', 'neu');
    expect(migrateLegacyKeys(s)).toBe(0);
    expect(s.getItem('typenhebel.v1.profile')).toBe('neu');
  });

  test('alte Schlüssel bleiben stehen, wenn Schreiben fehlschlägt', () => {
    const s = new MemoryStorage();
    s.setItem('anschlag.v1.books', '[]');
    s.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(() => migrateLegacyKeys(s)).not.toThrow();
    expect(s.getItem('anschlag.v1.books')).toBe('[]');
  });
});
