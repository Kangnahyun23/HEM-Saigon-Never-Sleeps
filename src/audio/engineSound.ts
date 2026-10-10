import { mixer } from './mixer';
import { engineTone, type EngineTone } from './soundModel';

/**
 * Tiếng máy xe của Tín: sóng răng cưa + sóng vuông thấp một quãng tám, lọc thông thấp, điều biến biên độ theo nhịp nổ
 * (tiếng "pành pạch" của xe số). Thông số tính trong soundModel.engineTone; ở đây chỉ trượt mượt tới giá trị mới.
 */
export class EngineSound {
  private osc: OscillatorNode | null = null;
  private sub: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private readonly tone: EngineTone = { freq: 40, gain: 0, cutoff: 300, pulse: 10 };

  /** Gọi mỗi khung hình. `speed` m/s, `throttle` 0…1. */
  update(riding: boolean, speed: number, throttle: number): void {
    const t = engineTone(riding, speed, throttle, this.tone);
    if (!this.gain) {
      if (!riding) return;
      if (!this.build()) return;
    }
    const ctx = mixer.context();
    if (!ctx || !this.osc || !this.sub || !this.lfo || !this.filter || !this.gain) return;
    const now = ctx.currentTime;
    this.osc.frequency.setTargetAtTime(t.freq, now, 0.06);
    this.sub.frequency.setTargetAtTime(t.freq / 2, now, 0.06);
    this.lfo.frequency.setTargetAtTime(t.pulse, now, 0.06);
    this.filter.frequency.setTargetAtTime(t.cutoff, now, 0.08);
    this.gain.gain.setTargetAtTime(t.gain * 0.16, now, riding ? 0.08 : 0.25);
  }

  private build(): boolean {
    const ctx = mixer.context();
    if (!ctx) return false;
    try {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const sub = ctx.createOscillator();
      sub.type = 'square';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 2;
      // Điều biến biên độ: gain dao động quanh 0,7 ± 0,3 theo nhịp nổ.
      const am = ctx.createGain();
      am.gain.value = 0.7;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.3;
      lfo.connect(lfoDepth).connect(am.gain);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      sub.connect(subGain).connect(filter);
      filter.connect(am).connect(gain).connect(mixer.bus());
      osc.start();
      sub.start();
      lfo.start();
      Object.assign(this, { osc, sub, lfo, filter, gain });
      return true;
    } catch {
      return false;
    }
  }
}
