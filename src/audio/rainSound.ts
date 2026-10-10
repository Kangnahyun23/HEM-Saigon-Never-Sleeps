import { mixer } from './mixer';

/** Tiếng mưa rào: nhiễu trắng lọc thông thấp, to nhỏ theo cường độ mưa. Im lặng tới khi người chơi tương tác. */
export class RainSound {
  private gain: GainNode | null = null;

  update(rain: number): void {
    if (!this.gain) {
      if (rain < 0.02) return;
      const ctx = mixer.context();
      if (!ctx) return;
      try {
        const len = ctx.sampleRate * 2;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        this.gain = ctx.createGain();
        this.gain.gain.value = 0;
        src.connect(filter).connect(this.gain).connect(mixer.bus());
        src.start();
      } catch {
        return;
      }
    }
    const ctx = mixer.context();
    if (ctx) this.gain.gain.setTargetAtTime(rain * 0.14, ctx.currentTime, 0.4);
  }
}
