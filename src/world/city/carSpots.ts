import { createRng } from '@/core/random';
import { containsPoint } from '@/core/rect';
import { CAR, type CarKind } from '@/vehicles/carModel';
import type { CityLayout } from './layout';

/**
 * Chỗ ô tô đậu sẵn ven đường để Tín lấy lái (thuần logic, có seed, có unit test): sát bó vỉa của đại lộ / đường thường,
 * đầu xe theo chiều chạy của nửa đường đó, tránh giao lộ, miệng hẻm và điểm xuất phát; xe đầu tiên luôn ở gần điểm xuất phát.
 */

export interface CarSpot {
  x: number;
  z: number;
  yaw: number;
  kind: CarKind;
  colorIndex: number;
}

/** Hở giữa hông xe và bó vỉa. */
const CURB_GAP = 0.35;
/** Cách mép đường cắt ngang ít nhất ngần này (vạch qua đường, chỗ xe NPC rẽ). */
const JUNCTION_CLEAR = 10;
const HEM_CLEAR = 4;
const SPAWN_CLEAR = 14;
/** Hai xe đậu cách nhau ít nhất ngần này. */
export const CAR_SPACING = 30;
const KINDS: readonly CarKind[] = ['sedan', 'taxi', 'pickup'];

export function carSpots(layout: CityLayout, count: number, seed = layout.seed + 31): CarSpot[] {
  const rng = createRng(seed);
  const b = layout.bounds;
  const candidates: Array<{ x: number; z: number; yaw: number }> = [];
  for (const road of layout.roads) {
    if (road.kind === 'edge') continue;
    const off = road.width / 2 - CURB_GAP - CAR.width / 2;
    const alongX = road.axis === 'x';
    const [from, to] = alongX ? [b.x0, b.x1] : [b.z0, b.z1];
    const crossing = layout.roads.filter((r) => r.axis !== road.axis);
    for (let t = from + 12; t < to - 12; t += 6) {
      if (crossing.some((r) => Math.abs(t - r.pos) < r.width / 2 + JUNCTION_CLEAR)) continue;
      for (const side of [1, -1]) {
        const x = alongX ? t : road.pos + side * off;
        const z = alongX ? road.pos + side * off : t;
        if (!containsPoint(b, x, z)) continue;
        if (Math.hypot(x - layout.spawn.x, z - layout.spawn.z) < SPAWN_CLEAR) continue;
        if (layout.hems.some((h) => x > h.rect.x0 - HEM_CLEAR && x < h.rect.x1 + HEM_CLEAR && z > h.rect.z0 - HEM_CLEAR && z < h.rect.z1 + HEM_CLEAR)) continue;
        // Chạy bên phải: đi theo +X thì ở nửa +Z của đường, đi theo +Z thì ở nửa −X.
        const yaw = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? Math.PI : 0;
        candidates.push({ x, z, yaw });
      }
    }
  }
  // Xáo có seed, rồi đưa chỗ gần điểm xuất phát nhất lên đầu.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = candidates[i] as (typeof candidates)[number];
    candidates[i] = candidates[j] as (typeof candidates)[number];
    candidates[j] = a;
  }
  const fromSpawn = (c: { x: number; z: number }): number => Math.hypot(c.x - layout.spawn.x, c.z - layout.spawn.z);
  let nearest = 0;
  for (let i = 1; i < candidates.length; i++) {
    if (fromSpawn(candidates[i] as { x: number; z: number }) < fromSpawn(candidates[nearest] as { x: number; z: number })) nearest = i;
  }
  if (candidates.length > 0) candidates.unshift(...candidates.splice(nearest, 1));

  const out: CarSpot[] = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < CAR_SPACING)) continue;
    out.push({ ...c, kind: KINDS[out.length % KINDS.length] as CarKind, colorIndex: Math.floor(rng() * 6) });
  }
  return out;
}
