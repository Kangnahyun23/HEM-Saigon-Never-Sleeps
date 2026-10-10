import { mixer } from './mixer';

/** Còi xe "tin tin" tổng hợp bằng WebAudio (không cần file âm thanh). */
export class Horn {
  private busyUntil = 0;

  /** `volume` 0…1 (xa thì nhỏ), `pitch` nhân tần số (mỗi xe một giọng còi). */
  beep(volume = 1, pitch = 1): void {
    // Người chơi chưa bấm phím / chuột lần nào ⇒ mixer chưa có context ⇒ im lặng.
    const ctx = mixer.context();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (now < this.busyUntil || volume <= 0.01) return;
      const peak = 0.16 * Math.min(1, volume);
      this.busyUntil = now + 0.42;
      for (const start of [0, 0.2]) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(peak, now + start + 0.015);
        gain.gain.setValueAtTime(peak, now + start + 0.13);
        gain.gain.linearRampToValueAtTime(0, now + start + 0.17);
        gain.connect(mixer.bus());
        // Hai nốt lệch nhau một chút cho giống còi điện xe máy.
        for (const f of [415, 440]) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = f * pitch;
          osc.connect(gain);
          osc.start(now + start);
          osc.stop(now + start + 0.18);
        }
      }
    } catch {
      // Trình duyệt chặn âm thanh: bỏ qua.
    }
  }
}
