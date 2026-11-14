import {
  analyze,
  assembleChapters,
  chapterOf,
  chapterRange,
  cleanParagraph,
  emptyProfile,
  findRare,
  mergeProfile,
  prepare,
  replaceRare,
  segment,
  series,
  Session,
  wc,
  type Book,
  type Profile,
  type RareChar,
  type SessionStats,
} from './core';
import { Sound } from './audio/sound';
import {
  addSession,
  buildExport,
  clearHistory,
  deleteBook,
  getSections,
  importJson,
  isQuotaError,
  loadState,
  migrateFromLocalStorage,
  saveBook as dbSaveBook,
  setKv,
  TypenhebelDb,
} from './data/db';
import {
  bookMeta,
  EXPORT_REMINDER,
  ImportError,
  newSessionId,
  type BookMeta,
  type ProgressRecord,
  type SessionRecord,
} from './data/records';
import { migrateLegacyKeys, store } from './data/store';
import { EpubError, readEpub, type EpubBook } from './epub/import';
import { attachInput } from './input/engine';
import { DEMO } from './ui/demo';
import { esc, fmtTime, round1 } from './ui/format';
import { insightsHtml, sparkSvg } from './ui/insights';

interface Settings {
  strict: boolean;
  sound: boolean;
  theme: 'light' | 'dark' | null;
}

