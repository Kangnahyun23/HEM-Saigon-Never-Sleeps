import { describe, expect, it } from 'vitest';
import { Inventory } from '@/systems/inventory';
import { buildWheel, sectorAt, WHEEL_SLOTS } from '@/systems/wheel';

describe('vòng chọn đồ', () => {
  it('luôn có tay không; mỗi loại vũ khí một ô; món ăn / thuốc hồi nhiều nhất', () => {
    const inv = new Inventory(12);
    inv.add('maTau', 2);
    inv.add('gaySat', 1);
    inv.add('traDa', 3);
    inv.add('comTam', 1);
    inv.add('bangCaNhan', 2);
    inv.add('goiHang', 1);
    const w = buildWheel(inv);
    expect(w.map((e) => e.label)).toEqual(['Tay không', 'Mã tấu', 'Gậy sắt', 'Cơm tấm sườn', 'Băng cá nhân']);
    expect(w[1]).toMatchObject({ kind: 'weapon', count: 2 });
    expect(buildWheel(new Inventory(12)).map((e) => e.kind)).toEqual(['hand']);
    expect(w.length).toBeLessThanOrEqual(WHEEL_SLOTS);
  });

  it('chọn ô theo hướng rê chuột: đỉnh = ô 0, theo chiều kim đồng hồ; vùng chết giữ ô cũ', () => {
    expect(sectorAt(0, -100, 4, 2)).toBe(0); // lên
    expect(sectorAt(100, 0, 4, 2)).toBe(1); // phải
    expect(sectorAt(0, 100, 4, 0)).toBe(2); // xuống
    expect(sectorAt(-100, 0, 4, 0)).toBe(3); // trái
    expect(sectorAt(5, 5, 4, 3)).toBe(3); // vùng chết
    expect(sectorAt(70, -70, 8, 0)).toBe(1); // chéo phải-trên
    expect(sectorAt(1, 1, 0, 0)).toBe(-1);
  });
});
