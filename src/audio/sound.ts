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

  constructor(
    private readonly enabled: () => boolean,
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

  /** Audio-Kontext anlegen; nur beim Abspielen, also nach einem Tastendruck. */
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
    this.out = comp;
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
    if (c.state === 'suspended') void c.resume();
    const src = c.createBufferSource();
    const g = c.createGain();
    const vary = kind === 'key' || kind === 'space' ? 0.85 + Math.random() * 0.15 : 1;
    let node: AudioNode = src;
    let segment: Segment | null = null;

    if (this.machine) {
      const { machine, buffer } = this.machine;
      src.buffer = buffer;
      // Vertipper: gedämpfter, tieferer Anschlag wie ein verhakter Typenhebel
      const list = machine.sounds[kind === 'err' ? 'key' : kind];
      segment = list[this.pick(kind, list.length)]!;
      g.gain.value = machine.gain * vary * (kind === 'err' ? 0.8 : 1);
      if (kind === 'err') {
        src.playbackRate.value = 0.72;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1100;
        src.connect(lp);
        node = lp;
      } else src.playbackRate.value = kind === 'done' ? 1 : 0.98 + Math.random() * 0.04;
    } else {
      const list = this.synth![kind];
      src.buffer = list[this.pick(kind, list.length)]!;
      src.playbackRate.value = kind === 'done' ? 1 : 0.96 + Math.random() * 0.08;
      g.gain.value = SYNTH_VOLUME * vary;
    }
    node.connect(g);
    g.connect(this.out!);
    if (segment) src.start(0, segment[0], segment[1]);
    else src.start();
  }
}