const $ = <T extends HTMLElement = HTMLElement>(s: string): T => {
  const e = document.querySelector<T>(s);
  if (!e) throw new Error('Element fehlt: ' + s);
  return e;
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Zustand ----------
migrateLegacyKeys();
const settings: Settings = Object.assign(
  { strict: true, sound: true, theme: null },
  store.get<Partial<Settings>>('settings', {}),
);
if (!settings.theme) settings.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
/** Datenbank; null, wenn IndexedDB nicht verfügbar ist (dann läuft alles nur im Speicher). */
let db: TypenhebelDb | null = null;
let books: BookMeta[] = [];
let profile: Profile = emptyProfile();
let sessions: SessionRecord[] = [];
/** Leseposition und abgeschlossene Abschnitte je Buch */
let progress = new Map<string, ProgressRecord>();
let exportedAtSessions = 0;
let book: Book = DEMO;
let secIdx = 0;
let sess: Session | null = null;
let spans: HTMLSpanElement[] = [];
let lastY = -1;

const el = {
  text: $('#text'),
  caret: document.createElement('div'),
  inp: $<HTMLTextAreaElement>('#inp'),
  mask: $('#mask'),
  hint: $('#hint'),
  bar: $('#barFill'),
  wpm: $('#lWpm'),
  acc: $('#lAcc'),
  streak: $('#lStreak'),
  time: $('#lTime'),
  veil: $('#resultVeil'),
  card: $('#resultCard'),
};

const DEMO_META = bookMeta(DEMO);
const allBooks = (): BookMeta[] => [DEMO_META, ...books];
const saveSettings = (): boolean => store.set('settings', settings);
const dialogOpen = (): boolean => document.querySelector('dialog[open]') !== null;
const snd = new Sound(() => settings.sound);

// ---------- Speichern ----------
let saveWarned = false;
/** Hinweis bei Speicherfehlern – nie still Daten verlieren. */
function storageWarning(e: unknown): string {
  return isQuotaError(e)
    ? 'Der Browser-Speicher ist voll. Lösche ein Buch oder sichere deine Daten über „Profil → Exportieren“.'
    : 'Speichern ist gerade nicht möglich. Sichere deine Daten über „Profil → Exportieren“.';
}
function persist(task: (d: TypenhebelDb) => Promise<unknown>): void {
  if (!db) return;
  task(db).catch((e: unknown) => {
    console.error(e);
    if (saveWarned) return;
    saveWarned = true;
    el.hint.textContent = storageWarning(e);
  });
}
const progressOf = (id: string): ProgressRecord => progress.get(id) ?? { bookId: id, section: 0, done: [] };
function saveProgress(id: string, change: Partial<ProgressRecord>): void {
  const p = { ...progressOf(id), ...change };
  progress.set(id, p);
  persist((d) => d.progress.put(p));
}
/** Browser bitten, die Daten nicht automatisch zu löschen (wirkt je nach Browser still oder mit Rückfrage). */
function requestPersistence(): void {
  void navigator.storage?.persist?.().catch(() => false);
}

// ---------- Darstellung ----------
function applyTheme(): void {
  document.documentElement.dataset.theme = settings.theme!;
  $('#themeBtn').textContent = settings.theme === 'dark' ? 'Hell' : 'Dunkel';
}
function applyButtons(): void {
  const mode = $('#modeBtn');
  mode.textContent = settings.strict ? 'Modus: Strikt' : 'Modus: Frei';
  mode.title = settings.strict
    ? 'Strikt: Der Cursor wartet auf das richtige Zeichen.'
    : 'Frei: Fehler bleiben stehen und müssen mit ⌫ korrigiert werden.';
  $('#soundBtn').textContent = settings.sound ? 'Ton: an' : 'Ton: aus';
  applyTheme();
}

/** Text eines Buchs laden (Demotext ist eingebaut, alle anderen liegen in IndexedDB). */
async function loadBook(id: string): Promise<Book | null> {
  if (id === DEMO.id) return DEMO;
  const meta = books.find((b) => b.id === id);
  if (!meta || !db) return null;
  try {
    const sections = await getSections(db, id);
    if (!sections?.length) return null;
    const { sectionCount, ...rest } = meta;
    return { ...rest, sections };
  } catch (e) {
    console.error(e);
    return null;
  }
}

let openSeq = 0;
async function openBook(id: string, idx?: number): Promise<void> {
  const seq = ++openSeq;
  const b = (await loadBook(id)) ?? DEMO;
  if (seq !== openSeq) return; // inzwischen wurde ein anderes Buch gewählt
  book = b;
  persist((d) => setKv(d, 'current', book.id));
  secIdx = Math.max(0, Math.min(idx ?? progressOf(book.id).section, book.sections.length - 1));
  renderSection();
}

function renderSection(): void {
  const sec = book.sections[secIdx]!;
  const s0 = (sess = new Session(sec.text, { strict: settings.strict }));
  if (progressOf(book.id).section !== secIdx) saveProgress(book.id, { section: secIdx });
  const breaks = new Set(sec.breaks ?? []);
  el.text.textContent = '';
  spans = [];
  const frag = document.createDocumentFragment();
  s0.chars.forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'c';
    s.textContent = ch;
    spans.push(s);
    frag.appendChild(s);
    if (breaks.has(i)) {
      const d = document.createElement('div');
      d.className = 'pbk';
      frag.appendChild(d);
    }
  });
  el.text.appendChild(frag);
  el.caret = document.createElement('div');
  el.caret.className = 'caret';
  el.text.appendChild(el.caret);
  $('#bookTitle').textContent = book.title;
  $('#bookAuthor').textContent = book.author || '';
  renderBookNav();
  renderChapterNav();
  el.veil.hidden = true;
  if (!saveWarned) el.hint.textContent = '';
  lastY = -1;
  updateCaret(true);
  updateLive();
  focusInput();
}

// ---------- Kapitel & Fortschritt ----------
const hasChapters = (b: Book): boolean => (b.chapters?.length ?? 0) > 1;
const doneSet = (id: string): Set<number> => new Set(progressOf(id).done);

/** Position im Kapitel bzw. im Buch: [Nummer ab 1, Anzahl] */
function sectionPos(): [number, number] {
  if (!hasChapters(book)) return [secIdx + 1, book.sections.length];
  const [start, end] = chapterRange(book, chapterOf(book, secIdx));
  return [secIdx - start + 1, end - start];
}

function renderChapterNav(): void {
  const sel = $<HTMLSelectElement>('#chapSel');
  const [k, n] = sectionPos();
  $('#secInfo').textContent = `Abschnitt ${k} / ${n}`;
  if (!hasChapters(book)) {
    sel.hidden = true;
    sel.innerHTML = '';
    return;
  }
  const ds = doneSet(book.id);
  sel.innerHTML = book
    .chapters!.map((ch, i) => {
      const [start, end] = chapterRange(book, i);
      let finished = 0;
      for (let j = start; j < end; j++) if (ds.has(j)) finished++;
      const mark = finished === end - start ? '✓ ' : '';
      return `<option value="${i}">${mark}${esc(ch.title)} · ${finished}/${end - start}</option>`;
    })
    .join('');
  sel.value = String(chapterOf(book, secIdx));
  sel.hidden = false;
}

