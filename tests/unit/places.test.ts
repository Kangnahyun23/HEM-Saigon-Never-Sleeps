import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { cityPlaces } from '@/world/city/places';
import { generateCity } from '@/world/city/layout';

describe('nơi đặc biệt', () => {
  it('đồn công an và trạm y tế: hai lô khác nhau, chỗ đứng trên vỉa hè trước cửa, cùng seed cùng chỗ', () => {
    const city = generateCity();
    const p = cityPlaces(city);
    expect(p.police.lotId).not.toBe(p.clinic.lotId);
    for (const place of [p.police, p.clinic]) {
      const lot = city.lots.find((l) => l.id === place.lotId)!;
      const block = city.blocks[lot.blockId]!;
      // Trên vỉa hè: trong block nhưng ngoài phần đất xây nhà.
      expect(containsPoint(block.rect, place.x, place.z)).toBe(true);
      expect(containsPoint(block.inner, place.x, place.z)).toBe(false);
      // Quay mặt ra đường: bước về phía trước là xa nhà hơn.
      const cx = (lot.rect.x0 + lot.rect.x1) / 2;
      const cz = (lot.rect.z0 + lot.rect.z1) / 2;
      expect(Math.hypot(place.x + Math.sin(place.yaw) - cx, place.z + Math.cos(place.yaw) - cz)).toBeGreaterThan(Math.hypot(place.x - cx, place.z - cz));
    }
    expect(cityPlaces(generateCity())).toEqual(p);
  });
});
