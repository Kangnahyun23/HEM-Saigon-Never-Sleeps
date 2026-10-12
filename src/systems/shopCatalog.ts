import type { Rng } from '@/core/random';
import type { ShopKind } from '@/world/city/shops';
import { ITEMS, type Inventory, type ItemDef, type ItemId } from './inventory';

/**
 * Hàng hoá + giá của các cửa hàng vào được, mặc cả, bán đồ ở tiệm cầm đồ (thuần logic, có unit test).
 * Giá theo đời sống Sài Gòn (kèo giao hàng ~50.000 đ, nhiệm vụ 150–650 nghìn) — đồ ăn rẻ, vũ khí / nâng cấp đắt.
 */

/** Món không phải đồ trong balo: nâng cấp balo, điện thoại, đổi đồ cho công an khó nhận ra. */
export type Service = 'balo16' | 'balo24' | 'dienThoaiPro' | 'doiDo';

export interface Offer {
  readonly id: ItemId | Service;
  readonly price: number;
}

export interface ServiceDef {
  readonly name: string;
  readonly desc: string;
  readonly color: string;
}

export const SERVICES: Record<Service, ServiceDef> = {
  balo16: { name: 'Balo du lịch (16 ô)', desc: 'Rộng hơn balo giao hàng — đồ cũ chuyển sang hết.', color: '#3f6fa8' },
  balo24: { name: 'Balo phượt (24 ô)', desc: 'Balo to nhất: nhét được cả gánh hàng rong.', color: '#2f5d3a' },
  dienThoaiPro: { name: 'Nâng cấp Sầu Riêng S9 Pro', desc: 'Camera nét hơn, máy lưu được 12 ảnh, hình nền mới.', color: '#2d3f8a' },
  doiDo: { name: 'Bộ đồ mới (áo khoác + nón)', desc: 'Thay đồ ngay trong tiệm: đang bị truy nã thì công an khó nhận ra hơn.', color: '#b0306f' },
};

export const CATALOG: Record<ShopKind, readonly Offer[]> = {
  tapHoa: [
    { id: 'traDa', price: 5_000 },
    { id: 'caPheSua', price: 20_000 },
    { id: 'banhMi', price: 20_000 },
    { id: 'bangCaNhan', price: 15_000 },
  ],
  comTam: [
    { id: 'comTam', price: 45_000 },
    { id: 'traDa', price: 5_000 },
    { id: 'caPheSua', price: 22_000 },
  ],
  nhaThuoc: [
    { id: 'bangCaNhan', price: 12_000 },
    { id: 'thuocDo', price: 60_000 },
  ],
  camDo: [
    { id: 'gaySat', price: 120_000 },
    { id: 'conNhiKhuc', price: 150_000 },
    { id: 'daoBam', price: 180_000 },
    { id: 'maTau', price: 250_000 },
  ],
  quanAo: [
    { id: 'muBaoHiem', price: 35_000 },
    { id: 'doiDo', price: 120_000 },
    { id: 'balo16', price: 250_000 },
    { id: 'balo24', price: 600_000 },
  ],
  dienThoai: [{ id: 'dienThoaiPro', price: 500_000 }],
};

/** Lời chào của chủ tiệm (đọc khi mở bảng hàng). */
export const GREETINGS: Record<ShopKind, string> = {
  tapHoa: 'Mua gì con? Thẻ cào hết mệnh giá nhỏ rồi nha.',
  comTam: 'Sườn mới nướng nè, ăn một dĩa cho có sức chạy kèo.',
  nhaThuoc: 'Trầy chỗ nào? Băng đỡ đi rồi về nhà sát trùng kỹ.',
  camDo: 'Đồ ở đây "không rõ nguồn gốc" nhưng giá mềm. Có gì cần bán không?',
  quanAo: 'Đồ mới về nè anh, mặc vô là khác người liền.',
  dienThoai: 'Máy cũ rồi, lên đời đi anh, trả góp app Vay Liền 5S cũng được.',
};

export const isService = (id: ItemId | Service): id is Service => Object.hasOwn(SERVICES, id);

export function offerName(id: ItemId | Service): string {
  return isService(id) ? SERVICES[id].name : ITEMS[id].name;
}

/** Giá sau mặc cả (`discount` 0..1), làm tròn nghìn. */
export function finalPrice(price: number, discount: number): number {
  return Math.max(1000, Math.round((price * (1 - discount)) / 1000) * 1000);
}

/**
 * Mặc cả một lần mỗi lần ghé tiệm: 55 % được bớt 10–20 %, còn lại chủ tiệm không bớt (lần ghé sau thử lại).
 */
export function bargain(rng: Rng): { discount: number; ok: boolean } {
  if (rng() < 0.55) return { ok: true, discount: Math.round((0.1 + rng() * 0.1) * 100) / 100 };
  return { ok: false, discount: 0 };
}

/** Tiệm cầm đồ mua lại vũ khí: 40 % giá bán, theo độ bền còn lại. Món không mua thì 0. */
export function sellPrice(id: ItemId, durability?: number): number {
  const offer = CATALOG.camDo.find((o) => o.id === id);
  if (!offer) return 0;
  const def: ItemDef = ITEMS[id];
  const wear = def.durability && durability !== undefined ? Math.max(0, Math.min(1, durability / def.durability)) : 1;
  return Math.max(1000, Math.round((offer.price * 0.4 * (0.3 + 0.7 * wear)) / 1000) * 1000);
}

export type BuyResult = 'ok' | 'no-money' | 'full' | 'owned';

/**
 * Có mua được không (chưa trừ tiền / thêm đồ — nơi gọi làm sau khi 'ok'): đủ tiền, balo còn chỗ, nâng cấp chưa có.
 * `owned`: các nâng cấp đã mua (điện thoại Pro…).
 */
export function canBuy(offer: Offer, cost: number, cash: number, inv: Inventory, owned: ReadonlySet<Service>): BuyResult {
  if (cash < cost) return 'no-money';
  if (isService(offer.id)) {
    if (offer.id === 'balo16' && inv.capacity >= 16) return 'owned';
    if (offer.id === 'balo24' && inv.capacity >= 24) return 'owned';
    if (offer.id === 'dienThoaiPro' && owned.has('dienThoaiPro')) return 'owned';
    return 'ok';
  }
  const def: ItemDef = ITEMS[offer.id];
  const free = inv.slots.some((s) => s === null || (s.id === offer.id && s.count < def.stack));
  return free ? 'ok' : 'full';
}
