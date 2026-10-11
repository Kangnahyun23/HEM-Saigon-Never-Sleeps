import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { CALL_TIME, FLEE_SPEED, PedestrianSim, PUNCH_DAMAGE, PUNCH_RANGE } from '@/ai/pedestrians';
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

  it('trúng đòn: loạng choạng đứng yên rồi bỏ chạy ra xa người đánh; đòn ngã thì nằm; hết máu thì gục hẳn', () => {
    const sim = new PedestrianSim(city, focus, { count: 6 });
    for (let i = 0; i < 30; i++) sim.step(STEP, focus);
    const w = sim.walkers[0]!;
    const from = { x: w.x + Math.sin(w.yaw) * 0.8, z: w.z + Math.cos(w.yaw) * 0.8 };
    expect(sim.hit(0, 10, from.x, from.z, false)).toBe('hurt');
    expect(w.health).toBe(90);
    const x0 = w.x;
    const z0 = w.z;
    sim.step(STEP, focus);
    expect(Math.hypot(w.x - x0, w.z - z0)).toBe(0);
    const d0 = Math.hypot(w.x - from.x, w.z - from.z);
    for (let i = 0; i < 120; i++) sim.step(STEP, focus);
    expect(w.flee).toBeGreaterThan(0);
    expect(w.speed).toBeGreaterThan(FLEE_SPEED * 0.8);
    expect(Math.hypot(w.x - from.x, w.z - from.z)).toBeGreaterThan(d0 + 2);

    expect(sim.hit(0, 10, from.x, from.z, true)).toBe('down');
    expect(w.down).toBeGreaterThan(0);
    expect(sim.hit(0, 500, from.x, from.z, false)).toBe('dead');
    const xd = w.x;
    for (let i = 0; i < 120; i++) sim.step(STEP, focus);
    expect(w.dead).toBe(true);
    expect(w.x).toBe(xd);
    expect(sim.hit(0, 10, from.x, from.z, false)).toBeNull();
  });

  it('thấy đánh nhau thì người xung quanh phản ứng, người ở xa không biết gì', () => {
    const sim = new PedestrianSim(city, focus, { count: 30 });
    const w = sim.walkers[3]!;
    sim.witness(w.x + 2, w.z, 12);
    expect(w.flee > 0 || w.react !== 'none').toBe(true);
    const far = sim.walkers.filter((o) => Math.hypot(o.x - w.x - 2, o.z - w.z) > 12);
    for (const o of far) {
      expect(o.flee).toBe(0);
      expect(o.react).toBe('none');
    }
  });

  it('phản ứng đa dạng: bỏ chạy, la lên, quay video, gọi báo; tối đa 2 người gọi cùng lúc', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const sim = new PedestrianSim(city, focus, { count: 80, seed });
      for (const w of sim.walkers.slice(0, 6)) sim.witness(w.x + 1, w.z, 40);
      for (const o of sim.walkers) seen.add(o.react !== 'none' ? o.react : o.flee > 0 ? 'flee' : 'none');
      expect(sim.walkers.filter((o) => o.react === 'call').length).toBeLessThanOrEqual(2);
      expect(sim.walkers.filter((o) => o.react === 'fight').length).toBeLessThanOrEqual(2);
    }
    for (const kind of ['flee', 'shout', 'film', 'call']) expect(seen.has(kind)).toBe(true);
  });

  it('gọi báo công an: đứng quay lưng 5 giây thì báo xong; người chơi áp sát kịp thì cúp máy bỏ chạy', () => {
    const sim = new PedestrianSim(city, focus, { count: 10 });
    const w = sim.walkers[0]!;
    const far = { x: w.x + 8, z: w.z };
    sim.startReaction(w, 'call', 0);
    for (let t = 0; t < CALL_TIME - 0.2; t += STEP) sim.step(STEP, far);
    expect(sim.reports).toBe(0);
    expect(w.react).toBe('call');
    expect(w.x).toBe(w.prevX); // đứng yên
    for (let t = 0; t < 0.4; t += STEP) sim.step(STEP, far);
    expect(sim.reports).toBe(1);
    expect(w.react).toBe('none');
    expect(w.flee).toBeGreaterThan(0);

    const v = sim.walkers[1]!;
    sim.startReaction(v, 'call', 0);
    sim.step(STEP, { x: v.x + 1.2, z: v.z });
    expect(sim.callsStopped).toBe(1);
    expect(v.react).toBe('none');
    expect(v.flee).toBeGreaterThan(0);
    for (let t = 0; t < CALL_TIME + 1; t += STEP) sim.step(STEP, far);
    expect(sim.reports).toBe(1);
  });

  it('đánh trả: xông tới người chơi dọc vỉa hè, đấm trúng làm mất máu; bị đánh yếu thì bỏ chạy', () => {
    const sim = new PedestrianSim(city, focus, { count: 10 });
    const w = sim.walkers[0]!;
    // Người chơi đứng phía trước người này 3 m trên cùng vỉa hè.
    const p = sim.position(city.blocks[w.block]!, w.side, w.t, w.d);
    const player = { x: w.x + p.fx * w.dir * 3, z: w.z + p.fz * w.dir * 3 };
    sim.startReaction(w, 'fight', 25);
    const start = Math.hypot(w.x - player.x, w.z - player.z);
    for (let t = 0; t < 3; t += STEP) sim.step(STEP, player);
    expect(Math.hypot(w.x - player.x, w.z - player.z)).toBeLessThan(Math.min(start, PUNCH_RANGE));
    expect(sim.damageToPlayer).toBeGreaterThanOrEqual(PUNCH_DAMAGE);
    expect(w.react).toBe('fight');
    // Ăn một đòn nhẹ vẫn đánh tiếp; mất quá nửa máu thì chạy.
    sim.hit(w.id, 20, player.x, player.z, false);
    expect(w.react).toBe('fight');
    sim.hit(w.id, 40, player.x, player.z, false);
    expect(w.react).toBe('none');
    expect(w.flee).toBeGreaterThan(0);
  });
});
