import type { ItemId } from './inventory';

/**
 * Đồ nhặt được ngoài phố (thuần logic, có unit test): ghế nhựa ở chồng ghế quán cóc (lấy bao nhiêu cũng có),
 * mũ bảo hiểm để trên yên xe đậu (lấy rồi thì vài giờ game sau chủ xe mới để cái khác).
 */

export interface PickupSpot {
  readonly x: number;
  /** Độ cao vật (để vẽ / hiện gợi ý). */
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly item: ItemId;
  /** Số giờ game để có lại sau khi bị lấy; 0 = không bao giờ hết (chồng ghế). */
  readonly restock: number;
}

/** Đứng cách vật trong bán kính này (m) thì nhặt được. */
export const PICKUP_RANGE = 1.4;

export class Pickups {
  /** Thời điểm (giờ game tính từ lúc vào game) bị lấy; -Infinity = còn. */
  private readonly takenAt: Float64Array;
  /** Đổi mỗi khi có vật bị lấy / có lại — hình vẽ chỉ cập nhật khi số này đổi. */
  version = 0;

  constructor(readonly spots: readonly PickupSpot[]) {
    this.takenAt = new Float64Array(spots.length).fill(-Infinity);
  }

  available(i: number, now: number): boolean {
    const spot = this.spots[i];
    if (!spot) return false;
    return spot.restock <= 0 || now - this.takenAt[i]! >= spot.restock;
  }

  /** Vật còn nhặt được gần (x, z) nhất trong `range`; -1 nếu không có. */
  nearest(x: number, z: number, now: number, range = PICKUP_RANGE): number {
    let best = -1;
    let bestD = range;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i]!;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bestD && this.available(i, now)) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Lấy vật `i` lúc `now` (giờ game). Trả món đồ, hoặc null nếu đã bị lấy. */
  take(i: number, now: number): ItemId | null {
    if (!this.available(i, now)) return null;
    const spot = this.spots[i]!;
    if (spot.restock > 0) {
      this.takenAt[i] = now;
      this.version++;
    }
    return spot.item;
  }

  /** Có vật nào vừa có lại không (gọi thưa, ví dụ mỗi giây) — có thì tăng `version` để vẽ lại. */
  refresh(now: number): void {
    for (let i = 0; i < this.spots.length; i++) {
      const t = this.takenAt[i]!;
      if (t === -Infinity) continue;
      if (now - t >= this.spots[i]!.restock) {
        this.takenAt[i] = -Infinity;
        this.version++;
      }
    }
  }
}
