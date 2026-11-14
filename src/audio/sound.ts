// Synthetische Tippgeräusche über Web Audio (keine Samples, keine Requests).
export type SoundKind = 'key' | 'space' | 'err' | 'done';

type AudioCtor = typeof AudioContext;

export class Sound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private readonly enabled: () => boolean) {}

  private init(): boolean {
    if (this.ctx) return true;
    const AC: AudioCtor | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    const len = Math.floor(this.ctx.sampleRate * 0.035);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    this.noise = b;
    return true;
  }

  play(kind: SoundKind): void {
    if (!this.enabled() || !this.init()) return;
    const c = this.ctx!;
    if (c.state === 'suspended') void c.resume();
    const t = c.currentTime;
    if (kind === 'err') {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(95, t + 0.14);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + 0.18);
      return;
    }
    if (kind === 'done') {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        const s = t + i * 0.09;
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.05, s + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.6);
        o.connect(g);
        g.connect(c.destination);
        o.start(s);
        o.stop(s + 0.65);
      });
      return;
    }
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.25;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.9;
    f.frequency.value = kind === 'space' ? 650 : 1400 + Math.random() * 900;
    const g = c.createGain();
    g.gain.value = kind === 'space' ? 0.28 : 0.17;
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t);
    const o = c.createOscillator();
    const g2 = c.createGain();
    o.type = 'sine';
    o.frequency.value = kind === 'space' ? 120 : 210;
    g2.gain.setValueAtTime(0.035, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g2);
    g2.connect(c.destination);
    o.start(t);
    o.stop(t + 0.06);
  }
}
