import { describe, expect, it } from 'vitest';
import { CIVILIAN_CAP, MAX_STARS, STAR_COOLDOWN, Wanted } from '@/systems/wanted';

describe('truy nã', () => {
  it('dân báo đánh người: 1 sao; có người chết: ít nhất 2 sao; dân báo tối đa 3 sao', () => {
    const w = new Wanted();
    w.report(1);
    expect(w.level).toBe(1);
    w.report(1);
    expect(w.level).toBe(2);
    const k = new Wanted();
    k.report(2);
    expect(k.level).toBe(2);
    for (let i = 0; i < 6; i++) k.report(2);
    expect(k.level).toBe(CIVILIAN_CAP);
    // Đã cao hơn mức dân báo (đánh công an ở N5.4) thì báo thêm không làm giảm.
    k.level = MAX_STARS;
    k.report(1);
    expect(k.level).toBe(MAX_STARS);
  });

  it('không bị báo thêm thì cứ STAR_COOLDOWN giây hạ một sao; báo mới thì tính lại từ đầu', () => {
    const w = new Wanted();
    w.report(2);
    w.update(STAR_COOLDOWN - 1);
    expect(w.level).toBe(2);
    expect(w.cooling).toBeGreaterThan(0.9);
    w.report(1);
    expect(w.level).toBe(3);
    expect(w.cooling).toBe(0);
    for (let t = 0; t < STAR_COOLDOWN * 3 + 1; t += 0.5) w.update(0.5);
    expect(w.level).toBe(0);
    expect(w.cooling).toBe(0);
  });
});
