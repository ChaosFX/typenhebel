import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { emptyProfile, mergeProfile, Session, type Book } from '../src/core';
import {
  addSession,
  buildExport,
  compactEvents,
  deleteBook,
  getSections,
  importJson,
  isQuotaError,
  loadState,
  migrateFromLocalStorage,
  saveBook,
  TypenhebelDb,
} from '../src/data/db';
import type { SessionRecord } from '../src/data/records';
import { MemoryStorage } from './fixtures/memory-storage';

let db: TypenhebelDb;
let n = 0;
beforeEach(async () => {
  db = new TypenhebelDb('test-' + n++);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const book = (id: string, created = 1): Book => ({
  id,
  title: 'Buch ' + id,
  author: 'A',
  chapters: [{ title: 'Eins', sectionStart: 0 }],
  sections: [
    { text: 'Erster Abschnitt.', breaks: [] },
    { text: 'Zweiter Abschnitt.', breaks: [] },
  ],
  created,
});

function session(id: string, date: number): SessionRecord {
  const s = new Session('abc', { strict: true });
  s.type('a', 0);
  s.type('b', 100);
  s.type('c', 200);
  return {
    id,
    date,
    bookId: 'demo',
    bookTitle: 'Demo',
    section: 0,
    strict: true,
    stats: s.stats(),
    events: s.log,
  };
}

describe('Migration aus localStorage', () => {
  test('übernimmt Bücher, Verlauf, Profil, Fortschritt und räumt auf – Einstellungen bleiben', async () => {
    const ls = new MemoryStorage();
    const p = { ...emptyProfile(), n: 7, sessions: 2 };
    ls.setItem('typenhebel.v1.books', JSON.stringify([book('b1')]));
    ls.setItem('typenhebel.v1.profile', JSON.stringify(p));
    ls.setItem(
      'typenhebel.v1.sessions',
      JSON.stringify([
        { d: 10, b: 'b1', bt: 'Buch b1', s: 0, wpm: 30, raw: 31, acc: 99, err: 0, cons: null, dur: 1000, strict: true },
      ]),
    );
    ls.setItem('typenhebel.v1.progress', JSON.stringify({ b1: 1, demo: 3 }));
    ls.setItem('typenhebel.v1.done', JSON.stringify({ b1: [0] }));
    ls.setItem('typenhebel.v1.current', JSON.stringify('b1'));
    ls.setItem('typenhebel.v1.settings', '{"strict":true}');

    expect(await migrateFromLocalStorage(db, ls)).toBe(true);
    const st = await loadState(db);
    expect(st.books).toEqual([expect.objectContaining({ id: 'b1', sectionCount: 2 })]);
    expect(st.books[0]).not.toHaveProperty('sections');
    expect(await getSections(db, 'b1')).toEqual(book('b1').sections);
    expect(st.sessions).toHaveLength(1);
    expect(st.sessions[0]!.stats.accuracy).toBeCloseTo(0.99);
    expect(st.profile).toEqual(p);
    expect(st.progress.get('b1')).toEqual({ bookId: 'b1', section: 1, done: [0] });
    expect(st.progress.get('demo')).toEqual({ bookId: 'demo', section: 3, done: [] });
    expect(st.current).toBe('b1');
    expect(ls.length).toBe(1);
    expect(ls.getItem('typenhebel.v1.settings')).toBe('{"strict":true}');

    expect(await migrateFromLocalStorage(db, ls)).toBe(false);
  });

  test('alte Daten bleiben stehen, wenn das Schreiben fehlschlägt', async () => {
    const ls = new MemoryStorage();
    ls.setItem('typenhebel.v1.books', JSON.stringify([book('b1')]));
    db.close();
    await expect(migrateFromLocalStorage(db, ls)).rejects.toThrow();
    expect(ls.getItem('typenhebel.v1.books')).not.toBeNull();
  });
});

describe('Bücher', () => {
  test('Metadaten und Text getrennt, Löschen entfernt alles', async () => {
    await saveBook(db, book('b2', 2));
    await saveBook(db, book('b1', 1));
    await db.progress.put({ bookId: 'b1', section: 1, done: [0] });
    expect((await loadState(db)).books.map((b) => b.id)).toEqual(['b1', 'b2']);
    await deleteBook(db, 'b1');
    expect(await getSections(db, 'b1')).toBeNull();
    expect(await db.progress.get('b1')).toBeUndefined();
    expect((await loadState(db)).books.map((b) => b.id)).toEqual(['b2']);
  });
});

describe('Sessions', () => {
  test('Rohdaten nur für die letzten 30 Sessions', async () => {
    for (let i = 0; i < 33; i++) await addSession(db, session('s' + i, 1000 + i), emptyProfile());
    const all = await db.sessions.orderBy('date').toArray();
    expect(all).toHaveLength(33);
    expect(all.filter((s) => s.events).map((s) => s.id)).toEqual(all.slice(3).map((s) => s.id));
    expect(all[0]!.stats.wpm).toBeGreaterThan(0);
    expect(await compactEvents(db)).toBe(0);
  });
});

describe('Export und Import', () => {
  test('Rundreise mit Büchern in eine leere Datenbank', async () => {
    const s = session('s1', 5);
    const prof = mergeProfile(emptyProfile(), s.events!);
    await saveBook(db, book('b1'));
    await addSession(db, s, prof);
    await db.progress.put({ bookId: 'b1', section: 1, done: [0] });
    const json = JSON.stringify(await buildExport(db, true));
    expect(JSON.parse(json).books[0].sections).toHaveLength(2);
    expect(JSON.parse(JSON.stringify(await buildExport(db, false)))).not.toHaveProperty('books');

    const other = new TypenhebelDb('test-other-' + n++);
    await other.open();
    const r = await importJson(other, json);
    expect(r.sessions).toHaveLength(1);
    const st = await loadState(other);
    expect(st.profile).toEqual(prof);
    expect(st.books.map((b) => b.id)).toEqual(['b1']);
    expect(await getSections(other, 'b1')).toHaveLength(2);
    expect(st.progress.get('b1')!.done).toEqual([0]);

    // Zweiter Import derselben Datei: nichts doppelt
    const again = await importJson(other, json);
    expect(again.sessions).toHaveLength(0);
    expect((await loadState(other)).profile).toEqual(prof);
    await other.delete();
  });

  test('Cover-Wahl wandert mit und verschwindet beim Löschen des Buchs', async () => {
    await saveBook(db, book('b1'));
    await db.kv.put({
      key: 'covers',
      value: { b1: { layout: 'tasten', palette: 'Rost' }, demo: { layout: 'rahmen', palette: 'Moos' } },
    });
    const json = JSON.stringify(await buildExport(db, true));
    const other = new TypenhebelDb('test-covers-' + n++);
    await other.open();
    await importJson(other, json);
    expect((await loadState(other)).covers.b1).toEqual({ layout: 'tasten', palette: 'Rost' });
    await deleteBook(other, 'b1');
    expect((await loadState(other)).covers).toEqual({ demo: { layout: 'rahmen', palette: 'Moos' } });
    await other.delete();
  });

  test('ungültige Datei ändert nichts', async () => {
    await addSession(db, session('s1', 5), { ...emptyProfile(), n: 3 });
    await expect(importJson(db, '{"app":"typenhebel","schema":99}')).rejects.toThrow(/neueren Version/);
    expect((await loadState(db)).profile.n).toBe(3);
  });
});

test('isQuotaError erkennt auch verpackte Fehler', () => {
  expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
  expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
  expect(isQuotaError(new Error('x'))).toBe(false);
  expect(isQuotaError(undefined)).toBe(false);
});
