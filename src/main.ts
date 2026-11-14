import {
  analyze,
  emptyProfile,
  mergeProfile,
  prepare,
  segment,
  series,
  Session,
  wc,
  type Profile,
  type SessionStats,
} from './core';
import { Sound } from './audio/sound';
import { store } from './data/store';
import { attachInput } from './input/engine';
import { DEMO, type Book } from './ui/demo';
import { esc, fmtTime, round1 } from './ui/format';
import { insightsHtml, sparkSvg } from './ui/insights';

/** Kompakter Sitzungseintrag im Format des Prototyps. */
interface SessionEntry {
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
const settings: Settings = Object.assign(
  { strict: true, sound: true, theme: null },
  store.get<Partial<Settings>>('settings', {}),
);
if (!settings.theme) settings.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
let books = store.get<Book[]>('books', []);
let profile = store.get<Profile | null>('profile', null) ?? emptyProfile();
let sessions = store.get<SessionEntry[]>('sessions', []);
const progress = store.get<Record<string, number>>('progress', {});
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

const allBooks = (): Book[] => [DEMO, ...books];
const saveSettings = (): boolean => store.set('settings', settings);
const dialogOpen = (): boolean => document.querySelector('dialog[open]') !== null;
const snd = new Sound(() => settings.sound);

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

function openBook(id: string, idx?: number): void {
  book = allBooks().find((b) => b.id === id) ?? DEMO;
  store.set('current', book.id);
  secIdx = Math.max(0, Math.min(idx ?? 0, book.sections.length - 1));
  renderSection();
}

function renderSection(): void {
  const sec = book.sections[secIdx]!;
  const s0 = (sess = new Session(sec.text, { strict: settings.strict }));
  progress[book.id] = secIdx;
  store.set('progress', progress);
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
  $('#secInfo').textContent = `Abschnitt ${secIdx + 1} / ${book.sections.length}`;
  el.veil.hidden = true;
  el.hint.textContent = '';
  lastY = -1;
  updateCaret(true);
  updateLive();
  focusInput();
}

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
  const prevBest = sessions.reduce((m, x) => Math.max(m, x.wpm), 0);
  const first = sessions.length === 0;
  sessions.push({
    d: Date.now(),
    b: book.id,
    bt: book.title,
    s: secIdx,
    wpm: round1(st.wpm),
    raw: round1(st.raw),
    acc: round1(st.accuracy * 100),
    err: st.errors,
    cons: st.consistency === null ? null : round1(st.consistency),
    dur: Math.round(st.durationMs),
    strict: settings.strict,
  });
  if (sessions.length > 200) sessions = sessions.slice(-200);
  profile = mergeProfile(profile, s.log);
  profile.sessions++;
  store.set('sessions', sessions);
  store.set('profile', profile);
  progress[book.id] = (secIdx + 1) % book.sections.length;
  store.set('progress', progress);
  snd.play('done');
  showResult(st, { newBest: !first && st.wpm > prevBest, perfect: st.errors === 0 });
}

