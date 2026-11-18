// Lautstärkeregler (SPEC Phase 4): 0 ist still, 70 ≈ bisherige Lautstärke, 100 höchstens doppelt so laut.
import { expect, test } from 'vitest';
import { volumeGain } from '../src/audio/sound';

test('Regler → Verstärkung', () => {
  expect(volumeGain(0)).toBe(0);
  expect(volumeGain(70)).toBeCloseTo(0.98, 2);
  expect(volumeGain(100)).toBe(2);
  expect(volumeGain(150)).toBe(2);
  expect(volumeGain(-5)).toBe(0);
  expect(volumeGain(35)).toBeLessThan(volumeGain(70) / 2); // quadratisch: halber Weg ist deutlich leiser
});
