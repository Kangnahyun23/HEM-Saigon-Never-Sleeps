import { volumeCurve } from './soundModel';

/**
 * Bộ trộn âm dùng chung cho cả game: MỘT AudioContext (trình duyệt giới hạn số context), âm lượng tổng, tắt tiếng.
 * Trình duyệt chỉ cho phát tiếng sau khi người chơi đã bấm phím / chuột: trước đó mọi âm thanh im lặng, không tạo context.
 * Mọi âm thanh (còi, mưa, máy xe, tiếng phố, hiệu ứng) nối vào `bus()` thay vì `ctx.destination`.
 */
class Mixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.8;
  private muted = false;
  private failed = false;

  /** Context đã sẵn sàng phát tiếng (null nếu người chơi chưa tương tác hoặc trình duyệt chặn). */
  context(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    if (this.failed || !navigator.userActivation?.hasBeenActive) return null;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = this.level();
      // Nén nhẹ để nhiều tiếng chồng nhau (còi, máy, mưa) không bị rè.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master.connect(comp).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      return ctx;
    } catch {
      this.failed = true;
      return null;
    }
  }

  /** Nút để nối âm thanh vào (đi qua âm lượng tổng). Gọi sau `context()`. */
  bus(): AudioNode {
    return this.master as AudioNode;
  }

  /** Âm lượng 0…1 (cài đặt). */
  setVolume(volume: number): void {
    this.volume = volume;
    this.apply();
  }

  /** Bật / tắt tiếng (phím M). Trả về trạng thái mới. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    this.apply();
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private level(): number {
    return this.muted ? 0 : volumeCurve(this.volume);
  }

  private apply(): void {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }
}

export const mixer = new Mixer();
