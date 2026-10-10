import { describe, expect, it } from 'vitest';
import { FALL_GRACE, FallGuard } from '@/systems/fallGuard';

describe('lưới an toàn khi rơi', () => {
  it('nhớ chỗ đứng vững gần nhất, rơi xuống sông quá lâu thì đưa về đó', () => {
    const g = new FallGuard({ x: 0, y: 0.2, z: 0, yaw: 0 });
    for (let i = 0; i < 60; i++) expect(g.update(1 / 30, i * 0.1, 0.15, 5, 1, true)).toBeNull();
    // Đang nhảy qua lan can (không chạm đất): không ghi đè chỗ an toàn.
    for (let i = 0; i < 30; i++) g.update(1 / 30, 50, 1.2, 5, 1, false);
    const safe = { ...g.lastSafe };
    expect(safe.x).toBeGreaterThan(4); // nhớ mỗi ~0,5 s nên là một điểm gần cuối đoạn đi bộ, không phải x = 50
    expect(safe.x).toBeLessThan(6);
    // Rơi xuống đáy sông (y ≈ −3,1): chưa cứu ngay, đủ FALL_GRACE giây mới cứu.
    let rescued = null;
    let t = 0;
    while (!rescued && t < 5) {
      rescued = g.update(1 / 30, 50, -3.1, 20, 1, true);
      t += 1 / 30;
    }
    expect(t).toBeGreaterThan(FALL_GRACE);
    expect(rescued).toEqual(safe);
  });

  it('rơi rất sâu (lọt khe va chạm) thì cứu ngay', () => {
    const g = new FallGuard({ x: 3, y: 0.2, z: 4, yaw: 2 });
    expect(g.update(1 / 60, 0, -9, 0, 0, false)).toEqual({ x: 3, y: 0.2, z: 4, yaw: 2 });
  });

  it('nhún xuống chốc lát rồi lên lại thì không cứu', () => {
    const g = new FallGuard({ x: 0, y: 0, z: 0, yaw: 0 });
    for (let i = 0; i < 20; i++) expect(g.update(1 / 30, 0, -2, 0, 0, false)).toBeNull();
    for (let i = 0; i < 5; i++) expect(g.update(1 / 30, 0, 0.1, 0, 0, true)).toBeNull();
    for (let i = 0; i < 20; i++) expect(g.update(1 / 30, 0, -2, 0, 0, false)).toBeNull();
  });
});
