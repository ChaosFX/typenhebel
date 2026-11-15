// Schreibmaschinenklänge aus Originalaufnahmen schneiden: je Maschine eine FLAC-Datei mit allen Klängen
// hintereinander (public/sounds/<id>.flac) und eine Beschreibung, wo welcher Klang liegt (<id>.json).
// Die Originale liegen nicht im Repo; Quellen und Lizenzen siehe public/sounds/QUELLEN.md.
//
//   npm run sounds -- --hermes ~/Downloads/hermes --erika ~/Downloads/WWS_Typewriter.ogg
//
// Hermes (BigSoundBank, CC0): Ordner mit den WAV-Dateien der IDs 2841 (Typewriter #8), 2842 (Key),
// 2843 (Space), 2844 (Bell). Erika (Wikimedia Commons, CC BY 4.0): WWS_Typewriter.ogg.
// Benötigt ffmpeg.
import { spawnSync } from 'node:child_process';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const SR = 48000;
const OUT = 'public/sounds';
/** Pause zwischen den Klängen in der Sammeldatei */
const GAP = 0.05;

function decode(file) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(`ffmpeg konnte ${file} nicht lesen: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.byteLength));
}

function encodeFlac(samples, file) {
  const r = spawnSync(
    'ffmpeg',
    [
      '-loglevel',
      'error',
      '-y',
      '-f',
      'f32le',
      '-ar',
      String(SR),
      '-ac',
      '1',
      '-i',
      '-',
      '-sample_fmt',
      's16',
      '-compression_level',
      '12',
      file,
    ],
    { input: Buffer.from(samples.buffer) },
  );
  if (r.status !== 0) throw new Error(`ffmpeg konnte ${file} nicht schreiben: ${r.stderr}`);
}

/** Hüllkurve in 2-ms-Schritten (Spitzenwert je Fenster) */
function envelope(b) {
  const w = 96;
  const env = [];
  for (let i = 0; i + w <= b.length; i += w) {
    let m = 0;
    for (let k = 0; k < w; k++) m = Math.max(m, Math.abs(b[i + k]));
    env.push(m);
  }
  return { env, w };
}

/** Einsätze: Überschreiten einer Schwelle über dem Grundrauschen, mindestens 80 ms Abstand. */
function onsets(b) {
  const { env, w } = envelope(b);
  const sorted = [...env].sort((x, y) => x - y);
  const floor = sorted[Math.floor(sorted.length * 0.3)];
  const thr = floor + (sorted.at(-1) - floor) * 0.12;
  const out = [];
  for (let i = 1; i < env.length; i++) {
    if (env[i] > thr && env[i - 1] <= thr && (!out.length || i * w - out.at(-1).s > 0.08 * SR)) {
      let peak = 0;
      for (let k = i; k < Math.min(env.length, i + 15); k++) peak = Math.max(peak, env[k]);
      out.push({ s: i * w, peak });
    }
  }
  return out;
}

/** Genauer Einsatz: erstes Überschreiten von 15 % der Spitze in den folgenden 30 ms */
function exactOnset(b, from) {
  from = Math.round(from);
  let p = 0;
  for (let i = from; i < Math.min(b.length, from + 0.03 * SR); i++) p = Math.max(p, Math.abs(b[i]));
  for (let i = Math.max(0, from - 480); i < b.length; i++) if (Math.abs(b[i]) > p * 0.15) return i;
  return from;
}

/** Ausschnitt ab 2 ms vor dem Einsatz, mit kurzer Ein- und weicher Ausblendung */
function cut(b, onset, len, fade) {
  const n = Math.round(len * SR);
  const f = Math.round(fade * SR);
  const a = Math.round(0.0005 * SR);
  const st = onset - Math.round(0.002 * SR);
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = (b[st + i] ?? 0) * Math.min(1, i / a) * Math.min(1, (n - i) / f);
  return o;
}

const rms = (x, n = x.length) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += x[i] * x[i];
  return Math.sqrt(s / n);
};
/** Lautheit über die ersten 30 ms angleichen (der Anschlag selbst zählt, nicht der Ausklang) */
const level = (x, target) => {
  const g = target / rms(x, Math.min(x.length, 0.03 * SR));
  return x.map((v) => v * g);
};

/** Helligkeit: Nulldurchgänge pro Sekunde in den ersten 25 ms */
function zcr(b, s) {
  const n = 0.025 * SR;
  let z = 0;
  for (let i = s + 1; i < s + n; i++) if (b[i] >= 0 !== b[i - 1] >= 0) z++;
  return z / (n / SR);
}

/** Kräftige, frei stehende Anschläge (vor 0,15 s und nach 0,2 s nichts), höchstens `max` */
function strikes(b, { minPeak, minZcr = 0, before = 0.15, after = 0.2, until = Infinity, max }) {
  const on = onsets(b);
  return on
    .filter((o, k) => {
      const prev = k ? (o.s - on[k - 1].s) / SR : 9;
      const next = k + 1 < on.length ? (on[k + 1].s - o.s) / SR : 9;
      const s = exactOnset(b, o.s);
      return o.peak >= minPeak && prev >= before && next >= after && o.s / SR < until && zcr(b, s) >= minZcr;
    })
    .slice(0, max)
    .map((o) => exactOnset(b, o.s));
}

/** Ziel-Effektivwert beim Tippen (80 WPM, Satz mit Glocke): so laut wie die abgestimmte Hörprobe */
const TARGET_RMS = 0.017;

/** Effektivwert eines simulierten Satzes mit 80 WPM, damit alle Maschinen gleich laut klingen. */
function typingRms(all, index) {
  const seg = ([s, l]) => all.subarray(Math.round(s * SR), Math.round((s + l) * SR));
  const text = 'Wer zum ersten Mal an einer Schreibmaschine saß, kannte das Gefühl.';
  const buf = new Float32Array(Math.ceil((text.length * 0.15 + 3) * SR));
  let t = 0.3;
  let k = 0;
  const add = (x, at, g) => {
    const p = Math.round(at * SR);
    for (let j = 0; j < x.length && p + j < buf.length; j++) buf[p + j] += x[j] * g;
  };
  for (const ch of text) {
    add(seg(ch === ' ' ? index.space[0] : index.key[k++ % index.key.length]), t, 0.925);
    t += 0.15;
  }
  add(seg(index.done[0]), t + 0.1, 1);
  return rms(buf, Math.min(buf.length, Math.round((t + 2.5) * SR)));
}

/** Sammeldatei und Beschreibung schreiben */
function writeMachine(id, meta, sounds) {
  const parts = [];
  const index = {};
  let t = 0;
  for (const [kind, list] of Object.entries(sounds)) {
    index[kind] = list.map((x) => {
      parts.push(x, new Float32Array(Math.round(GAP * SR)));
      const seg = [+t.toFixed(5), +(x.length / SR).toFixed(5)];
      t += x.length / SR + GAP;
      return seg;
    });
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  // Gemeinsamer Spitzenwert: knapp unter Vollaussteuerung, Verhältnisse zwischen den Klängen bleiben
  let peak = 0;
  for (const x of all) peak = Math.max(peak, Math.abs(x));
  for (let i = 0; i < all.length; i++) all[i] *= 0.95 / peak;
  encodeFlac(all, join(OUT, `${id}.flac`));
  const gain = +(TARGET_RMS / typingRms(all, index)).toFixed(3);
  writeFileSync(
    join(OUT, `${id}.json`),
    JSON.stringify({ id, ...meta, file: `${id}.flac`, gain, sounds: index }, null, 2) + '\n',
  );
  console.log(
    `${id}: ${Object.entries(index)
      .map(([k, v]) => `${v.length} × ${k}`)
      .join(', ')}, ${t.toFixed(1)} s`,
  );
}

function hermes(dir) {
  const file = (id) =>
    join(
      dir,
      readdirSync(dir).find((f) => f.includes(`ID ${id}`) || f.includes(`${id}.`)),
    );
  const typing = decode(file(2841));
  const single = decode(file(2842));
  const space = decode(file(2843));
  const bell = decode(file(2844));
  const keys = [
    cut(single, exactOnset(single, 0.16 * SR), 0.16, 0.04),
    ...strikes(typing, { minPeak: 0.85, minZcr: 13000, max: 11 }).map((s) => cut(typing, s, 0.16, 0.04)),
  ];
  writeMachine(
    'hermes',
    {
      name: 'Hermes Precisa 305',
      credit: 'Joseph Sardin, BigSoundBank.com (Nr. 2841–2844)',
      license: 'CC0 1.0',
      source: 'https://bigsoundbank.com/sound-2842-machine-a-ecrire-touche.html',
    },
    {
      key: keys.map((k) => level(k, 0.2)),
      space: [level(cut(space, exactOnset(space, 0.085 * SR), 0.36, 0.06), 0.15)],
      done: [level(cut(bell, exactOnset(bell, 0.065 * SR), 2.2, 0.5), 0.1)],
    },
  );
}

function erika(file) {
  const b = decode(file);
  // Bis 18,3 s nur Anschläge; die Glocke liegt bei 18,42 s (Ton um 3150 Hz)
  const keys = strikes(b, { minPeak: 0.7, before: 0.1, after: 0.12, until: 18.3, max: 12 }).map((s) =>
    cut(b, s, 0.2, 0.03),
  );
  writeMachine(
    'erika',
    {
      name: 'Erika 5 (1940)',
      credit: 'Work With Sounds / Konrad Gutkowski, Wikimedia Commons (geschnitten und angeglichen)',
      license: 'CC BY 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:WWS_Typewriter.ogg',
    },
    {
      key: keys.map((k) => level(k, 0.2)),
      // Keine eigene Leertaste in der Aufnahme: leiserer Anschlag
      space: [level(keys[keys.length - 1], 0.13)],
      done: [level(cut(b, Math.round(18.42 * SR), 0.6, 0.15), 0.1)],
    },
  );
}

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!arg('hermes') && !arg('erika')) {
  console.error('Aufruf: npm run sounds -- --hermes <Ordner> --erika <WWS_Typewriter.ogg>');
  process.exit(1);
}
if (arg('hermes')) hermes(arg('hermes'));
if (arg('erika')) erika(arg('erika'));
