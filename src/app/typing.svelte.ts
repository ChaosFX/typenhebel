// Tippfläche: Zeichen, Cursor und Fortschrittsbalken werden direkt im DOM aktualisiert,
// weil das bei jedem Anschlag passiert. Nur die Live-Werte laufen über Svelte.
import type { Session } from '../core';
import { attachInput } from '../input/engine';
import { fmtTime } from '../ui/format';
import { app } from './state.svelte';

export interface TypingElements {
  text: HTMLElement;
  inp: HTMLTextAreaElement;
  bar: HTMLElement;
  streak: HTMLElement;
}

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Typing {
  /** Live-Werte über dem Text */
  live = $state({ wpm: '0', acc: '100 %', streak: '0', time: '0:00' });

  private spans: HTMLSpanElement[] = [];
  private caret: HTMLDivElement = document.createElement('div');
  private lastY = -1;
  private sess: Session | null = null;

  constructor(private readonly el: TypingElements) {
    attachInput(el.inp, {
      onChar: (ch, t) => this.onChar(ch, t),
      onBackspace: (t) => this.onBackspace(t),
      dialogOpen: () => app.dialogOpen(),
      onFocus: (t) => {
        app.masked = false;
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
  render(sess: Session, breaks: readonly number[]): void {
    this.sess = sess;
    const text = this.el.text;
    const br = new Set(breaks);
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
      }
    });
    text.appendChild(frag);
    this.caret = document.createElement('div');
    this.caret.className = 'caret';
    text.appendChild(this.caret);
    this.lastY = -1;
    this.updateCaret(true);
    this.updateLive();
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
    c.style.height = s.offsetHeight + 'px';
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
    this.updateCaret();
    this.updateLive();
  }
}
