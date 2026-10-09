import { describe, expect, it } from 'vitest';
import { arrowAngle, mapImageTransform, markerOnMap, worldToMap, type MapView } from '@/ui/minimapMath';

const view = (fx: number, fz: number): MapView => ({ px: 10, pz: 20, fx, fz, cx: 100, cy: 100, scale: 2 });

describe('minimapMath', () => {
  it('người chơi ở tâm; phía trước camera là phía trên bản đồ, bên phải camera là bên phải', () => {
    const v = view(0, 1); // camera nhìn +Z ⇒ bên phải là −X
    expect(worldToMap(v, 10, 20)).toEqual({ u: 100, v: 100 });
    const ahead = worldToMap(v, 10, 30);
    expect(ahead.u).toBeCloseTo(100);
    expect(ahead.v).toBeCloseTo(80);
    const right = worldToMap(v, 0, 20);
    expect(right.u).toBeCloseTo(120);
    expect(right.v).toBeCloseTo(100);
  });

  it('xoay camera thì bản đồ xoay theo', () => {
    const v = view(1, 0); // nhìn +X ⇒ bên phải là +Z
    const ahead = worldToMap(v, 20, 20);
    expect(ahead.v).toBeLessThan(100);
    const right = worldToMap(v, 10, 25);
    expect(right.u).toBeGreaterThan(100);
  });

  it('ma trận vẽ ảnh nền khớp với phép chiếu điểm', () => {
    const v = { ...view(0.6, 0.8) };
    const [a, b, c, d, e, f] = mapImageTransform(v, -50, -40, 1.5);
    for (const [i, j] of [
      [0, 0],
      [30, 12],
      [300, 222],
    ] as const) {
      const p = worldToMap(v, -50 + i / 1.5, -40 + j / 1.5);
      expect(a * i + c * j + e).toBeCloseTo(p.u, 6);
      expect(b * i + d * j + f).toBeCloseTo(p.v, 6);
    }
  });

  it('điểm đánh dấu ở xa được ghim lên mép bản đồ theo đúng hướng', () => {
    const v = view(0, 1);
    const near = markerOnMap(v, 10, 40, 80);
    expect(near.edge).toBe(false);
    const far = markerOnMap(v, 10, 500, 80);
    expect(far.edge).toBe(true);
    expect(far.u).toBeCloseTo(100);
    expect(far.v).toBeCloseTo(20);
  });

  it('mũi tên người chơi: cùng hướng camera thì chỉ lên, quay phải 90° thì chỉ sang phải', () => {
    expect(arrowAngle(0, 0, 1)).toBeCloseTo(0);
    // yaw = −π/2 ⇒ hướng (−1, 0) = bên phải khi camera nhìn +Z.
    expect(arrowAngle(-Math.PI / 2, 0, 1)).toBeCloseTo(Math.PI / 2);
  });
});
