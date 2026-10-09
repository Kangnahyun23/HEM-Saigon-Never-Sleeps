import { createRng, pick, range, type Rng } from '@/core/random';
import type { CityLayout, Dir, Lot } from '@/world/city/layout';
import { locate } from '@/world/city/locate';
import type { MissionDef } from './mission';

/**
 * Kèo giao hàng lặp lại (thuần logic, có seed, có unit test): lấy món ở một tiệm mặt tiền, giao tới nhà khách —
 * nhiều nhà nằm sâu trong hẻm, chỗ xe máy luồn được còn ô tô thì chịu.
 */

const ITEMS = ['cơm tấm', 'trà sữa', 'bánh mì', 'hủ tiếu', 'cà phê sữa đá', 'bún bò', 'thuốc tây', 'hoa tươi', 'giấy tờ', 'bánh tráng trộn', 'nước mía'];

export interface Spot {
  x: number;
  z: number;
  place: string;
}

const OUT: Record<Dir, [number, number]> = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

/** Điểm đứng trước cửa một căn nhà (ra phía mặt tiền 1.4 m). */
export function doorstep(layout: CityLayout, lot: Lot): Spot {
  const [ox, oz] = OUT[lot.front];
  const r = lot.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const x = ox > 0 ? r.x1 + 1.4 : ox < 0 ? r.x0 - 1.4 : cx;
  const z = oz > 0 ? r.z1 + 1.4 : oz < 0 ? r.z0 - 1.4 : cz;
  return { x, z, place: locate(layout, x, z).name };
}

/** Tiền công: 15.000 đ + 130 đ/m, làm tròn nghìn. */
export function jobPay(distance: number): number {
  return Math.round((15_000 + distance * 130) / 1000) * 1000;
}

export class JobBoard {
  private readonly rng: Rng;
  private readonly shops: Lot[];
  private readonly homes: Lot[];
  private counter = 0;

  constructor(private readonly layout: CityLayout, seed = 99) {
    this.rng = createRng(seed);
    this.shops = layout.lots.filter((l) => l.blockId >= 0 && l.row === 'front' && l.kind === 'shophouse');
    if (this.shops.length === 0) this.shops = layout.lots.filter((l) => l.row === 'front');
    this.homes = layout.lots.filter((l) => l.blockId >= 0 && l.kind === 'house' && (l.row === 'back' || l.row === 'front'));
  }

  /** Sinh một kèo quanh vị trí người chơi: tiệm cách 40–220 m, nhà khách cách tiệm 150–450 m. */
  make(px: number, pz: number): MissionDef {
    let shop = pick(this.rng, this.shops);
    for (let i = 0; i < 30; i++) {
      const cand = pick(this.rng, this.shops);
      const d = Math.hypot((cand.rect.x0 + cand.rect.x1) / 2 - px, (cand.rect.z0 + cand.rect.z1) / 2 - pz);
      if (d > 40 && d < 220) {
        shop = cand;
        break;
      }
    }
    const from = doorstep(this.layout, shop);
    let home = pick(this.rng, this.homes);
    // Ưu tiên nhà trong hẻm (60 %).
    const wantHem = this.rng() < 0.6;
    for (let i = 0; i < 40; i++) {
      const cand = pick(this.rng, this.homes);
      const d = Math.hypot((cand.rect.x0 + cand.rect.x1) / 2 - from.x, (cand.rect.z0 + cand.rect.z1) / 2 - from.z);
      if (d > 150 && d < 450 && (cand.frontage === 'hem') === wantHem) {
        home = cand;
        break;
      }
    }
    const to = doorstep(this.layout, home);
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    // ~12 % là "hàng nóng" (gói hàng không hỏi han): tiền gần gấp đôi, lấy hàng xong là bị bám đuôi.
    const hot = this.rng() < 0.12;
    const item = hot ? 'gói hàng không hỏi han' : pick(this.rng, ITEMS);
    this.counter++;
    return {
      ...(hot ? { heat: { at: 1, level: 1 } } : {}),
      id: `keo-${this.counter}`,
      title: hot ? 'Hàng nóng: không hỏi han' : `Giao ${item}`,
      reward: hot ? Math.round((jobPay(distance) * 1.8) / 1000) * 1000 : jobPay(distance),
      objectives: [
        { kind: 'goto', x: from.x, z: from.z, radius: 3.5, label: `Lấy ${item} ở ${from.place}`, place: from.place },
        { kind: 'goto', x: to.x, z: to.z, radius: 3.5, label: `Giao ${item} tới ${to.place}`, place: to.place },
      ],
      // Tính giờ từ lúc lấy hàng: chạy ~7 m/s đường chim bay + 45 s dư.
      timeLimit: Math.round(distance / 7 + 45),
      timerFrom: 1,
      late: 'half',
    };
  }

  /** Bảng kèo hiện tại: `count` kèo mới quanh người chơi. */
  offers(px: number, pz: number, count = 3): MissionDef[] {
    return Array.from({ length: count }, () => this.make(px, pz));
  }

  /** Tiền boa ngẫu nhiên khi giao sớm (0–10.000 đ). */
  tip(): number {
    return Math.round(range(this.rng, 0, 10)) * 1000;
  }
}
