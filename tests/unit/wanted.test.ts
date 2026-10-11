import { describe, expect, it } from 'vitest';
import { CIVILIAN_CAP, ESCAPE_TIME, HEM_RATE, INSIDE_ZONE_RATE, MAX_STARS, SEARCH_RADIUS, Wanted } from '@/systems/wanted';

const run = (w: Wanted, seconds: number, seen: boolean, x: number, z: number, inHem = false): string => {
  let ev = 'none';
  for (let t = 0; t < seconds - 1e-9; t += 0.1) {
    const e = w.update(0.1, seen, x, z, inHem);
    if (e !== 'none') ev = e;
  }
  return ev;
};

describe('truy nã', () => {
  it('dân báo đánh người: 1 sao; có người chết: ít nhất 2 sao; dân báo tối đa 3 sao; đánh công an thì lên tới 5', () => {
    const w = new Wanted();
    w.report(1, 0, 0);
    expect(w.level).toBe(1);
    w.report(1, 0, 0);
    expect(w.level).toBe(2);
    const k = new Wanted();
    k.report(2, 0, 0);
    expect(k.level).toBe(2);
    for (let i = 0; i < 6; i++) k.report(2, 0, 0);
    expect(k.level).toBe(CIVILIAN_CAP);
    k.raise(4, 0, 0);
    expect(k.level).toBe(MAX_STARS);
    k.report(1, 0, 0);
    expect(k.level).toBe(MAX_STARS);
  });

  it('vùng tìm kiếm theo sao; công an thấy thì tâm vùng đi theo Tín', () => {
    const w = new Wanted();
    w.report(2, 10, 20);
    expect(w.radius).toBe(SEARCH_RADIUS[2]);
    expect([w.searchX, w.searchZ]).toEqual([10, 20]);
    run(w, 1, true, 50, 60);
    expect([w.searchX, w.searchZ]).toEqual([50, 60]);
    expect(w.seen).toBe(true);
    expect(w.escapeProgress).toBe(0);
  });

  it('khuất mặt ngoài vùng đủ lâu thì hết truy nã; trong vùng chậm hơn; trong hẻm nhanh hơn', () => {
    // Ngoài vùng: đúng ESCAPE_TIME.
    const out = new Wanted();
    out.report(1, 0, 0);
    expect(run(out, ESCAPE_TIME[1] - 0.5, false, 500, 0)).toBe('none');
    expect(out.level).toBe(1);
    expect(run(out, 0.6, false, 500, 0)).toBe('escaped');
    expect(out.level).toBe(0);
    // Trong vùng: chậm hơn INSIDE_ZONE_RATE lần.
    const inside = new Wanted();
    inside.report(1, 0, 0);
    run(inside, ESCAPE_TIME[1], false, 5, 0);
    expect(inside.level).toBe(1);
    expect(inside.escapeProgress).toBeCloseTo(INSIDE_ZONE_RATE, 1);
    // Bị thấy lại thì tính lại từ đầu.
    run(inside, 0.2, true, 5, 0);
    expect(inside.escapeProgress).toBe(0);
    // Trong hẻm (ngoài vùng): nhanh hơn HEM_RATE lần.
    const hem = new Wanted();
    hem.report(2, 0, 0);
    expect(run(hem, ESCAPE_TIME[2] / HEM_RATE + 0.2, false, 999, 0, true)).toBe('escaped');
  });
});
