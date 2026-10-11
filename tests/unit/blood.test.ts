import { describe, expect, it } from 'vitest';
import { BloodSim, MAX_DROPS, MAX_SPLATS, POOL_SPREAD, SPLAT_FADE, SPLAT_LIFE } from '@/world/blood';
import { bloodFor } from '@/systems/combat';

const run = (sim: BloodSim, seconds: number): void => {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60);
};

describe('máu nhẹ', () => {
  it('giọt bắn theo hướng đòn, rơi xuống đất, một phần thành vết nhỏ', () => {
    const sim = new BloodSim(7);
    sim.spray(0, 1.2, 0, 1, 0, 30, 0.2);
    expect(sim.flying).toBe(30);
    run(sim, 0.1);
    // Bay về phía +X (hướng đòn).
    let sumX = 0;
    for (let i = 0; i < 30; i++) sumX += sim.px[i]!;
    expect(sumX / 30).toBeGreaterThan(0.1);
    run(sim, 2);
    expect(sim.flying).toBe(0);
    expect(sim.splats).toBeGreaterThan(0);
    expect(sim.splats).toBeLessThan(20);
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (sim.sage[i]! < 0) continue;
      expect(sim.sy[i]).toBeCloseTo(0.2);
      // Máu nhẹ: rơi gần, không văng xa quá 1,5 m.
      expect(Math.hypot(sim.sx[i]!, sim.sz[i]!)).toBeLessThan(1.5);
    }
  });

  it('giọt rơi ra ngoài vỉa hè (lòng đường thấp hơn) thì không để vết', () => {
    const sim = new BloodSim(7, () => false);
    sim.spray(0, 1.2, 0, 1, 0, 60, 0.2);
    run(sim, 2);
    expect(sim.flying).toBe(0);
    expect(sim.splats).toBe(0);
  });

  it('vũng máu loang dần rồi mờ hẳn sau SPLAT_LIFE giây', () => {
    const sim = new BloodSim(1);
    sim.pool(3, 0.2, 4, 0.6);
    const i = 0;
    expect(sim.splatRadius(i)).toBe(0);
    run(sim, POOL_SPREAD / 2);
    const half = sim.splatRadius(i);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.6);
    run(sim, POOL_SPREAD);
    expect(sim.splatRadius(i)).toBeCloseTo(0.6);
    run(sim, SPLAT_LIFE - POOL_SPREAD * 1.5 - SPLAT_FADE / 2);
    expect(sim.splatRadius(i)).toBeLessThan(0.45);
    run(sim, SPLAT_FADE);
    expect(sim.splatRadius(i)).toBe(0);
    expect(sim.splats).toBe(0);
  });

  it('bể đầy thì ghi đè cái cũ nhất, không tràn', () => {
    const sim = new BloodSim(2);
    for (let k = 0; k < 10; k++) sim.spray(0, 1, 0, 0, 1, 20, 0);
    expect(sim.flying).toBe(MAX_DROPS);
    for (let k = 0; k < MAX_SPLATS + 5; k++) sim.splat(k, 0, 0, 0.1);
    expect(sim.splats).toBe(MAX_SPLATS);
    sim.clear();
    expect(sim.flying + sim.splats).toBe(0);
  });

  it('mã tấu chảy máu nhiều hơn tay không; chỉ người gục mới có vũng', () => {
    expect(bloodFor('maTau', 'hurt').drops).toBeGreaterThan(bloodFor(null, 'hurt').drops * 4);
    expect(bloodFor(null, 'hurt').drops).toBeGreaterThan(0);
    expect(bloodFor('gheNhua', 'hurt').pool).toBe(0);
    expect(bloodFor('maTau', 'down').pool).toBeGreaterThan(0);
    expect(bloodFor('gaySat', 'down').pool).toBe(0);
    expect(bloodFor('maTau', 'dead').pool).toBeGreaterThan(bloodFor(null, 'dead').pool);
    expect(bloodFor(null, 'dead').pool).toBeGreaterThan(0);
  });
});
