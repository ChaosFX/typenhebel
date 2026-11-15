// Schreibmaschinenklänge per Modalsynthese, ohne Samples und ohne Web Audio (reine Rechnung, testbar).
// Ein Anschlag = dumpfer Schlag der Walze + metallisches Klacken des Typenhebels (gedämpfte Eigenfrequenzen)
// + leises Ticken der Wagenschaltung kurz danach. Leertaste ohne Typenhebel, Fehler als dumpfes Doppelklopfen,
// Abschnittsende als kleine Glocke.

export type SoundKind = 'key' | 'space' | 'err' | 'done';

/** Gedämpfte Schwingung: Frequenz (Hz), Abklingzeit τ (s), Amplitude */
interface Mode {
  f: number;
  tau: number;
  a: number;
}

type Rand = () => number;

/** Abweichung um ±spread (relativ) */
const jitter = (rand: Rand, x: number, spread: number): number => x * (1 + (rand() * 2 - 1) * spread);

/** Gedämpfte Sinusschwingungen ab `at` Sekunden aufaddieren (kurzer Anstieg gegen Knacksen). */
function addModes(buf: Float32Array, sr: number, at: number, modes: readonly Mode[], rand: Rand): void {
  const start = Math.round(at * sr);
  for (const m of modes) {
    const phase = rand() * Math.PI * 2;
    const len = Math.min(buf.length - start, Math.ceil(m.tau * 7 * sr));
    const w = (2 * Math.PI * m.f) / sr;
    const attack = Math.max(1, Math.round(0.0004 * sr));
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (m.tau * sr)) * Math.min(1, i / attack);
      buf[start + i]! += m.a * env * Math.sin(w * i + phase);
    }
  }
}

/** Dumpfer Schlag: Sinus mit fallender Tonhöhe (f0 → f1) */
function addThump(buf: Float32Array, sr: number, at: number, f0: number, f1: number, tau: number, a: number): void {
  const start = Math.round(at * sr);
  const len = Math.min(buf.length - start, Math.ceil(tau * 7 * sr));
  const attack = Math.max(1, Math.round(0.001 * sr));
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const f = f1 + (f0 - f1) * Math.exp(-i / (0.012 * sr));
    phase += (2 * Math.PI * f) / sr;
    buf[start + i]! += a * Math.exp(-i / (tau * sr)) * Math.min(1, i / attack) * Math.sin(phase);
  }
}

/** Sehr kurzer Rauschimpuls als Anschlag-Transiente */
function addClick(buf: Float32Array, sr: number, at: number, tau: number, a: number, rand: Rand): void {
  const start = Math.round(at * sr);
  const len = Math.min(buf.length - start, Math.ceil(tau * 6 * sr));
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const n = rand() * 2 - 1;
    // einfacher Hochpass: Rauschen ohne Bass, damit es „klickt“ statt „pufft“
    buf[start + i]! += a * Math.exp(-i / (tau * sr)) * (n - prev);
    prev = n;
  }
}

/** Auf Spitzenwert `peak` normieren. */
function normalize(buf: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const x of buf) m = Math.max(m, Math.abs(x));
  if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] = (buf[i]! / m) * peak;
  return buf;
}

/** Typenhebel trifft die Walze */
function key(sr: number, rand: Rand): Float32Array {
  const buf = new Float32Array(Math.round(0.11 * sr));
  addThump(buf, sr, 0, jitter(rand, 190, 0.08), 85, 0.016, 0.55);
  addClick(buf, sr, 0, 0.0007, 0.35, rand);
  addModes(
    buf,
    sr,
    0,
    [
      { f: jitter(rand, 1750, 0.05), tau: 0.016, a: 0.38 },
      { f: jitter(rand, 2950, 0.05), tau: 0.011, a: 0.3 },
      { f: jitter(rand, 4350, 0.05), tau: 0.007, a: 0.2 },
      { f: jitter(rand, 6200, 0.06), tau: 0.004, a: 0.12 },
    ],
    rand,
  );
  // Wagenschaltung
  const esc = jitter(rand, 0.016, 0.2);
  addModes(
    buf,
    sr,
    esc,
    [
      { f: jitter(rand, 5400, 0.05), tau: 0.0035, a: 0.09 },
      { f: jitter(rand, 7900, 0.05), tau: 0.0025, a: 0.06 },
    ],
    rand,
  );
  return normalize(buf, jitter(rand, 0.9, 0.08));
}

