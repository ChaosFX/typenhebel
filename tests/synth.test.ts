import { describe, expect, test } from 'vitest';
import { renderSounds, VARIANTS } from '../src/audio/synth';
import { seeded } from '../src/core';

const SR = 48000;
const sounds = renderSounds(SR, seeded(7));
const peak = (b: Float32Array): number => b.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (b: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i]! ** 2;
  return Math.sqrt(s / (to - from));
};

/** Energieanteil oberhalb grob 1 kHz über die Differenz benachbarter Werte (einfacher Hochpass). */
const brightness = (b: Float32Array, to: number): number => {
  let hi = 0;
  let all = 0;
  for (let i = 1; i < to; i++) {
    hi += (b[i]! - b[i - 1]!) ** 2;
    all += b[i]! ** 2;
  }
  return hi / all;
};

describe('Schreibmaschinenklänge', () => {
  test('Varianten, Länge, keine Übersteuerung, keine ungültigen Werte', () => {
    for (const [kind, list] of Object.entries(sounds)) {
      expect(list).toHaveLength(VARIANTS[kind as keyof typeof VARIANTS]);
      for (const b of list) {
        expect(b.every(Number.isFinite)).toBe(true);
        expect(peak(b)).toBeLessThanOrEqual(1);
        expect(peak(b)).toBeGreaterThan(0.4);
      }
    }
    expect(sounds.key[0]!.length).toBeLessThanOrEqual(0.11 * SR); // kurz genug für schnelles Tippen
    expect(sounds.done[0]!.length).toBeGreaterThan(SR); // Glocke klingt nach
  });

  test('klingt aus statt abzubrechen (kein Knacksen am Ende)', () => {
    for (const list of Object.values(sounds))
      for (const b of list) expect(rms(b, b.length - SR * 0.005, b.length)).toBeLessThan(peak(b) * 0.01);
  });

  test('Anschlag: kräftiger Beginn, nach 40 ms fast still', () => {
    const b = sounds.key[0]!;
    expect(rms(b, 0, SR * 0.01)).toBeGreaterThan(rms(b, SR * 0.04, SR * 0.05) * 10);
  });

  test('Varianten unterscheiden sich', () => {
    expect(sounds.key[0]).not.toEqual(sounds.key[1]);
  });

  test('Anschlag heller als Leertaste, Leertaste heller als nichts', () => {
    const n = Math.round(SR * 0.03);
    expect(brightness(sounds.key[0]!, n)).toBeGreaterThan(brightness(sounds.space[0]!, n));
  });
});
