import type { Rect } from '@/core/rect';

/**
 * Độ Nóng (thuần logic, có unit test): 0 = yên ổn, 1–3 = đàn em của Phát đang truy đuổi.
 * Còn bị nhìn thấy thì giữ nguyên; khuất tầm nhìn đủ lâu (cấp càng cao càng lâu) thì cắt đuôi được, về 0.
 */
export class Heat {
  level = 0;
  /** Thời gian liên tục không bị thấy (s). */
  unseen = 0;

  /** Thời gian khuất tầm nhìn cần để cắt đuôi ở cấp hiện tại. */
  get loseTime(): number {
    return [0, 8, 12, 16][this.level] ?? 16;
  }

  /** 0..1: tiến độ cắt đuôi (cho HUD nhấp nháy sao). */
  get escapeProgress(): number {
    return this.level === 0 ? 0 : Math.min(1, this.unseen / this.loseTime);
  }

  set(level: number): void {
    this.level = Math.max(0, Math.min(3, Math.round(level)));
    this.unseen = 0;
  }

  raise(by = 1): void {
    this.set(this.level + by);
  }

  /** Trả về true đúng lúc vừa cắt đuôi xong. */
  update(dt: number, seen: boolean): boolean {
    if (this.level === 0) return false;
    if (seen) {
      this.unseen = 0;
      return false;
    }
    this.unseen += dt;
    if (this.unseen >= this.loseTime) {
      this.level = 0;
      this.unseen = 0;
      return true;
    }
    return false;
  }
}

/** Đoạn thẳng (ax, az)–(bx, bz) có cắt hình chữ nhật không (thuật toán Liang–Barsky). */
export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, ax - r.x0) && clip(dx, r.x1 - ax) && clip(-dz, az - r.z0) && clip(dz, r.z1 - az) && t0 <= t1;
}

/**
 * Tầm nhìn giữa hai điểm có bị nhà che không. Tra nhanh bằng lưới băm theo ô 20 m.
 */
export class SightGrid {
  private readonly cells = new Map<number, Rect[]>();
  private static readonly CELL = 20;
  private static key(cx: number, cz: number): number {
    return (cx + 1000) * 4096 + (cz + 1000);
  }

  constructor(obstacles: readonly Rect[]) {
    const C = SightGrid.CELL;
    for (const r of obstacles) {
      for (let cx = Math.floor(r.x0 / C); cx <= Math.floor(r.x1 / C); cx++)
        for (let cz = Math.floor(r.z0 / C); cz <= Math.floor(r.z1 / C); cz++) {
          const k = SightGrid.key(cx, cz);
          const list = this.cells.get(k);
          if (list) list.push(r);
          else this.cells.set(k, [r]);
        }
    }
  }

  /** true nếu nhìn thấy nhau (không nhà nào chắn giữa). */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const C = SightGrid.CELL;
    const seen = new Set<Rect>();
    // Bước lấy mẫu 4 m (nhỏ hơn ô lưới) để không bỏ sót ô mà đoạn thẳng chỉ cắt qua góc.
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let i = 0; i <= steps; i++) {
      const x = ax + ((bx - ax) * i) / steps;
      const z = az + ((bz - az) * i) / steps;
      for (const r of this.cells.get(SightGrid.key(Math.floor(x / C), Math.floor(z / C))) ?? []) {
        if (seen.has(r)) continue;
        seen.add(r);
        if (segmentHitsRect(ax, az, bx, bz, r)) return false;
      }
    }
    return true;
  }
}
