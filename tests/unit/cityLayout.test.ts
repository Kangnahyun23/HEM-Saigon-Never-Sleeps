import { describe, expect, it } from 'vitest';
import { containsRect, overlaps } from '@/core/rect';
import { generateCity, type CityLayout } from '@/world/city/layout';

const city: CityLayout = generateCity();

describe('generateCity', () => {
  it('cùng seed → cùng bố cục', () => {
    const again = generateCity();
    expect(again.lots.length).toBe(city.lots.length);
    expect(JSON.stringify(again.lots.slice(0, 50))).toBe(JSON.stringify(city.lots.slice(0, 50)));
    expect(generateCity({ seed: 7 }).lots.length).not.toBe(0);
  });

  it('có đủ thành phần: đường, block, hẻm, nhà, chợ, công viên, cột điện, cây, xe đậu', () => {
    expect(city.roads.filter((r) => r.kind === 'avenue').length).toBe(2);
    expect(city.blocks.length).toBeGreaterThanOrEqual(12);
    expect(city.hems.filter((h) => h.kind === 'main').length).toBeGreaterThan(8);
    expect(city.hems.filter((h) => h.kind === 'branch').length).toBeGreaterThan(10);
    expect(city.lots.length).toBeGreaterThan(800);
    expect(city.blocks.filter((b) => b.kind === 'market')).toHaveLength(1);
    expect(city.blocks.filter((b) => b.kind === 'park')).toHaveLength(1);
    expect(city.poles.length).toBeGreaterThan(100);
    expect(city.wires.length).toBeGreaterThan(300);
    expect(city.trees.length).toBeGreaterThan(100);
    expect(city.bikes.length).toBeGreaterThan(50);
  });

  it('không có hai lô nhà chồng lên nhau', () => {
    const lots = city.lots;
    for (let i = 0; i < lots.length; i++) {
      for (let j = i + 1; j < lots.length; j++) {
        const a = lots[i]!.rect;
        const b = lots[j]!.rect;
        if (Math.abs(a.x0 - b.x0) > 40 || Math.abs(a.z0 - b.z0) > 40) continue;
        expect(overlaps(a, b, 1e-3), `lô ${i} đè lô ${j}`).toBe(false);
      }
    }
  });

  it('không lô nào đè lên đường hay hẻm', () => {
    for (const lot of city.lots) {
      for (const road of city.roads) expect(overlaps(lot.rect, road.rect, 1e-3)).toBe(false);
      for (const hem of city.hems) expect(overlaps(lot.rect, hem.rect, 1e-3), `lô ${lot.id} đè hẻm ${hem.id}`).toBe(false);
    }
  });

  it('nhà trong block nằm gọn trong phần đất xây dựng', () => {
    for (const lot of city.lots) {
      if (lot.blockId < 0) continue;
      const block = city.blocks[lot.blockId]!;
      expect(containsRect(block.inner, lot.rect, 1e-3)).toBe(true);
    }
  });

  it('hẻm chính thông ra đường ở cả hai đầu; hẻm nhánh nối vào hẻm chính', () => {
    for (const hem of city.hems) {
      const block = city.blocks[hem.blockId]!;
      if (hem.kind === 'main') {
        const r = hem.rect;
        const b = block.rect;
        if (hem.axis === 'x') expect([r.x0, r.x1]).toEqual([b.x0, b.x1]);
        else expect([r.z0, r.z1]).toEqual([b.z0, b.z1]);
      } else {
        const main = city.hems.find((h) => h.blockId === hem.blockId && h.kind === 'main')!;
        const touches = overlaps(hem.rect, main.rect, -0.01);
        expect(touches, `hẻm nhánh ${hem.id} không chạm hẻm chính`).toBe(true);
      }
    }
  });

  it('chiều cao nhà hợp lý và có nhà cao tầng trên đại lộ', () => {
    for (const lot of city.lots) {
      expect(lot.floors).toBeGreaterThanOrEqual(1);
      expect(lot.floors).toBeLessThanOrEqual(18);
      expect(lot.height).toBeGreaterThan(lot.floors * 3);
    }
    expect(city.lots.some((l) => l.kind === 'tower')).toBe(true);
    const hemHouses = city.lots.filter((l) => l.frontage === 'hem');
    expect(Math.max(...hemHouses.map((l) => l.floors))).toBeLessThanOrEqual(4);
  });

  it('cây, cột điện, xe đậu không nằm trong nhà hay giữa lòng đường', () => {
    const inLot = (x: number, z: number) => city.lots.some((l) => x > l.rect.x0 && x < l.rect.x1 && z > l.rect.z0 && z < l.rect.z1);
    const inRoad = (x: number, z: number) => city.roads.some((r) => x > r.rect.x0 && x < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1);
    for (const p of [...city.poles, ...city.trees, ...city.bikes]) {
      expect(inLot(p.x, p.z)).toBe(false);
    }
    for (const p of [...city.trees, ...city.bikes]) expect(inRoad(p.x, p.z)).toBe(false);
  });

  it('điểm xuất phát nằm trên vỉa hè trống, trong vùng chơi', () => {
    const { x, z } = city.spawn;
    expect(x).toBeGreaterThan(city.playArea.x0);
    expect(x).toBeLessThan(city.playArea.x1);
    expect(z).toBeGreaterThan(city.playArea.z0);
    expect(z).toBeLessThan(city.playArea.z1);
    expect(city.lots.some((l) => x > l.rect.x0 && x < l.rect.x1 && z > l.rect.z0 && z < l.rect.z1)).toBe(false);
  });
});
