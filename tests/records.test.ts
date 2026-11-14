import { describe, expect, test } from 'vitest';
import { addProfiles, emptyProfile, mergeProfile, Session, type Profile } from '../src/core';
import {
  EXPORT_SCHEMA,
  fromLegacy,
  ImportError,
  mergeImport,
  parseExport,
  type ExportFile,
  type LocalState,
  type SessionRecord,
} from '../src/data/records';

/** Session mit echten Ereignissen erzeugen: tippt `typed` gegen `text`. */
function typedSession(text: string, typed: string): Session {
  const s = new Session(text, { strict: false });
  let t = 1000;
  for (const ch of typed) s.type(ch, (t += 150));
  return s;
}

function record(id: string, date: number, events?: Session): SessionRecord {
  return {
    id,
    date,
    bookId: 'demo',
    bookTitle: 'Demo',
    section: 0,
    strict: true,
    stats: { wpm: 40, raw: 42, accuracy: 0.98, errors: 1, consistency: 80, durationMs: 30000 },
    events: events?.log,
  };
}

const profileOf = (...ss: Session[]): Profile => {
  let p = emptyProfile();
  for (const s of ss) {
    p = mergeProfile(p, s.log);
    p.sessions++;
  }
  return p;
};

const file = (over: Partial<ExportFile>): ExportFile => ({
  app: 'typenhebel',
  schema: EXPORT_SCHEMA,
  exported: '',
  profile: emptyProfile(),
  sessions: [],
  progress: [],
  ...over,
});

const local = (over: Partial<LocalState>): LocalState => ({
  profile: emptyProfile(),
  sessionIds: new Set(),
  bookIds: new Set(['demo']),
  progress: [],
  ...over,
});

describe('addProfiles', () => {
  test('ergibt dasselbe wie gemeinsames Aggregieren', () => {
    const a = typedSession('das ist gut', 'das ist gut');
    const b = typedSession('das ist gut', 'dss ist gzt');
    expect(addProfiles(profileOf(a), profileOf(b))).toEqual(profileOf(a, b));
  });
  test('verändert die Eingaben nicht', () => {
    const p = profileOf(typedSession('abc', 'abc'));
    const copy = structuredClone(p);
    addProfiles(p, p);
    expect(p).toEqual(copy);
  });
});

describe('fromLegacy', () => {
  test('übernimmt Kennzahlen, Genauigkeit als Anteil, stabile ID', () => {
    const e = {
      d: 1700000000000,
      b: 'demo',
      bt: 'Demo',
      s: 3,
      wpm: 41.2,
      raw: 44,
      acc: 97.5,
      err: 2,
      cons: 71,
      dur: 28000,
      strict: true,
    };
    const r = fromLegacy(e);
    expect(r.stats.accuracy).toBeCloseTo(0.975);
    expect(r).toMatchObject({ date: e.d, bookId: 'demo', section: 3, bookTitle: 'Demo' });
    expect(fromLegacy(e).id).toBe(r.id);
  });
});

describe('parseExport', () => {
  test('liest das aktuelle Format', () => {
    const f = file({ sessions: [record('s1', 1)], progress: [{ bookId: 'demo', section: 2, done: [0, 1] }] });
    expect(parseExport(JSON.stringify(f))).toEqual(f);
  });
  test('liest den alten Export (Version 1) und vergibt IDs', () => {
    const old = {
      version: 1,
      exported: '2026-11-01T00:00:00Z',
      profile: emptyProfile(),
      sessions: [
        { d: 5, b: 'demo', bt: 'Demo', s: 0, wpm: 30, raw: 31, acc: 99, err: 0, cons: null, dur: 1000, strict: true },
      ],
    };
    const f = parseExport(JSON.stringify(old));
    expect(f.schema).toBe(1);
    expect(f.sessions[0]!.id).toBeTruthy();
    expect(f.progress).toEqual([]);
  });
  test.each([
    ['kein JSON', '{oh', /kein gültiges JSON/],
    ['fremde Datei', '{"foo":1}', /keine Typenhebel-Sicherung/],
    ['Array', '[]', /keine Typenhebel-Sicherung/],
    ['neuere Version', JSON.stringify(file({ schema: EXPORT_SCHEMA + 1 })), /neueren Version/],
    ['Profil fehlt', JSON.stringify({ ...file({}), profile: null }), /Profil/],
    ['Session kaputt', JSON.stringify(file({ sessions: [{ id: 1 } as unknown as SessionRecord] })), /Verlauf/],
    ['Buch ohne Text', JSON.stringify(file({ books: [{ id: 'b', title: 'x', author: '', sections: [] }] })), /Buch/],
  ])('weist ab: %s', (_name, json, msg) => {
    expect(() => parseExport(json)).toThrow(ImportError);
    expect(() => parseExport(json)).toThrow(msg);
  });
});

