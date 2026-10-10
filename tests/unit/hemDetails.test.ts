import { describe, expect, it } from 'vitest';
import { generateCity } from '@/world/city/layout';
import { hemDoorRight, hemDoorSpan, hemMouths, hemNumber } from '@/world/city/hemDetails';

describe('chi tiết hẻm', () => {
  const layout = generateCity();

  it('mỗi hẻm chính có 2 miệng thông ra đường, hẻm cụt không có miệng', () => {
    const mouths = hemMouths(layout);
    for (const h of layout.hems) {
      const n = mouths.filter((m) => m.hemId === h.id).length;
      if (h.deadEnd) expect(n).toBe(0);
      else if (h.kind === 'main') expect(n).toBe(2);
      else expect(n).toBe(1);
    }
  });

  it('miệng hẻm nằm trên đường mặt tiền của block và nhìn ra phía ngoài block', () => {
    for (const m of hemMouths(layout)) {
      const h = layout.hems[m.hemId]!;
      const block = layout.blocks.find((b) => b.id === h.blockId)!;
      const outX = Math.sin(m.yaw);
      const outZ = Math.cos(m.yaw);
      const cx = (block.inner.x0 + block.inner.x1) / 2;
      const cz = (block.inner.z0 + block.inner.z1) / 2;
      // Đi ra ngoài theo hướng nhìn ⇒ xa tâm block hơn.
      expect(Math.hypot(m.x + outX - cx, m.z + outZ - cz)).toBeGreaterThan(Math.hypot(m.x - cx, m.z - cz));
    }
  });

  it('số hẻm: hẻm chính số chẵn, hẻm nhánh "số hẻm chính / số nhánh"', () => {
    for (const h of layout.hems) {
      const label = hemNumber(layout, h);
      if (h.kind === 'main') expect(Number(label) % 2).toBe(0);
      else expect(label).toMatch(/^\d+\/\d+$/);
    }
  });

  it('ô cửa nhà trong hẻm nằm gọn trong mặt tiền, cửa trái / phải đều có', () => {
    let rights = 0;
    for (let s = 0; s < 200; s++) {
      const right = hemDoorRight(s * 7919);
      if (right) rights++;
      for (const w of [2.6, 4, 6.2]) {
        const [a, dw] = hemDoorSpan(w, right);
        expect(a).toBeGreaterThan(0);
        expect(a + dw).toBeLessThan(w);
      }
    }
    expect(rights).toBeGreaterThan(40);
    expect(rights).toBeLessThan(160);
  });
});