$<HTMLSelectElement>('#chapSel').addEventListener('change', (e) => {
  const k = Number((e.target as HTMLSelectElement).value);
  const [start, end] = chapterRange(book, k);
  const ds = doneSet(book.id);
  let target = start;
  while (target < end && ds.has(target)) target++;
  secIdx = target < end ? target : start;
  renderSection();
});

const percentDone = (b: BookMeta): number => Math.floor((doneSet(b.id).size / b.sectionCount) * 100);

function bookProgress(b: BookMeta): string {
  const parts = [];
  if ((b.chapters?.length ?? 0) > 1) parts.push(`${b.chapters!.length} Kapitel`);
  parts.push(`${b.sectionCount} Abschnitte`);
  if (doneSet(b.id).size) parts.push(`${percentDone(b)} % geschafft`);
  return parts.join(' · ');
}

// ---------- Buchmenü ----------
/** Auswahl zwischen den Büchern; erscheint, sobald mehr als der Demotext geladen ist. */
function renderBookNav(): void {
  const sel = $<HTMLSelectElement>('#bookSel');
  if (!books.length) {
    sel.hidden = true;
    sel.innerHTML = '';
    return;
  }
  sel.innerHTML =
    allBooks()
      .map((b) => {
        const pct = doneSet(b.id).size ? ` · ${percentDone(b)} %` : '';
        return `<option value="${esc(b.id)}">${esc(b.title)}${pct}</option>`;
      })
      .join('') + '<option value="" disabled>──────────</option><option value=":load">Text laden …</option>';
  sel.value = book.id;
  sel.hidden = false;
}

$<HTMLSelectElement>('#bookSel').addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  const id = sel.value;
  if (id === ':load') {
    sel.value = book.id;
    openLoadDialog();
    return;
  }
  void openBook(id);
});

function paint(i: number): void {
  const s = spans[i];
  if (!s || !sess) return;
  const st = sess.stateAt(i);
  s.className = 'c' + (st ? ' ' + st : '');
}

function updateCaret(instant = false): void {
  const len = spans.length;
  if (!len || !sess) return;
  const atEnd = sess.cursor >= len;
  const s = spans[atEnd ? len - 1 : sess.cursor]!;
  const x = s.offsetLeft + (atEnd ? s.offsetWidth : 0);
  const y = s.offsetTop;
  const c = el.caret;
  const lineChanged = y !== lastY;
  c.style.height = s.offsetHeight + 'px';
  if (lineChanged || instant) c.style.transition = 'none';
  c.style.transform = `translate(${x}px,${y}px)`;
  if (lineChanged || instant)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        c.style.transition = '';
      }),
    );
  if (lineChanged && lastY !== -1) c.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  lastY = y;
  el.bar.style.width = (sess.cursor / len) * 100 + '%';
}

function updateLive(): void {
  if (!sess) return;
  const st = sess.stats();
  el.wpm.textContent = sess.start === null ? '0' : String(Math.round(st.wpm));
  el.acc.textContent = (st.accuracy * 100).toFixed(0) + ' %';
  const old = el.streak.textContent;
  el.streak.textContent = String(sess.streak);
  if (sess.streak && sess.streak % 50 === 0 && String(sess.streak) !== old && !reduced) {
    el.streak.classList.remove('glow');
    void el.streak.offsetWidth;
    el.streak.classList.add('glow');
  }
  el.time.textContent = fmtTime(st.durationMs);
}

function flashAt(i: number): void {
  const s = spans[i];
  if (!s) return;
  s.classList.remove('flash');
  void s.offsetWidth;
  s.classList.add('flash');
  el.caret.classList.remove('err');
  void el.caret.offsetWidth;
  el.caret.classList.add('err');
}

// ---------- Eingabe ----------
function focusInput(): void {
  if (!dialogOpen() && el.veil.hidden) el.inp.focus({ preventScroll: true });
}

