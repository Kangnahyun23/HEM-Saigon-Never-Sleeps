import { describe, expect, it } from 'vitest';
import { KeyedPool } from '@/core/keyedPool';

type Item = { key: string; n: number; shown: boolean };

const pool = () => {
  let n = 0;
  const p = new KeyedPool<Item>(
    (i) => (i.shown = true),
    (i) => (i.shown = false),
  );
  const make = (key: string) => () => ({ key, n: n++, shown: false });
  return { p, make };
};

describe('KeyedPool', () => {
  it('dùng lại món đã trả cùng khoá, tạo mới khi khác khoá hoặc hết món rảnh', () => {
    const { p, make } = pool();
    const a = p.take('nam:idle', make('nam:idle'))!;
    expect(a.shown).toBe(true);
    p.give(a);
    expect(a.shown).toBe(false);
    expect(p.take('nam:idle', make('nam:idle'))).toBe(a);
    const b = p.take('nam:idle', make('nam:idle'))!;
    expect(b).not.toBe(a);
    const c = p.take('nu:idle', make('nu:idle'))!;
    expect(c.key).toBe('nu:idle');
    expect(p.created).toBe(3);
  });

  it('đi qua rất nhiều người: số món chỉ bằng số người cùng lúc, không phình theo thời gian', () => {
    const { p, make } = pool();
    const keys = ['a', 'b', 'c', 'd', 'e', 'f'];
    const slots: Array<Item | null> = new Array(10).fill(null);
    // 10 ô, mỗi "khung" đổi người ở vài ô (như khi đi xe qua phố) — 5000 lần đổi.
    for (let t = 0; t < 5000; t++) {
      const k = (t * 7) % slots.length;
      const old = slots[k];
      if (old) p.give(old);
      const key = keys[(t * 13) % keys.length]!;
      slots[k] = p.take(key, make(key));
    }
    expect(p.created).toBeLessThanOrEqual(slots.length + keys.length);
    expect(slots.every((s) => s?.shown)).toBe(true);
  });

  it('create trả null (thiếu mẫu): không đếm, không giữ gì; trả hai lần một món không nhân đôi', () => {
    const { p, make } = pool();
    expect(p.take('x', () => null)).toBeNull();
    expect(p.created).toBe(0);
    const a = p.take('x', make('x'))!;
    p.give(a);
    p.give(a);
    expect(p.idle).toBe(1);
    p.give({ key: 'lạ', n: -1, shown: true });
    expect(p.idle).toBe(1);
  });
});