describe('mergeImport', () => {
  const a = typedSession('Abend am Fluss', 'Abend am Fluss');
  const b = typedSession('Morgen im Wald', 'Morgen im Wakd');
  const c = typedSession('Mittag am See', 'Mitag am See');

  test('leeres lokales Profil übernimmt den Import', () => {
    const r = mergeImport(local({}), file({ profile: profileOf(a), sessions: [record('a', 1, a)] }));
    expect(r.profile).toEqual(profileOf(a));
    expect(r.sessions.map((s) => s.id)).toEqual(['a']);
  });

  test('derselbe Import zweimal ändert nichts', () => {
    const l = local({ profile: profileOf(a), sessionIds: new Set(['a']) });
    const r = mergeImport(l, file({ profile: profileOf(a), sessions: [record('a', 1, a)] }));
    expect(r.profile).toBe(l.profile);
    expect(r.sessions).toEqual([]);
    expect(r.duplicates).toBe(1);
  });

  test('disjunkte Verläufe: Profile werden addiert', () => {
    const l = local({ profile: profileOf(a), sessionIds: new Set(['a']) });
    const r = mergeImport(l, file({ profile: profileOf(b), sessions: [record('b', 2)] }));
    expect(r.profile).toEqual(profileOf(a, b));
    expect(r.sessions.map((s) => s.id)).toEqual(['b']);
  });

  test('Import enthält alles Lokale und mehr: sein Profil gilt', () => {
    const l = local({ profile: profileOf(a), sessionIds: new Set(['a']) });
    const r = mergeImport(l, file({ profile: profileOf(a, b), sessions: [record('a', 1), record('b', 2)] }));
    expect(r.profile).toEqual(profileOf(a, b));
    expect(r.sessions.map((s) => s.id)).toEqual(['b']);
  });

  test('teilweise Überschneidung: nur neue Sessions mit Rohdaten zählen ins Profil', () => {
    const l = local({ profile: profileOf(a, b), sessionIds: new Set(['a', 'b']) });
    const inc = file({
      profile: profileOf(b, c),
      sessions: [record('b', 2, b), record('c', 3, c), record('d', 4)],
    });
    const r = mergeImport(l, inc);
    expect(r.profile).toEqual(profileOf(a, b, c));
    expect(r.sessions.map((s) => s.id)).toEqual(['c', 'd']);
    expect(r.unprofiled).toBe(1);
  });

  test('Bücher: nur neue; Fortschritt: erledigte Abschnitte vereinigt, lokale Position bleibt', () => {
    const book = { id: 'b1', title: 'Neu', author: '', sections: [{ text: 'x', breaks: [] }] };
    const l = local({
      bookIds: new Set(['demo', 'old']),
      progress: [{ bookId: 'demo', section: 4, done: [0, 1] }],
    });
    const r = mergeImport(
      l,
      file({
        books: [book, { ...book, id: 'old' }],
        progress: [
          { bookId: 'demo', section: 1, done: [1, 2] },
          { bookId: 'b1', section: 3, done: [0] },
          { bookId: 'unbekannt', section: 0, done: [0] },
        ],
      }),
    );
    expect(r.books.map((x) => x.id)).toEqual(['b1']);
    expect(r.progress).toEqual([
      { bookId: 'demo', section: 4, done: [0, 1, 2] },
      { bookId: 'b1', section: 3, done: [0] },
    ]);
  });

  test('Cover: lokale Wahl hat Vorrang, nur für bekannte Bücher', () => {
    const l = local({ bookIds: new Set(['demo', 'b1']), covers: { b1: { layout: 'rahmen', palette: 'Moos' } } });
    const r = mergeImport(
      l,
      file({
        covers: {
          b1: { layout: 'tasten', palette: 'Tinte' },
          demo: { layout: 'initial', palette: 'Rost' },
          fremd: { layout: 'tasten', palette: 'Tinte' },
        },
      }),
    );
    expect(r.covers).toEqual({
      b1: { layout: 'rahmen', palette: 'Moos' },
      demo: { layout: 'initial', palette: 'Rost' },
    });
  });

  test('ungültige Cover-Angaben im Import fallen still weg', () => {
    const f = parseExport(
      JSON.stringify(
        file({ covers: { a: { layout: 'rahmen', palette: 'Moos' }, b: { layout: 'neu', palette: 'x' } } as never }),
      ),
    );
    expect(f.covers).toEqual({ a: { layout: 'rahmen', palette: 'Moos' } });
  });
});
