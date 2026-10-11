import { describe, expect, it } from 'vitest';
import { BACKPACK_SIZES, Inventory, ITEMS, starterInventory } from '@/systems/inventory';

describe('balo', () => {
  it('xếp chồng theo giới hạn từng món, tràn sang ô trống; đầy thì trả lại số không chứa được', () => {
    const inv = new Inventory(2);
    expect(inv.add('banhMi', 7)).toBe(0); // 5 + 2
    expect(inv.slots.map((s) => s?.count)).toEqual([5, 2]);
    expect(inv.add('banhMi', 4)).toBe(1); // ô 2 còn chỗ 3
    expect(inv.count('banhMi')).toBe(10);
    expect(inv.add('traDa', 1)).toBe(1); // hết ô
  });

  it('vũ khí không xếp chồng, có độ bền ban đầu', () => {
    const inv = new Inventory(3);
    inv.add('maTau', 2);
    expect(inv.slots.filter((s) => s?.id === 'maTau')).toHaveLength(2);
    expect(inv.slots[0]!.durability).toBe(ITEMS.maTau.durability);
  });

  it('dùng đồ ăn / thuốc thì tiêu hao và trả lượng máu hồi; vũ khí, đồ nhiệm vụ không dùng kiểu này', () => {
    const inv = new Inventory(4);
    inv.add('comTam', 1);
    inv.add('maTau', 1);
    inv.add('goiHang', 1);
    expect(inv.use(0)?.heal).toBe(35);
    expect(inv.slots[0]).toBeNull();
    expect(inv.use(1)).toBeNull();
    expect(inv.use(2)).toBeNull();
    expect(inv.use(3)).toBeNull();
  });

  it('vứt bớt / bỏ hẳn một loại', () => {
    const inv = new Inventory(4);
    inv.add('traDa', 3);
    inv.add('goiHang', 2);
    expect(inv.remove(0, 2)?.count).toBe(1);
    expect(inv.removeAll('goiHang')).toBe(2);
    expect(inv.count('goiHang')).toBe(0);
  });

  it('nâng cấp balo chỉ tăng chỗ, giữ đồ', () => {
    const inv = starterInventory();
    const before = inv.toJSON().slots.filter(Boolean);
    expect(inv.upgrade(BACKPACK_SIZES[1])).toBe(true);
    expect(inv.capacity).toBe(16);
    expect(inv.upgrade(12)).toBe(false);
    expect(inv.toJSON().slots.filter(Boolean)).toEqual(before);
  });

  it('lưu / đọc lại y nguyên; dữ liệu hỏng thì bỏ từng ô hỏng, không hỏng cả balo', () => {
    const inv = starterInventory();
    inv.add('gaySat', 1);
    expect(Inventory.fromJSON(JSON.parse(JSON.stringify(inv.toJSON()))).toJSON()).toEqual(inv.toJSON());
    const bad = Inventory.fromJSON({ capacity: 999, slots: [{ id: 'banhMi', count: 99 }, { id: 'boom', count: 1 }, null, 'x', { id: 'maTau', count: 1, durability: -5 }] });
    expect(bad.capacity).toBe(12);
    expect(bad.slots[0]).toEqual({ id: 'banhMi', count: 5 });
    expect(bad.slots[1]).toBeNull();
    expect(bad.slots[4]).toEqual({ id: 'maTau', count: 1, durability: 0 });
    expect(Inventory.fromJSON(null).capacity).toBe(12);
  });
});
