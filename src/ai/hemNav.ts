import { containsPoint, type Rect } from '@/core/rect';

/** Một hẻm theo bố cục: hình chữ nhật + trục dọc hẻm. */
export interface HemShape {
  readonly rect: Rect;
  readonly axis: 'x' | 'z';
}

/** Điểm ra khỏi hẻm lấn qua đầu hẻm ngần này (m): ra hẳn lòng đường, hoặc vào giữa hẻm chính. */
const EXIT_REACH = 1.5;

/**
 * Hẻm với xe truy đuổi (thuần logic, có unit test). Hẻm hẹp, đông người, đồ đạc bày ra ⇒ xe máy vào hẻm phải chạy
 * chậm (ChaseConfig.hemSpeed); ô tô không vào được (trụ chắn miệng hẻm) ⇒ dừng ở miệng hẻm. Xe đang trong hẻm mà mất
 * dấu Tín thì men theo trục hẻm ra một đầu thông — không lao thẳng về giao lộ xuyên qua nhà.
 */
export class HemMap {
  /** Hai đầu của từng hẻm (đầu nhỏ, đầu lớn theo trục) có thông ra không — đầu cụt là nhà. */
  private readonly open: boolean[] = [];

  constructor(
    readonly hems: readonly HemShape[],
    lots: readonly Rect[],
  ) {
    const p = { x: 0, z: 0 };
    for (let i = 0; i < hems.length; i++) {
      for (let end = 0; end < 2; end++) {
        this.endPoint(i, end, 1, p);
        this.open.push(!lots.some((l) => containsPoint(l, p.x, p.z)));
      }
    }
  }

  /** Đầu `end` (0: phía toạ độ nhỏ, 1: phía toạ độ lớn) của hẻm `i` có thông ra không. */
  isOpen(i: number, end: number): boolean {
    return this.open[i * 2 + end] === true;
  }

  /** Chỉ số hẻm chứa điểm (x, z), -1 nếu không ở trong hẻm nào. */
  at(x: number, z: number): number {
    const hems = this.hems;
    for (let i = 0; i < hems.length; i++) if (containsPoint(hems[i]!.rect, x, z)) return i;
    return -1;
  }

  /** Đi thẳng từ (ax, az) tới (bx, bz) thì sau bao nhiêu mét vào hẻm: 0 nếu đang ở trong hẻm, Infinity nếu không vào hẻm nào. */
  entry(ax: number, az: number, bx: number, bz: number): number {
    const dx = bx - ax;
    const dz = bz - az;
    let best = Infinity;
    for (let i = 0; i < this.hems.length; i++) {
      const t = entryParam(ax, az, dx, dz, this.hems[i]!.rect);
      if (t < best) best = t;
    }
    return best === Infinity ? Infinity : best * Math.hypot(dx, dz);
  }

  /**
   * Điểm ra của hẻm `i`: đầu thông gần (gx, gz) nhất, lấn ra ngoài đầu hẻm một chút, giữa bề ngang hẻm. Ghi vào `out`;
   * false nếu hẻm không có đầu nào thông.
   */
  exit(i: number, gx: number, gz: number, out: { x: number; z: number }): boolean {
    let found = false;
    let bestD = Infinity;
    let bx = 0;
    let bz = 0;
    for (let end = 0; end < 2; end++) {
      if (!this.isOpen(i, end)) continue;
      this.endPoint(i, end, EXIT_REACH, out);
      const d = Math.hypot(out.x - gx, out.z - gz);
      if (d < bestD) {
        bestD = d;
        bx = out.x;
        bz = out.z;
        found = true;
      }
    }
    out.x = bx;
    out.z = bz;
    return found;
  }

  /** Điểm giữa bề ngang hẻm `i`, lấn qua đầu `end` một đoạn `reach` m. */
  private endPoint(i: number, end: number, reach: number, out: { x: number; z: number }): void {
    const { rect: r, axis } = this.hems[i]!;
    if (axis === 'x') {
      out.x = end === 0 ? r.x0 - reach : r.x1 + reach;
      out.z = (r.z0 + r.z1) / 2;
    } else {
      out.x = (r.x0 + r.x1) / 2;
      out.z = end === 0 ? r.z0 - reach : r.z1 + reach;
    }
  }
}

/**
 * Tham số t ∈ [0, 1] nơi đoạn (ax, az) → (ax + dx, az + dz) đi vào hình chữ nhật (0 nếu điểm đầu đã ở trong),
 * Infinity nếu không cắt. Cắt theo từng trục (slab), không tạo closure / đối tượng.
 */
export function entryParam(ax: number, az: number, dx: number, dz: number, r: Rect): number {
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (ax < r.x0 || ax > r.x1) return Infinity;
  } else {
    const a = (r.x0 - ax) / dx;
    const b = (r.x1 - ax) / dx;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (dz === 0) {
    if (az < r.z0 || az > r.z1) return Infinity;
  } else {
    const a = (r.z0 - az) / dz;
    const b = (r.z1 - az) / dz;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 <= t1 ? t0 : Infinity;
}
