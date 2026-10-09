/**
 * Bộ sinh số ngẫu nhiên có seed (mulberry32): cùng seed → cùng thành phố.
 * Dùng cho sinh khối nhà, vị trí NPC… để bug tái hiện được.
 */
/** Hàm sinh số ngẫu nhiên [0, 1). */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Số thực trong [min, max). */
export function range(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Chọn một phần tử bất kỳ của mảng không rỗng. */
export function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() cần mảng không rỗng');
  return items[Math.floor(rng() * items.length)] as T;
}