function onChar(ch: string, t: number): void {
  if (!sess || sess.done) return;
  const r = sess.type(ch, t);
  if (!r) {
    if (!sess.strict && sess.cursor >= sess.chars.length && !sess.done)
      el.hint.textContent = 'Im Text sind noch Fehler – korrigiere sie mit der Rücktaste.';
    return;
  }
  el.hint.textContent = '';
  paint(r.i);
  if (r.ok) {
    spans[r.i]!.classList.add('pop');
    snd.play(ch === ' ' ? 'space' : 'key');
  } else {
    if (sess.strict) flashAt(r.i);
    snd.play('err');
  }
  updateCaret();
  updateLive();
  if (sess.done) finish();
}

function onBackspace(t: number): void {
  if (!sess || sess.done) return;
  const r = sess.backspace(t);
  if (!r) return;
  el.hint.textContent = '';
  paint(r.i);
  updateCaret();
  updateLive();
}

attachInput(el.inp, {
  onChar,
  onBackspace,
  dialogOpen,
  onFocus(t) {
    el.mask.hidden = true;
    sess?.resume(t);
  },
  onBlur(t) {
    if (!sess || sess.done || !el.veil.hidden || dialogOpen()) return;
    sess.pause(t);
    el.mask.hidden = false;
  },
  onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      renderSection();
      return true;
    }
    if (!el.veil.hidden) {
      if (e.key === 'Enter') {
        e.preventDefault();
        go(1);
      }
      return true;
    }
    return false;
  },
});
el.mask.addEventListener('click', focusInput);
$('#sheet').addEventListener('click', focusInput);
setInterval(() => {
  if (sess && sess.start !== null && !sess.done && sess.pausedAt === null) updateLive();
}, 400);

// ---------- Abschluss & Ergebnis ----------
function finish(): void {
  const s = sess!;
  const st = s.stats();
  const prevBest = sessions.reduce((m, x) => Math.max(m, x.stats.wpm), 0);
  const first = sessions.length === 0;
  const now = Date.now();
  const rec: SessionRecord = {
    id: newSessionId(now),
    date: now,
    bookId: book.id,
    bookTitle: book.title,
    section: secIdx,
    strict: settings.strict,
    stats: st,
    events: s.log,
  };
  sessions.push(rec);
  profile = mergeProfile(profile, s.log);
  profile.sessions++;
  const snapshot = structuredClone(profile);
  persist((d) => addSession(d, rec, snapshot));
  const ds = doneSet(book.id);
  ds.add(secIdx);
  saveProgress(book.id, { section: (secIdx + 1) % book.sections.length, done: [...ds].sort((a, b) => a - b) });
  renderChapterNav();
  renderBookNav();
  snd.play('done');
  showResult(st, { newBest: !first && st.wpm > prevBest, perfect: st.errors === 0 });
}

