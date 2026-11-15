// Zentraler Zustand der App (Svelte-Runes). Die Komponenten lesen ihn direkt, Änderungen laufen über die Methoden.
import {
  analyze,
  chapterOf,
  chapterRange,
  emptyProfile,
  mergeProfile,
  series,
  Session,
  type Analysis,
  type Book,
  type CoverChoice,
  type Profile,
  type SessionStats,
} from '../core';
import { Sound } from '../audio/sound';
import {
  addSession,
  buildExport,
  getSections,
  isQuotaError,
  loadState,
  migrateFromLocalStorage,
  saveBook as dbSaveBook,
  setKv,
  TypenhebelDb,
} from '../data/db';
import {
  bookMeta,
  EXPORT_REMINDER,
  newSessionId,
  type BookMeta,
  type ProgressRecord,
  type SessionRecord,
} from '../data/records';
import { migrateLegacyKeys, store } from '../data/store';
import { DEMO } from '../ui/demo';

export interface Settings {
  strict: boolean;
  sound: boolean;
  theme: 'light' | 'dark';
}

/** Angaben für die Ergebniskarte, festgehalten beim Abschluss eines Abschnitts. */
export interface ResultInfo {
  stats: SessionStats;
  newBest: boolean;
  perfect: boolean;
  /** Buch · Kapitel · Abschnitt k von n */
  sub: string;
  series: number[];
  analysis: Analysis | null;
  profileSessions: number;
}

export const DEMO_META = bookMeta(DEMO);

/** Hinweis bei Speicherfehlern – nie still Daten verlieren. */
export function storageWarning(e: unknown): string {
  return isQuotaError(e)
    ? 'Der Browser-Speicher ist voll. Lösche ein Buch oder sichere deine Daten über „Profil → Exportieren“.'
    : 'Speichern ist gerade nicht möglich. Sichere deine Daten über „Profil → Exportieren“.';
}

function loadSettings(): Settings {
  migrateLegacyKeys();
  const s = store.get<Partial<Settings>>('settings', {});
  return {
    strict: s.strict ?? true,
    sound: s.sound ?? true,
    theme: s.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  };
}

export const hasChapters = (b: Pick<Book, 'chapters'>): boolean => (b.chapters?.length ?? 0) > 1;

class AppState {
  settings = $state<Settings>(loadSettings());
  /** Datenbank; null, wenn IndexedDB nicht verfügbar ist (dann läuft alles nur im Speicher). */
  db = $state.raw<TypenhebelDb | null>(null);
  books = $state.raw<BookMeta[]>([]);
  sessions = $state.raw<SessionRecord[]>([]);
  profile = $state.raw<Profile>(emptyProfile());
  /** Leseposition und abgeschlossene Abschnitte je Buch */
  progress = $state.raw(new Map<string, ProgressRecord>());
  /** Vom Nutzer gewählte Cover je Buch-ID */
  covers = $state.raw<Record<string, CoverChoice>>({});
  exportedAtSessions = $state(0);

  book = $state.raw<Book>(DEMO);
  secIdx = $state(0);
  /** Laufende Übung; wird bei jedem Neustart eines Abschnitts ersetzt. */
  sess = $state.raw<Session | null>(null);
  result = $state.raw<ResultInfo | null>(null);
  hint = $state('');
  masked = $state(false);

  libOpen = $state(false);
  loadOpen = $state(false);
  profOpen = $state(false);
  /** Buch, dessen Cover gerade gewählt wird */
  coverId = $state<string | null>(null);

  /** Eingabefeld; wird von der Oberfläche gesetzt. */
  inp: HTMLTextAreaElement | null = null;
  readonly snd = new Sound(() => this.settings.sound);
  private saveWarned = false;
  private openSeq = 0;

  allBooks = $derived<BookMeta[]>([DEMO_META, ...this.books]);
  exportDue = $derived(this.sessions.length - this.exportedAtSessions >= EXPORT_REMINDER);
  /** Position im Kapitel bzw. im Buch: [Nummer ab 1, Anzahl] */
  sectionPos = $derived.by((): [number, number] => {
    const b = this.book;
    if (!hasChapters(b)) return [this.secIdx + 1, b.sections.length];
    const [start, end] = chapterRange(b, chapterOf(b, this.secIdx));
    return [this.secIdx - start + 1, end - start];
  });

