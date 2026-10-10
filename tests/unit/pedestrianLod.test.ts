import { describe, expect, it } from 'vitest';
import { LOD_HYSTERESIS, PedestrianLod, type LodPoint } from '@/ai/pedestrianLod';

const pts = (...xs: number[]): LodPoint[] => xs.map((x, id) => ({ id, x, z: 0 }));

describe('người đi bộ gần camera vẽ bằng nhân vật có xương', () => {
  it('chọn tối đa `capacity` người gần nhất trong bán kính', () => {
    const lod = new PedestrianLod(2, 30);
    lod.update(pts(5, 50, 1, 20, 3), 0, 0);
    expect([...lod.slots].sort()).toEqual([2, 4]);
    expect(lod.has(0)).toBe(false);
    expect(lod.has(1)).toBe(false);
  });

  it('ngoài bán kính thì không vẽ chi tiết; chỗ trống khi ít người', () => {
    const lod = new PedestrianLod(3, 10);
    lod.update(pts(5, 40), 0, 0);
    expect(lod.slots.filter((s) => s >= 0)).toEqual([0]);
  });

  it('người đang giữ chỗ không bị đổi khi người khác chỉ gần hơn chút xíu (giữ chỗ)', () => {
    const lod = new PedestrianLod(1, 30);
    lod.update(pts(10, 12), 0, 0);
    expect(lod.slots).toEqual([0]);
    // Người 1 lại gần hơn 1 m — chưa đủ để giành chỗ.
    lod.update(pts(10, 9), 0, 0);
    expect(lod.slots).toEqual([0]);
    // Gần hơn hẳn (vượt ngưỡng giữ chỗ) ⇒ đổi.
    lod.update(pts(10, 10 - LOD_HYSTERESIS - 1), 0, 0);
    expect(lod.slots).toEqual([1]);
  });

  it('người vẫn được chọn giữ nguyên số chỗ (khỏi phải dựng lại hình)', () => {
    const lod = new PedestrianLod(3, 30);
    lod.update(pts(1, 2, 3), 0, 0);
    const before = [...lod.slots];
    lod.update(pts(3, 1, 2), 0, 0);
    expect(lod.slots).toEqual(before);
  });
});