function showResult(st: SessionStats, { newBest, perfect }: { newBest: boolean; perfect: boolean }): void {
  const a = analyze(profile);
  const badges: string[] = [];
  if (perfect) badges.push('Fehlerfrei');
  if (newBest) badges.push('Neuer Bestwert');
  const [k, n] = sectionPos();
  const chapter = hasChapters(book) ? ` · ${esc(book.chapters![chapterOf(book, secIdx)]!.title)}` : '';
  el.card.innerHTML = `
    <h2 id="resTitle">Abschnitt geschafft</h2>
    <div class="sub">${esc(book.title)}${chapter} · Abschnitt ${k} von ${n}</div>
    ${badges.length ? `<div class="badges">${badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>` : ''}
    <div class="big">
      <div><b>${Math.round(st.wpm)}</b><span>WPM netto</span></div>
      <div><b>${(st.accuracy * 100).toFixed(1).replace('.', ',')} %</b><span>Genauigkeit</span></div>
      <div><b>${st.consistency === null ? '–' : Math.round(st.consistency) + ' %'}</b><span>Gleichmäßigkeit</span></div>
      <div><b>${fmtTime(st.durationMs)}</b><span>Zeit</span></div>
    </div>
    <div class="small">Brutto ${Math.round(st.raw)} WPM · ${st.errors} Fehler · ${st.backspaces} Korrekturen · längste fehlerfreie Serie ${st.bestStreak} · ${Math.round(st.wpm * 5)} Zeichen/min</div>
    ${sparkSvg(series(sess!.log))}
    <h3>Auffälligkeiten aus deinem Profil (${profile.sessions} ${profile.sessions === 1 ? 'Abschnitt' : 'Abschnitte'})</h3>
    ${insightsHtml(a)}
    ${exportDue() ? `<p class="remind" id="resRemind">Seit deiner letzten Sicherung hast du ${sessions.length - exportedAtSessions} Abschnitte geübt. Browserdaten können verloren gehen – <button class="link" id="resExport">jetzt sichern</button>.</p>` : ''}
    <div class="actions"><button id="resAgain">Nochmal</button><button class="primary" id="resNext">Weiter ↵</button></div>`;
  el.veil.hidden = false;
  $('#resAgain').onclick = () => {
    el.veil.hidden = true;
    renderSection();
  };
  $('#resNext').onclick = () => go(1);
  document.querySelector<HTMLButtonElement>('#resExport')?.addEventListener('click', () => {
    void exportData(true).then(() => $('#resRemind').remove());
    $('#resNext').focus();
  });
  $('#resNext').focus();
}

// ---------- Navigation ----------
function go(d: number): void {
  secIdx = (secIdx + d + book.sections.length) % book.sections.length;
  el.veil.hidden = true;
  renderSection();
}
$('#prev').onclick = () => go(-1);
$('#next').onclick = () => go(1);
$('#modeBtn').onclick = () => {
  settings.strict = !settings.strict;
  saveSettings();
  applyButtons();
  renderSection();
};
$('#soundBtn').onclick = () => {
  settings.sound = !settings.sound;
  saveSettings();
  applyButtons();
  focusInput();
};
$('#themeBtn').onclick = () => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  saveSettings();
  applyTheme();
  focusInput();
};

// ---------- Text laden ----------
const loadDlg = $<HTMLDialogElement>('#loadDlg');
const profDlg = $<HTMLDialogElement>('#profDlg');
const ldTitle = $<HTMLInputElement>('#ldTitle');
const ldAuthor = $<HTMLInputElement>('#ldAuthor');
const ldFile = $<HTMLInputElement>('#ldFile');
const ldText = $<HTMLTextAreaElement>('#ldText');
const ldMsg = $('#ldMsg');

function renderBookList(): void {
  const list = $('#bookList');
  list.innerHTML = allBooks()
    .map(
      (b) =>
        `<li><span>${esc(b.title)}${b.author && b.id !== 'demo' ? ' <small>– ' + esc(b.author) + '</small>' : ''}<br><small>${bookProgress(b)}</small></span>
    <span><button data-open="${esc(b.id)}">Öffnen</button>${b.id === 'demo' ? '' : ` <button data-del="${esc(b.id)}">Löschen</button>`}</span></li>`,
    )
    .join('');
}

/** Ausgewähltes, aber noch nicht geladenes EPUB */
let pendingEpub: { book: EpubBook; file: string } | null = null;
const ldInfo = $('#ldInfo');
const ldRare = $('#ldRare');
const ldReplace = $<HTMLInputElement>('#ldReplace');
let rareFound: RareChar[] = [];

function showRare(texts: Iterable<string>): void {
  rareFound = findRare(texts);
  ldRare.hidden = rareFound.length === 0;
  if (!rareFound.length) return;
  const shown = rareFound
    .slice(0, 14)
    .map(
      (r) =>
        `<span class="mono">${esc(r.ch)}</span> ${r.replacement === null ? '<i>(kein Ersatz)</i>' : '→ <span class="mono">' + esc(r.replacement) + '</span>'} (${r.n}×)`,
    );
  const more = rareFound.length > 14 ? ` und ${rareFound.length - 14} weitere` : '';
  const stuck = rareFound.some((r) => r.replacement === null)
    ? ' Zeichen ohne Ersatz lassen sich auf einer deutschen Tastatur kaum tippen.'
    : '';
  $('#ldRareList').innerHTML =
    `Seltene Zeichen, schwer erreichbar auf deutscher Tastatur: ${shown.join(' · ')}${more}.${stuck}`;
}

