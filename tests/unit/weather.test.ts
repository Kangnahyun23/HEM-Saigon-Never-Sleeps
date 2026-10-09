import { describe, expect, it } from 'vitest';
import { lightingAt } from '@/world/timeOfDay';
import { applyWeather, rainChance, WeatherSim } from '@/world/weather';

const MINUTE = 1 / 60;

describe('WeatherSim', () => {
  it('cùng seed → cùng thời tiết; giá trị luôn trong 0..1 và đổi mượt', () => {
    const a = new WeatherSim(5);
    const b = new WeatherSim(5);
    let prev = { ...a.state };
    let sawRain = false;
    for (let m = 0; m < 6 * 24 * 60; m++) {
      const hour = (16 + m * MINUTE) % 24;
      const s = a.update(MINUTE, hour);
      b.update(MINUTE, hour);
      for (const v of [s.cloud, s.rain, s.wet]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(s.rain - prev.rain)).toBeLessThan(0.11);
      expect(Math.abs(s.cloud - prev.cloud)).toBeLessThan(0.06);
      if (s.rain > 0.9) sawRain = true;
      prev = { ...s };
    }
    expect(sawRain).toBe(true);
    expect(b.state).toEqual(a.state);
  });

  it('mưa chiều tối nhiều hơn buổi sáng', () => {
    expect(rainChance(16)).toBeGreaterThan(rainChance(9));
  });

  it('ép mưa: nặng hạt dần, đường ướt; tạnh thì đường còn ướt một lúc', () => {
    const w = new WeatherSim(1);
    w.forced = 'rain';
    for (let m = 0; m < 60; m++) w.update(MINUTE, 17);
    expect(w.state.rain).toBeGreaterThan(0.95);
    expect(w.state.wet).toBeGreaterThan(0.95);
    w.forced = 'clear';
    for (let m = 0; m < 20; m++) w.update(MINUTE, 18);
    expect(w.state.rain).toBeLessThan(0.05);
    expect(w.state.wet).toBeGreaterThan(0.5);
    for (let m = 0; m < 120; m++) w.update(MINUTE, 18);
    expect(w.state.wet).toBeLessThan(0.05);
  });

  it('áp thời tiết: mưa thì nắng yếu, sương gần lại, đèn bật sớm', () => {
    const l = lightingAt(16);
    const clear = applyWeather(l, { sky: 'clear', cloud: 0, rain: 0, wet: 0 });
    const rain = applyWeather(l, { sky: 'rain', cloud: 1, rain: 1, wet: 1 });
    expect(clear.lightIntensity).toBeCloseTo(l.lightIntensity);
    expect(clear.fogFar).toBe(760);
    expect(rain.lightIntensity).toBeLessThan(l.lightIntensity * 0.3);
    expect(rain.fogFar).toBeLessThan(300);
    expect(rain.night).toBeGreaterThan(0.4);
  });
});
