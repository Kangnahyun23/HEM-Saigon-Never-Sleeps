import { describe, expect, it } from 'vitest';
import { FONT_FALLBACK, SIGN_FONTS, signFont, type SignFont } from '@/ui/fonts';
import { SHOP_SIGNS, signStyle } from '@/world/city/signs';

describe('font bảng hiệu', () => {
  it('chuỗi ctx.font đúng thứ tự: độ đậm, cỡ chữ, họ font (kể cả họ font có dấu cách), rồi font dự phòng', () => {
    expect(signFont('narrow', 40)).toBe(`700 40px "Barlow Condensed", ${FONT_FALLBACK}`);
    expect(signFont('condensed', 12)).toBe(`400 12px "Anton", ${FONT_FALLBACK}`);
  });

  it('quán ăn dùng chữ vẽ tay / chữ đứng, quán đêm dùng chữ khối / neon, mọi bảng đều có kiểu hợp lệ', () => {
    expect(['brush', 'condensed']).toContain(signStyle('CƠM TẤM', 2));
    expect(['neon', 'block']).toContain(signStyle('KARAOKE', 7));
    SHOP_SIGNS.forEach(([text], i) => expect(Object.keys(SIGN_FONTS)).toContain(signStyle(text, i) satisfies SignFont));
  });
});
