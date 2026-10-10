/**
 * Chất lượng tự động (thuần logic, có unit test): đo thời gian khung hình, máy không kịp thì hạ dần, dư sức thì nâng lại.
 * Nấc 1: bản đồ bóng đổ chỉ vẽ lại cách một khung hình — lượt vẽ bóng chiếm gần nửa thời gian CPU của bước vẽ,
 *        mà mắt gần như không nhận ra (bóng nhà cửa đứng yên; chỉ bóng xe đang chạy cập nhật 30 lần/giây).
 * Nấc 2…: hạ tỉ lệ điểm ảnh — số điểm ảnh quyết định chi phí shader mặt tiền, sương, bóng đổ trên laptop card onboard /
 *        màn hình độ nét cao.
 * Nâng lại theo thứ tự ngược: độ phân giải trước, bóng đổ sau cùng.
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
  /** Vẽ lại bản đồ bóng đổ sau mỗi ngần này khung hình (1 = mọi khung hình). */
  shadowInterval: 1 | 2 = 1;
  /** Còn bao lâu mới được bật lại bóng đổ mọi khung hình (s) — tránh bật/tắt qua lại. */
  private shadowHold = 0;
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

  /** Ghi một khung hình (dt giây). Trả về true khi tỉ lệ điểm ảnh hoặc nhịp vẽ bóng đổ vừa đổi. */
  sample(dt: number): boolean {
    // Khung hình dài bất thường (chuyển tab, tải shader lần đầu…) không phản ánh sức máy.
    if (dt <= 0 || dt > 0.25) return false;
    this.elapsed += dt;
    this.frames++;
    this.ceilingTimer = Math.max(0, this.ceilingTimer - dt);
    this.shadowHold = Math.max(0, this.shadowHold - dt);
    if (this.ceilingTimer === 0) this.ceiling = Infinity;
    if (this.elapsed < this.options.window) return false;

    const avgMs = (this.elapsed / this.frames) * 1000;
    this.elapsed = 0;
    this.frames = 0;
    const { min, max, slowMs, fastMs } = this.options;
    const before = this.pixelRatio;
    const beforeShadow = this.shadowInterval;

    if (avgMs > slowMs) {
      this.goodWindows = 0;
      if (this.shadowInterval === 1) {
        // Nấc rẻ nhất trước: bóng đổ cách khung.
        this.shadowInterval = 2;
        this.shadowHold = 20;
      } else {
        // Chậm càng nhiều thì hạ càng mạnh (số điểm ảnh tỉ lệ bình phương).
        const factor = Math.max(0.7, Math.min(0.9, Math.sqrt(slowMs / avgMs)));
        this.ceiling = this.pixelRatio;
        this.ceilingTimer = 20;
        this.pixelRatio = Math.max(min, round(this.pixelRatio * factor));
      }
    } else if (avgMs < fastMs) {
      // Mượt liên tục ba lượt mới nâng, mỗi lần một nấc nhỏ.
      if (++this.goodWindows >= 3) {
        this.goodWindows = 0;
        const next = Math.min(max, round(this.pixelRatio + 0.1));
        if (this.pixelRatio < max) {
          if (next < this.ceiling) this.pixelRatio = next;
        } else if (this.shadowInterval === 2 && this.shadowHold === 0) {
          this.shadowInterval = 1;
        }
      }
    } else {
      this.goodWindows = 0;
    }
    return this.pixelRatio !== before || this.shadowInterval !== beforeShadow;
  }
}

const round = (v: number): number => Math.round(v * 100) / 100;
