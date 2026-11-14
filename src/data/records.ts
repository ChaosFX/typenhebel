// Gespeicherte Datensätze, Exportformat und Zusammenführen beim Import.
// DOM- und IndexedDB-frei, damit alles in Unit-Tests prüfbar ist.
import { addProfiles, emptyProfile, mergeProfile, type Book, type LogEvent, type Profile } from '../core';
import type { SessionStats } from '../core/session';

/** Rohdaten (Tastenereignisse) bleiben nur für die letzten N Sessions erhalten (SPEC §7, Phase 2). */
export const KEEP_EVENTS = 30;
/** Nach so vielen Sessions ohne Export erinnert die App ans Sichern. */
export const EXPORT_REMINDER = 30;
/** Schema der Exportdatei. Version 1 war der Export aus Phase 0/1 (nur Sessions und Profil). */
export const EXPORT_SCHEMA = 2;

/** Kennzahlen einer Session. Aus localStorage migrierte Sessions haben nur diese Felder. */
export type SessionSummary = Pick<SessionStats, 'wpm' | 'raw' | 'accuracy' | 'errors' | 'consistency' | 'durationMs'> &
  Partial<SessionStats>;

export interface SessionRecord {
  id: string;
  date: number;
  bookId: string;
  bookTitle: string;
  section: number;
  strict: boolean;
  stats: SessionSummary;
  /** Nur für die letzten KEEP_EVENTS Sessions vorhanden */
  events?: LogEvent[];
}

/** Buch ohne Text, für Listen und Menüs. Der Text liegt getrennt (Tabelle `texts`). */
export type BookMeta = Omit<Book, 'sections'> & { sectionCount: number };

export interface ProgressRecord {
  bookId: string;
  /** Abschnitt, bei dem es weitergeht */
  section: number;
  /** Abgeschlossene Abschnitte (aufsteigend) */
  done: number[];
}

export const bookMeta = ({ sections, ...rest }: Book): BookMeta => ({ ...rest, sectionCount: sections.length });

/** Sitzungseintrag aus localStorage (Phase 0/1) bzw. Export Version 1. */
export interface LegacySession {
  d: number;
  b: string;
  bt: string;
  s: number;
  wpm: number;
  raw: number;
  acc: number;
  err: number;
  cons: number | null;
  dur: number;
  strict: boolean;
}

/** Stabile ID für alte Einträge, damit derselbe Export nicht doppelt importiert wird. */
export const legacyId = (e: LegacySession): string => `l${e.d.toString(36)}-${e.b}-${e.s}`;

export function fromLegacy(e: LegacySession): SessionRecord {
  return {
    id: legacyId(e),
    date: e.d,
    bookId: e.b,
    bookTitle: e.bt,
    section: e.s,
    strict: e.strict,
    stats: {
      wpm: e.wpm,
      raw: e.raw,
      accuracy: e.acc / 100,
      errors: e.err,
      consistency: e.cons,
      durationMs: e.dur,
    },
  };
}

export const newSessionId = (date: number): string => 's' + date.toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Export ----------

export interface ExportFile {
  app: 'typenhebel';
  schema: number;
  exported: string;
  profile: Profile;
  sessions: SessionRecord[];
  progress: ProgressRecord[];
  books?: Book[];
}

export class ImportError extends Error {}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';

function checkProfile(p: unknown): Profile {
  if (!isObj(p) || !isNum(p.n) || !isNum(p.sessions) || !isObj(p.ch) || !isObj(p.bg) || !isObj(p.cf) || !isObj(p.cat))
    throw new ImportError('Das Profil in der Datei ist unvollständig.');
  return { ...emptyProfile(), ...(p as unknown as Profile) };
}

function checkSession(s: unknown): SessionRecord {
  if (
    !isObj(s) ||
    !isStr(s.id) ||
    !isNum(s.date) ||
    !isStr(s.bookId) ||
    !isNum(s.section) ||
    !isObj(s.stats) ||
    !isNum(s.stats.wpm) ||
    (s.events !== undefined && !Array.isArray(s.events))
  )
    throw new ImportError('Ein Eintrag im Verlauf ist beschädigt.');
  return {
    ...(s as unknown as SessionRecord),
    bookTitle: isStr(s.bookTitle) ? s.bookTitle : '',
    strict: s.strict !== false,
  };
}

function checkLegacySession(s: unknown): SessionRecord {
  if (!isObj(s) || !isNum(s.d) || !isStr(s.b) || !isNum(s.s) || !isNum(s.wpm) || !isNum(s.acc))
    throw new ImportError('Ein Eintrag im Verlauf ist beschädigt.');
  return fromLegacy(s as unknown as LegacySession);
}

function checkBook(b: unknown): Book {
  if (
    !isObj(b) ||
    !isStr(b.id) ||
    !isStr(b.title) ||
    !Array.isArray(b.sections) ||
    !b.sections.length ||
    !b.sections.every((s) => isObj(s) && isStr(s.text) && Array.isArray(s.breaks))
  )
    throw new ImportError('Ein Buch in der Datei ist beschädigt.');
  return { ...(b as unknown as Book), author: isStr(b.author) ? b.author : '' };
}

