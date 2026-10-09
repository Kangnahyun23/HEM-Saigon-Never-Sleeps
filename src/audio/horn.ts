/** Còi xe "tin tin" tổng hợp bằng WebAudio (không cần file âm thanh). */
export class Horn {
  private ctx: AudioContext | null = null;
  private busyUntil = 0;

  beep(): void {
    try {
      this.ctx ??= new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === 'suspended') void ctx.resume();
      const now = ctx.currentTime;
      if (now < this.busyUntil) return;
      this.busyUntil = now + 0.42;
      for (const start of [0, 0.2]) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.16, now + start + 0.015);
        gain.gain.setValueAtTime(0.16, now + start + 0.13);
        gain.gain.linearRampToValueAtTime(0, now + start + 0.17);
        gain.connect(ctx.destination);
        // Hai nốt lệch nhau một chút cho giống còi điện xe máy.
        for (const f of [415, 440]) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = f;
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
