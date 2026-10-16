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

/** Khoảng tham số [t0, t1] của Liang–Barsky — biến cấp module để `clip` khỏi là closure (không tạo rác mỗi lần gọi). */
let clipT0 = 0;
let clipT1 = 1;

function clip(p: number, q: number): boolean {
  if (p === 0) return q >= 0;
  const t = q / p;
  if (p < 0) {
    if (t > clipT1) return false;
    if (t > clipT0) clipT0 = t;
  } else {
    if (t < clipT0) return false;
    if (t < clipT1) clipT1 = t;
  }
  return true;
}

/** Đoạn thẳng (ax, az)–(bx, bz) có cắt hình chữ nhật không (thuật toán Liang–Barsky). */
export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect): boolean {
  clipT0 = 0;
  clipT1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  return clip(-dx, ax - r.x0) && clip(dx, r.x1 - ax) && clip(-dz, az - r.z0) && clip(dz, r.z1 - az) && clipT0 <= clipT1;
}

/**
 * Tầm nhìn giữa hai điểm có bị nhà che không. Tra nhanh bằng lưới băm theo ô 20 m. Xe truy đuổi, công an đi bộ, xe
 * tuần tra tra nhiều lần mỗi bước ⇒ một lần tra không tạo đối tượng nào (đánh dấu nhà đã xét bằng số lượt tra).
 */
export class SightGrid {
  /** Ô lưới → chỉ số các nhà chạm ô đó. */
  private readonly cells = new Map<number, number[]>();
  private readonly rects: readonly Rect[];
  /** Lượt tra gần nhất đã xét từng nhà (nhà trải qua nhiều ô chỉ xét một lần mỗi lượt). */
  private readonly checked: Uint32Array;
  private query = 0;
  private static readonly CELL = 20;
  private static key(cx: number, cz: number): number {
    return (cx + 1000) * 4096 + (cz + 1000);
  }

  constructor(obstacles: readonly Rect[]) {
    const C = SightGrid.CELL;
    this.rects = obstacles.slice();
    this.checked = new Uint32Array(obstacles.length);
    obstacles.forEach((r, i) => {
      for (let cx = Math.floor(r.x0 / C); cx <= Math.floor(r.x1 / C); cx++)
        for (let cz = Math.floor(r.z0 / C); cz <= Math.floor(r.z1 / C); cz++) {
          const k = SightGrid.key(cx, cz);
          const list = this.cells.get(k);
          if (list) list.push(i);
          else this.cells.set(k, [i]);
        }
    });
  }

  /** true nếu nhìn thấy nhau (không nhà nào chắn giữa). */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const C = SightGrid.CELL;
    if (++this.query === 0xffffffff) {
      this.checked.fill(0);
      this.query = 1;
    }
    const q = this.query;
    // Bước lấy mẫu 4 m (nhỏ hơn ô lưới) để không bỏ sót ô mà đoạn thẳng chỉ cắt qua góc.
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let i = 0; i <= steps; i++) {
      const x = ax + ((bx - ax) * i) / steps;
      const z = az + ((bz - az) * i) / steps;
      const list = this.cells.get(SightGrid.key(Math.floor(x / C), Math.floor(z / C)));
      if (!list) continue;
      for (let j = 0; j < list.length; j++) {
        const r = list[j]!;
        if (this.checked[r] === q) continue;
        this.checked[r] = q;
        if (segmentHitsRect(ax, az, bx, bz, this.rects[r]!)) return false;
      }
    }
    return true;
  }
}
