import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/random';
import {
  ATLAS_SIZE,
  BANNERS,
  cellUv,
  designBanner,
  designShopSign,
  designVerticalSign,
  fakePhone,
  H_CELL,
  H_COLS,
  H_ROWS,
  hCellPx,
  SHOP_NAMES,
  SIGN_GLOW,
  TRADES,
  V_CELL,
  V_COUNT,
  vCellPx,
} from '@/world/city/signage';

describe('bảng hiệu Sài Gòn', () => {
  it('cùng seed ⇒ cùng bảng hiệu (bug tái hiện được)', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 20; i++) expect(designShopSign(a)).toEqual(designShopSign(b));
  });

  it('bảng ngang: tên nghề có trong danh sách, dòng 2 là tên tiệm hoặc món, dòng 3 có số điện thoại giả', () => {
    const rng = createRng(42);
    for (let i = 0; i < 200; i++) {
      const d = designShopSign(rng);
      const trade = TRADES.find((t) => t.title === d.lines[0]);
      expect(trade, d.lines[0]).toBeDefined();
      expect([...SHOP_NAMES, ...trade!.subs]).toContain(d.lines[1]);
      expect(d.lines[2]).toMatch(/ĐT: 01\d{2}\.\d{3}\.\d{4}$/);
      expect(d.glow).toBe(SIGN_GLOW[d.style]);
    }
  });

  it('số điện thoại dùng đầu số 11 chữ số cũ (không còn tồn tại) ⇒ không trùng số thật', () => {
    const rng = createRng(3);
    for (let i = 0; i < 100; i++) expect(fakePhone(rng).replace(/\./g, '')).toMatch(/^01\d{9}$/);
  });

  it('quán đêm hay dùng neon / hộp đèn; chữ in hoa', () => {
    const rng = createRng(11);
    const styles = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const d = designShopSign(rng);
      expect(d.lines[0]).toBe(d.lines[0]!.toUpperCase());
      if (['KARAOKE', 'NHÀ NGHỈ', 'BI-A', 'GAME NET', 'QUÁN NHẬU'].includes(d.lines[0]!)) styles.add(d.style);
    }
    expect(styles.has('neon')).toBe(true);
  });

  it('bảng dọc: từng chữ một dòng + số điện thoại; băng rôn có cả quảng cáo app vay của Phát', () => {
    const rng = createRng(5);
    const v = designVerticalSign(rng);
    expect(v.lines.length).toBeGreaterThanOrEqual(2);
    expect(v.lines.at(-1)).toMatch(/^01\d{2}\.\d{3}\.\d{4}$/);
    expect(BANNERS.map(([t]) => t)).toContain('VAY LIỀN 5S');
    expect(designBanner(4, rng).lines[0]).toBe('VAY LIỀN 5S');
  });

  it('ô atlas không chồng nhau và nằm gọn trong 2048²; uv nằm trong [0, 1]', () => {
    const rects: [number, number, number, number][] = [];
    for (let i = 0; i < H_COLS * H_ROWS; i++) rects.push([...hCellPx(i), ...H_CELL]);
    for (let j = 0; j < V_COUNT; j++) rects.push([...vCellPx(j), ...V_CELL]);
    for (const [x, y, w, h] of rects) {
      expect(x + w).toBeLessThanOrEqual(ATLAS_SIZE);
      expect(y + h).toBeLessThanOrEqual(ATLAS_SIZE);
      const [u, v, du, dv] = cellUv([x, y], [w, h], 3);
      for (const n of [u, v, u + du, v + dv]) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(1);
      }
    }
    for (let a = 0; a < rects.length; a++)
      for (let b = a + 1; b < rects.length; b++) {
        const [ax, ay, aw, ah] = rects[a]!;
        const [bx, by, bw, bh] = rects[b]!;
        expect(ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah).toBe(false);
      }
  });
});