function resetLoadForm(): void {
  pendingEpub = null;
  rareFound = [];
  ldText.value = '';
  ldText.disabled = false;
  ldText.placeholder = '';
  ldTitle.value = '';
  ldAuthor.value = '';
  ldFile.value = '';
  ldInfo.hidden = true;
  ldRare.hidden = true;
  ldReplace.checked = true;
}

function loadError(text: string): void {
  ldMsg.className = 'msg err';
  ldMsg.textContent = text;
}

/** Buch speichern; false, wenn das nicht ging (Meldung steht dann im Dialog). */
async function saveBook(b: Book): Promise<boolean> {
  if (!db) {
    loadError(
      'Dieser Browser erlaubt keine dauerhafte Speicherung (IndexedDB). Der Text kann nicht gespeichert werden.',
    );
    return false;
  }
  try {
    await dbSaveBook(db, b);
  } catch (e) {
    console.error(e);
    loadError(
      isQuotaError(e)
        ? 'Der Browser-Speicher ist voll. Lösche einen anderen Text, um Platz zu schaffen.'
        : 'Der Text konnte nicht gespeichert werden.',
    );
    return false;
  }
  books.push(bookMeta(b));
  requestPersistence();
  return true;
}

function openLoadDialog(): void {
  ldMsg.textContent = '';
  renderBookList();
  loadDlg.showModal();
}
$('#loadBtn').onclick = openLoadDialog;
$('#ldClose').onclick = () => loadDlg.close();
loadDlg.addEventListener('close', () => focusInput());
$('#bookList').addEventListener('click', (e) => {
  const ds = (e.target as HTMLElement).dataset;
  const o = ds.open;
  const d = ds.del;
  if (o) {
    loadDlg.close();
    void openBook(o);
  }
  if (d && confirm('Diesen Text wirklich löschen? Der Fortschritt darin geht verloren, dein Profil bleibt.')) {
    const del = db ? deleteBook(db, d) : Promise.resolve();
    del.then(
      () => {
        books = books.filter((b) => b.id !== d);
        progress.delete(d);
        if (book.id === d) void openBook(DEMO.id, 0);
        else renderBookNav();
        renderBookList();
      },
      (e: unknown) => {
        console.error(e);
        loadError('Der Text konnte nicht gelöscht werden.');
      },
    );
  }
});

ldFile.addEventListener('change', async () => {
  const f = ldFile.files?.[0];
  pendingEpub = null;
  ldText.disabled = false;
  ldText.placeholder = '';
  ldInfo.hidden = true;
  ldRare.hidden = true;
  ldMsg.className = 'msg';
  ldMsg.textContent = '';
  if (!f) return;
  if (!/\.epub$/i.test(f.name) && f.type !== 'application/epub+zip') {
    ldText.value = await f.text();
    if (!ldTitle.value) ldTitle.value = f.name.replace(/\.[^.]+$/, '');
    showRare(prepare(ldText.value).paragraphs);
    return;
  }
  try {
    const eb = readEpub(new Uint8Array(await f.arrayBuffer()));
    pendingEpub = { book: eb, file: f.name };
    ldTitle.value = eb.title;
    ldAuthor.value = eb.author;
    ldText.value = '';
    ldText.disabled = true;
    ldText.placeholder = 'Der Text kommt aus der EPUB-Datei.';
    const paras = eb.chapters.flatMap((c) => c.paragraphs.map(cleanParagraph));
    const words = paras.reduce((a, p) => a + wc(p), 0);
    const ed = [eb.publisher, eb.date?.slice(0, 4)].filter(Boolean).join(' ');
    const nCh = eb.chapters.filter((c) => c.paragraphs.length).length;
    ldInfo.textContent =
      `EPUB erkannt: ${nCh} Kapitel, ${words.toLocaleString('de-DE')} Wörter${ed ? ' · Ausgabe: ' + ed : ''}`.replace(
        /\.?$/,
        '.',
      );
    ldInfo.hidden = false;
    showRare(paras);
  } catch (err) {
    ldFile.value = '';
    loadError(err instanceof EpubError ? err.message : 'Die Datei konnte nicht gelesen werden.');
  }
});
let rareTimer = 0;
ldText.addEventListener('input', () => {
  clearTimeout(rareTimer);
  rareTimer = window.setTimeout(() => {
    if (!pendingEpub) showRare(prepare(ldText.value).paragraphs);
  }, 300);
});

