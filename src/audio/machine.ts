// Beschreibung einer Schreibmaschine (public/sounds/<id>.json, erzeugt von scripts/sounds.mjs):
// wo in der Sammeldatei welcher Klang liegt, Lautstärkeausgleich, Quelle und Lizenz.

/** Klänge, die aus einer Aufnahme kommen; Fehler entstehen aus einem gedämpften Anschlag. */
export type SampleKind = 'key' | 'space' | 'done';

/** [Start, Länge] in Sekunden */
export type Segment = [start: number, length: number];

export interface Machine {
  id: string;
  name: string;
  credit: string;
  license: string;
  source: string;
  file: string;
  /** Verstärkung, damit alle Maschinen gleich laut klingen */
  gain: number;
  sounds: Record<SampleKind, Segment[]>;
}

/** Maschine, die die App verwendet. Weitere liegen schon bereit (Auswahl folgt später). */
export const DEFAULT_MACHINE = 'hermes';

const isSegment = (x: unknown): x is Segment =>
  Array.isArray(x) &&
  x.length === 2 &&
  x.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0) &&
  x[1] > 0;

/** Beschreibung prüfen; wirft bei Unstimmigkeiten (dann bleibt es beim synthetischen Klang). */
export function parseMachine(x: unknown): Machine {
  const m = x as Partial<Machine> | null;
  const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  if (!m || !str(m.id) || !str(m.name) || !str(m.file) || !str(m.credit) || !str(m.license) || !str(m.source))
    throw new Error('Schreibmaschine: Angaben fehlen');
  if (typeof m.gain !== 'number' || !(m.gain > 0 && m.gain <= 4))
    throw new Error('Schreibmaschine: ungültige Lautstärke');
  if (/[/\\]|\.\./.test(m.file)) throw new Error('Schreibmaschine: ungültiger Dateiname');
  for (const k of ['key', 'space', 'done'] as const) {
    const list = m.sounds?.[k];
    if (!Array.isArray(list) || !list.length || !list.every(isSegment))
      throw new Error(`Schreibmaschine: Klang „${k}“ fehlt`);
  }
  return m as Machine;
}
