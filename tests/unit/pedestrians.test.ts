import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { PedestrianSim } from '@/ai/pedestrians';
import { generateCity } from '@/world/city/layout';

const city = generateCity();
const STEP = 1 / 60;
const focus = { x: city.spawn.x, z: city.spawn.z };

describe('PedestrianSim', () => {
  it('cùng seed → cùng diễn biến', () => {
    const a = new PedestrianSim(city, focus, { count: 20 });
    const b = new PedestrianSim(city, focus, { count: 20 });
    for (let i = 0; i < 600; i++) {
      a.step(STEP, focus);
      b.step(STEP, focus);
    }
    expect(a.walkers.map((w) => w.x.toFixed(4))).toEqual(b.walkers.map((w) => w.x.toFixed(4)));
  });

  it('luôn ở trên vỉa hè, đi liền mạch qua góc phố, có di chuyển', () => {
    const sim = new PedestrianSim(city, focus);
    let moved = 0;
    let offSidewalk = 0;
    let maxStep = 0;
    for (let i = 0; i < 60 * 60; i++) {
      const gens = sim.walkers.map((w) => w.generation);
      sim.step(STEP, focus);
      sim.walkers.forEach((w, k) => {
        const b = city.blocks[w.block]!;
        // Trên vỉa hè = trong block nhưng ngoài phần đất xây nhà.
        if (!containsPoint(b.rect, w.x, w.z) || containsPoint(b.inner, w.x, w.z)) offSidewalk++;
        // Không dịch chuyển tức thời (trừ khi vừa được thả lại).
        if (gens[k] === w.generation) {
          const step = Math.hypot(w.x - w.prevX, w.z - w.prevZ);
          maxStep = Math.max(maxStep, step);
          moved += step;
        }
      });
    }
    expect(offSidewalk).toBe(0);
    expect(maxStep).toBeLessThan(0.2);
    // Trung bình mỗi người đi được hơn 20 m trong 60 s (có lúc đứng lại).
    expect(moved / sim.walkers.length).toBeGreaterThan(20);
  });

  it('lách cột điện, cây, xe đậu thay vì đi xuyên qua', () => {
    const sim = new PedestrianSim(city, focus);
    let samples = 0;
    let inside = 0;
    for (let i = 0; i < 60 * 40; i++) {
      sim.step(STEP, focus);
      if (i % 10) continue;
      for (const w of sim.walkers) {
        samples++;
        if (sim.blocked(w.x, w.z, 0.05)) inside++;
      }
    }
    expect(inside / samples).toBeLessThan(0.03);
  });

  it('xe lao tới thì nhảy tránh vào sát nhà và đứng lại', () => {
    const sim = new PedestrianSim(city, focus, { count: 1 });
    const w = sim.walkers[0]!;
    sim.step(STEP, focus);
    const d0 = w.d;
    // Xe cách 5 m, lao thẳng vào người với 10 m/s.
    const dx = Math.sin(w.yaw);
    const dz = Math.cos(w.yaw);
    const threat = { x: w.x + dx * 5, z: w.z + dz * 5, vx: -dx * 10, vz: -dz * 10 };
    for (let i = 0; i < 30; i++) sim.step(STEP, focus, [threat]);
    expect(w.dodge).toBeGreaterThan(0);
    expect(w.speed).toBeLessThan(0.5);
    expect(w.d).toBeGreaterThan(d0);
  });

  it('bong bóng: người chơi đi xa thì người đi bộ được thả lại quanh người chơi', () => {
    const sim = new PedestrianSim(city, focus, { count: 30 });
    const far = { x: -focus.x, z: -focus.z };
    sim.step(STEP, far);
    for (const w of sim.walkers) expect(Math.hypot(w.x - far.x, w.z - far.z)).toBeLessThan(sim.options.despawnRadius + 5);
    expect(sim.respawns).toBeGreaterThan(0);
  });
});
