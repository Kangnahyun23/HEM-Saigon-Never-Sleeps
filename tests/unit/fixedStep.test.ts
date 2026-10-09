import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from '@/core/fixedStep';

describe('FixedStepAccumulator', () => {
  it('chạy đúng 1 bước khi dt bằng đúng 1 bước', () => {
    const acc = new FixedStepAccumulator(1 / 60);
    expect(acc.advance(1 / 60)).toBe(1);
  });

  it('cộng dồn các khung hình ngắn', () => {
    const acc = new FixedStepAccumulator(1 / 60);
    expect(acc.advance(1 / 120)).toBe(0);
    expect(acc.advance(1 / 120)).toBe(1);
  });

  it('60 khung hình ở 60 fps = 60 bước, không trôi', () => {
    const acc = new FixedStepAccumulator(1 / 60);
    let total = 0;
    for (let i = 0; i < 60; i++) total += acc.advance(1 / 60);
    expect(total).toBe(60);
  });

  it('cắt khung hình quá dài để tránh vòng xoáy tử thần', () => {
    const acc = new FixedStepAccumulator(1 / 60, 5);
    expect(acc.advance(10)).toBe(5);
    expect(acc.advance(0)).toBe(0);
  });

  it('bỏ qua dt âm hoặc NaN', () => {
    const acc = new FixedStepAccumulator(1 / 60);
    expect(acc.advance(-1)).toBe(0);
    expect(acc.advance(Number.NaN)).toBe(0);
  });

  it('alpha nằm trong [0, 1]', () => {
    const acc = new FixedStepAccumulator(1 / 60);
    acc.advance(1 / 120);
    expect(acc.alpha).toBeCloseTo(0.5, 5);
  });
});
