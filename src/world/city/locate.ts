import { containsPoint } from '@/core/rect';
import type { CityLayout, Hem, Road } from './layout';

export interface Location {
  kind: 'road' | 'intersection' | 'hem' | 'sidewalk' | 'market' | 'park' | 'river' | 'outside';
  name: string;
}

export const PLACE_NAMES = {
  market: 'Chợ Trung Tâm',
  park: 'Công viên Lá Me',
  river: 'Bờ kè Bến Sông',
  district: 'Khu Trung Tâm',
} as const;

/** Đường mà hẻm thông ra (đầu hẻm). Hẻm chính: đường ở đầu nhỏ hơn; hẻm nhánh: đường nó cắt ra, nếu không có thì theo hẻm chính. */
function hemRoad(layout: CityLayout, hem: Hem): { road: Road; along: number } | null {
  const touching = layout.roads.filter((r) => {
    const rr = r.rect;
    const h = hem.rect;
    const eps = 0.05;
    return rr.x0 <= h.x1 + eps && h.x0 <= rr.x1 + eps && rr.z0 <= h.z1 + eps && h.z0 <= rr.z1 + eps;
  });
  // Đường vuông góc với hướng hẻm, đặt ở đầu hẻm.
  const perpendicular = touching.filter((r) => r.axis !== hem.axis);
  const road = perpendicular.sort((a, b) => a.pos - b.pos)[0];
  if (road) {
    const mid = hem.axis === 'x' ? (hem.rect.z0 + hem.rect.z1) / 2 : (hem.rect.x0 + hem.rect.x1) / 2;
    const start = road.axis === 'x' ? road.rect.x0 : road.rect.z0;
    return { road, along: mid - start };
  }
  return null;
}

/** Số nhà kiểu Sài Gòn: số chẵn tăng dần theo quãng đường dọc con đường. */
function houseNumber(along: number): number {
  return Math.max(2, 2 * Math.round(along / 9));
}

/** Tên địa điểm tại (x, z) để hiện trên HUD. */
export function locate(layout: CityLayout, x: number, z: number): Location {
  const market = layout.blocks.find((b) => b.kind === 'market');
  if (market && containsPoint(market.rect, x, z)) return { kind: 'market', name: PLACE_NAMES.market };
  const park = layout.blocks.find((b) => b.kind === 'park');
  if (park && containsPoint(park.inner, x, z)) return { kind: 'park', name: PLACE_NAMES.park };
  if (containsPoint(layout.river.promenade, x, z)) return { kind: 'river', name: PLACE_NAMES.river };

  // Ưu tiên hẻm nhánh (chỗ giao nhau thuộc về nhánh). Số hẻm nhánh = số hẻm chính / thứ tự nhánh, kiểu "Hẻm 42/1".
  const hits = layout.hems.filter((h) => containsPoint(h.rect, x, z));
  const hem = hits.find((h) => h.kind === 'branch') ?? hits[0];
  if (hem) {
    const main = hem.kind === 'main' ? hem : layout.hems.find((h) => h.blockId === hem.blockId && h.kind === 'main');
    const info = main ? hemRoad(layout, main) : null;
    if (info) {
      const base = `Hẻm ${houseNumber(info.along)}`;
      if (hem.kind === 'branch') {
        const sub = 1 + layout.hems.filter((h) => h.blockId === hem.blockId && h.kind === 'branch' && h.id < hem.id).length;
        return { kind: 'hem', name: `${base}/${sub} ${info.road.name}` };
      }
      return { kind: 'hem', name: `${base} ${info.road.name}` };
    }
    return { kind: 'hem', name: 'Hẻm' };
  }

  const roads = layout.roads.filter((r) => containsPoint(r.rect, x, z));
  if (roads.length >= 2) {
    const [a, b] = roads as [Road, Road];
    return { kind: 'intersection', name: `Ngã tư ${a.name.replace(/^Đường /, '')} – ${b.name.replace(/^Đường /, '')}` };
  }
  if (roads.length === 1) return { kind: 'road', name: (roads[0] as Road).name };

  // Trên vỉa hè / trong block: lấy tên con đường gần nhất.
  let best: Road | null = null;
  let bestD = Infinity;
  for (const r of layout.roads) {
    const d = r.axis === 'x' ? Math.abs(z - r.pos) - r.width / 2 : Math.abs(x - r.pos) - r.width / 2;
    const inSpan = r.axis === 'x' ? x >= r.rect.x0 && x <= r.rect.x1 : z >= r.rect.z0 && z <= r.rect.z1;
    if (inSpan && d < bestD) {
      bestD = d;
      best = r;
    }
  }
  if (best && bestD < 40) return { kind: 'sidewalk', name: best.name };
  return { kind: 'outside', name: PLACE_NAMES.district };
}
