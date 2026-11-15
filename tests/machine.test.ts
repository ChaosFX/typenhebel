// Schreibmaschinen-Aufnahmen: Beschreibung gültig, jeder Klang liegt vollständig in der FLAC-Datei.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DEFAULT_MACHINE, parseMachine } from '../src/audio/machine';

/** Abtastrate und Länge aus dem STREAMINFO-Block einer FLAC-Datei */
function flacInfo(buf: Buffer): { rate: number; channels: number; seconds: number } {
  expect(buf.subarray(0, 4).toString('latin1')).toBe('fLaC');
  const si = buf.subarray(8, 8 + 34); // erster Metadatenblock ist immer STREAMINFO
  const rate = (si[10]! << 12) | (si[11]! << 4) | (si[12]! >> 4);
  const channels = ((si[12]! >> 1) & 7) + 1;
  const total = (si[13]! & 0x0f) * 2 ** 32 + si.readUInt32BE(14);
  return { rate, channels, seconds: total / rate };
}

const DIR = 'public/sounds';
const machines = readdirSync(DIR).filter((f) => f.endsWith('.json'));

describe('Schreibmaschinen', () => {
  test('die Standardmaschine ist vorhanden', () => {
    expect(machines).toContain(`${DEFAULT_MACHINE}.json`);
  });

  for (const f of machines)
    test(`${f}: gültig, Klänge innerhalb der Datei, Quelle und Lizenz angegeben`, () => {
      const m = parseMachine(JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8')));
      expect(`${m.id}.json`).toBe(f);
      const info = flacInfo(readFileSync(`${DIR}/${m.file}`));
      expect(info).toMatchObject({ rate: 48000, channels: 1 });
      for (const list of Object.values(m.sounds))
        for (const [s, l] of list) expect(s + l).toBeLessThanOrEqual(info.seconds + 1e-3);
      expect(m.sounds.key.length).toBeGreaterThanOrEqual(8);
      expect(m.license).toMatch(/^CC/);
      expect(m.source).toMatch(/^https:\/\//);
      expect(readFileSync(`${DIR}/QUELLEN.md`, 'utf8')).toContain(m.source);
    });

  test('ungültige Beschreibungen werden abgewiesen', () => {
    const ok = JSON.parse(readFileSync(`${DIR}/${DEFAULT_MACHINE}.json`, 'utf8'));
    expect(() => parseMachine(null)).toThrow();
    expect(() => parseMachine({ ...ok, file: '../x.flac' })).toThrow(/Dateiname/);
    expect(() => parseMachine({ ...ok, gain: 0 })).toThrow(/Lautstärke/);
    expect(() => parseMachine({ ...ok, sounds: { ...ok.sounds, key: [] } })).toThrow(/key/);
    expect(() => parseMachine({ ...ok, sounds: { ...ok.sounds, done: [[0, -1]] } })).toThrow(/done/);
  });
});
