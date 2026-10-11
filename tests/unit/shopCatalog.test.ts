import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/random';
import { Inventory, ITEMS } from '@/systems/inventory';
import { bargain, canBuy, CATALOG, finalPrice, isService, offerName, sellPrice, SERVICES } from '@/systems/shopCatalog';
import { SHOP_ORDER } from '@/world/city/shops';

describe('hàng hoá cửa hàng', () => {
  it('tiệm nào cũng có hàng, giá chẵn nghìn; đồ ăn rẻ hơn thuốc, vũ khí đắt hơn đồ ăn', () => {
    for (const kind of SHOP_ORDER) {
      expect(CATALOG[kind].length).toBeGreaterThan(0);
      for (const o of CATALOG[kind]) {
        expect(o.price % 1000).toBe(0);
        expect(offerName(o.id).length).toBeGreaterThan(2);
        if (!isService(o.id)) expect(ITEMS[o.id]).toBeDefined();
      }
    }
    const price = (kind: keyof typeof CATALOG, id: string) => CATALOG[kind].find((o) => o.id === id)!.price;
    expect(price('tapHoa', 'traDa')).toBeLessThan(price('nhaThuoc', 'thuocDo'));
    expect(price('camDo', 'gaySat')).toBeGreaterThan(price('comTam', 'comTam'));
    expect(Object.keys(SERVICES).length).toBe(4);
  });

  it('mặc cả: lúc được bớt 10–20 %, lúc không; giá sau mặc cả làm tròn nghìn', () => {
    const rng = createRng(5);
    const results = Array.from({ length: 200 }, () => bargain(rng));
    const ok = results.filter((r) => r.ok);
    expect(ok.length).toBeGreaterThan(70);
    expect(ok.length).toBeLessThan(150);
    for (const r of ok) {
      expect(r.discount).toBeGreaterThanOrEqual(0.1);
      expect(r.discount).toBeLessThanOrEqual(0.2);
    }
    for (const r of results.filter((x) => !x.ok)) expect(r.discount).toBe(0);
    expect(finalPrice(45_000, 0.15)).toBe(38_000);
    expect(finalPrice(5_000, 0)).toBe(5_000);
  });

  it('cầm đồ mua lại vũ khí 40 % giá, mòn thì rẻ hơn; đồ ăn không mua', () => {
    expect(sellPrice('maTau')).toBe(100_000);
    expect(sellPrice('maTau', ITEMS.maTau.durability / 2)).toBeLessThan(sellPrice('maTau'));
    expect(sellPrice('maTau', 0)).toBeGreaterThan(0);
    expect(sellPrice('banhMi')).toBe(0);
  });

  it('mua được khi đủ tiền, balo còn chỗ, nâng cấp chưa có', () => {
    const inv = new Inventory(12);
    const offer = CATALOG.tapHoa[0]!;
    expect(canBuy(offer, offer.price, 1000, inv, new Set())).toBe('no-money');
    expect(canBuy(offer, offer.price, 1_000_000, inv, new Set())).toBe('ok');
    for (let i = 0; i < 12; i++) inv.add('maTau');
    expect(canBuy(offer, offer.price, 1_000_000, inv, new Set())).toBe('full');
    const balo = CATALOG.quanAo.find((o) => o.id === 'balo16')!;
    expect(canBuy(balo, balo.price, 1_000_000, inv, new Set())).toBe('ok');
    inv.upgrade(16);
    expect(canBuy(balo, balo.price, 1_000_000, inv, new Set())).toBe('owned');
    const pro = CATALOG.dienThoai[0]!;
    expect(canBuy(pro, pro.price, 1_000_000, inv, new Set(['dienThoaiPro']))).toBe('owned');
  });
});
