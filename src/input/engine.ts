// Eingabe über ein verstecktes <textarea>. Fallstricke siehe SPEC §6.
export interface InputHandlers {
  onChar(ch: string, t: number): void;
  onBackspace(t: number): void;
  onFocus(t: number): void;
  onBlur(t: number): void;
  /** Globale Tasten (Esc, Enter); liefert true, wenn die Taste verbraucht wurde. */
  onKey(e: KeyboardEvent): boolean;
  /** Ob gerade ein Dialog offen ist; dann wird die Tastatur nicht abgefangen. */
  dialogOpen(): boolean;
}

export function attachInput(inp: HTMLTextAreaElement, h: InputHandlers): { isComposing(): boolean } {
  let composing = false;
  const now = (e: Event): number => e.timeStamp || performance.now();

  inp.addEventListener('compositionstart', () => {
    composing = true;
  });
  inp.addEventListener('compositionend', (e) => {
    composing = false;
    const t = now(e);
    if (e.data) for (const ch of Array.from(e.data)) h.onChar(ch, t);
    inp.value = '';
  });
  inp.addEventListener('beforeinput', (e) => {
    if (composing || e.isComposing) return;
    e.preventDefault();
    if (e.inputType === 'insertText' && e.data) {
      const t = now(e);
      for (const ch of Array.from(e.data)) h.onChar(ch, t);
    }
  });
  inp.addEventListener('input', () => {
    if (!composing) inp.value = '';
  });
  inp.addEventListener('paste', (e) => e.preventDefault());
  inp.addEventListener('drop', (e) => e.preventDefault());
  inp.addEventListener('focus', () => h.onFocus(performance.now()));
  inp.addEventListener('blur', () => h.onBlur(performance.now()));

  document.addEventListener('keydown', (e) => {
    if (h.dialogOpen()) return;
    if (h.onKey(e)) return;
    // Rücktaste über keydown: Bei leerem Feld feuert beforeinput in Chrome nicht.
    if (e.key === 'Backspace' && document.activeElement === inp && !composing && !e.isComposing) {
      e.preventDefault();
      h.onBackspace(now(e));
    }
  });

  return { isComposing: () => composing };
}
