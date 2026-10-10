import { describe, expect, it } from 'vitest';
import { ambienceLevels, engineTone, ENGINE_TOP_SPEED, volumeCurve, type AmbienceLevels, type EngineTone } from '@/audio/soundModel';

const tone = (): EngineTone => ({ freq: 0, gain: 0, cutoff: 0, pulse: 0 });
const amb = (): AmbienceLevels => ({ hum: 0, crickets: 0 });

describe('tiếng máy xe', () => {
  it('không lái thì im; đứng yên thì nổ cầm chừng', () => {
    expect(engineTone(false, 10, 1, tone()).gain).toBe(0);
    const idle = engineTone(true, 0, 0, tone());
    expect(idle.gain).toBeGreaterThan(0);
    expect(idle.freq).toBeLessThan(60);
  });

  it('ga mạnh thì to và gắt hơn; tăng tốc trong một số thì tiếng cao dần, lên số thì tụt tua', () => {
    const soft = engineTone(true, 5, 0.1, tone());
    const hard = engineTone(true, 5, 1, tone());
    expect(hard.gain).toBeGreaterThan(soft.gain);
    expect(hard.cutoff).toBeGreaterThan(soft.cutoff);
    const top = ENGINE_TOP_SPEED;
    const early = engineTone(true, top * 0.3, 0.5, tone());
    const late = engineTone(true, top * 0.49, 0.5, tone());
    const shifted = engineTone(true, top * 0.51, 0.5, tone());
    expect(late.freq).toBeGreaterThan(early.freq);
    expect(shifted.freq).toBeLessThan(late.freq);
    for (const v of [0, 3, 8, 14, 17, 25]) {
      const t = engineTone(true, v, 1, tone());
      expect(t.gain).toBeLessThanOrEqual(1);
      expect(t.freq).toBeGreaterThan(30);
      expect(t.freq).toBeLessThan(250);
    }
  });

  it('lùi xe cũng có tiếng như tiến', () => {
    expect(engineTone(true, -4, 0.5, tone())).toEqual(engineTone(true, 4, 0.5, tone()));
  });
});

describe('tiếng phố', () => {
  it('giờ tan tầm đông xe thì ồn hơn khuya vắng; mưa át bớt', () => {
    const rush = ambienceLevels(18, 0, 12, amb()).hum;
    const late = ambienceLevels(3, 0, 2, amb()).hum;
    expect(rush).toBeGreaterThan(late * 2);
    expect(ambienceLevels(18, 1, 12, amb()).hum).toBeLessThan(rush);
  });

  it('dế chỉ kêu khi trời tối, không kêu khi mưa', () => {
    expect(ambienceLevels(12, 0, 0, amb()).crickets).toBe(0);
    expect(ambienceLevels(22, 0, 0, amb()).crickets).toBeGreaterThan(0.9);
    expect(ambienceLevels(22, 1, 0, amb()).crickets).toBe(0);
    expect(ambienceLevels(18.5, 0, 0, amb()).crickets).toBeCloseTo(0.5);
  });

  it('âm lượng: 0 là im, 1 là to nhất, giữa thì nhỏ hơn tuyến tính', () => {
    expect(volumeCurve(0)).toBe(0);
    expect(volumeCurve(1)).toBe(1);
    expect(volumeCurve(0.5)).toBe(0.25);
    expect(volumeCurve(2)).toBe(1);
  });
});
