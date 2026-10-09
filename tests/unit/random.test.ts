import { describe, expect, it } from 'vitest';
import { createRng, pick, range } from '@/core/random';

describe('createRng', () => {
  it('cùng seed → cùng dãy số (thành phố tái hiện được)', () => {
    const a = createRng(2026);
    const b = createRng(2026);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('seed khác → dãy khác', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('giá trị nằm trong [0, 1)', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range và pick', () => {
    const rng = createRng(7);
    for (let i = 0; i < 100; i++) {
      const v = range(rng, 4, 6);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThan(6);
    }
    expect(['a', 'b']).toContain(pick(rng, ['a', 'b']));
    expect(() => pick(rng, [])).toThrow();
  });
});
