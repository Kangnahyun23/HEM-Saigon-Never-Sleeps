import type { CityLayout, Dir, Lot } from './layout';

/**
 * Nơi đặc biệt trong khu (thuần logic, có unit test): đồn công an phường (bị bắt thì được thả ra ở đây) và trạm y tế
 * phường (gục thì tỉnh dậy ở đây). Chọn theo bố cục ⇒ cùng seed thì cùng chỗ, không cần lưu.
 */
export interface Place {
  readonly name: string;
  /** Chỗ đứng trên vỉa hè trước cửa, quay mặt ra đường. */
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly lotId: number;
}

export interface CityPlaces {
  readonly police: Place;
  readonly clinic: Place;
}

/** Góc quay mặt ra đường (yaw = 0 nhìn về +Z). */
const yawFor = (d: Dir): number => (d === '+z' ? 0 : d === '-z' ? Math.PI : d === '+x' ? Math.PI / 2 : -Math.PI / 2);

/** Giữa mặt tiền lô nhà (toạ độ trên mép lô phía đường). */
function facadeCenter(l: Lot): [number, number] {
  const r = l.rect;
  switch (l.front) {
    case '+z':
      return [(r.x0 + r.x1) / 2, r.z1];
    case '-z':
      return [(r.x0 + r.x1) / 2, r.z0];
    case '+x':
      return [r.x1, (r.z0 + r.z1) / 2];
    default:
      return [r.x0, (r.z0 + r.z1) / 2];
  }
}

/** Lô mặt tiền đường lớn (không phải nhà cao tầng) gần điểm (x, z) nhất, khác các lô đã dùng. */
function nearestLot(layout: CityLayout, x: number, z: number, used: ReadonlySet<number>): Lot {
  let best: Lot | null = null;
  let bestD = Infinity;
  for (const l of layout.lots) {
    if (l.row !== 'front' || l.frontage === 'hem' || l.kind === 'tower' || l.blockId < 0 || used.has(l.id)) continue;
    const [fx, fz] = facadeCenter(l);
    const d = Math.hypot(fx - x, fz - z);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return best ?? (layout.lots[0] as Lot);
}

function placeAt(name: string, l: Lot): Place {
  const yaw = yawFor(l.front);
  const [fx, fz] = facadeCenter(l);
  // Bước ra vỉa hè 1,6 m trước cửa.
  return { name, x: fx + Math.sin(yaw) * 1.6, z: fz + Math.cos(yaw) * 1.6, yaw, lotId: l.id };
}

export function cityPlaces(layout: CityLayout): CityPlaces {
  const m = layout.market.rect;
  const cx = (m.x0 + m.x1) / 2;
  const cz = (m.z0 + m.z1) / 2;
  const used = new Set<number>();
  // Đồn công an phường ở phía đông chợ, trạm y tế phía tây.
  const policeLot = nearestLot(layout, cx + 70, cz, used);
  used.add(policeLot.id);
  const clinicLot = nearestLot(layout, cx - 70, cz, used);
  return { police: placeAt('Công an phường Chợ Trung Tâm', policeLot), clinic: placeAt('Trạm y tế phường', clinicLot) };
}
