import { describe, expect, it } from 'vitest';
import { CHASE, ChaseSim, POLICE_CHASE, type ChasePlayer } from '@/ai/chase';
import { entryParam, HemMap } from '@/ai/hemNav';
import { buildTrafficNetwork } from '@/ai/trafficNetwork';
import { containsPoint, inset, rect } from '@/core/rect';
import { SightGrid } from '@/systems/heat';
import { generateCity, type Hem } from '@/world/city/layout';

/** Xe truy đuổi trong hẻm (R4): xe máy chậm hơn Tín chạy bộ, ô tô dừng ở miệng hẻm, mất dấu thì men theo hẻm ra. */

const city = generateCity();
const net = buildTrafficNetwork(city);
const lots = city.lots.map((l) => l.rect);
const sight = new SightGrid(lots);
const hems = new HemMap(city.hems, lots);
const STEP = 1 / 60;
const RUN_SPEED = 6.4;
/** Lô nhà thu vào chút ít: xe cua trong hẻm hẹp được phép lấn mép tường vài tấc. */
const walls = lots.map((r) => inset(r, 0.3));
const inHouse = (x: number, z: number): boolean => walls.some((r) => containsPoint(r, x, z));
/** Ra tới lòng đường: ngoài mọi khu nhà (khu gồm cả vỉa hè, hẻm, khe giữa hai dãy nhà). */
const onRoad = (x: number, z: number): boolean => !city.blocks.some((b) => containsPoint(b.rect, x, z));

const length = (h: Hem): number => (h.axis === 'x' ? h.rect.x1 - h.rect.x0 : h.rect.z1 - h.rect.z0);
/** Hẻm chính dài nhất (thông hai đầu ra đường). */
const main = city.hems.filter((h) => h.kind === 'main').reduce((a, b) => (length(b) > length(a) ? b : a));

/** Điểm giữa bề ngang hẻm, cách đầu 0 (phía toạ độ nhỏ) `s` m vào trong (s < 0: ngoài miệng hẻm). */
function along(h: Hem, s: number): { x: number; z: number } {
  const r = h.rect;
  return h.axis === 'x' ? { x: r.x0 + s, z: (r.z0 + r.z1) / 2 } : { x: (r.x0 + r.x1) / 2, z: r.z0 + s };
}
/** Hướng nhìn dọc hẻm, từ đầu 0 vào trong. */
const inward = (h: Hem): number => (h.axis === 'x' ? Math.PI / 2 : 0);

describe('HemMap', () => {
  it('đoạn thẳng đi vào hình chữ nhật: tham số lúc vào, 0 nếu đã ở trong, Infinity nếu trượt / chưa tới', () => {
    const r = rect(0, 0, 2, 2);
    expect(entryParam(-2, 1, 4, 0, r)).toBeCloseTo(0.5);
    expect(entryParam(1, -2, 0, 4, r)).toBeCloseTo(0.5);
    expect(entryParam(1, 1, 4, 0, r)).toBe(0);
    expect(entryParam(-2, 3, 4, 0, r)).toBe(Infinity);
    expect(entryParam(-4, 1, 2, 0, r)).toBe(Infinity);
    expect(entryParam(3, 3, -2, -2, r)).toBeCloseTo(0.5);
  });

  it('đầu hẻm: hẻm chính và hẻm nhánh thông thì mở hai đầu; hẻm cụt chỉ mở phía hẻm chính', () => {
    expect(city.hems.some((h) => h.deadEnd)).toBe(true);
    for (let i = 0; i < city.hems.length; i++) {
      const h = city.hems[i]!;
      const open = [hems.isOpen(i, 0), hems.isOpen(i, 1)];
      if (!h.deadEnd) {
        expect(open).toEqual([true, true]);
        continue;
      }
      expect(open.filter(Boolean)).toHaveLength(1);
      // Đi ra đầu thông của hẻm cụt là vào hẻm chính cùng khu.
      const out = { x: 0, z: 0 };
      expect(hems.exit(i, h.rect.x0, h.rect.z0, out)).toBe(true);
      const mainOfBlock = city.hems.find((m) => m.blockId === h.blockId && m.kind === 'main')!;
      expect(containsPoint(mainOfBlock.rect, out.x, out.z)).toBe(true);
    }
  });

  it('quãng đường tới hẻm dọc đường đi; đang trong hẻm là 0; chạy song song ngoài đường thì không vào hẻm', () => {
    const before = along(main, -10);
    const inside = along(main, 20);
    expect(hems.entry(before.x, before.z, inside.x, inside.z)).toBeCloseTo(10, 5);
    expect(hems.entry(inside.x, inside.z, before.x, before.z)).toBe(0);
    expect(hems.at(inside.x, inside.z)).toBe(city.hems.indexOf(main));
    expect(hems.at(before.x, before.z)).toBe(-1);
    // Dọc lòng đường lớn (tim đường) không cắt hẻm nào.
    const road = city.roads.find((r) => r.axis === 'x')!;
    expect(hems.entry(-100, road.pos, 100, road.pos)).toBe(Infinity);
  });
});

