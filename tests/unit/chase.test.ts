import { describe, expect, it } from 'vitest';
import { ChaseSim, CHASERS_PER_LEVEL } from '@/ai/chase';
import { buildTrafficNetwork } from '@/ai/trafficNetwork';
import { Heat, segmentHitsRect, SightGrid } from '@/systems/heat';
import { containsPoint, rect } from '@/core/rect';
import { generateCity } from '@/world/city/layout';

const city = generateCity();
const net = buildTrafficNetwork(city);
const sight = new SightGrid(city.lots.map((l) => l.rect));
const STEP = 1 / 60;

describe('Heat', () => {
  it('bị thấy thì giữ cấp; khuất tầm nhìn đủ lâu (theo cấp) thì cắt đuôi', () => {
    const h = new Heat();
    h.set(2);
    for (let i = 0; i < 600; i++) expect(h.update(STEP, i % 2 === 0)).toBe(false);
    expect(h.level).toBe(2);
    let cleared = false;
    for (let t = 0; t < 11.9; t += STEP) cleared ||= h.update(STEP, false);
    expect(cleared).toBe(false);
    expect(h.escapeProgress).toBeGreaterThan(0.9);
    for (let t = 0; t < 0.2; t += STEP) cleared ||= h.update(STEP, false);
    expect(cleared).toBe(true);
    expect(h.level).toBe(0);
    h.set(9);
    expect(h.level).toBe(3);
  });
});

describe('tầm nhìn', () => {
  it('đoạn thẳng cắt / không cắt hình chữ nhật', () => {
    const r = rect(0, 0, 2, 2);
    expect(segmentHitsRect(-1, 1, 3, 1, r)).toBe(true);
    expect(segmentHitsRect(-1, 3, 3, 3, r)).toBe(false);
    expect(segmentHitsRect(-1, -1, 3, 3, r)).toBe(true);
    expect(segmentHitsRect(3, 0, 5, 5, r)).toBe(false);
  });

  it('dọc lòng đường thấy nhau; xuyên qua dãy nhà thì không', () => {
    const road = city.roads.find((r) => r.axis === 'x' && r.kind === 'street')!;
    expect(sight.clear(-60, road.pos, 60, road.pos)).toBe(true);
    const block = city.blocks.find((b) => b.kind === 'houses')!;
    const midZ = (block.rect.z0 + block.rect.z1) / 2;
    expect(sight.clear(block.rect.x0 - 3, midZ, block.rect.x1 + 3, midZ)).toBe(false);
  });
});

describe('ChaseSim', () => {
  it('tìm đường giữa các giao lộ: liền mạch, đầu cuối đúng', () => {
    const sim = new ChaseSim(net, sight);
    const a = 0;
    const b = net.nodes.length - 1;
    const path = sim.route(a, b);
    expect(path[0]).toBe(a);
    expect(path.at(-1)).toBe(b);
    for (let i = 1; i < path.length; i++) {
      const from = path[i - 1]!;
      expect(net.nodes[from]!.out.some((l) => net.lanes[l]!.to === path[i])).toBe(true);
    }
  });

  it('số xe theo cấp; đuổi kịp và chặn đầu người đứng yên giữa đường', () => {
    const sim = new ChaseSim(net, sight, 3);
    const road = city.roads.find((r) => r.axis === 'x' && r.kind === 'avenue')!;
    const player = { x: city.spawn.x, z: road.pos, speed: 0 };
    let caught = false;
    for (let i = 0; i < 60 * 40 && !caught; i++) caught = sim.update(STEP, player, 2);
    expect(sim.chasers.filter((c) => !c.leaving)).toHaveLength(CHASERS_PER_LEVEL[2]);
    expect(caught).toBe(true);
  });

  it('Tín chạy nhanh hơn xe truy đuổi; hết Độ Nóng thì chúng rút đi rồi biến mất', () => {
    const sim = new ChaseSim(net, sight, 4);
    const player = { x: city.spawn.x, z: city.spawn.z, speed: 21 };
    for (let i = 0; i < 60; i++) sim.update(STEP, player, 3);
    for (let i = 0; i < 600; i++) sim.update(STEP, player, 3);
    expect(Math.max(...sim.chasers.map((c) => c.speed))).toBeLessThan(21);
    sim.disperse();
    const far = { x: player.x + 400, z: player.z, speed: 0 };
    for (let i = 0; i < 60; i++) sim.update(STEP, far, 0);
    expect(sim.chasers).toHaveLength(0);
  });

  it('trốn sâu trong hẻm: xe truy đuổi không lao xuyên nhà, mất dấu và Độ Nóng về 0', () => {
    const sim = new ChaseSim(net, sight, 9);
    const heat = new Heat();
    heat.set(2);
    // Giữa một hẻm nhánh cụt (khuất tầm nhìn từ đường lớn).
    const hem = city.hems.find((h) => h.kind === 'branch' && h.deadEnd) ?? city.hems.find((h) => h.kind === 'branch')!;
    const player = { x: (hem.rect.x0 + hem.rect.x1) / 2, z: (hem.rect.z0 + hem.rect.z1) / 2, speed: 0 };
    let cleared = false;
    let insideHouse = 0;
    for (let i = 0; i < 60 * 40 && !cleared; i++) {
      sim.update(STEP, player, heat.level);
      cleared = heat.update(STEP, sim.seen);
      if (i % 30 === 0) for (const c of sim.chasers) if (city.lots.some((l) => containsPoint(l.rect, c.x, c.z))) insideHouse++;
    }
    expect(cleared).toBe(true);
    expect(insideHouse).toBe(0);
  });
});