/** Leertaste: schwerer Tastenbalken, kein Typenhebel, deutliche Wagenschaltung */
function space(sr: number, rand: Rand): Float32Array {
  const buf = new Float32Array(Math.round(0.16 * sr));
  addThump(buf, sr, 0, jitter(rand, 120, 0.08), 58, 0.026, 0.7);
  addClick(buf, sr, 0, 0.0009, 0.15, rand);
  addModes(
    buf,
    sr,
    0,
    [
      { f: jitter(rand, 820, 0.05), tau: 0.02, a: 0.22 },
      { f: jitter(rand, 1450, 0.05), tau: 0.012, a: 0.14 },
    ],
    rand,
  );
  addModes(
    buf,
    sr,
    jitter(rand, 0.011, 0.2),
    [
      { f: jitter(rand, 4800, 0.05), tau: 0.004, a: 0.14 },
      { f: jitter(rand, 7100, 0.05), tau: 0.003, a: 0.08 },
    ],
    rand,
  );
  return normalize(buf, jitter(rand, 0.85, 0.06));
}

/** Fehler: zwei dumpfe Klopfer wie ein verhakter Hebel – deutlich, aber ohne Piepton */
function err(sr: number, rand: Rand): Float32Array {
  const buf = new Float32Array(Math.round(0.22 * sr));
  for (const at of [0, 0.055]) {
    addThump(buf, sr, at, 140, 70, 0.022, 0.6);
    addModes(buf, sr, at, [{ f: jitter(rand, 430, 0.03), tau: 0.025, a: 0.25 }], rand);
  }
  return normalize(buf, 0.7);
}

/** Kleine Glocke am Abschnittsende (unharmonische Teiltöne wie bei einer Schreibmaschinenglocke) */
function bell(sr: number, rand: Rand): Float32Array {
  const buf = new Float32Array(Math.round(3 * sr));
  const f0 = 2350;
  addClick(buf, sr, 0, 0.0005, 0.2, rand);
  addModes(
    buf,
    sr,
    0,
    [
      { f: f0, tau: 0.55, a: 0.5 },
      { f: f0 * 1.007, tau: 0.5, a: 0.25 }, // leichte Schwebung
      { f: f0 * 2.32, tau: 0.28, a: 0.22 },
      { f: f0 * 4.25, tau: 0.12, a: 0.1 },
      { f: f0 * 6.63, tau: 0.06, a: 0.06 },
    ],
    rand,
  );
  return normalize(buf, 0.55);
}

/** Letzte 5 ms ausblenden, falls ein Ausklang länger wäre als der Puffer. */
function fadeOut(buf: Float32Array, sr: number): Float32Array {
  const n = Math.min(buf.length, Math.round(0.005 * sr));
  for (let i = 0; i < n; i++) buf[buf.length - 1 - i]! *= i / n;
  return buf;
}

const MAKERS: Record<SoundKind, (sr: number, rand: Rand) => Float32Array> = { key, space, err, done: bell };

/** Varianten je Klangart, damit schnelles Tippen nicht maschinenhaft klingt */
export const VARIANTS: Record<SoundKind, number> = { key: 8, space: 4, err: 1, done: 1 };

/** Alle Klänge berechnen: je Art eine Liste von Varianten (Abtastwerte −1…1). */
export function renderSounds(sr: number, rand: Rand = Math.random): Record<SoundKind, Float32Array[]> {
  const out = {} as Record<SoundKind, Float32Array[]>;
  for (const k of Object.keys(MAKERS) as SoundKind[])
    out[k] = Array.from({ length: VARIANTS[k] }, () => fadeOut(MAKERS[k](sr, rand), sr));
  return out;
}
