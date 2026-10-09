/** Tiếng mưa rào: nhiễu trắng lọc thông thấp, to nhỏ theo cường độ mưa. Im lặng tới khi người chơi tương tác. */
export class RainSound {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;

  update(rain: number): void {
    if (!this.ctx) {
      if (rain < 0.02 || !navigator.userActivation?.hasBeenActive) return;
      try {
        this.ctx = new AudioContext();
        const ctx = this.ctx;
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
        src.connect(filter).connect(this.gain).connect(ctx.destination);
        src.start();
      } catch {
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.gain?.gain.setTargetAtTime(rain * 0.14, this.ctx.currentTime, 0.4);
  }
}
