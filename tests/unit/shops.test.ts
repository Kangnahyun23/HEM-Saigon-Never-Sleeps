import { describe, expect, it } from 'vitest';
import { generateCity } from '@/world/city/layout';
import { cityPlaces } from '@/world/city/places';
import { insideShop, lotFrame, ROOM_DEPTH, selectShops, SHOP_ORDER, SHOP_TYPES } from '@/world/city/shops';

const city = generateCity();

describe('cửa hàng vào được', () => {
  it('đủ mỗi loại một tiệm, lô nhà phố mặt đường, cách nhau xa, không trùng đồn / trạm y tế', () => {
    const places = cityPlaces(city);
    const shops = selectShops(city, new Set([places.police.lotId, places.clinic.lotId]));
    expect(shops.map((s) => s.kind)).toEqual(SHOP_ORDER);
    for (const s of shops) {
      const lot = city.lots.find((l) => l.id === s.lotId)!;
      expect(lot.frontage).not.toBe('hem');
      expect(lot.row).toBe('front');
      expect([places.police.lotId, places.clinic.lotId]).not.toContain(s.lotId);
      expect(s.depth).toBeGreaterThan(3.5);
      expect(s.depth).toBeLessThanOrEqual(ROOM_DEPTH);
      expect(lotFrame(lot).bodyD - s.depth).toBeGreaterThanOrEqual(3);
      expect(SHOP_TYPES[s.kind].name.length).toBeGreaterThan(3);
    }
    for (let i = 0; i < shops.length; i++)
      for (let j = i + 1; j < shops.length; j++) expect(Math.hypot(shops[i]!.ox - shops[j]!.ox, shops[i]!.oz - shops[j]!.oz)).toBeGreaterThanOrEqual(25);
    expect(selectShops(generateCity(), new Set([places.police.lotId, places.clinic.lotId]))).toEqual(shops);
  });

  it('trong phòng: lùi vào sau mặt tiền, trong bề ngang; ngoài vỉa hè thì không', () => {
    const s = selectShops(city)[0]!;
    const inX = s.ox - Math.sin(s.yaw) * (s.depth / 2);
    const inZ = s.oz - Math.cos(s.yaw) * (s.depth / 2);
    expect(insideShop(s, inX, inZ)).toBe(true);
    expect(insideShop(s, s.ox + Math.sin(s.yaw) * 1.5, s.oz + Math.cos(s.yaw) * 1.5)).toBe(false);
    expect(insideShop(s, inX + Math.cos(s.yaw) * s.width, inZ - Math.sin(s.yaw) * s.width)).toBe(false);
  });
});
