import { describe, expect, test } from 'vitest';
import { findRare, isTypable, replaceRare, replacementFor } from '../src/core/rare';

describe('seltene Zeichen', () => {
  test('deutsche Tastatur inkl. Tottasten und akzeptierter Entsprechungen ist tippbar', () => {
    for (const ch of 'aZäÖß9 @€{}[]\\|~µ²³°§éèêÁÀÂ„“»«‚‘’–—') expect(isTypable(ch), ch).toBe(true);
  });

  test('nicht tippbare Zeichen werden erkannt', () => {
    for (const ch of 'χæœçñëøå½×†') expect(isTypable(ch), ch).toBe(false);
  });

  test('Ersatz: Ligaturen, Diakritika, Griechisch, Symbole', () => {
    expect(replacementFor('æ')).toBe('ae');
    expect(replacementFor('Œ')).toBe('Oe');
    expect(replacementFor('ç')).toBe('c');
    expect(replacementFor('ñ')).toBe('n');
    expect(replacementFor('ë')).toBe('e');
    expect(replacementFor('Χ')).toBe('Ch');
    expect(replacementFor('ά')).toBe('a');
    expect(replacementFor('½')).toBe('1/2');
    expect(replacementFor('✠')).toBeNull();
  });

  test('findRare zählt und sortiert, replaceRare ersetzt nur Seltenes', () => {
    expect(findRare(['Cœur, cœur, ça'])).toEqual([
      { ch: 'œ', n: 2, replacement: 'oe' },
      { ch: 'ç', n: 1, replacement: 'c' },
    ]);
    expect(replaceRare('Café „Œuvre“ ✠')).toBe('Café „Oeuvre“ ✠');
  });
});
