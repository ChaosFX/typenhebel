// Tippgeräusche über Web Audio: einmal berechnete Schreibmaschinenklänge (audio/synth.ts), keine Samples, keine Requests.
import { renderSounds, type SoundKind } from './synth';

export type { SoundKind };

type AudioCtor = typeof AudioContext;

/** Gesamtlautstärke: dezent, Spitzen fängt der Kompressor ab. */
const VOLUME = 0.18;

export class Sound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private buffers: Record<SoundKind, AudioBuffer[]> | null = null;
  private last = -1;

  constructor(private readonly enabled: () => boolean) {}

  private init(): boolean {
    if (this.ctx) return true;
    const AC: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!AC) return false;
    const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.08;
    const gain = c.createGain();
    gain.gain.value = VOLUME;
    gain.connect(comp);
    comp.connect(c.destination);
    this.out = gain;
    const raw = renderSounds(c.sampleRate);
    const toBuffer = (data: Float32Array): AudioBuffer => {
      const b = c.createBuffer(1, data.length, c.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      return b;
    };
    this.buffers = {
      key: raw.key.map(toBuffer),
      space: raw.space.map(toBuffer),
      err: raw.err.map(toBuffer),
      done: raw.done.map(toBuffer),
    };
    return true;
  }

  /** Kontext schon beim Fokus anlegen, damit der erste Anschlag nicht verzögert klingt. */
  warmUp(): void {
    if (this.enabled()) this.init();
  }

  play(kind: SoundKind): void {
    if (!this.enabled() || !this.init()) return;
    const c = this.ctx!;
    if (c.state === 'suspended') void c.resume();
    const list = this.buffers![kind];
    // Zufällige Variante, aber nie zweimal dieselbe hintereinander
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.last) i = (i + 1) % list.length;
    this.last = i;
    const src = c.createBufferSource();
    src.buffer = list[i]!;
    src.playbackRate.value = kind === 'done' ? 1 : 0.96 + Math.random() * 0.08;
    const g = c.createGain();
    g.gain.value = kind === 'key' || kind === 'space' ? 0.85 + Math.random() * 0.15 : 1;
    src.connect(g);
    g.connect(this.out!);
    src.start();
  }
}
