/**
 * Truy nã (thuần logic, có unit test): 0–5 sao, chạy song song với Độ Nóng (đàn em của Phát).
 * N5.3: người đi đường gọi báo ⇒ lên sao (đánh người: 1 sao, có người chết: 2 sao), dân báo tối đa 3 sao; không bị báo
 * thêm thì cứ STAR_COOLDOWN giây hạ một sao. N5.4 thêm công an đi tìm, vùng tìm kiếm, khuất mặt mới hạ sao.
 */

export const MAX_STARS = 5;
/** Dân gọi báo chỉ đẩy tới mức này; cao hơn là do đánh nhau với công an (N5.4). */
export const CIVILIAN_CAP = 3;
/** Không bị báo thêm bấy nhiêu giây thì hạ một sao. */
export const STAR_COOLDOWN = 40;

export class Wanted {
  level = 0;
  /** Thời gian (s) từ lần bị báo gần nhất / lần hạ sao gần nhất. */
  private calm = 0;

  /** Có người báo công an; `severity` 1 = đánh người, 2 = có người chết. */
  report(severity: 1 | 2): void {
    this.level = Math.min(Math.max(this.level, CIVILIAN_CAP), Math.max(this.level + 1, severity));
    this.calm = 0;
  }

  update(dt: number): void {
    if (this.level <= 0) return;
    this.calm += dt;
    if (this.calm >= STAR_COOLDOWN) {
      this.level--;
      this.calm = 0;
    }
  }

  /** Tiến độ hạ sao kế tiếp (0..1) — HUD cho sao nhấp nháy khi sắp hạ. */
  get cooling(): number {
    return this.level > 0 ? this.calm / STAR_COOLDOWN : 0;
  }

  clear(): void {
    this.level = 0;
    this.calm = 0;
  }
}