  // ---------- Speichern ----------
  saveSettings(): void {
    store.set('settings', $state.snapshot(this.settings));
  }

  warn(text: string): void {
    this.hint = text;
    this.saveWarned = true;
  }

  persist(task: (d: TypenhebelDb) => Promise<unknown>): void {
    if (!this.db) return;
    task(this.db).catch((e: unknown) => {
      console.error(e);
      if (!this.saveWarned) this.warn(storageWarning(e));
    });
  }

  progressOf(id: string): ProgressRecord {
    return this.progress.get(id) ?? { bookId: id, section: 0, done: [] };
  }

  doneSet(id: string): Set<number> {
    return new Set(this.progressOf(id).done);
  }

  percentDone(b: BookMeta): number {
    return Math.floor((this.doneSet(b.id).size / b.sectionCount) * 100);
  }

  saveProgress(id: string, change: Partial<ProgressRecord>): void {
    const p = { ...this.progressOf(id), ...change };
    this.progress = new Map(this.progress).set(id, p);
    this.persist((d) => d.progress.put(p));
  }

  /** Browser bitten, die Daten nicht automatisch zu löschen (wirkt je nach Browser still oder mit Rückfrage). */
  requestPersistence(): void {
    void navigator.storage?.persist?.().catch(() => false);
  }

