// Tippgeräusche über Web Audio. Bevorzugt Aufnahmen einer echten Schreibmaschine (public/sounds/, gleiche Herkunft);
// bis sie geladen sind oder falls das nicht klappt, synthetische Klänge (audio/synth.ts).
import { DEFAULT_MACHINE, parseMachine, type Machine, type Segment } from './machine';
import { renderSounds, type SoundKind } from './synth';

export type { SoundKind };

type AudioCtor = typeof AudioContext;

/** Lautstärke der synthetischen Klänge (die Aufnahmen bringen ihren Ausgleich selbst mit) */
const SYNTH_VOLUME = 0.18;
/** Abtastrate der vorbereiteten Klänge; der Browser rechnet beim Abspielen bei Bedarf um. */
const RATE = 48000;
/** Vertipper aus zwei Anschlägen: [Verzögerung s, Tempo, Tiefpass Hz, Lautstärke] */
const ERR_KNOCKS: [number, number, number, number][] = [
  [0, 0.82, 2500, 1.9],
  [0.05, 0.78, 2000, 1.4],
];

/**
 * Regler 0–100 → Verstärkung. Quadratisch, weil das Ohr Lautstärke logarithmisch hört;
 * 70 entspricht etwa der bisherigen Lautstärke (≈ 1), 100 ist doppelt so laut.
 */
export const volumeGain = (v: number): number => 2 * (Math.min(100, Math.max(0, v)) / 100) ** 2;

interface Loaded {
  machine: Machine;
  buffer: AudioBuffer;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private synth: Record<SoundKind, AudioBuffer[]> | null = null;
  private machine: Loaded | null = null;
  private last: Partial<Record<SoundKind, number>> = {};

  private master: GainNode | null = null;

  constructor(
    private readonly enabled: () => boolean,
    /** Lautstärke 0–100 */
    private readonly volume: () => number = () => 70,
    private readonly base = import.meta.env.BASE_URL,
  ) {}

  /**
   * Klänge vorbereiten, ohne Audio-Kontext: Browser starten ihn erst nach einer Nutzeraktion
   * (Firefox warnt sonst). Dekodiert wird über einen Offline-Kontext.
   */
  private prepare(): void {
    if (this.synth || typeof AudioBuffer === 'undefined') return;
    const raw = renderSounds(RATE);
    const toBuffer = (data: Float32Array): AudioBuffer => {
      const b = new AudioBuffer({ length: data.length, sampleRate: RATE, numberOfChannels: 1 });
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      return b;
    };
    this.synth = {
      key: raw.key.map(toBuffer),
      space: raw.space.map(toBuffer),
      err: raw.err.map(toBuffer),
      done: raw.done.map(toBuffer),
    };
    void this.load(DEFAULT_MACHINE);
  }

  /**
   * Audio bei jeder echten Nutzergeste freischalten. Safari (macOS und iOS) startet einen Audio-Kontext
   * nur innerhalb von keydown, pointerdown, touchend und Ähnlichem, nicht in beforeinput, wo die
   * Anschläge ankommen. Nach Tab-Wechsel, Sperrbildschirm oder Anruf steht der Kontext wieder auf
   * „suspended“ bzw. „interrupted“; deshalb bleiben die Listener dauerhaft und versuchen es bei jeder Geste.
   */
  unlockOn(target: EventTarget): void {
    const unlock = (): void => this.unlock();
    for (const type of ['keydown', 'pointerdown', 'touchend', 'mousedown'])
      target.addEventListener(type, unlock, { capture: true, passive: true });
  }

  private unlock(): void {
    if (!this.enabled() || !this.init()) return;
    const c = this.ctx!;
    if (c.state === 'running') return;
    void c.resume().catch(() => {});
    // iOS gibt die Ausgabe teils erst frei, wenn innerhalb der Geste wirklich etwas abgespielt wird.
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start();
  }

