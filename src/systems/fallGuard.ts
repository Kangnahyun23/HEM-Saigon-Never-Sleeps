/**
 * Lưới an toàn khi người chơi rơi khỏi mặt đất (thuần logic, có unit test): xuống sông, lọt khe va chạm…
 * Nhớ chỗ đứng an toàn gần nhất; ở dưới mặt đất quá lâu (hoặc rơi rất sâu) thì trả về chỗ đó để đưa người chơi lên.
 */

export interface SafeSpot {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Thấp hơn mức này coi như đã rơi khỏi mặt đất (m). Mặt đường y = 0, vỉa hè ~0,15. */
export const FALL_Y = -1.5;
/** Rơi sâu hơn mức này thì cứu ngay. */
export const DEEP_Y = -8;
/** Ở dưới FALL_Y quá ngần này giây thì cứu (để khoảnh khắc rơi còn kịp thấy). */
export const FALL_GRACE = 1.2;

export class FallGuard {
  private safe: SafeSpot;
  private below = 0;
  private sinceSave = 0;

  constructor(start: SafeSpot) {
    this.safe = { ...start };
  }

  /** Chỗ an toàn đang nhớ. */
  get lastSafe(): Readonly<SafeSpot> {
    return this.safe;
  }

  /**
   * Gọi mỗi khung hình với vị trí người chơi (hoặc xe đang lái). `grounded`: đang đứng / chạy trên mặt đất.
   * Trả về chỗ cần đưa người chơi về, hoặc null.
   */
  update(dt: number, x: number, y: number, z: number, yaw: number, grounded: boolean): Readonly<SafeSpot> | null {
    this.sinceSave += dt;
    if (y > FALL_Y) {
      this.below = 0;
      // Nửa giây nhớ một lần, chỉ khi đứng vững trên mặt đất (không ghi lúc đang bay qua lan can).
      if (grounded && y > -0.5 && this.sinceSave >= 0.5) {
        this.sinceSave = 0;
        this.safe.x = x;
        this.safe.y = y;
        this.safe.z = z;
        this.safe.yaw = yaw;
      }
      return null;
    }
    this.below += dt;
    if (y < DEEP_Y || this.below > FALL_GRACE) {
      this.below = 0;
      return this.safe;
    }
    return null;
  }
}
