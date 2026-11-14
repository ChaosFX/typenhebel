export const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export const fmtTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

export const round1 = (x: number): number => Math.round(x * 10) / 10;
export const f1 = (x: number): string => x.toFixed(1).replace('.', ',');
export const showCh = (c: string): string => (c === ' ' ? '␣' : c);
