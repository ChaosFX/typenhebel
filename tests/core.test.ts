// Portierung von prototype/tests/core.test.mjs (13 Tests). Der NFC-Test prüft zusätzlich zerlegte Eingabe (a + U+0308).
import { describe, expect, test } from 'vitest';
import * as Core from '../src/core';

describe('core', () => {
  test('matches: exakt und Tastatur-Entsprechungen', () => {
    expect(Core.matches('a', 'a')).toBe(true);
    expect(Core.matches('a', 'b')).toBe(false);
    expect(Core.matches('„', '"') && Core.matches('“', '"') && Core.matches('»', '"')).toBe(true);
    expect(Core.matches('’', "'") && Core.matches('‚', "'")).toBe(true);
    expect(Core.matches('–', '-') && Core.matches('—', '-')).toBe(true);
    expect(Core.matches('a', '"')).toBe(false);
    expect(Core.matches('ä', 'ä') && !Core.matches('ä', 'a')).toBe(true);
  });

  test('prepare: Normalisierung, Überschrift, Seitenzahl, Fußnote', () => {
    const raw =
      'Die Welt der Sicherheit\n\nEs war einmal[1] ein Land… mit „Zitaten“.\n\n12\n\nZweiter Absatz, der lang genug ist, um kein Titel zu sein.';
    const p = Core.prepare(raw);
    expect(p.headings).toEqual(['Die Welt der Sicherheit']);
    expect(p.paragraphs.length).toBe(2);
    expect(p.paragraphs[0]).toBe('Es war einmal ein Land... mit „Zitaten“.');
    expect(p.rare.length).toBe(0);
  });

  test('prepare: NFC (ä als ein Zeichen)', () => {
    const p = Core.prepare('Scho\u0308nes Wetter heute, a\u0308hnlich wie gestern und vorgestern auch schon.');
    expect(p.paragraphs[0]).toContain('ä');
    expect(p.paragraphs[0]).toContain('ö');
    expect(Array.from('ä').length).toBe(1);
  });

  test('segment: Länge, Brüche, Verlustfreiheit', () => {
    const para = (k: number) => Array.from({ length: 60 }, (_, i) => `Wort${k}_${i}`).join(' ') + '.';
    const paras = [para(1), para(2), para(3), para(4), para(5)];
    const secs = Core.segment(paras, { min: 90, max: 200 });
    expect(secs.length).toBeGreaterThanOrEqual(2);
    for (const s of secs) {
      expect(Core.wc(s.text)).toBeLessThanOrEqual(200 + 60);
      for (const b of s.breaks) expect(Array.from(s.text)[b]).toBe(' ');
    }
    const joined = secs
      .map((s) => s.text)
      .join(' ')
      .split(/\s+/)
      .join(' ');
    expect(joined).toBe(paras.join(' ').split(/\s+/).join(' '));
  });

  test('segment: sehr langer Absatz wird an Satzgrenzen geteilt', () => {
    const sent = 'Dies ist ein Satz mit genau zehn Wörtern, nicht mehr.';
    const p = Array.from({ length: 60 }, () => sent).join(' ');
    const secs = Core.segment([p], { min: 90, max: 200 });
    expect(secs.length).toBeGreaterThanOrEqual(2);
    for (const s of secs) expect(Core.wc(s.text)).toBeLessThanOrEqual(200);
  });

  test('cleanParagraph: Zeilenumbrüche bleiben, Leerraum drumherum fällt weg', () => {
    expect(Core.cleanParagraph('  Erste  Zeile, \n\n  zweite\tZeile\n')).toBe('Erste Zeile,\nzweite Zeile');
  });

  test('segment: Verszeilen werden zu Leerzeichen mit Zeilenmarke, Absätze bleiben Brüche', () => {
    const vers = 'Habe nun, ach! Philosophie,\nJuristerei und Medizin,\nUnd leider auch Theologie';
    const [s] = Core.segment([vers, 'Durchaus studiert, mit heißem Bemühn.'], { min: 90, max: 200 });
    const chars = Array.from(s!.text);
    expect(s!.text).not.toContain('\n');
    expect(s!.lines).toEqual([chars.indexOf('J') - 1, chars.indexOf('U') - 1]);
    for (const i of s!.lines!) expect(chars[i]).toBe(' ');
    expect(s!.breaks).toEqual([chars.indexOf('D') - 1]);
    // Ohne Zeilenumbrüche kein Feld (ältere Daten sehen genauso aus)
    expect(Core.segment(['Nur Prosa hier.'])[0]).not.toHaveProperty('lines');
  });

  test('segment: Satzgrenze auf einem Zeilenumbruch bleibt beim Teilen langer Absätze ein Zeilenumbruch', () => {
    const line = 'Dies ist ein Vers mit genau zehn Wörtern darin hier.';
    const p = Array.from({ length: 60 }, () => line).join('\n');
    const secs = Core.segment([p], { min: 90, max: 200 });
    expect(secs.length).toBeGreaterThanOrEqual(2);
    for (const s of secs) {
      const chars = Array.from(s.text);
      // Jede Zeile außer der letzten im Abschnitt endet mit einer Zeilenmarke
      expect(s.lines?.length).toBe(s.text.split('. ').length - 1);
      for (const i of s.lines!) expect(chars[i - 1]).toBe('.');
      expect(s.breaks).toEqual([]);
    }
  });

  test('Session strikt: Fehler blockiert, korrekt rückt vor', () => {
    const s = new Core.Session('Hallo', { strict: true });
    let time = 1000;
    const k = (c: string, dt = 150) => s.type(c, (time += dt));
    expect(k('H')?.ok).toBe(true);
    expect(k('x')?.ok).toBe(false);
    expect(s.cursor).toBe(1);
    expect(s.streak).toBe(0);
    expect(k('a')?.ok).toBe(true);
    k('l');
    k('l');
    expect(s.done).toBe(false);
    k('o');
    expect(s.done).toBe(true);
    const st = s.stats();
    expect(st.total).toBe(6);
    expect(st.errors).toBe(1);
    expect(Math.abs(st.accuracy - 5 / 6)).toBeLessThan(1e-9);
    expect(s.backspace(time + 10)).toBeNull();
  });

  test('Session strikt: falsch getipptes Zeichen bleibt markiert', () => {
    const s = new Core.Session('ab');
    let time = 0;
    const k = (c: string) => s.type(c, (time += 120));
    k('x');
    expect(s.stateAt(0)).toBe('bad');
    expect(s.stateAt(1)).toBe('');
    k('y');
    expect(s.stateAt(0)).toBe('bad');
    k('a');
    expect(s.stateAt(0)).toBe('fixed');
    expect(s.stateAt(1)).toBe('');
    k('b');
    expect(s.stateAt(1)).toBe('ok');
  });

  test('Session frei: Fehler bleiben, Backspace, Abschluss nur fehlerfrei', () => {
    const s = new Core.Session('Ab', { strict: false });
    let time = 0;
    const k = (c: string) => s.type(c, (time += 120));
    k('A');
    k('x');
    expect(s.done).toBe(false);
    expect(s.stateAt(1)).toBe('bad');
    expect(k('z')).toBeNull();
    s.backspace((time += 100));
    expect(s.stateAt(1)).toBe('');
    k('b');
    expect(s.done).toBe(true);
    expect(s.stats().backspaces).toBe(1);
  });

  test('Session: Anführungszeichen und Gedankenstrich per ASCII', () => {
    const s = new Core.Session('„A“ – B', { strict: true });
    let time = 0;
    for (const c of '"A" - B') s.type(c, (time += 100));
    expect(s.done).toBe(true);
    expect(s.stats().errors).toBe(0);
  });

  test('Session: Pause verfälscht Zeit nicht', () => {
    const s = new Core.Session('abc', { strict: true });
    s.type('a', 1000);
    s.type('b', 1200);
    s.pause(1300);
    s.resume(61300);
    s.type('c', 61500);
    const st = s.stats();
    expect(st.durationMs).toBeLessThanOrEqual(400);
    expect(s.log[2]!.dt).toBeNull();
  });

  test('Session: Leerlauf über Cap wird gekappt', () => {
    const s = new Core.Session('ab', { strict: true });
    s.type('a', 0);
    s.type('b', 20000);
    expect(s.stats().durationMs).toBe(Core.IDLE_CAP);
  });

  test('Statistik: WPM-Formel (5 Zeichen = 1 Wort)', () => {
    const text = 'a'.repeat(61);
    const s = new Core.Session(text, { strict: true });
    let time = 0;
    for (let i = 0; i < 61; i++) s.type('a', (time += 1000));
    const st = s.stats(); // 61 Anschläge, 60 s aktive Zeit
    expect(Math.abs(st.wpm - 12.2)).toBeLessThan(0.2);
    expect(st.consistency).toBeGreaterThan(95);
  });

  test('Profil/Analyse: langsames Bigramm, Fehlerzeichen, Verwechslung', () => {
    const text = 'ab ab ab ab ab ab ab ab ';
    let p = Core.emptyProfile();
    for (let r = 0; r < 3; r++) {
      const s = new Core.Session(text, { strict: true });
      let time = 0;
      for (const c of text) {
        time += c === 'b' ? 600 : 100; // „b“ nach „a“ ist langsam
        if (c === 'b' && r === 0) s.type('n', time - 50); // Fehler: soll b, getippt n
        s.type(c, time);
      }
      p = Core.mergeProfile(p, s.log);
      p.sessions++;
    }
    const a = Core.analyze(p)!;
    expect(a.slow[0]!.k).toBe('ab');
    expect(a.slow[0]!.ratio).toBeGreaterThan(1.2);
    expect(a.errChars.some((x) => x.k === 'b')).toBe(true);
    expect(a.conf[0]!.exp).toBe('b');
    expect(a.conf[0]!.got).toBe('n');
    expect(a.cats.length).toBeGreaterThan(0);
    expect(typeof Core.hint(a)).toBe('string');
  });

  test('series: liefert Tempo-Verlauf', () => {
    const s = new Core.Session('a'.repeat(80), { strict: true });
    let time = 0;
    for (let i = 0; i < 80; i++) s.type('a', (time += 200));
    const v = Core.series(s.log);
    expect(v.length).toBeGreaterThanOrEqual(10);
    expect(Math.abs(v[0]! - 60)).toBeLessThan(1.5); // 200 ms/Zeichen = 60 WPM
  });
});
