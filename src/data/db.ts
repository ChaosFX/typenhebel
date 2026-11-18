// IndexedDB über Dexie: Schema, Migration aus localStorage, Export/Import.
import Dexie, { type EntityTable } from 'dexie';
import { emptyProfile, type Book, type CoverChoice, type Digest, type Profile, type Section } from '../core';
import {
  bookMeta,
  cleanCovers,
  EXPORT_SCHEMA,
  fromLegacy,
  KEEP_EVENTS,
  mergeImport,
  parseExport,
  type BookMeta,
  type ExportFile,
  type LegacySession,
  type MergeResult,
  type ProgressRecord,
  type SessionRecord,
  withDigest,
} from './records';
import { PREFIX } from './store';

interface TextRow {
  bookId: string;
  sections: Section[];
}
interface KvRow {
  key: string;
  value: unknown;
}

export class TypenhebelDb extends Dexie {
  books!: EntityTable<BookMeta, 'id'>;
  texts!: EntityTable<TextRow, 'bookId'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  progress!: EntityTable<ProgressRecord, 'bookId'>;
  kv!: EntityTable<KvRow, 'key'>;

  constructor(name = 'typenhebel') {
    super(name);
    // Schema-Version 1. Änderungen am Modell → neue version(n) mit upgrade(), nie die alte ändern.
    this.version(1).stores({
      books: 'id, created',
      texts: 'bookId',
      sessions: 'id, date, bookId',
      progress: 'bookId',
      kv: 'key',
    });
    // Version 2 (Phase 6): Kurzfassung je Session für alle, die noch Rohdaten haben.
    this.version(2)
      .stores({})
      .upgrade((tx) =>
        tx
          .table<SessionRecord, string>('sessions')
          .toCollection()
          .modify((s: SessionRecord) => {
            const d = withDigest(s).digest;
            if (d) s.digest = d;
          }),
      );
  }
}

/** Speicher voll? (QuotaExceededError, auch verpackt in Dexie-Fehlern) */
export function isQuotaError(e: unknown): boolean {
  for (let x = e as { name?: string; inner?: unknown } | undefined; x; x = x.inner as typeof x) {
    if (x.name === 'QuotaExceededError') return true;
  }
  return false;
}

/** Schlüssel aus Phase 0/1, die nach IndexedDB umziehen. `settings` bleibt in localStorage. */
const LEGACY_KEYS = ['books', 'profile', 'sessions', 'progress', 'done', 'current'] as const;

/**
 * Einmalige Übernahme der localStorage-Daten. Die alten Schlüssel werden erst gelöscht,
 * wenn die Transaktion erfolgreich war; schlägt sie fehl, bleibt alles stehen.
 */
export async function migrateFromLocalStorage(db: TypenhebelDb, storage: Storage): Promise<boolean> {
  const read = <T>(k: string): T | null => {
    try {
      const v = storage.getItem(PREFIX + k);
      return v === null ? null : (JSON.parse(v) as T);
    } catch {
      return null;
    }
  };
  if (!LEGACY_KEYS.some((k) => storage.getItem(PREFIX + k) !== null)) return false;
  const books = read<Book[]>('books') ?? [];
  const profile = read<Profile>('profile');
  const sessions = (read<LegacySession[]>('sessions') ?? []).map(fromLegacy);
  const pos = read<Record<string, number>>('progress') ?? {};
  const done = read<Record<string, number[]>>('done') ?? {};
  const current = read<string>('current');
  const progress = [...new Set([...Object.keys(pos), ...Object.keys(done)])].map((bookId): ProgressRecord => ({
    bookId,
    section: pos[bookId] ?? 0,
    done: done[bookId] ?? [],
  }));

  await db.transaction('rw', [db.books, db.texts, db.sessions, db.progress, db.kv], async () => {
    for (const b of books) {
      if (await db.books.get(b.id)) continue;
      await db.books.add(bookMeta(b));
      await db.texts.add({ bookId: b.id, sections: b.sections });
    }
    await db.sessions.bulkPut(sessions);
    for (const p of progress) if (!(await db.progress.get(p.bookId))) await db.progress.add(p);
    if (profile && !(await db.kv.get('profile'))) await db.kv.add({ key: 'profile', value: profile });
    if (current && !(await db.kv.get('current'))) await db.kv.add({ key: 'current', value: current });
  });
  for (const k of LEGACY_KEYS) storage.removeItem(PREFIX + k);
  return true;
}

export interface LoadedState {
  books: BookMeta[];
  /** ohne Kurzfassung: die wird nur für Auswertungen über Zeiträume gebraucht und dann eigens geladen */
  sessions: SessionRecord[];
  progress: Map<string, ProgressRecord>;
  profile: Profile;
  current: string | null;
  exportedAtSessions: number;
  covers: Record<string, CoverChoice>;
}