function showResult(st: SessionStats, { newBest, perfect }: { newBest: boolean; perfect: boolean }): void {
  const a = analyze(profile);
  const badges: string[] = [];
  if (perfect) badges.push('Fehlerfrei');
  if (newBest) badges.push('Neuer Bestwert');
  el.card.innerHTML = `
    <h2 id="resTitle">Abschnitt geschafft</h2>
    <div class="sub">${esc(book.title)} · Abschnitt ${secIdx + 1} von ${book.sections.length}</div>
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
    <div class="actions"><button id="resAgain">Nochmal</button><button class="primary" id="resNext">Weiter ↵</button></div>`;
  el.veil.hidden = false;
  $('#resAgain').onclick = () => {
    el.veil.hidden = true;
    renderSection();
  };
  $('#resNext').onclick = () => go(1);
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
  $('#bookList').innerHTML = allBooks()
    .map(
      (
        b,
      ) => `<li><span>${esc(b.title)}${b.author && b.id !== 'demo' ? ' <small>– ' + esc(b.author) + '</small>' : ''}<br><small>${b.sections.length} Abschnitte</small></span>
    <span><button data-open="${esc(b.id)}">Öffnen</button>${b.id === 'demo' ? '' : ` <button data-del="${esc(b.id)}">Löschen</button>`}</span></li>`,
    )
    .join('');
}
$('#loadBtn').onclick = () => {
  ldMsg.textContent = '';
  renderBookList();
  loadDlg.showModal();
};
$('#ldClose').onclick = () => loadDlg.close();
loadDlg.addEventListener('close', () => focusInput());
$('#bookList').addEventListener('click', (e) => {
  const ds = (e.target as HTMLElement).dataset;
  const o = ds.open;
  const d = ds.del;
  if (o) {
    loadDlg.close();
    openBook(o, progress[o] ?? 0);
  }
  if (d && confirm('Diesen Text wirklich löschen?')) {
    books = books.filter((b) => b.id !== d);
    store.set('books', books);
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Fortschritt ist ein Wörterbuch nach Buch-ID
    delete progress[d];
    store.set('progress', progress);
    if (book.id === d) openBook('demo', 0);
    renderBookList();
  }
});
ldFile.addEventListener('change', async () => {
  const f = ldFile.files?.[0];
  if (!f) return;
  ldText.value = await f.text();
  if (!ldTitle.value) ldTitle.value = f.name.replace(/\.[^.]+$/, '');
});
$('#ldGo').onclick = () => {
  ldMsg.className = 'msg';
  const raw = ldText.value;
  if (raw.trim().length < 200) {
    ldMsg.className = 'msg err';
    ldMsg.textContent = 'Bitte mindestens ein paar Absätze Text einfügen.';
    return;
  }
  const p = prepare(raw);
  const secs = segment(p.paragraphs);
  if (!secs.length) {
    ldMsg.className = 'msg err';
    ldMsg.textContent = 'Im Text wurden keine Absätze gefunden.';
    return;
  }
  const b: Book = {
    id: 'b' + Date.now().toString(36),
    title: ldTitle.value.trim() || p.headings[0] || 'Ohne Titel',
    author: ldAuthor.value.trim(),
    sections: secs,
    created: Date.now(),
  };
  books.push(b);
  if (!store.set('books', books)) {
    books.pop();
    ldMsg.className = 'msg err';
    ldMsg.textContent = 'Der Browser-Speicher ist voll. Lösche einen anderen Text oder lade ein kürzeres Kapitel.';
    return;
  }
  const words = p.paragraphs.reduce((a, x) => a + wc(x), 0);
  let m = `${secs.length} Abschnitte, ${words} Wörter geladen.`;
  if (p.rare.length) m += ` Seltene Zeichen im Text: ${p.rare.slice(0, 12).join(' ')}`;
  ldText.value = '';
  ldTitle.value = '';
  ldAuthor.value = '';
  ldFile.value = '';
  renderBookList();
  ldMsg.textContent = m;
  loadDlg.close();
  openBook(b.id, 0);
};

// ---------- Profil ----------
function renderProfile(): void {
  const a = analyze(profile);
  const last = sessions.slice(-10).reverse();
  let h = `<p class="small">${profile.sessions} ${profile.sessions === 1 ? 'Abschnitt' : 'Abschnitte'} · ${profile.n} Anschläge ausgewertet. Die Daten liegen nur in diesem Browser.</p>`;
  h += insightsHtml(a);
  h += '<h3 style="margin-top:1.4rem">Letzte Abschnitte</h3>';
  h += last.length
    ? `<table><thead><tr><th>Datum</th><th>Text</th><th>WPM</th><th>Genauigkeit</th><th>Gleichm.</th></tr></thead><tbody>${last
        .map(
          (s) =>
            `<tr><td>${new Date(s.d).toLocaleDateString('de-AT')}</td><td>${esc(s.bt)} · ${s.s + 1}</td><td>${s.wpm}</td><td>${String(s.acc).replace('.', ',')} %</td><td>${s.cons === null ? '–' : Math.round(s.cons) + ' %'}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="empty">Noch keine Abschnitte abgeschlossen.</p>';
  $('#profBody').innerHTML = h;
}
$('#profBtn').onclick = () => {
  renderProfile();
  profDlg.showModal();
};
$('#profClose').onclick = () => profDlg.close();
profDlg.addEventListener('close', () => focusInput());
$('#profExport').onclick = () => {
  const blob = new Blob(
    [JSON.stringify({ version: 1, exported: new Date().toISOString(), sessions, profile }, null, 1)],
    {
      type: 'application/json',
    },
  );
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anschlag-daten.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#profReset').onclick = () => {
  if (!confirm('Profil und Verlauf wirklich löschen? Deine geladenen Texte bleiben erhalten.')) return;
  sessions = [];
  profile = emptyProfile();
  store.del('sessions');
  store.del('profile');
  renderProfile();
};

// ---------- Start ----------
applyButtons();
const cur = store.get('current', 'demo');
openBook(cur, progress[cur] ?? 0);
if (!document.hasFocus()) el.mask.hidden = false;