$('#ldGo').onclick = async () => {
  ldMsg.className = 'msg';
  clearTimeout(rareTimer);
  if (!pendingEpub) showRare(prepare(ldText.value).paragraphs);
  const replace = ldReplace.checked && rareFound.length > 0;
  const id = 'b' + Date.now().toString(36);
  let b: Book;
  let words: number;
  if (pendingEpub) {
    const eb = pendingEpub.book;
    const { chapters, sections } = assembleChapters(eb.chapters, { replace });
    if (!sections.length) return loadError('Im EPUB wurde kein Text gefunden.');
    b = {
      id,
      title: ldTitle.value.trim() || eb.title,
      author: ldAuthor.value.trim(),
      source: {
        name: pendingEpub.file,
        edition: [eb.publisher, eb.date?.slice(0, 4)].filter(Boolean).join(' ') || undefined,
      },
      chapters,
      sections,
      created: Date.now(),
    };
    words = sections.reduce((a, s) => a + wc(s.text), 0);
  } else {
    const raw = ldText.value;
    if (raw.trim().length < 200)
      return loadError('Bitte mindestens ein paar Absätze Text einfügen oder ein EPUB wählen.');
    const p = prepare(raw);
    const paras = replace ? p.paragraphs.map(replaceRare) : p.paragraphs;
    const secs = segment(paras);
    if (!secs.length) return loadError('Im Text wurden keine Absätze gefunden.');
    b = {
      id,
      title: ldTitle.value.trim() || p.headings[0] || 'Ohne Titel',
      author: ldAuthor.value.trim(),
      sections: secs,
      created: Date.now(),
    };
    words = paras.reduce((a, x) => a + wc(x), 0);
  }
  const go = $<HTMLButtonElement>('#ldGo');
  go.disabled = true;
  const ok = await saveBook(b).finally(() => (go.disabled = false));
  if (!ok) return;
  const chapters = b.chapters ? `${b.chapters.length} Kapitel, ` : '';
  const m = `${chapters}${b.sections.length} Abschnitte, ${words.toLocaleString('de-DE')} Wörter geladen.`;
  resetLoadForm();
  renderBookList();
  ldMsg.textContent = m;
  loadDlg.close();
  void openBook(b.id, 0);
};

// ---------- Profil, Sichern, Wiederherstellen ----------
const exportDue = (): boolean => sessions.length - exportedAtSessions >= EXPORT_REMINDER;
const profMsg = $('#profMsg');

function renderProfile(): void {
  const a = analyze(profile);
  const last = sessions.slice(-10).reverse();
  let h = `<p class="small">${profile.sessions} ${profile.sessions === 1 ? 'Abschnitt' : 'Abschnitte'} · ${profile.n} Anschläge ausgewertet.</p>`;
  h += insightsHtml(a);
  h += '<h3 style="margin-top:1.4rem">Letzte Abschnitte</h3>';
  h += last.length
    ? `<table><thead><tr><th>Datum</th><th>Text</th><th>WPM</th><th>Genauigkeit</th><th>Gleichm.</th></tr></thead><tbody>${last
        .map(
          (s) =>
            `<tr><td>${new Date(s.date).toLocaleDateString('de-AT')}</td><td>${esc(s.bookTitle)} · ${s.section + 1}</td><td>${round1(s.stats.wpm)}</td><td>${String(round1(s.stats.accuracy * 100)).replace('.', ',')} %</td><td>${s.stats.consistency === null ? '–' : Math.round(s.stats.consistency) + ' %'}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="empty">Noch keine Abschnitte abgeschlossen.</p>';
  $('#profBody').innerHTML = h;
  const since = sessions.length - exportedAtSessions;
  $('#profStore').textContent =
    (db
      ? 'Profil, Verlauf und Bücher liegen nur in diesem Browser. Wenn Browserdaten gelöscht werden, sind sie weg – sichere sie deshalb ab und zu als Datei.'
      : 'Dieser Browser erlaubt keine dauerhafte Speicherung: Nach dem Schließen ist alles weg. Sichere deine Daten als Datei.') +
    (since > 0 ? ` Seit der letzten Sicherung: ${since} ${since === 1 ? 'Abschnitt' : 'Abschnitte'}.` : '');
}

