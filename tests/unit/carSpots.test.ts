import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { CAR } from '@/vehicles/carModel';
import { CAR_SPACING, carSpots, type CarSpot } from '@/world/city/carSpots';
import { BOLLARD, hemBollards, hemMouths } from '@/world/city/hemDetails';
import { generateCity, type Road } from '@/world/city/layout';

const city = generateCity();

/** Con đường mà xe đang đậu trên đó (xe nằm lệch khỏi tim đường). */
function roadOf(s: CarSpot): Road | undefined {
  return city.roads.find((r) => r.kind !== 'edge' && containsPoint(r.rect, s.x, s.z) && Math.abs((r.axis === 'x' ? s.z : s.x) - r.pos) > 2);
}

describe('chỗ ô tô đậu', () => {
  const spots = carSpots(city, 7);

  it('đủ số xe, có seed, đủ ba kiểu xe', () => {
    expect(spots).toHaveLength(7);
    expect(carSpots(city, 7)).toEqual(spots);
    expect(carSpots(city, 3)).toEqual(spots.slice(0, 3));
    expect(new Set(spots.map((s) => s.kind))).toEqual(new Set(['sedan', 'taxi', 'pickup']));
  });

  it('nằm trên lòng đường sát bó vỉa, trong khu chơi, ngoài mọi block và giao lộ', () => {
    for (const s of spots) {
      const road = roadOf(s);
      expect(road).toBeDefined();
      if (!road) continue;
      const lateral = Math.abs((road.axis === 'x' ? s.z : s.x) - road.pos);
      expect(lateral + CAR.width / 2).toBeLessThan(road.width / 2);
      expect(lateral + CAR.width / 2).toBeGreaterThan(road.width / 2 - 0.6);
      expect(containsPoint(city.playArea, s.x, s.z)).toBe(true);
      expect(city.blocks.some((b) => containsPoint(b.rect, s.x, s.z))).toBe(false);
      // Không nằm trong lòng đường cắt ngang nào.
      expect(city.roads.filter((r) => r.axis !== road.axis).some((r) => containsPoint(r.rect, s.x, s.z))).toBe(false);
    }
  });

  it('đầu xe theo chiều chạy bên phải: đi +X ở nửa +Z, đi +Z ở nửa −X', () => {
    for (const s of spots) {
      const road = roadOf(s);
      if (!road) throw new Error('xe không nằm trên đường');
      if (road.axis === 'x') expect(Math.sign(Math.sin(s.yaw))).toBe(Math.sign(s.z - road.pos));
      else expect(Math.sign(Math.cos(s.yaw))).toBe(-Math.sign(s.x - road.pos));
    }
  });

  it('các xe cách nhau xa, không chắn miệng hẻm, xe đầu tiên ở gần điểm xuất phát', () => {
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i] as CarSpot;
        const b = spots[j] as CarSpot;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(CAR_SPACING);
      }
    }
    for (const s of spots) for (const m of hemMouths(city)) expect(Math.hypot(s.x - m.x, s.z - m.z)).toBeGreaterThan(4);
    const first = spots[0] as CarSpot;
    const d = Math.hypot(first.x - city.spawn.x, first.z - city.spawn.z);
    expect(d).toBeGreaterThan(12);
    expect(d).toBeLessThan(60);
  });
});

describe('trụ chắn ô tô ở miệng hẻm', () => {
  const posts = hemBollards(city);
  const mouths = hemMouths(city);
  const near = (m: (typeof mouths)[number]) => posts.filter((p) => p.hemId === m.hemId && Math.hypot(p.x - m.x, p.z - m.z) < m.halfWidth + 1);

  it('miệng hẻm nào cũng có trụ, nằm trong lòng hẻm', () => {
    for (const p of posts) expect(containsPoint(city.hems[p.hemId]!.rect, p.x, p.z)).toBe(true);
    for (const m of mouths) expect(near(m).length).toBeGreaterThan(0);
  });

  it('mọi khe (tường–trụ, trụ–trụ) hẹp hơn ô tô nhưng đủ rộng cho xe máy', () => {
    for (const m of mouths) {
      // Vị trí các trụ dọc bề ngang miệng hẻm, tính từ tường bên này sang tường bên kia.
      const along = near(m)
        .map((p) => (p.x - m.x) * Math.cos(m.yaw) - (p.z - m.z) * Math.sin(m.yaw))
        .sort((a, b) => a - b);
      const edges = [-m.halfWidth, ...along, m.halfWidth];
      for (let i = 1; i < edges.length; i++) {
        const posts = (i === 1 ? 0 : 1) + (i === edges.length - 1 ? 0 : 1);
        const gap = (edges[i] as number) - (edges[i - 1] as number) - posts * BOLLARD.radius;
        expect(gap).toBeLessThan(CAR.width - 0.3);
        expect(gap).toBeGreaterThan(0.9);
      }
    }
  });
});