export async function loadState(db: TypenhebelDb): Promise<LoadedState> {
  const [books, sessions, progress, profile, current, exported, covers] = await Promise.all([
    db.books.orderBy('created').toArray(),
    db.sessions.orderBy('date').toArray(),
    db.progress.toArray(),
    db.kv.get('profile'),
    db.kv.get('current'),
    db.kv.get('exportedAtSessions'),
    db.kv.get('covers'),
  ]);
  return {
    books,
    sessions: sessions.map(({ digest: _, ...s }) => s),
    progress: new Map(progress.map((p) => [p.bookId, p])),
    profile: (profile?.value as Profile | undefined) ?? emptyProfile(),
    current: (current?.value as string | undefined) ?? null,
    exportedAtSessions: (exported?.value as number | undefined) ?? 0,
    covers: cleanCovers(covers?.value),
  };
}

/** Kurzfassungen ab einem Zeitpunkt (für Vergleiche über Zeiträume, SPEC Phase 6). */
export async function loadDigests(db: TypenhebelDb, since: number): Promise<{ date: number; digest?: Digest }[]> {
  const rows = await db.sessions.where('date').aboveOrEqual(since).toArray();
  return rows.map(({ date, digest }) => (digest ? { date, digest } : { date }));
}

export async function getSections(db: TypenhebelDb, bookId: string): Promise<Section[] | null> {
  return (await db.texts.get(bookId))?.sections ?? null;
}

export async function saveBook(db: TypenhebelDb, b: Book): Promise<void> {
  await db.transaction('rw', db.books, db.texts, async () => {
    await db.books.put(bookMeta(b));
    await db.texts.put({ bookId: b.id, sections: b.sections });
  });
}

export async function deleteBook(db: TypenhebelDb, id: string): Promise<void> {
  await db.transaction('rw', [db.books, db.texts, db.progress, db.kv], async () => {
    await db.books.delete(id);
    await db.texts.delete(id);
    await db.progress.delete(id);
    const covers = cleanCovers((await db.kv.get('covers'))?.value);
    if (covers[id]) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Wörterbuch nach Buch-ID
      delete covers[id];
      await db.kv.put({ key: 'covers', value: covers });
    }
  });
}

export const setKv = async (db: TypenhebelDb, key: string, value: unknown): Promise<void> => {
  await db.kv.put({ key, value });
};

/** Session und neues Profil gemeinsam speichern; Rohdaten älterer Sessions verdichten. */
export async function addSession(db: TypenhebelDb, s: SessionRecord, profile: Profile): Promise<void> {
  await db.transaction('rw', db.sessions, db.kv, async () => {
    await db.sessions.put(s);
    await db.kv.put({ key: 'profile', value: profile });
    await compactEvents(db);
  });
}

/** Tastenereignisse nur für die letzten KEEP_EVENTS Sessions behalten. Gibt die Zahl der verdichteten zurück. */
export async function compactEvents(db: TypenhebelDb, keep = KEEP_EVENTS): Promise<number> {
  return db.sessions
    .orderBy('date')
    .reverse()
    .offset(keep)
    .filter((s) => s.events !== undefined)
    .modify((s: SessionRecord) => {
      delete s.events;
    });
}

export async function clearHistory(db: TypenhebelDb): Promise<void> {
  await db.transaction('rw', db.sessions, db.kv, async () => {
    await db.sessions.clear();
    await db.kv.bulkDelete(['profile', 'exportedAtSessions']);
  });
}

export async function buildExport(db: TypenhebelDb, withBooks: boolean): Promise<ExportFile> {
  return db.transaction('r', [db.books, db.texts, db.sessions, db.progress, db.kv], async () => {
    const file: ExportFile = {
      app: 'typenhebel',
      schema: EXPORT_SCHEMA,
      exported: new Date().toISOString(),
      profile: ((await db.kv.get('profile'))?.value as Profile | undefined) ?? emptyProfile(),
      sessions: await db.sessions.orderBy('date').toArray(),
      progress: await db.progress.toArray(),
      covers: cleanCovers((await db.kv.get('covers'))?.value),
    };
    if (withBooks) {
      const metas = await db.books.orderBy('created').toArray();
      file.books = [];
      for (const { sectionCount, ...m } of metas) {
        const sections = await getSections(db, m.id);
        if (sections) file.books.push({ ...m, sections });
      }
    }
    return file;
  });
}

/** Sicherung einlesen und zusammenführen. Wirft ImportError bei ungültigen Dateien. */
export async function importJson(db: TypenhebelDb, json: string): Promise<MergeResult> {
  const inc = parseExport(json);
  return db.transaction('rw', [db.books, db.texts, db.sessions, db.progress, db.kv], async () => {
    const local = {
      profile: ((await db.kv.get('profile'))?.value as Profile | undefined) ?? emptyProfile(),
      sessionIds: new Set((await db.sessions.toCollection().primaryKeys()) as string[]),
      bookIds: new Set(['demo', ...((await db.books.toCollection().primaryKeys()) as string[])]),
      progress: await db.progress.toArray(),
      covers: cleanCovers((await db.kv.get('covers'))?.value),
    };
    const r = mergeImport(local, inc);
    for (const b of r.books) await saveBook(db, b);
    await db.sessions.bulkPut(r.sessions);
    await db.progress.bulkPut(r.progress);
    await db.kv.put({ key: 'profile', value: r.profile });
    await db.kv.put({ key: 'covers', value: r.covers });
    await compactEvents(db);
    return r;
  });
}
