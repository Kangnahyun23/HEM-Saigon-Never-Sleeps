import { mixer } from './mixer';
import { ambienceLevels, type AmbienceLevels } from './soundModel';

/**
 * Tiếng phố: ồn xe cộ xa xa (nhiễu nâu lọc thấp) đông vắng theo giờ / số xe quanh người chơi, và tiếng dế ban đêm
 * (tiếng rít cao ngắt quãng). Độ to tính ở soundModel.ambienceLevels.
 */
export class Ambience {
  private hum: GainNode | null = null;
  private crickets: GainNode | null = null;
  private readonly levels: AmbienceLevels = { hum: 0, crickets: 0 };

  update(hour: number, rain: number, nearbyTraffic: number): void {
    if (!this.hum && !this.build()) return;
    const ctx = mixer.context();
    if (!ctx || !this.hum || !this.crickets) return;
    const l = ambienceLevels(hour, rain, nearbyTraffic, this.levels);
    this.hum.gain.setTargetAtTime(l.hum * 0.09, ctx.currentTime, 1.2);
    this.crickets.gain.setTargetAtTime(l.crickets * 0.025, ctx.currentTime, 2);
  }

  private build(): boolean {
    const ctx = mixer.context();
    if (!ctx) return false;
    try {
      // Nhiễu nâu (tích phân nhiễu trắng) 4 giây lặp lại: trầm như tiếng xe xa.
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        data[i] = last * 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 420;
      this.hum = ctx.createGain();
      this.hum.gain.value = 0;
      noise.connect(low).connect(this.hum).connect(mixer.bus());
      noise.start();

      // Dế: sóng sin 4,6 kHz, bật tắt nhanh (rung cánh ~30 Hz) theo từng đợt ~1,3 giây.
      const chirp = ctx.createOscillator();
      chirp.frequency.value = 4600;
      const flutter = ctx.createGain();
      flutter.gain.value = 0;
      const wing = ctx.createOscillator();
      wing.type = 'square';
      wing.frequency.value = 30;
      const wingDepth = ctx.createGain();
      wingDepth.gain.value = 0.5;
      wing.connect(wingDepth).connect(flutter.gain);
      const burst = ctx.createOscillator();
      burst.type = 'square';
      burst.frequency.value = 0.75;
      const burstGain = ctx.createGain();
      burstGain.gain.value = 0;
      const burstDepth = ctx.createGain();
      burstDepth.gain.value = 0.5;
      burst.connect(burstDepth).connect(burstGain.gain);
      this.crickets = ctx.createGain();
      this.crickets.gain.value = 0;
      chirp.connect(flutter).connect(burstGain).connect(this.crickets).connect(mixer.bus());
      chirp.start();
      wing.start();
      burst.start();
      return true;
    } catch {
      return false;
    }
  }
}
