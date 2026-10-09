/** Hình chữ nhật thẳng trục trên mặt phẳng XZ (mét). Luôn giữ x0 < x1, z0 < z1. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export const rect = (x0: number, z0: number, x1: number, z1: number): Rect => ({
  x0: Math.min(x0, x1),
  z0: Math.min(z0, z1),
  x1: Math.max(x0, x1),
  z1: Math.max(z0, z1),
});

export const width = (r: Rect): number => r.x1 - r.x0;
export const depth = (r: Rect): number => r.z1 - r.z0;
export const centerX = (r: Rect): number => (r.x0 + r.x1) / 2;
export const centerZ = (r: Rect): number => (r.z0 + r.z1) / 2;

export const inset = (r: Rect, d: number): Rect => rect(r.x0 + d, r.z0 + d, r.x1 - d, r.z1 - d);

/** Hai hình có phần giao với diện tích > 0 (chạm cạnh không tính). `eps` cho phép sai số. */
export function overlaps(a: Rect, b: Rect, eps = 1e-6): boolean {
  return a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
}

export function containsPoint(r: Rect, x: number, z: number): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

export function containsRect(outer: Rect, inner: Rect, eps = 1e-6): boolean {
  return inner.x0 >= outer.x0 - eps && inner.x1 <= outer.x1 + eps && inner.z0 >= outer.z0 - eps && inner.z1 <= outer.z1 + eps;
}
