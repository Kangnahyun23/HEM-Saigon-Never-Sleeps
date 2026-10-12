import { mixer } from './mixer';

/**
 * Còi hú xe công an: dao động răng cưa trượt lên xuống 620 ↔ 1250 Hz (chu kỳ ~1,3 s), lọc bớt chói; to nhỏ theo
 * khoảng cách xe công an gần nhất. Chỉ dựng nút âm thanh khi có xe công an lần đầu; im lặng tới khi người chơi tương tác.
 */
export class Siren {
  private gain: GainNode | null = null;
  private level = -1;

  /** `distance`: khoảng cách (m) tới xe công an gần nhất; Infinity = không có xe nào. */
  update(distance: number): void {
    const target = Number.isFinite(distance) ? 0.07 * Math.max(0, 1 - distance / 140) : 0;
    if (!this.gain) {
      if (target <= 0) return;
      const ctx = mixer.context();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 935;
        // Bộ dao động chậm làm tần số trượt lên xuống (tiếng "hú").
        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        lfo.frequency.value = 0.75;
        const depth = ctx.createGain();
        depth.gain.value = 315;
        lfo.connect(depth).connect(osc.frequency);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2400;
        this.gain = ctx.createGain();
        this.gain.gain.value = 0;
        osc.connect(filter).connect(this.gain).connect(mixer.bus());
        osc.start();
        lfo.start();
      } catch {
        return;
      }
    }
    // Chỉ đặt lại đích âm lượng khi đổi đáng kể (tránh xếp hàng hàng nghìn lệnh tự động hoá).
    const rounded = Math.round(target * 400) / 400;
    if (rounded === this.level) return;
    this.level = rounded;
    const ctx = mixer.context();
    if (ctx) this.gain.gain.setTargetAtTime(rounded, ctx.currentTime, 0.3);
  }
}
