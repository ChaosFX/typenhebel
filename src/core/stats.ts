// Robuste Statistik für die Auswertungen (SPEC Phase 3): keine Aussage ohne Datenbasis.

/** Median; null bei leerer Liste. */
export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Wilson-Intervall für einen Anteil (z. B. Fehlerquote): [untere, obere Grenze].
 * Liegt die untere Grenze über dem Durchschnitt, ist die Abweichung kein Zufall kleiner Zahlen.
 */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

/**
 * Geglättete Quote mit Beta-Prior: Bei wenigen Anschlägen zieht sie zum Durchschnitt `prior`,
 * `strength` entspricht der Zahl gedachter Anschläge mit genau dieser Quote.
 */
export function smoothRate(k: number, n: number, prior: number, strength = 50): number {
  return (k + prior * strength) / (n + strength);
}