  // ---------- Bücher ----------
  /** Text eines Buchs laden (Demotext ist eingebaut, alle anderen liegen in IndexedDB). */
  private async loadBook(id: string): Promise<Book | null> {
    if (id === DEMO.id) return DEMO;
    const meta = this.books.find((b) => b.id === id);
    if (!meta || !this.db) return null;
    try {
      const sections = await getSections(this.db, id);
      if (!sections?.length) return null;
      const { sectionCount, ...rest } = meta;
      return { ...rest, sections };
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async openBook(id: string, idx?: number): Promise<void> {
    const seq = ++this.openSeq;
    const b = (await this.loadBook(id)) ?? DEMO;
    if (seq !== this.openSeq) return; // inzwischen wurde ein anderes Buch gewählt
    this.book = b;
    this.persist((d) => setKv(d, 'current', b.id));
    this.secIdx = Math.max(0, Math.min(idx ?? this.progressOf(b.id).section, b.sections.length - 1));
    this.restart();
  }

  /** Buch speichern; liefert eine Fehlermeldung, wenn das nicht ging. */
  async saveBook(b: Book): Promise<string | null> {
    if (!this.db)
      return 'Dieser Browser erlaubt keine dauerhafte Speicherung (IndexedDB). Der Text kann nicht gespeichert werden.';
    try {
      await dbSaveBook(this.db, b);
    } catch (e) {
      console.error(e);
      return isQuotaError(e)
        ? 'Der Browser-Speicher ist voll. Lösche einen anderen Text, um Platz zu schaffen.'
        : 'Der Text konnte nicht gespeichert werden.';
    }
    this.books = [...this.books, bookMeta(b)];
    this.requestPersistence();
    return null;
  }

  /** Nach dem Löschen eines Buchs (Datenbank ist schon erledigt). */
  forgetBook(id: string): void {
    this.books = this.books.filter((x) => x.id !== id);
    const p = new Map(this.progress);
    p.delete(id);
    this.progress = p;
    const { [id]: _gone, ...rest } = this.covers;
    this.covers = rest;
    if (this.book.id === id) void this.openBook(DEMO.id, 0);
  }

  setCover(id: string, c: CoverChoice | null): void {
    const { [id]: _old, ...rest } = this.covers;
    this.covers = c ? { ...rest, [id]: c } : rest;
    const snapshot = this.covers;
    this.persist((d) => setKv(d, 'covers', snapshot));
  }

  // ---------- Abschnitte ----------
  /** Aktuellen Abschnitt (neu) beginnen. */
  restart(): void {
    this.result = null;
    this.sess = new Session(this.book.sections[this.secIdx]!.text, { strict: this.settings.strict });
    if (this.progressOf(this.book.id).section !== this.secIdx)
      this.saveProgress(this.book.id, { section: this.secIdx });
    if (!this.saveWarned) this.hint = '';
  }

  go(d: number): void {
    const n = this.book.sections.length;
    this.secIdx = (this.secIdx + d + n) % n;
    this.restart();
  }

  /** Kapitel wählen: erster noch nicht geschaffter Abschnitt darin, sonst der erste. */
  openChapter(k: number): void {
    const [start, end] = chapterRange(this.book, k);
    const ds = this.doneSet(this.book.id);
    let target = start;
    while (target < end && ds.has(target)) target++;
    this.secIdx = target < end ? target : start;
    this.restart();
  }

  finish(): void {
    const s = this.sess!;
    const st = s.stats();
    const prevBest = this.sessions.reduce((m, x) => Math.max(m, x.stats.wpm), 0);
    const first = this.sessions.length === 0;
    const now = Date.now();
    const book = this.book;
    const rec: SessionRecord = {
      id: newSessionId(now),
      date: now,
      bookId: book.id,
      bookTitle: book.title,
      section: this.secIdx,
      strict: this.settings.strict,
      stats: st,
      events: s.log,
    };
    this.sessions = [...this.sessions, rec];
    // Kopie: mergeProfile ändert das Objekt direkt, Svelte erkennt nur einen neuen Wert.
    const profile = mergeProfile(structuredClone(this.profile), s.log);
    profile.sessions++;
    this.profile = profile;
    this.persist((d) => addSession(d, rec, profile));
    const ds = this.doneSet(book.id);
    ds.add(this.secIdx);
    this.saveProgress(book.id, {
      section: (this.secIdx + 1) % book.sections.length,
      done: [...ds].sort((a, b) => a - b),
    });
    this.snd.play('done');
    const [k, n] = this.sectionPos;
    const chapter = hasChapters(book) ? ` · ${book.chapters![chapterOf(book, this.secIdx)]!.title}` : '';
    this.result = {
      stats: st,
      newBest: !first && st.wpm > prevBest,
      perfect: st.errors === 0,
      sub: `${book.title}${chapter} · Abschnitt ${k} von ${n}`,
      series: series(s.log),
      analysis: analyze(profile),
      profileSessions: profile.sessions,
    };
  }

  // ---------- Fokus ----------
  dialogOpen(): boolean {
    return document.querySelector('dialog[open]') !== null;
  }

  focusInput(): void {
    if (!this.dialogOpen() && !this.result) this.inp?.focus({ preventScroll: true });
  }

  // ---------- Sichern ----------
  async exportData(withBooks: boolean): Promise<void> {
    const data = this.db
      ? await buildExport(this.db, withBooks)
      : {
          app: 'typenhebel',
          schema: 2,
          exported: new Date().toISOString(),
          profile: this.profile,
          sessions: this.sessions,
          progress: [...this.progress.values()],
        };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `typenhebel-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.exportedAtSessions = this.sessions.length;
    const n = this.exportedAtSessions;
    this.persist((d) => setKv(d, 'exportedAtSessions', n));
    this.requestPersistence();
  }

  /** Beim Start und nach einem Import: alles aus der Datenbank lesen. Gibt das zuletzt geöffnete Buch zurück. */
  async reloadState(): Promise<string | null> {
    if (!this.db) return null;
    const st = await loadState(this.db);
    this.books = st.books;
    this.sessions = st.sessions;
    this.progress = st.progress;
    this.profile = st.profile;
    this.exportedAtSessions = st.exportedAtSessions;
    this.covers = st.covers;
    return st.current;
  }

  resetHistory(): void {
    this.sessions = [];
    this.profile = emptyProfile();
    this.exportedAtSessions = 0;
  }

  // ---------- Start ----------
  async start(): Promise<void> {
    let current: string | null = null;
    try {
      const db = new TypenhebelDb();
      await db.open();
      this.db = db;
      try {
        await migrateFromLocalStorage(db, localStorage);
      } catch (e) {
        // Alte Daten bleiben in localStorage und werden beim nächsten Start erneut übernommen.
        console.error(e);
        this.warn(storageWarning(e));
      }
      current = await this.reloadState();
    } catch (e) {
      console.error(e);
      this.db = null;
      this.warn(
        'Dieser Browser erlaubt keine dauerhafte Speicherung (IndexedDB). Fortschritt und Profil gehen beim Schließen verloren.',
      );
    }
    await this.openBook(current ?? DEMO.id);
    if (!document.hasFocus()) this.masked = true;
  }
}

export const app = new AppState();
