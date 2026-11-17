// Tippfläche: Zeichen, Cursor und Fortschrittsbalken werden direkt im DOM aktualisiert,
// weil das bei jedem Anschlag passiert. Nur die Live-Werte laufen über Svelte.
import { describeStrokes, strokesFor, type Section, type Session, type Stroke } from '../core';
import { attachInput } from '../input/engine';
import { fmtTime } from '../ui/format';
import { app } from './state.svelte';

export interface TypingElements {
  text: HTMLElement;
  inp: HTMLTextAreaElement;
  bar: HTMLElement;
  streak: HTMLElement;
  /** Schreibmaschinen-Tastatur (Tasten mit data-k, Fingerhinweis mit data-finger) */
  kb?: HTMLElement;
}

/** Tasten (data-k) eines Anschlags: Taste, Umschalttaste der anderen Hand, AltGr */
const strokeKeys = (s: Stroke): string[] => [
  s.key.base,
  ...(s.shift ? [s.shift === 'left' ? 'shiftL' : 'shiftR'] : []),
  ...(s.altGr ? ['altgr'] : []),
];
const keysFor = (ch: string): string[] => strokesFor(ch)?.flatMap(strokeKeys) ?? [];

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Typing {
  /** Live-Werte über dem Text */
  live = $state({ wpm: '0', acc: '100 %', streak: '0', time: '0:00' });

  private spans: HTMLSpanElement[] = [];
  private caret: HTMLDivElement = document.createElement('div');
  private lastY = -1;
  private sess: Session | null = null;
  /** Tastatur: Tasten nach data-k, gerade hervorgehobene Tasten, Fingerhinweis */
  private keyEls = new Map<string, HTMLElement>();
  private lit: HTMLElement[] = [];
  private fingerEl: HTMLElement | null = null;
  private kbOn = false;

  constructor(private readonly el: TypingElements) {
    for (const k of el.kb?.querySelectorAll<HTMLElement>('[data-k]') ?? []) this.keyEls.set(k.dataset.k!, k);
    this.fingerEl = el.kb?.querySelector<HTMLElement>('[data-finger]') ?? null;
    app.snd.unlockOn(document);
    // Die Schrift lädt erst nach dem ersten Zeichnen (font-display: swap); danach stimmen die Positionen nicht mehr.
    document.fonts?.addEventListener('loadingdone', () => this.updateCaret(true));
    attachInput(el.inp, {
      onChar: (ch, t) => this.onChar(ch, t),
      onBackspace: (t) => this.onBackspace(t),
      dialogOpen: () => app.dialogOpen(),
      onFocus: (t) => {
        app.masked = false;
        app.snd.warmUp();
        this.sess?.resume(t);
      },
      onBlur: (t) => {
        if (!this.sess || this.sess.done || app.result || app.dialogOpen()) return;
        this.sess.pause(t);
        app.masked = true;
      },
      onKey: (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          app.restart();
          return true;
        }
        if (app.result) {
          if (e.key === 'Enter') {
            e.preventDefault();
            app.go(1);
          }
          return true;
        }
        return false;
      },
    });
  }

  /** Neuen Abschnitt darstellen. */
  render(sess: Session, sec: Pick<Section, 'breaks' | 'lines'> | undefined): void {
    this.sess = sess;
    const text = this.el.text;
    const br = new Set(sec?.breaks);
    const lines = new Set(sec?.lines);
    text.textContent = '';
    this.spans = [];
    const frag = document.createDocumentFragment();
    sess.chars.forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'c';
      s.textContent = ch;
      this.spans.push(s);
      frag.appendChild(s);
      if (br.has(i)) {
        const d = document.createElement('div');
        d.className = 'pbk';
        frag.appendChild(d);
      } else if (lines.has(i)) frag.appendChild(document.createElement('br'));
    });
    text.appendChild(frag);
    this.caret = document.createElement('div');
    this.caret.className = 'caret';
    text.appendChild(this.caret);
    this.lastY = -1;
    this.updateCaret(true);
    this.updateLive();
    this.showNext();
  }

  /** Tastatur ein- oder ausblenden; ausgeblendet kostet sie beim Tippen nichts. */
  setKeyboard(on: boolean): void {
    this.kbOn = on;
    this.showNext();
  }

  /** Nächste Taste(n) hervorheben: bei Tottasten beide Anschläge, der zweite schwächer. */
  private showNext(): void {
    for (const e of this.lit) e.classList.remove('next', 'then');
    this.lit = [];
    const sess = this.sess;
    if (!this.kbOn || !sess) return;
    const ch = sess.done ? undefined : sess.chars[sess.cursor];
    const strokes = ch === undefined ? null : strokesFor(ch);
    strokes?.forEach((st, j) => {
      for (const k of strokeKeys(st)) {
        const e = this.keyEls.get(k);
        if (!e || this.lit.includes(e)) continue;
        e.classList.add('next');
        if (j > 0) e.classList.add('then');
        this.lit.push(e);
      }
    });
    if (this.fingerEl)
      this.fingerEl.textContent = strokes ? `${ch === ' ' ? 'Leertaste' : ch} · ${describeStrokes(strokes)}` : '';
  }

  /** Anschlag auf der Tastatur zeigen: Tasten gehen kurz nach unten, bei Fehlern rot. */
  private strike(keys: string[], ok: boolean): void {
    if (!this.kbOn) return;
    const bad = ok ? '' : getComputedStyle(this.el.kb!).getPropertyValue('--bad');
    for (const k of keys) {
      const cap = this.keyEls.get(k)?.firstElementChild as HTMLElement | null | undefined;
      if (!cap?.animate) continue;
      const down: Keyframe = reduced ? {} : { transform: 'translateY(0.7cqw) scale(0.94)' };
      if (!ok) down.background = bad;
      cap.animate([{}, { ...down, offset: 0.25 }, {}], { duration: ok ? 150 : 320, easing: 'ease-out' });
    }
  }

  /** Regelmäßig aufrufen, damit Zeit und Tempo auch ohne Anschlag weiterlaufen. */
  tick(): void {
    const s = this.sess;
    if (s && s.start !== null && !s.done && s.pausedAt === null) this.updateLive();
  }

  private paint(i: number): void {
    const s = this.spans[i];
    if (!s || !this.sess) return;
    const st = this.sess.stateAt(i);
    s.className = 'c' + (st ? ' ' + st : '');
  }

  private updateCaret(instant = false): void {
    const len = this.spans.length;
    const sess = this.sess;
    if (!len || !sess) return;
    const atEnd = sess.cursor >= len;
    const s = this.spans[atEnd ? len - 1 : sess.cursor]!;
    const x = s.offsetLeft + (atEnd ? s.offsetWidth : 0);
    const y = s.offsetTop;
    const c = this.caret;
    const lineChanged = y !== this.lastY;
    // Breite und Höhe des Zeichens unter dem Cursor; ob Strich oder Unterstrich, entscheidet das CSS (data-caret).
    c.style.setProperty('--ch', s.offsetHeight + 'px');
    c.style.setProperty('--cw', (atEnd ? 0 : s.offsetWidth) + 'px');
    if (lineChanged || instant) c.style.transition = 'none';
    c.style.transform = `translate(${x}px,${y}px)`;
    if (lineChanged || instant)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          c.style.transition = '';
        }),
      );
    if (lineChanged && this.lastY !== -1) c.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    this.lastY = y;
    this.el.bar.style.width = (sess.cursor / len) * 100 + '%';
  }

  private updateLive(): void {
    const sess = this.sess;
    if (!sess) return;
    const st = sess.stats();
    const streak = String(sess.streak);
    if (sess.streak && sess.streak % 50 === 0 && streak !== this.live.streak && !reduced) {
      const el = this.el.streak;
      el.classList.remove('glow');
      void el.offsetWidth;
      el.classList.add('glow');
    }
    this.live = {
      wpm: sess.start === null ? '0' : String(Math.round(st.wpm)),
      acc: (st.accuracy * 100).toFixed(0) + ' %',
      streak,
      time: fmtTime(st.durationMs),
    };
  }

  private flashAt(i: number): void {
    const s = this.spans[i];
    if (!s) return;
    s.classList.remove('flash');
    void s.offsetWidth;
    s.classList.add('flash');
    this.caret.classList.remove('err');
    void this.caret.offsetWidth;
    this.caret.classList.add('err');
  }

  private onChar(ch: string, t: number): void {
    const sess = this.sess;
    if (!sess || sess.done) return;
    const r = sess.type(ch, t);
    if (!r) {
      if (!sess.strict && sess.cursor >= sess.chars.length && !sess.done)
        app.hint = 'Im Text sind noch Fehler – korrigiere sie mit der Rücktaste.';
      return;
    }
    app.hint = '';
    this.paint(r.i);
    this.strike(keysFor(ch), r.ok);
    this.showNext();
    if (r.ok) {
      this.spans[r.i]!.classList.add('pop');
      app.snd.play(ch === ' ' ? 'space' : 'key');
    } else {
      if (sess.strict) this.flashAt(r.i);
      app.snd.play('err');
    }
    this.updateCaret();
    this.updateLive();
    if (sess.done) app.finish();
  }

  private onBackspace(t: number): void {
    const sess = this.sess;
    if (!sess || sess.done) return;
    const r = sess.backspace(t);
    if (!r) return;
    app.hint = '';
    this.paint(r.i);
    this.strike(['bs'], true);
    this.showNext();
    this.updateCaret();
    this.updateLive();
  }
}
