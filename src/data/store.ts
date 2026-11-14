// localStorage mit den Schlüsseln des Prototyps (anschlag.v1.*), damit vorhandene Daten erhalten bleiben.
// Wird in Phase 2 durch IndexedDB (Dexie) ersetzt.
const PREFIX = 'anschlag.v1.';

export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(PREFIX + k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown): boolean {
    try {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  del(k: string): void {
    try {
      localStorage.removeItem(PREFIX + k);
    } catch {
      /* ignorieren */
    }
  },
};
