/**
 * Balo của Tín (thuần logic, có unit test): ô đồ có xếp chồng, nâng cấp balo lớn, dùng / vứt đồ, lưu được.
 * Đồ ăn / thuốc hồi máu; vũ khí (N5) không xếp chồng, có độ bền. Tên món đều đời thường Sài Gòn.
 */

export type ItemKind = 'food' | 'medicine' | 'weapon' | 'quest' | 'misc';

export interface ItemDef {
  readonly name: string;
  readonly kind: ItemKind;
  /** Tối đa mỗi ô. */
  readonly stack: number;
  /** Máu hồi khi dùng (0..100). */
  readonly heal?: number;
  /** Độ bền ban đầu (vũ khí). */
  readonly durability?: number;
  readonly desc: string;
  /** Màu biểu tượng trong balo. */
  readonly color: string;
}

export const ITEMS = {
  banhMi: { name: 'Bánh mì thịt', kind: 'food', stack: 5, heal: 20, desc: 'Bánh mì nóng giòn, pate, chả lụa. Hồi 20 máu.', color: '#d9a441' },
  comTam: { name: 'Cơm tấm sườn', kind: 'food', stack: 3, heal: 35, desc: 'Sườn nướng, bì, chả, mỡ hành. Hồi 35 máu.', color: '#c96b2c' },
  traDa: { name: 'Trà đá', kind: 'food', stack: 5, heal: 8, desc: 'Ly trà đá vỉa hè 3 nghìn. Hồi 8 máu.', color: '#a8692c' },
  caPheSua: { name: 'Cà phê sữa đá', kind: 'food', stack: 5, heal: 12, desc: 'Đậm, ngọt, tỉnh cả đêm. Hồi 12 máu.', color: '#6b4226' },
  bangCaNhan: { name: 'Băng cá nhân', kind: 'medicine', stack: 10, heal: 15, desc: 'Dán đỡ vết trầy. Hồi 15 máu.', color: '#e8b4a0' },
  thuocDo: { name: 'Thuốc đỏ + bông băng', kind: 'medicine', stack: 5, heal: 40, desc: 'Sát trùng, băng bó tử tế. Hồi 40 máu.', color: '#c0392b' },
  maTau: { name: 'Mã tấu', kind: 'weapon', stack: 1, durability: 60, desc: 'Lưỡi dài, chém mạnh nhưng chậm.', color: '#9aa1a6' },
  gaySat: { name: 'Gậy sắt', kind: 'weapon', stack: 1, durability: 90, desc: 'Ống tuýp sắt — bền, đánh choáng.', color: '#6b7280' },
  daoBam: { name: 'Dao bấm', kind: 'weapon', stack: 1, durability: 40, desc: 'Nhỏ, nhanh, tầm ngắn.', color: '#4b5563' },
  conNhiKhuc: { name: 'Côn nhị khúc', kind: 'weapon', stack: 1, durability: 70, desc: 'Xoay nhanh, khó dùng.', color: '#8b5a2b' },
  gheNhua: { name: 'Ghế nhựa', kind: 'weapon', stack: 1, durability: 4, desc: 'Ghế đẩu quán cóc. Đập 3–4 phát là vỡ — vũ khí truyền thống của mọi vụ ẩu đả vỉa hè.', color: '#d8342c' },
  muBaoHiem: { name: 'Mũ bảo hiểm', kind: 'weapon', stack: 1, durability: 18, desc: 'Loại "thời trang" 35 nghìn: đội thì không đỡ được gì, cầm đập thì hơi đau.', color: '#e7c22d' },
  goiHang: { name: 'Gói hàng giao', kind: 'quest', stack: 3, desc: 'Hàng của khách — đừng làm rơi.', color: '#ff8c1a' },
  giayToXe: { name: 'Giấy tờ xe', kind: 'misc', stack: 1, desc: 'Cà vẹt + bằng lái. Gặp công an thì cần.', color: '#3b82f6' },
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export interface InvSlot {
  id: ItemId;
  count: number;
  /** Còn bao nhiêu độ bền (vũ khí). */
  durability?: number;
}

/** Các cỡ balo: balo giao hàng mặc định → balo du lịch → balo phượt. */
export const BACKPACK_SIZES = [12, 16, 24] as const;

const isItemId = (v: unknown): v is ItemId => typeof v === 'string' && Object.hasOwn(ITEMS, v);

export class Inventory {
  slots: Array<InvSlot | null>;

  constructor(capacity: number = BACKPACK_SIZES[0]) {
    this.slots = new Array<InvSlot | null>(capacity).fill(null);
  }

  get capacity(): number {
    return this.slots.length;
  }

  /** Thêm `count` món: dồn vào ô cùng loại còn chỗ trước, rồi ô trống. Trả số món không còn chỗ chứa. */
  add(id: ItemId, count = 1): number {
    const def: ItemDef = ITEMS[id];
    let left = count;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.count < def.stack) {
        const n = Math.min(left, def.stack - s.count);
        s.count += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(left, def.stack);
      this.slots[i] = def.durability !== undefined ? { id, count: n, durability: def.durability } : { id, count: n };
      left -= n;
    }
    return left;
  }

  /** Tổng số món loại `id`. */
  count(id: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s?.id === id) n += s.count;
    return n;
  }

  /** Bớt `count` món ở ô `index` (vứt / dùng). Trả về ô sau khi bớt (null nếu ô trống hẳn). */
  remove(index: number, count = 1): InvSlot | null {
    const s = this.slots[index];
    if (!s) return null;
    s.count -= Math.min(count, s.count);
    if (s.count <= 0) this.slots[index] = null;
    return this.slots[index] ?? null;
  }

  /** Bỏ hẳn một loại đồ (ví dụ giao xong gói hàng). Trả số món đã bỏ. */
  removeAll(id: ItemId): number {
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s?.id !== id) continue;
      n += s.count;
      this.slots[i] = null;
    }
    return n;
  }

  /**
   * Dùng món ở ô `index`: đồ ăn / thuốc bị tiêu hao và trả về định nghĩa (nơi gọi hồi máu theo `heal`);
   * vũ khí / đồ nhiệm vụ không "dùng" kiểu này ⇒ null.
   */
  use(index: number): ItemDef | null {
    const s = this.slots[index];
    if (!s) return null;
    const def: ItemDef = ITEMS[s.id];
    if (def.kind !== 'food' && def.kind !== 'medicine') return null;
    this.remove(index, 1);
    return def;
  }

  /** Nâng cấp balo (chỉ tăng, giữ nguyên đồ). */
  upgrade(capacity: number): boolean {
    if (capacity <= this.capacity) return false;
    while (this.slots.length < capacity) this.slots.push(null);
    return true;
  }

  toJSON(): { capacity: number; slots: Array<InvSlot | null> } {
    return { capacity: this.capacity, slots: this.slots.map((s) => (s ? { ...s } : null)) };
  }

  /** Đọc từ bản lưu; dữ liệu hỏng / món lạ thì bỏ qua từng ô (không hỏng cả balo). */
  static fromJSON(data: unknown): Inventory {
    const d = (typeof data === 'object' && data !== null ? data : {}) as { capacity?: unknown; slots?: unknown };
    const cap = typeof d.capacity === 'number' && (BACKPACK_SIZES as readonly number[]).includes(d.capacity) ? d.capacity : BACKPACK_SIZES[0];
    const inv = new Inventory(cap);
    if (!Array.isArray(d.slots)) return inv;
    d.slots.slice(0, cap).forEach((raw: unknown, i) => {
      const s = (typeof raw === 'object' && raw !== null ? raw : {}) as { id?: unknown; count?: unknown; durability?: unknown };
      if (!isItemId(s.id) || typeof s.count !== 'number' || !Number.isFinite(s.count)) return;
      const def: ItemDef = ITEMS[s.id];
      const count = Math.max(1, Math.min(def.stack, Math.floor(s.count)));
      const slot: InvSlot = { id: s.id, count };
      if (def.durability !== undefined) slot.durability = typeof s.durability === 'number' ? Math.max(0, Math.min(def.durability, s.durability)) : def.durability;
      inv.slots[i] = slot;
    });
    return inv;
  }
}

/** Đồ trong balo lúc bắt đầu chơi mới. */
export function starterInventory(): Inventory {
  const inv = new Inventory();
  inv.add('banhMi', 2);
  inv.add('traDa', 1);
  inv.add('bangCaNhan', 2);
  inv.add('giayToXe', 1);
  return inv;
}
