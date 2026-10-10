import { describe, expect, it } from 'vitest';
import { clipTimeScale, locomotionWeights, SPEED_KNOTS } from '@/player/locomotion';

describe('trộn động tác di chuyển theo tốc độ', () => {
  const w = [0, 0, 0, 0];

  it('đứng yên ⇒ chỉ động tác đứng; đúng tốc độ đi bộ ⇒ chỉ động tác đi; giữ Shift ⇒ chỉ chạy nhanh', () => {
    expect(locomotionWeights(0, w)).toEqual([1, 0, 0, 0]);
    expect(locomotionWeights(SPEED_KNOTS[1], w)).toEqual([0, 1, 0, 0]);
    expect(locomotionWeights(SPEED_KNOTS[3], w)).toEqual([0, 0, 0, 1]);
    expect(locomotionWeights(20, w)).toEqual([0, 0, 0, 1]);
    expect(locomotionWeights(-1, w)).toEqual([1, 0, 0, 0]);
  });

  it('giữa hai mốc: trộn đúng hai động tác kề nhau, tổng trọng số luôn bằng 1', () => {
    for (let v = 0; v <= 7; v += 0.13) {
      locomotionWeights(v, w);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
      expect(w.filter((x) => x > 0).length).toBeLessThanOrEqual(2);
    }
    locomotionWeights((SPEED_KNOTS[1] + SPEED_KNOTS[2]) / 2, w);
    expect(w[1]).toBeCloseTo(0.5);
    expect(w[2]).toBeCloseTo(0.5);
  });

  it('nhịp clip tăng theo tốc độ nhưng bị kẹp (không quay chân quá nhanh / quá chậm)', () => {
    expect(clipTimeScale(0, 0)).toBe(0.55);
    expect(clipTimeScale(0, 2.3)).toBeGreaterThan(1);
    expect(clipTimeScale(2, 100)).toBe(1.6);
    expect(clipTimeScale(1, 3.6)).toBeCloseTo(1);
  });
});