function profileMessage(text: string, err = false): void {
  profMsg.className = err ? 'msg err' : 'msg';
  profMsg.textContent = text;
}

async function exportData(withBooks: boolean): Promise<void> {
  const data = db
    ? await buildExport(db, withBooks)
    : {
        app: 'typenhebel',
        schema: 2,
        exported: new Date().toISOString(),
        profile,
        sessions,
        progress: [...progress.values()],
      };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `typenhebel-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  exportedAtSessions = sessions.length;
  persist((d) => setKv(d, 'exportedAtSessions', exportedAtSessions));
  requestPersistence();
}

/** Beim Start und nach einem Import: alles aus der Datenbank lesen. Gibt das zuletzt geöffnete Buch zurück. */
async function reloadState(): Promise<string | null> {
  if (!db) return null;
  const st = await loadState(db);
  books = st.books;
  sessions = st.sessions;
  progress = st.progress;
  profile = st.profile;
  exportedAtSessions = st.exportedAtSessions;
  return st.current;
}

$('#profBtn').onclick = () => {
  profMsg.textContent = '';
  renderProfile();
  profDlg.showModal();
};
$('#profClose').onclick = () => profDlg.close();
profDlg.addEventListener('close', () => focusInput());
$('#profExport').onclick = () => {
  exportData($<HTMLInputElement>('#profWithBooks').checked).then(
    () => {
      profileMessage('Sicherung gespeichert.');
      renderProfile();
    },
    (e: unknown) => {
      console.error(e);
      profileMessage('Die Sicherung konnte nicht erstellt werden.', true);
    },
  );
};
$('#profImport').onclick = () => $<HTMLInputElement>('#profFile').click();
$<HTMLInputElement>('#profFile').addEventListener('change', async (e) => {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (!db) return profileMessage('Ohne dauerhafte Speicherung ist kein Import möglich.', true);
  try {
    const r = await importJson(db, await f.text());
    await reloadState();
    const parts = [`${r.sessions.length} ${r.sessions.length === 1 ? 'Abschnitt' : 'Abschnitte'} übernommen`];
    if (r.books.length) parts.push(`${r.books.length} ${r.books.length === 1 ? 'Buch' : 'Bücher'}`);
    if (r.duplicates) parts.push(`${r.duplicates} schon vorhanden`);
    let m = parts.join(', ') + '.';
    if (r.unprofiled) m += ` ${r.unprofiled} ältere Abschnitte ohne Rohdaten fließen nicht ins Profil ein.`;
    profileMessage(m);
    renderProfile();
    renderBookNav();
    renderChapterNav();
  } catch (err) {
    console.error(err);
    if (err instanceof ImportError) profileMessage(err.message, true);
    else profileMessage(isQuotaError(err) ? storageWarning(err) : 'Die Datei konnte nicht importiert werden.', true);
  }
});
$('#profReset').onclick = async () => {
  if (!confirm('Profil und Verlauf wirklich löschen? Deine geladenen Texte bleiben erhalten.')) return;
  try {
    if (db) await clearHistory(db);
    sessions = [];
    profile = emptyProfile();
    exportedAtSessions = 0;
    renderProfile();
  } catch (e) {
    console.error(e);
    profileMessage('Löschen ist fehlgeschlagen.', true);
  }
};

// ---------- Start ----------
async function start(): Promise<void> {
  applyButtons();
  let current: string | null = null;
  try {
    db = new TypenhebelDb();
    await db.open();
    try {
      await migrateFromLocalStorage(db, localStorage);
    } catch (e) {
      // Alte Daten bleiben in localStorage und werden beim nächsten Start erneut übernommen.
      console.error(e);
      el.hint.textContent = storageWarning(e);
      saveWarned = true;
    }
    current = await reloadState();
  } catch (e) {
    console.error(e);
    db = null;
    el.hint.textContent =
      'Dieser Browser erlaubt keine dauerhafte Speicherung (IndexedDB). Fortschritt und Profil gehen beim Schließen verloren.';
    saveWarned = true;
  }
  await openBook(current ?? DEMO.id);
  if (!document.hasFocus()) el.mask.hidden = false;
}
void start();
