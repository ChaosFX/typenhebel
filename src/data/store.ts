// localStorage unter `typenhebel.v1.*`. Wird in Phase 2 durch IndexedDB (Dexie) ersetzt.
const PREFIX = 'typenhebel.v1.';
/** Schlüssel des Prototyps (Arbeitstitel „Anschlag“) */
const LEGACY_PREFIX = 'anschlag.v1.';

/** Einmalige Migration: Daten des Prototyps übernehmen, ohne Vorhandenes zu überschreiben. */
export function migrateLegacyKeys(storage: Storage = localStorage): number {
  let moved = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(LEGACY_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const target = PREFIX + k.slice(LEGACY_PREFIX.length);
      if (storage.getItem(target) === null) {
        storage.setItem(target, storage.getItem(k)!);
        moved++;
      }
      storage.removeItem(k);
    }
  } catch {
    // Speicher nicht verfügbar oder voll: alte Schlüssel bleiben dann stehen, nichts geht verloren.
  }
  return moved;
}

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
