import { describe, expect, it } from 'vitest';
import { clothWeight, GANG_CLOTHES, POLICE_UNIFORM, recolor, type Outfit } from '@/assets/outfits';

type Rgb = readonly [number, number, number];

/** Đổi màu một điểm ảnh, trả [r, g, b]. */
function shade(rgb: Rgb, outfit: Outfit): [number, number, number] {
  const data = new Uint8ClampedArray([rgb[0], rgb[1], rgb[2], 255]);
  recolor(data, outfit);
  expect(data[3]).toBe(255);
  return [data[0]!, data[1]!, data[2]!];
}

/** Hai màu lệch nhau không quá `tol` ở mọi kênh. */
function near(a: Rgb, b: Rgb, tol: number): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k]! - b[k]!)).toBeLessThanOrEqual(tol);
}

// Màu lấy từ ảnh màu thật của các mẫu người (CC0, Mesh2Motion).
const NAVY = [31, 33, 51] as const;
/** Ô nén 8×8 trong vùng đồng phục: gần như xám, hết sắc xanh. */
const NAVY_GREYISH = [30, 30, 32] as const;
const NAVY_BRIGHT = [62, 66, 98] as const;
const SKIN = [217, 166, 128] as const;
const SKIN_PALE = [240, 205, 180] as const;
const HAIR = [70, 50, 38] as const;
const SHIRT_BLUE = [180, 200, 230] as const;
const POLO_GREY = [140, 140, 142] as const;
const JEANS = [70, 100, 150] as const;

describe('trang phục nướng vào ảnh màu nhân vật', () => {
  it('công an: đồng phục xanh đen thành xanh ô-liu, giữ nếp vải (vải sáng hơn ⇒ màu mới sáng hơn)', () => {
    const [r, g, b] = shade(NAVY, POLICE_UNIFORM);
    // Ô-liu: lục trội nhất, xanh dương thấp nhất.
    expect(g).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(b);
    expect(Math.abs(g - POLICE_UNIFORM.color[1])).toBeLessThan(15);
    const bright = shade(NAVY_BRIGHT, POLICE_UNIFORM);
    expect(bright[1]).toBeGreaterThan(g + 20);
    expect(bright[1]).toBeGreaterThan(bright[2]);
  });

  it('công an: ô nén gần xám giữa vùng đồng phục cũng thành ô-liu gần như cùng màu (không loang lổ)', () => {
    near(shade(NAVY_GREYISH, POLICE_UNIFORM), shade(NAVY, POLICE_UNIFORM), 12);
  });

  it('da và tóc nâu giữ nguyên với mọi trang phục', () => {
    for (const outfit of [POLICE_UNIFORM, GANG_CLOTHES]) {
      for (const c of [SKIN, SKIN_PALE]) expect(shade(c, outfit)).toEqual([...c]);
      near(shade(HAIR, outfit), HAIR, 4);
    }
  });

  it('đàn em: áo sơ mi xanh, áo polo xám, quần jean thành đồ đen', () => {
    for (const c of [SHIRT_BLUE, POLO_GREY, JEANS]) {
      for (const v of shade(c, GANG_CLOTHES)) expect(v).toBeLessThan(65);
    }
  });

  it('mặt nạ chuyển dần giữa vải và da (không có ranh giới gắt)', () => {
    expect(clothWeight(NAVY[0], NAVY[2])).toBe(1);
    expect(clothWeight(POLO_GREY[0], POLO_GREY[2])).toBe(1);
    expect(clothWeight(SKIN[0], SKIN[2])).toBe(0);
    const mid = clothWeight(120, 98);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});