function checkProgress(p: unknown): ProgressRecord {
  if (!isObj(p) || !isStr(p.bookId) || !isNum(p.section) || !Array.isArray(p.done) || !p.done.every(isNum))
    throw new ImportError('Der gespeicherte Fortschritt ist beschädigt.');
  return p as unknown as ProgressRecord;
}

/** Exportdatei lesen und prüfen. Wirft ImportError mit verständlicher Meldung. */
export function parseExport(json: string): ExportFile {
  let d: unknown;
  try {
    d = JSON.parse(json);
  } catch {
    throw new ImportError('Die Datei ist kein gültiges JSON.');
  }
  if (!isObj(d)) throw new ImportError('Die Datei ist keine Typenhebel-Sicherung.');
  // Version 1: Export aus Phase 0/1 (bzw. dem Prototyp)
  if (d.version === 1 && !('app' in d)) {
    if (!Array.isArray(d.sessions)) throw new ImportError('Die Datei ist keine Typenhebel-Sicherung.');
    return {
      app: 'typenhebel',
      schema: 1,
      exported: isStr(d.exported) ? d.exported : '',
      profile: d.profile ? checkProfile(d.profile) : emptyProfile(),
      sessions: d.sessions.map(checkLegacySession),
      progress: [],
    };
  }
  if (d.app !== 'typenhebel' || !isNum(d.schema)) throw new ImportError('Die Datei ist keine Typenhebel-Sicherung.');
  if (d.schema > EXPORT_SCHEMA)
    throw new ImportError('Die Sicherung stammt aus einer neueren Version von Typenhebel. Bitte die Seite neu laden.');
  if (!Array.isArray(d.sessions) || !Array.isArray(d.progress))
    throw new ImportError('Die Datei ist keine Typenhebel-Sicherung.');
  if (d.books !== undefined && !Array.isArray(d.books))
    throw new ImportError('Die Bücher in der Datei sind beschädigt.');
  return {
    app: 'typenhebel',
    schema: d.schema,
    exported: isStr(d.exported) ? d.exported : '',
    profile: checkProfile(d.profile),
    sessions: d.sessions.map(checkSession),
    progress: d.progress.map(checkProgress),
    books: d.books?.map(checkBook),
  };
}

// ---------- Zusammenführen ----------

export interface LocalState {
  profile: Profile;
  sessionIds: Set<string>;
  bookIds: Set<string>;
  progress: ProgressRecord[];
}

export interface MergeResult {
  profile: Profile;
  sessions: SessionRecord[];
  books: Book[];
  progress: ProgressRecord[];
  /** Neue Sessions ohne Rohdaten, die im Profil deshalb nicht auftauchen */
  unprofiled: number;
  duplicates: number;
}

/**
 * Import zusammenführen statt überschreiben:
 * - Sessions nach ID entdoppeln, Bücher nach ID (vorhandene bleiben unverändert).
 * - Profil: Enthält der Import alle lokalen Sessions, gilt sein Profil; enthält das lokale alle importierten,
 *   bleibt es. Sind beide disjunkt, werden die Profile addiert. Bei teilweiser Überschneidung fließen nur die
 *   neuen Sessions mit Rohdaten ins lokale Profil ein (sonst würde doppelt gezählt).
 * - Fortschritt: abgeschlossene Abschnitte vereinigen, Leseposition lokal hat Vorrang.
 */
export function mergeImport(local: LocalState, inc: ExportFile): MergeResult {
  const incIds = new Set(inc.sessions.map((s) => s.id));
  const sessions = inc.sessions.filter((s) => !local.sessionIds.has(s.id));
  const duplicates = inc.sessions.length - sessions.length;
  const localInInc = [...local.sessionIds].every((id) => incIds.has(id));
  const incInLocal = sessions.length === 0;

  let profile: Profile;
  let unprofiled = 0;
  if (incInLocal) profile = local.profile;
  else if (localInInc) profile = structuredClone(inc.profile);
  else if (duplicates === 0) profile = addProfiles(local.profile, inc.profile);
  else {
    profile = structuredClone(local.profile);
    for (const s of sessions) {
      if (s.events?.length) {
        profile = mergeProfile(profile, s.events);
        profile.sessions++;
      } else unprofiled++;
    }
  }

  const books = (inc.books ?? []).filter((b) => !local.bookIds.has(b.id));
  const known = new Set([...local.bookIds, ...books.map((b) => b.id)]);
  const byId = new Map(local.progress.map((p) => [p.bookId, p]));
  const progress: ProgressRecord[] = [];
  for (const p of inc.progress) {
    if (!known.has(p.bookId)) continue;
    const mine = byId.get(p.bookId);
    const done = [...new Set([...(mine?.done ?? []), ...p.done])].sort((a, b) => a - b);
    if (mine && done.length === mine.done.length) continue;
    progress.push({ bookId: p.bookId, section: mine?.section ?? p.section, done });
  }
  return { profile, sessions, books, progress, unprofiled, duplicates };
}
