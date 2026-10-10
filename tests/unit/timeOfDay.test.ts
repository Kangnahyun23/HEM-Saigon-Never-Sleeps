import { describe, expect, it } from 'vitest';
import { GameClock, lightingAt, nightFactor, shopsClosedFraction, sunDirection, wrapHour } from '@/world/timeOfDay';

describe('timeOfDay', () => {
  it('mặt trời mọc phía đông (+X), lặn phía tây (−X), trưa trên cao, nửa đêm dưới chân trời', () => {
    expect(sunDirection(7)[0]).toBeGreaterThan(0.5);
    expect(sunDirection(7)[1]).toBeGreaterThan(0);
    expect(sunDirection(17)[0]).toBeLessThan(-0.5);
    expect(sunDirection(17)[1]).toBeGreaterThan(0);
    expect(sunDirection(12)[1]).toBeGreaterThan(0.9);
    expect(sunDirection(0)[1]).toBeLessThan(-0.9);
    for (const h of [0, 3, 9, 13.5, 21]) expect(Math.hypot(...sunDirection(h))).toBeCloseTo(1, 6);
  });

  it('mức đêm: 0 ban ngày, 1 ban đêm, chuyển dần lúc chạng vạng', () => {
    expect(nightFactor(12)).toBe(0);
    expect(nightFactor(16.5)).toBe(0);
    expect(nightFactor(0)).toBe(1);
    expect(nightFactor(22)).toBe(1);
    expect(nightFactor(4)).toBe(1);
    const dusk = nightFactor(18.4);
    expect(dusk).toBeGreaterThan(0.2);
    expect(dusk).toBeLessThan(0.9);
  });

  it('16 giờ giữ đúng ánh sáng nắng chiều của M1', () => {
    const l = lightingAt(16);
    expect(l.lightIntensity).toBeCloseTo(3.0);
    expect(l.hemiIntensity).toBeCloseTo(1.0);
    expect(l.exposure).toBeCloseTo(1.05);
    expect(l.night).toBe(0);
  });

  it('ban đêm: nguồn sáng là trăng (trên trời, yếu), trời tối hơn hẳn ban ngày', () => {
    const night = lightingAt(23);
    const day = lightingAt(12);
    expect(night.lightDir[1]).toBeGreaterThan(0.3);
    expect(night.lightIntensity).toBeLessThan(0.5);
    expect(night.hemiIntensity).toBeLessThan(day.hemiIntensity / 4);
    expect(night.fogColor[0] + night.fogColor[1] + night.fogColor[2]).toBeLessThan(0.6);
  });

  it('ánh sáng biến đổi liên tục, không giật cục giữa hai phút liền nhau', () => {
    let prev = lightingAt(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const cur = lightingAt(m / 60);
      expect(Math.abs(cur.hemiIntensity - prev.hemiIntensity)).toBeLessThan(0.05);
      expect(Math.abs(cur.night - prev.night)).toBeLessThan(0.03);
      expect(Math.abs(cur.exposure - prev.exposure)).toBeLessThan(0.02);
      // Cường độ nguồn sáng chính: đổi mặt trời ↔ trăng chỉ xảy ra khi cả hai đều yếu.
      expect(Math.abs(cur.lightIntensity - prev.lightIntensity)).toBeLessThan(0.4);
      for (const v of [...cur.fogColor, ...cur.hemiSky]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      prev = cur;
    }
  });

  it('đồng hồ game: trôi theo tốc độ, quay vòng qua nửa đêm, hiện HH:MM', () => {
    const c = new GameClock(23.5, 1);
    expect(c.label()).toBe('23:30');
    c.advance(1);
    expect(c.hour).toBeCloseTo(0.5);
    expect(c.label()).toBe('00:30');
    expect(wrapHour(-1)).toBe(23);
    // Mặc định: 1 phút thật = 1 giờ game.
    const d = new GameClock(10);
    d.advance(60);
    expect(d.hour).toBeCloseTo(11);
  });

  it('tiệm đóng cửa theo giờ: ban ngày ít, khuya hầu hết, mở lại dần lúc sáng sớm', () => {
    expect(shopsClosedFraction(10)).toBeCloseTo(0.15);
    expect(shopsClosedFraction(15)).toBeCloseTo(0.15);
    expect(shopsClosedFraction(2)).toBeCloseTo(0.85);
    expect(shopsClosedFraction(22)).toBeGreaterThan(0.2);
    expect(shopsClosedFraction(22)).toBeLessThan(0.85);
    expect(shopsClosedFraction(6)).toBeLessThan(shopsClosedFraction(5));
    expect(shopsClosedFraction(26)).toBeCloseTo(shopsClosedFraction(2));
  });
});
