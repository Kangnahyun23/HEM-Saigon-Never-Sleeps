import { FLOOR_HEIGHT, type CityLayout, type Dir, type Lot } from './layout';

/**
 * Cửa hàng vào được (thuần logic, có unit test): chọn vài lô nhà phố mặt đường gần chỗ xuất phát, mỗi lô một loại tiệm;
 * tầng trệt thành một phòng thật mở thẳng ra phố (sàn, tường, trần, quầy, kệ, chủ tiệm). Cùng seed thì cùng chỗ.
 */

export type ShopKind = 'tapHoa' | 'camDo' | 'comTam' | 'nhaThuoc' | 'quanAo' | 'dienThoai';

export interface ShopType {
  /** Tên trên bảng hiệu (chữ hoa). */
  readonly name: string;
  /** Tên hiện trên HUD khi đứng trong tiệm. */
  readonly title: string;
  /** Dòng phụ trên bảng hiệu. */
  readonly tagline: string;
  /** Màu chủ đạo (bảng hiệu, sơn tường trong tiệm). */
  readonly color: string;
  readonly wall: string;
}

export const SHOP_TYPES: Record<ShopKind, ShopType> = {
  tapHoa: { name: 'TẠP HÓA BA BỐN', title: 'Tạp hóa Ba Bốn', tagline: 'Thẻ cào · Nước ngọt · Mì gói', color: '#1f7a3a', wall: '#e9e2c8' },
  camDo: { name: 'CẦM ĐỒ PHÁT LỘC', title: 'Cầm đồ Phát Lộc', tagline: 'Cầm xe · Điện thoại · Đồ cũ', color: '#8a1c1c', wall: '#d8cdb8' },
  comTam: { name: 'CƠM TẤM CÔ BA', title: 'Cơm tấm Cô Ba', tagline: 'Sườn bì chả · Mở tới khuya', color: '#c4561b', wall: '#f0dfc0' },
  nhaThuoc: { name: 'NHÀ THUỐC TÂM AN', title: 'Nhà thuốc Tâm An', tagline: 'Thuốc tây · Băng gạc', color: '#1b6fb3', wall: '#e8f0f4' },
  quanAo: { name: 'SHOP THỜI TRANG VY', title: 'Shop thời trang Vy', tagline: 'Quần áo · Mũ bảo hiểm', color: '#b0306f', wall: '#f3e3ec' },
  dienThoai: { name: 'ĐIỆN THOẠI 5 SAO', title: 'Điện thoại 5 Sao', tagline: 'Sửa máy · Nâng cấp · Phụ kiện', color: '#2d3f8a', wall: '#e2e6f0' },
};

export const SHOP_ORDER: readonly ShopKind[] = ['tapHoa', 'comTam', 'nhaThuoc', 'camDo', 'quanAo', 'dienThoai'];

export interface Shop {
  readonly id: number;
  readonly kind: ShopKind;
  readonly lotId: number;
  /** Gốc phòng: giữa chân mặt tiền (toạ độ thế giới). Hệ cục bộ: x dọc mặt tiền, z hướng ra đường (vào trong là −z). */
  readonly ox: number;
  readonly oz: number;
  readonly yaw: number;
  /** Bề ngang mặt tiền (m), chiều sâu phòng (m), chiều cao tầng trệt (m). */
  readonly width: number;
  readonly depth: number;
  readonly height: number;
}

/** Chiều sâu phòng tối đa / phần nhà phía sau tối thiểu (m). */
export const ROOM_DEPTH = 7;
const MIN_BACK = 3;
const MIN_GAP = 25;

const yawFor = (d: Dir): number => (d === '+z' ? 0 : d === '-z' ? Math.PI : d === '+x' ? Math.PI / 2 : -Math.PI / 2);

/** Hệ mặt tiền của lô: gốc giữa chân mặt tiền, bề ngang mặt tiền, chiều sâu thân nhà. */
export function lotFrame(l: Lot): { ox: number; oz: number; yaw: number; faceW: number; bodyD: number } {
  const r = l.rect;
  const alongX = l.front.endsWith('z');
  const plus = l.front.startsWith('+');
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  return {
    ox: alongX ? cx : plus ? r.x1 : r.x0,
    oz: alongX ? (plus ? r.z1 : r.z0) : cz,
    yaw: yawFor(l.front),
    faceW: alongX ? r.x1 - r.x0 : r.z1 - r.z0,
    bodyD: alongX ? r.z1 - r.z0 : r.x1 - r.x0,
  };
}

/** Lô dùng được làm cửa hàng: nhà phố / nhà mặt đường lớn, mặt tiền 3,8–7 m, đủ sâu. */
export function shopCandidate(l: Lot): boolean {
  if (l.row !== 'front' || l.frontage === 'hem' || l.kind === 'tower' || l.blockId < 0) return false;
  const f = lotFrame(l);
  return f.faceW >= 3.8 && f.faceW <= 7 && f.bodyD >= ROOM_DEPTH * 0.6 + MIN_BACK;
}

/**
 * Chọn tiệm: lô hợp lệ gần chỗ xuất phát nhất, cách các tiệm đã chọn ít nhất MIN_GAP mét, bỏ qua các lô trong `exclude`
 * (đồn công an, trạm y tế…). Mỗi loại tiệm một lô theo SHOP_ORDER.
 */
export function selectShops(layout: CityLayout, exclude: ReadonlySet<number> = new Set()): Shop[] {
  const { spawn } = layout;
  const pool = layout.lots
    .filter((l) => shopCandidate(l) && !exclude.has(l.id))
    .map((l) => ({ l, f: lotFrame(l) }))
    .sort((a, b) => Math.hypot(a.f.ox - spawn.x, a.f.oz - spawn.z) - Math.hypot(b.f.ox - spawn.x, b.f.oz - spawn.z) || a.l.id - b.l.id);
  const out: Shop[] = [];
  for (const { l, f } of pool) {
    if (out.length >= SHOP_ORDER.length) break;
    if (out.some((s) => Math.hypot(s.ox - f.ox, s.oz - f.oz) < MIN_GAP)) continue;
    out.push({
      id: out.length,
      kind: SHOP_ORDER[out.length]!,
      lotId: l.id,
      ox: f.ox,
      oz: f.oz,
      yaw: f.yaw,
      width: f.faceW,
      depth: Math.min(ROOM_DEPTH, f.bodyD - MIN_BACK),
      height: FLOOR_HEIGHT,
    });
  }
  return out;
}

/**
 * Điểm (x, z) có ở trong phòng của tiệm không (cách mép mặt tiền vào trong 0,1 m trở vào). `front` > 0: tính cả dải
 * vỉa hè trước cửa rộng ngần ấy mét (camera trong nhà bật sớm khi đi vào).
 */
export function insideShop(s: Shop, x: number, z: number, front = -0.1): boolean {
  const dx = x - s.ox;
  const dz = z - s.oz;
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  // Toạ độ cục bộ: dọc mặt tiền = (cos, −sin), ra đường = (sin, cos).
  const along = dx * c - dz * sn;
  const out = dx * sn + dz * c;
  return Math.abs(along) < s.width / 2 && out < front && out > -s.depth;
}
