/**
 * Chọn người đi bộ nào được vẽ bằng nhân vật có xương (gần camera) — còn lại vẽ bằng khối hộp instanced
 * (thuần logic, có unit test). Số chỗ cố định theo sức máy; có "giữ chỗ" để người đang hiện chi tiết không bị
 * đổi qua đổi lại khi hai người cách camera gần bằng nhau.
 */

export interface LodPoint {
  readonly id: number;
  readonly x: number;
  readonly z: number;
}

/** Người đang giữ chỗ chỉ nhường khi người mới gần hơn hẳn ngần này (m). */
export const LOD_HYSTERESIS = 3;

export class PedestrianLod {
  /** slots[k] = id người đi bộ đang dùng chỗ k, hoặc −1 nếu trống. */
  readonly slots: number[];
  private readonly dist: number[] = [];
  private readonly order: number[] = [];

  constructor(
    readonly capacity: number,
    readonly radius: number,
  ) {
    this.slots = new Array<number>(capacity).fill(-1);
  }

  /** Cập nhật chỗ theo vị trí camera (cx, cz). Không tạo mảng / closure mới mỗi khung hình. */
  update(points: readonly LodPoint[], cx: number, cz: number): void {
    const { dist, order, slots } = this;
    const n = points.length;
    dist.length = n;
    order.length = 0;
    const r2 = this.radius * this.radius;
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      const d2 = (p.x - cx) ** 2 + (p.z - cz) ** 2;
      if (d2 > r2) continue;
      // Người đang giữ chỗ được "kéo gần lại" một đoạn ⇒ không nhường chỗ vì chênh lệch nhỏ.
      dist[i] = Math.sqrt(d2) - (slots.includes(p.id) ? LOD_HYSTERESIS : 0);
      order.push(i);
    }
    order.sort(this.byDist);
    if (order.length > this.capacity) order.length = this.capacity;

    // Giữ nguyên chỗ cho người vẫn được chọn; chỗ trống chia cho người mới.
    for (let k = 0; k < slots.length; k++) {
      const id = slots[k]!;
      if (id < 0) continue;
      let kept = false;
      for (let j = 0; j < order.length && !kept; j++) kept = points[order[j]!]!.id === id;
      if (!kept) slots[k] = -1;
    }
    for (let j = 0; j < order.length; j++) {
      const id = points[order[j]!]!.id;
      if (slots.includes(id)) continue;
      const free = slots.indexOf(-1);
      if (free >= 0) slots[free] = id;
    }
  }

  private readonly byDist = (a: number, b: number): number => this.dist[a]! - this.dist[b]!;

  /** Người này có đang được vẽ chi tiết không. */
  has(id: number): boolean {
    return this.slots.includes(id);
  }
}
