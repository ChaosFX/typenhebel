/** Pausen über 3 s zählen nicht als Tippzeit (SPEC §5). */
export const IDLE_CAP = 3000;

const DOUBLE_QUOTES = new Set(['„', '“', '”', '»', '«', '‟', '"']);
const SINGLE_QUOTES = new Set(['‚', '‘', '’', '›', '‹', "'"]);
const DASHES = new Set(['–', '—', '‐', '‑', '−', '-']);

/** Ein getipptes Zeichen passt, wenn es exakt stimmt oder eine einfache Tastatur-Entsprechung ist. */
export function matches(exp: string, got: string): boolean {
  if (exp === got) return true;
  if (DOUBLE_QUOTES.has(exp) && got === '"') return true;
  if (SINGLE_QUOTES.has(exp) && got === "'") return true;
  if (DASHES.has(exp) && got === '-') return true;
  return false;
}
