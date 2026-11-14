import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/\/\/ <core>([\s\S]*?)\/\/ <\/core>/);
assert(m, 'Core-Block nicht gefunden');
const Core = vm.runInNewContext(m[1] + ';Core', {Math, Array, Object, Set, String, Number});

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  ', name); };

t('matches: exakt und Tastatur-Entsprechungen', () => {
  assert(Core.matches('a', 'a'));
  assert(!Core.matches('a', 'b'));
  assert(Core.matches('„', '"') && Core.matches('“', '"') && Core.matches('»', '"'));
  assert(Core.matches('’', "'") && Core.matches('‚', "'"));
  assert(Core.matches('–', '-') && Core.matches('—', '-'));
  assert(!Core.matches('a', '"'));
  assert(Core.matches('ä', 'ä') && !Core.matches('ä', 'a'));
});

t('prepare: Normalisierung, Überschrift, Seitenzahl, Fußnote', () => {
  const raw = 'Die Welt der Sicherheit\n\nEs war einmal[1] ein Land… mit „Zitaten“.\n\n12\n\nZweiter Absatz, der lang genug ist, um kein Titel zu sein.';
  const p = Core.prepare(raw);
  assert.equal(JSON.stringify(p.headings), JSON.stringify(['Die Welt der Sicherheit']));
  assert.equal(p.paragraphs.length, 2);
  assert.equal(p.paragraphs[0], 'Es war einmal ein Land... mit „Zitaten“.');
  assert.equal(p.rare.length, 0);
});

t('prepare: NFC (ä als ein Zeichen)', () => {
  const p = Core.prepare('Schönes Wetter heute, ähnlich wie gestern und vorgestern auch schon.');
  assert(p.paragraphs[0].includes('ä'));
  assert.equal(Array.from('ä').length, 1);
});

t('segment: Länge, Brüche, Verlustfreiheit', () => {
  const para = (k) => Array.from({length: 60}, (_, i) => `Wort${k}_${i}`).join(' ') + '.';
  const paras = [para(1), para(2), para(3), para(4), para(5)];
  const secs = Core.segment(paras, {min: 90, max: 200});
  assert(secs.length >= 2);
  for (const s of secs) {
    const w = Core.wc(s.text);
    assert(w <= 200 + 60, 'Abschnitt zu lang: ' + w);
    for (const b of s.breaks) assert.equal(Array.from(s.text)[b], ' ');
  }
  const joined = secs.map(s => s.text).join(' ').split(/\s+/).join(' ');
  assert.equal(joined, paras.join(' ').split(/\s+/).join(' '));
});

t('segment: sehr langer Absatz wird an Satzgrenzen geteilt', () => {
  const sent = 'Dies ist ein Satz mit genau zehn Wörtern, nicht mehr.';
  const p = Array.from({length: 60}, () => sent).join(' ');
  const secs = Core.segment([p], {min: 90, max: 200});
  assert(secs.length >= 2);
  for (const s of secs) assert(Core.wc(s.text) <= 200);
});

t('Session strikt: Fehler blockiert, korrekt rückt vor', () => {
  const s = new Core.Session('Hallo', {strict: true});
  let time = 1000;
  const k = (c, dt = 150) => s.type(c, (time += dt));
  assert.equal(k('H').ok, true);
  assert.equal(k('x').ok, false);
  assert.equal(s.cursor, 1);
  assert.equal(s.streak, 0);
  assert.equal(k('a').ok, true); k('l'); k('l');
  assert(!s.done);
  k('o');
  assert(s.done);
  const st = s.stats();
  assert.equal(st.total, 6); assert.equal(st.errors, 1);
  assert(Math.abs(st.accuracy - 5 / 6) < 1e-9);
  assert.equal(s.backspace(time + 10), null);
});

t('Session frei: Fehler bleiben, Backspace, Abschluss nur fehlerfrei', () => {
  const s = new Core.Session('Ab', {strict: false});
  let time = 0;
  const k = (c) => s.type(c, (time += 120));
  k('A'); k('x');
  assert(!s.done);
  assert.equal(s.stateAt(1), 'bad');
  assert.equal(k('z'), null);
  s.backspace(time += 100);
  assert.equal(s.stateAt(1), '');
  k('b');
  assert(s.done);
  assert.equal(s.stats().backspaces, 1);
});

t('Session: Anführungszeichen und Gedankenstrich per ASCII', () => {
  const s = new Core.Session('„A“ – B', {strict: true});
  let time = 0;
  for (const c of '"A" - B') s.type(c, (time += 100));
  assert(s.done);
  assert.equal(s.stats().errors, 0);
});

t('Session: Pause verfälscht Zeit nicht', () => {
  const s = new Core.Session('abc', {strict: true});
  s.type('a', 1000); s.type('b', 1200);
  s.pause(1300); s.resume(61300);
  s.type('c', 61500);
  const st = s.stats();
  assert(st.durationMs <= 400, 'Dauer ' + st.durationMs);
  assert.equal(s.log[2].dt, null);
});

t('Session: Leerlauf über Cap wird gekappt', () => {
  const s = new Core.Session('ab', {strict: true});
  s.type('a', 0); s.type('b', 20000);
  assert.equal(s.stats().durationMs, Core.IDLE_CAP);
});

t('Statistik: WPM-Formel (5 Zeichen = 1 Wort)', () => {
  const text = 'a'.repeat(61);
  const s = new Core.Session(text, {strict: true});
  let time = 0;
  for (let i = 0; i < 61; i++) s.type('a', (time += 1000));
  const st = s.stats();            // 61 Anschläge, 60 s aktive Zeit
  assert(Math.abs(st.wpm - 12.2) < 0.2, 'wpm ' + st.wpm);
  assert(st.consistency > 95);
});

t('Profil/Analyse: langsames Bigramm, Fehlerzeichen, Verwechslung', () => {
  const text = 'ab ab ab ab ab ab ab ab ';
  let p = Core.emptyProfile();
  for (let r = 0; r < 3; r++) {
    const s = new Core.Session(text, {strict: true});
    let time = 0;
    for (const c of text) {
      time += c === 'b' ? 600 : 100;          // „b“ nach „a“ ist langsam
      if (c === 'b' && r === 0) s.type('n', time - 50); // Fehler: soll b, getippt n
      s.type(c, time);
    }
    p = Core.mergeProfile(p, s.log); p.sessions++;
  }
  const a = Core.analyze(p);
  assert.equal(a.slow[0].k, 'ab');
  assert(a.slow[0].ratio > 1.2);
  assert(a.errChars.some(x => x.k === 'b'));
  assert.equal(a.conf[0].exp, 'b'); assert.equal(a.conf[0].got, 'n');
  assert(a.cats.length > 0);
  assert(typeof Core.hint(a) === 'string');
});

t('series: liefert Tempo-Verlauf', () => {
  const s = new Core.Session('a'.repeat(80), {strict: true});
  let time = 0;
  for (let i = 0; i < 80; i++) s.type('a', (time += 200));
  const v = Core.series(s.log);
  assert(v.length >= 10);
  assert(Math.abs(v[0] - 60) < 1.5, 'v0 ' + v[0]); // 200 ms/Zeichen = 60 WPM
});

console.log(`\n${n} Tests bestanden`);