describe('xe truy đuổi trong hẻm', () => {
  /** Xe máy / ô tô công an phóng tới miệng hẻm chính, Tín đứng sâu trong hẻm (nhìn thấy nhau dọc hẻm). */
  function intoHem(kind: 'bike' | 'car', player: ChasePlayer) {
    const sim = new ChaseSim(net, sight, 7, POLICE_CHASE, hems);
    const start = along(main, -14);
    expect(sight.clear(start.x, start.z, player.x, player.z)).toBe(true);
    const c = sim.spawnAt(start.x, start.z, inward(main), kind, 14);
    return { sim, c };
  }

  it('xe máy thấy Tín trong hẻm: phanh trước miệng hẻm, trong hẻm không quá hemSpeed; Tín đứng yên thì vẫn bị bắt', () => {
    const p = along(main, 25);
    const player = { x: p.x, z: p.z, speed: 0 };
    const { sim, c } = intoHem('bike', player);
    let caught = false;
    let entered = false;
    let topInHem = 0;
    for (let i = 0; i < 60 * 20 && !caught; i++) {
      // 1 sao: chỉ một xe (chính xe này), không có xe nào khác chen vào.
      caught = sim.update(STEP, player, 1);
      if (hems.at(c.x, c.z) >= 0) {
        entered = true;
        topInHem = Math.max(topInHem, c.speed);
      }
    }
    expect(entered).toBe(true);
    expect(topInHem).toBeLessThanOrEqual(POLICE_CHASE.hemSpeed + 0.3);
    expect(caught).toBe(true);
  });

  it('Tín chạy bộ trong hẻm thì bỏ được xe máy (công an lẫn đàn em)', () => {
    expect(POLICE_CHASE.hemSpeed).toBeLessThan(RUN_SPEED);
    expect(CHASE.hemSpeed).toBeLessThan(RUN_SPEED);
    for (const cfg of [POLICE_CHASE, CHASE]) {
      const sim = new ChaseSim(net, sight, 3, cfg, hems);
      const start = along(main, 4);
      const c = sim.spawnAt(start.x, start.z, inward(main), 'bike', cfg.hemSpeed);
      let s = 10;
      const player = { ...along(main, s), speed: RUN_SPEED };
      let caught = false;
      let gap = Infinity;
      // Chạy dọc hẻm chính tới gần đầu kia.
      while (s < length(main) - 6) {
        s += RUN_SPEED * STEP;
        Object.assign(player, along(main, s));
        caught ||= sim.update(STEP, player, 1);
        gap = Math.min(gap, Math.hypot(player.x - c.x, player.z - c.z));
      }
      expect(caught).toBe(false);
      // Xe không áp sát thêm được chút nào (bắt đầu cách 6 m).
      expect(gap).toBeGreaterThan(5.5);
      expect(Math.hypot(player.x - c.x, player.z - c.z)).toBeGreaterThan(15);
    }
  });

  it('ô tô công an không vào hẻm: dừng ở miệng hẻm', () => {
    const p = along(main, 25);
    const player = { x: p.x, z: p.z, speed: 0 };
    const { sim, c } = intoHem('car', player);
    for (let i = 0; i < 60 * 15; i++) {
      sim.update(STEP, player, 1);
      expect(hems.at(c.x, c.z)).toBe(-1);
    }
    expect(c.speed).toBeLessThan(0.5);
    // Đỗ sát miệng hẻm (mũi xe ở mép hẻm), không dừng sớm giữa đường.
    expect(hems.entry(c.x, c.z, p.x, p.z)).toBeLessThan(POLICE_CHASE.car!.radius + 3);
  });

  it('mất dấu trong hẻm cụt: quay đầu, men theo hẻm ra tới lòng đường, không lao xuyên nhà', () => {
    const i = city.hems.findIndex((h) => h.deadEnd);
    const dead = city.hems[i]!;
    // Đứng sát đầu cụt, mặt quay vào tường cụt (phải quay đầu trong hẻm 2,4 m).
    const closedEnd = hems.isOpen(i, 0) ? 1 : 0;
    const s = closedEnd === 0 ? 1.5 : length(dead) - 1.5;
    const start = along(dead, s);
    const yaw = closedEnd === 0 ? inward(dead) + Math.PI : inward(dead);
    // Tín ở xa, khuất hẳn.
    const far = city.roads.find((r) => r.axis === 'x' && Math.abs(r.pos - start.z) > 120) ?? city.roads[0]!;
    const player = { x: start.x + 150, z: far.pos, speed: 0 };
    expect(sight.clear(start.x, start.z, player.x, player.z)).toBe(false);
    for (const cfg of [POLICE_CHASE, CHASE]) {
      const sim = new ChaseSim(net, sight, 11, cfg, hems);
      const c = sim.spawnAt(start.x, start.z, yaw, 'bike', 0);
      let out = false;
      for (let k = 0; k < 60 * 40 && !out; k++) {
        sim.update(STEP, player, 1);
        expect(inHouse(c.x, c.z)).toBe(false);
        out = onRoad(c.x, c.z);
      }
      expect(out).toBe(true);
    }
  });

  it('Tín khuất sau góc hẻm: xe tới chỗ thấy Tín lần cuối rồi mới men theo hẻm ra', () => {
    const p = along(main, 30);
    const player = { x: p.x, z: p.z, speed: 0 };
    const sim = new ChaseSim(net, sight, 13, POLICE_CHASE, hems);
    const start = along(main, 8);
    const c = sim.spawnAt(start.x, start.z, inward(main), 'bike', POLICE_CHASE.hemSpeed);
    for (let i = 0; i < 30; i++) sim.update(STEP, player, 1);
    expect(c.lastSeen).toBe(0);
    // Tín biến mất (ra chỗ khuất rất xa) — xe vẫn tới chỗ vừa thấy, rồi ra khỏi hẻm, không xuyên nhà.
    Object.assign(player, { x: p.x + 400, z: p.z + 400 });
    let reached = Infinity;
    let out = false;
    for (let i = 0; i < 60 * 30 && !out; i++) {
      sim.update(STEP, player, 1);
      reached = Math.min(reached, Math.hypot(c.x - p.x, c.z - p.z));
      expect(inHouse(c.x, c.z)).toBe(false);
      out = reached < 2 && onRoad(c.x, c.z);
    }
    expect(reached).toBeLessThan(2);
    expect(out).toBe(true);
  });
});