  /** Audio-Kontext anlegen; nur innerhalb einer Nutzergeste oder beim Abspielen. */
  private init(): boolean {
    this.prepare();
    if (this.ctx) return true;
    const AC: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!AC || !this.synth) return false;
    const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
    // Kompressor nur gegen Übersteuern, wenn sich Anschläge überlagern
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.ratio.value = 3;
    comp.attack.value = 0.002;
    comp.release.value = 0.08;
    comp.connect(c.destination);
    // Lautstärkeregler vor dem Kompressor
    this.master = c.createGain();
    this.master.connect(comp);
    this.out = this.master;
    return true;
  }

  /** Aufnahmen einer Maschine laden; bei Fehlern bleibt es still beim synthetischen Klang. */
  private async load(id: string): Promise<void> {
    try {
      const r = await fetch(`${this.base}sounds/${id}.json`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const machine = parseMachine(await r.json());
      const f = await fetch(`${this.base}sounds/${machine.file}`);
      if (!f.ok) throw new Error('HTTP ' + f.status);
      const decoder = new OfflineAudioContext({ length: 1, sampleRate: RATE, numberOfChannels: 1 });
      const buffer = await decoder.decodeAudioData(await f.arrayBuffer());
      this.machine = { machine, buffer };
    } catch (e) {
      console.warn('Schreibmaschinenklang nicht verfügbar, synthetischer Klang wird verwendet.', e);
    }
  }

  /** Beim Fokus: Klänge vorbereiten und Aufnahmen laden, damit schon der erste Anschlag richtig klingt. */
  warmUp(): void {
    if (this.enabled()) this.prepare();
  }

  /** Zufällige Variante, aber nie zweimal dieselbe hintereinander */
  private pick(kind: SoundKind, n: number): number {
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this.last[kind]) i = (i + 1) % n;
    this.last[kind] = i;
    return i;
  }

  play(kind: SoundKind): void {
    if (!this.enabled() || !this.init()) return;
    const c = this.ctx!;
    const g = volumeGain(this.volume());
    if (!g) return;
    this.master!.gain.value = g;
    // Auch „interrupted“ (Safari/iOS) und andere Zustände außer „closed“ fortsetzen.
    if (c.state !== 'running' && c.state !== 'closed') void c.resume().catch(() => {});
    const vary = kind === 'key' || kind === 'space' ? 0.85 + Math.random() * 0.15 : 1;

    if (this.machine) {
      const { machine, buffer } = this.machine;
      const list = machine.sounds[kind === 'err' ? 'key' : kind];
      const seg = list[this.pick(kind, list.length)]!;
      if (kind === 'err') {
        // Vertipper: zwei gedämpfte, tiefere Anschläge kurz hintereinander, wie ein verhakter Typenhebel.
        // Gemessen etwa so laut wie ein normaler Anschlag, aber dunkler.
        for (const [at, rate, cutoff, gain] of ERR_KNOCKS)
          this.sample(buffer, seg, machine.gain * gain, rate, cutoff, at);
        return;
      }
      this.sample(buffer, seg, machine.gain * vary, kind === 'done' ? 1 : 0.98 + Math.random() * 0.04);
      return;
    }
    const list = this.synth![kind];
    this.sample(
      list[this.pick(kind, list.length)]!,
      null,
      SYNTH_VOLUME * vary,
      kind === 'done' ? 1 : 0.96 + Math.random() * 0.08,
    );
  }

  /** Puffer (oder Abschnitt daraus) abspielen, optional gedämpft und verzögert */
  private sample(buffer: AudioBuffer, seg: Segment | null, gain: number, rate: number, cutoff = 0, delay = 0): void {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    let node: AudioNode = src;
    if (cutoff) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      src.connect(lp);
      node = lp;
    }
    node.connect(g);
    g.connect(this.out!);
    const at = c.currentTime + delay;
    if (seg) src.start(at, seg[0], seg[1]);
    else src.start(at);
  }
}
