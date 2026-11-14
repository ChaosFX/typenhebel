// Seltene Zeichen: alles, was sich auf einer deutschen Tastatur (QWERTZ, inkl. Tottasten) nicht direkt tippen
// lässt. Für die meisten gibt es einen naheliegenden Ersatz (SPEC §7, Phase 1).
import { matches } from './match';

const KEYBOARD =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZäöüÄÖÜß0123456789 ' +
  '°^!"§$%&/()=?`´+*#\'-_.:,;<>|@€{}[]\\~µ²³' +
  // Tottasten ^ ´ ` + Vokal
  'âêîôûÂÊÎÔÛáéíóúýÁÉÍÓÚÝàèìòùÀÈÌÒÙ';
const TYPABLE = new Set(Array.from(KEYBOARD));

/** Lässt sich das Zeichen tippen – direkt oder über eine akzeptierte Entsprechung („ → ")? */
export function isTypable(ch: string): boolean {
  if (TYPABLE.has(ch)) return true;
  return ['"', "'", '-'].some((k) => matches(ch, k));
}

const MAP: Record<string, string> = {
  æ: 'ae',
  Æ: 'Ae',
  œ: 'oe',
  Œ: 'Oe',
  ø: 'o',
  Ø: 'O',
  ð: 'd',
  Ð: 'D',
  þ: 'th',
  Þ: 'Th',
  ł: 'l',
  Ł: 'L',
  ı: 'i',
  '‛': "'",
  ʼ: "'",
  '′': "'",
  '″': '"',
  '‒': '-',
  '―': '-',
  '×': 'x',
  '·': '.',
  '•': '*',
  '†': '+',
  '‡': '+',
  '½': '1/2',
  '¼': '1/4',
  '¾': '3/4',
  '¡': '!',
  '¿': '?',
  '©': '(c)',
  '®': '(R)',
  '™': 'TM',
  '±': '+-',
  '÷': ':',
  '≈': '~',
  '¹': '1',
};

// Griechisch nach gängiger Umschrift (Akzente werden vorher entfernt)
const GREEK: Record<string, string> = {
  α: 'a',
  β: 'b',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'e',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'ph',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
};

const COMBINING = /[\u0300-\u036f]/g;

/** Ersatz für ein seltenes Zeichen, oder null, wenn es keinen sinnvollen gibt. */
export function replacementFor(ch: string): string | null {
  if (isTypable(ch)) return ch;
  const mapped = MAP[ch];
  if (mapped !== undefined) return mapped;
  const base = ch.normalize('NFD').replace(COMBINING, '');
  if (base && Array.from(base).every(isTypable)) return base;
  const lower = base.toLowerCase();
  const greek = GREEK[lower];
  if (greek !== undefined) return lower === base ? greek : greek[0]!.toUpperCase() + greek.slice(1);
  return null;
}

export interface RareChar {
  ch: string;
  n: number;
  replacement: string | null;
}

/** Seltene Zeichen in den Texten, häufigste zuerst. */
export function findRare(texts: Iterable<string>): RareChar[] {
  const counts = new Map<string, number>();
  for (const t of texts)
    for (const ch of t) if (ch !== '\n' && !isTypable(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return [...counts]
    .map(([ch, n]) => ({ ch, n, replacement: replacementFor(ch) }))
    .sort((a, b) => b.n - a.n || a.ch.localeCompare(b.ch));
}

/** Seltene Zeichen ersetzen, soweit es einen Ersatz gibt; der Rest bleibt stehen. */
export function replaceRare(s: string): string {
  let out = '';
  for (const ch of s) out += isTypable(ch) ? ch : (replacementFor(ch) ?? ch);
  return out;
}
