import { describe, expect, it } from 'vitest';
import { FONT_FALLBACK, SIGN_FONTS, signFont, type SignFont } from '@/ui/fonts';

describe('font bảng hiệu', () => {
  it('chuỗi ctx.font đúng thứ tự: độ đậm, cỡ chữ, họ font (kể cả họ font có dấu cách), rồi font dự phòng', () => {
    expect(signFont('narrow', 40)).toBe(`700 40px "Barlow Condensed", ${FONT_FALLBACK}`);
    expect(signFont('condensed', 12)).toBe(`400 12px "Anton", ${FONT_FALLBACK}`);
  });

  it('mọi kiểu chữ đều có độ đậm và họ font', () => {
    for (const k of Object.keys(SIGN_FONTS) as SignFont[]) expect(signFont(k, 20)).toMatch(/^\d00 20px "[^"]+", /);
  });
});
