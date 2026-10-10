/**
 * Độ phân giải tự động (thuần logic, có unit test): đo thời gian khung hình, máy không kịp thì hạ tỉ lệ điểm ảnh,
 * máy dư sức thì nâng dần lên. Phần lớn chi phí của game nằm ở số điểm ảnh (shader mặt tiền, sương, bóng đổ)
 * nên đây là cách chắc ăn nhất để giữ mượt trên laptop card onboard / màn hình độ nét cao.
 */

export interface ResolutionOptions {
  /** Tỉ lệ điểm ảnh tối đa (≤ devicePixelRatio của màn hình). */
  max: number;
  /** Tỉ lệ thấp nhất được phép hạ xuống. */
  min: number;
  /** Mỗi lần đánh giá sau ngần này giây. */
  window: number;
  /** Trung bình khung hình chậm hơn mức này (ms) ⇒ hạ. */
  slowMs: number;
  /** Nhanh hơn mức này (ms) ⇒ có thể nâng. */
  fastMs: number;
}

const DEFAULTS: ResolutionOptions = { max: 1.5, min: 0.5, window: 1.5, slowMs: 1000 / 48, fastMs: 1000 / 57 };

export class ResolutionGovernor {
  readonly options: ResolutionOptions;
  /** Tỉ lệ điểm ảnh hiện tại. */
  pixelRatio: number;
  private elapsed = 0;
  private frames = 0;
  private goodWindows = 0;
  /** Mức từng bị hạ vì chậm: không nâng lại tới mức này trong một lúc (tránh nhảy qua lại). */
  private ceiling = Infinity;
  private ceilingTimer = 0;

  constructor(options: Partial<ResolutionOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.options.min = Math.min(this.options.min, this.options.max);
    this.pixelRatio = this.options.max;
  }

  /** Ghi một khung hình (dt giây). Trả về true khi tỉ lệ điểm ảnh vừa đổi. */
  sample(dt: number): boolean {
    // Khung hình dài bất thường (chuyển tab, tải shader lần đầu…) không phản ánh sức máy.
    if (dt <= 0 || dt > 0.25) return false;
    this.elapsed += dt;
    this.frames++;
    this.ceilingTimer = Math.max(0, this.ceilingTimer - dt);
    if (this.ceilingTimer === 0) this.ceiling = Infinity;
    if (this.elapsed < this.options.window) return false;

    const avgMs = (this.elapsed / this.frames) * 1000;
    this.elapsed = 0;
    this.frames = 0;
    const { min, max, slowMs, fastMs } = this.options;
    const before = this.pixelRatio;

    if (avgMs > slowMs) {
      this.goodWindows = 0;
      // Chậm càng nhiều thì hạ càng mạnh (số điểm ảnh tỉ lệ bình phương).
      const factor = Math.max(0.7, Math.min(0.9, Math.sqrt(slowMs / avgMs)));
      this.ceiling = this.pixelRatio;
      this.ceilingTimer = 20;
      this.pixelRatio = Math.max(min, round(this.pixelRatio * factor));
    } else if (avgMs < fastMs) {
      // Mượt liên tục ba lượt mới nâng, mỗi lần một nấc nhỏ.
      if (++this.goodWindows >= 3) {
        this.goodWindows = 0;
        const next = Math.min(max, round(this.pixelRatio + 0.1));
        if (next < this.ceiling) this.pixelRatio = next;
      }
    } else {
      this.goodWindows = 0;
    }
    return this.pixelRatio !== before;
  }
}

const round = (v: number): number => Math.round(v * 100) / 100;
