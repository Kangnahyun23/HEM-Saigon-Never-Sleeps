/**
 * Truy nã (thuần logic, có unit test): 0–5 sao, chạy song song với Độ Nóng (đàn em của Phát).
 *
 * Dân gọi báo ⇒ lên sao (đánh người: 1 sao, có án mạng: 2 sao; dân báo tối đa 3 sao — cao hơn là do đánh nhau với
 * công an). Có VÙNG TÌM KIẾM quanh chỗ công an thấy Tín lần cuối, bán kính theo số sao; công an còn thấy Tín thì tâm
 * vùng đi theo Tín. Khuất mặt đủ lâu thì hết truy nã — nhanh hơn nhiều khi đã ra khỏi vùng, và khi trốn trong hẻm.
 */

export const MAX_STARS = 5;
/** Dân gọi báo chỉ đẩy tới mức này. */
export const CIVILIAN_CAP = 3;
/** Bán kính vùng tìm kiếm (m) theo số sao. */
export const SEARCH_RADIUS = [0, 60, 120, 200, 300, 400] as const;
/** Khuất mặt bấy nhiêu giây (đã ra khỏi vùng tìm kiếm) thì hết truy nã, theo số sao. */
export const ESCAPE_TIME = [0, 10, 20, 32, 45, 60] as const;
/** Còn trong vùng tìm kiếm thì đồng hồ khuất mặt chạy chậm hơn (×). */
export const INSIDE_ZONE_RATE = 0.35;
/** Trốn trong hẻm thì đồng hồ khuất mặt chạy nhanh hơn (×). */
export const HEM_RATE = 1.6;

export type WantedEvent = 'none' | 'escaped';

export class Wanted {
  level = 0;
  /** Tâm vùng tìm kiếm: chỗ công an thấy Tín lần cuối (hoặc chỗ gây án). */
  searchX = 0;
  searchZ = 0;
  /** Thời gian khuất mặt đã tích luỹ (s, đã nhân hệ số trong vùng / trong hẻm). */
  private unseen = 0;
  /** Công an có đang thấy Tín không (lần update gần nhất). */
  seen = false;

  /** Có người báo công an về vụ ở (x, z); `severity` 1 = đánh người, 2 = có người chết. */
  report(severity: 1 | 2, x: number, z: number): void {
    this.level = Math.min(Math.max(this.level, CIVILIAN_CAP), Math.max(this.level + 1, severity));
    this.searchX = x;
    this.searchZ = z;
    this.unseen = 0;
  }

  /** Tăng sao trực tiếp (đánh công an…) — không quá MAX_STARS. */
  raise(stars: number, x: number, z: number): void {
    this.level = Math.min(MAX_STARS, this.level + stars);
    this.searchX = x;
    this.searchZ = z;
    this.unseen = 0;
  }

  /** Đặt thẳng số sao (debug / test: __HEM__.setWanted). */
  set(level: number, x: number, z: number): void {
    this.level = Math.max(0, Math.min(MAX_STARS, Math.round(level)));
    this.searchX = x;
    this.searchZ = z;
    this.unseen = 0;
  }

  get radius(): number {
    return SEARCH_RADIUS[this.level] ?? 0;
  }

  /**
   * Một bước: `seen` = có công an thấy Tín; (px, pz) chỗ Tín; `inHem` = Tín đang trong hẻm.
   * Trả 'escaped' khi vừa hết truy nã.
   */
  update(dt: number, seen: boolean, px: number, pz: number, inHem: boolean): WantedEvent {
    this.seen = seen && this.level > 0;
    if (this.level <= 0) return 'none';
    if (seen) {
      this.searchX = px;
      this.searchZ = pz;
      this.unseen = 0;
      return 'none';
    }
    const outside = Math.hypot(px - this.searchX, pz - this.searchZ) > this.radius;
    this.unseen += dt * (outside ? 1 : INSIDE_ZONE_RATE) * (inHem ? HEM_RATE : 1);
    if (this.unseen >= (ESCAPE_TIME[this.level] ?? 0)) {
      this.clear();
      return 'escaped';
    }
    return 'none';
  }

  /** Tiến độ cắt đuôi (0..1) — HUD cho sao nhấp nháy khi khuất mặt. */
  get escapeProgress(): number {
    return this.level > 0 ? this.unseen / (ESCAPE_TIME[this.level] ?? 1) : 0;
  }

  clear(): void {
    this.level = 0;
    this.unseen = 0;
    this.seen = false;
  }
}
