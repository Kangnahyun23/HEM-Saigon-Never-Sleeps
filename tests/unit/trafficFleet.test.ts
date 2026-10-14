import { describe, expect, it } from 'vitest';
import { TrafficSim, type Focus, type Obstacle, type TrafficAgent } from '@/ai/traffic';
import { bodyHalfExtents, fleetKinds, VEHICLE_SPECS, type TrafficKind } from '@/ai/trafficKinds';
import { buildTrafficNetwork, lanePoint, turnKind, type TrafficLane } from '@/ai/trafficNetwork';
import { containsPoint } from '@/core/rect';
import { npcVehicleParts, type NpcVehicleKind } from '@/vehicles/npcVehicleModels';
import { carSpots } from '@/world/city/carSpots';
import { generateCity } from '@/world/city/layout';

/**
 * Giao thông đa dạng (N7.2): ô tô / taxi / buýt chạy sát tim đường, ba gác / xích lô / xe đẩy sát lề,
 * xe lớn qua giao lộ theo lượt. Xe máy thuần đã có traffic.test.ts.
 */

const city = generateCity();
const net = buildTrafficNetwork(city);
const STEP = 1 / 60;
const center: Focus = { x: city.spawn.x, z: city.spawn.z };
const NON_BIKES = ['sedan', 'taxi', 'pickup', 'police', 'bus', 'baGac', 'xichLo', 'cart'] as const satisfies readonly NpcVehicleKind[];

const lane = (id: number): TrafficLane => net.lanes[id] as TrafficLane;
const longest = (kind?: 'avenue' | 'street'): TrafficLane =>
  net.lanes.filter((l) => !kind || l.road.kind === kind).reduce((best, l) => (l.length > best.length ? l : best));
/** Vệt quen của một loại xe trên làn (cùng công thức với mô phỏng): sát tim đường hoặc sát lề. */
const home = (kind: TrafficKind, l: TrafficLane): number => {
  const spec = VEHICLE_SPECS[kind];
  return spec.position === 'inner' ? l.minOffset - 0.5 + spec.halfWidth : l.maxOffset + 0.5 - spec.halfWidth;
};

/** Đặt xe ở quãng `s` trên làn với độ lệch `offset`, tốc độ `speed`. */
function putAt(agent: TrafficAgent, l: TrafficLane, s: number, offset: number, speed: number): void {
  agent.lane = l.id;
  agent.turn = null;
  agent.s = s;
  agent.offset = agent.targetOffset = offset;
  agent.speed = speed;
  const p = lanePoint(l, s, offset);
  agent.x = agent.prevX = p.x;
  agent.z = agent.prevZ = p.z;
  agent.yaw = agent.prevYaw = Math.atan2(l.dx, l.dz);
}

/** Một xe loại `kind` chạy một mình trên làn dài nhất (đổi loại của xe máy duy nhất — mô phỏng đọc `kind` mỗi bước). */
function solo(kind: TrafficKind, l: TrafficLane, s = 0): { sim: TrafficSim; agent: TrafficAgent } {
  const sim = new TrafficSim(net, center, { count: 1 });
  const agent = sim.agents[0] as TrafficAgent;
  agent.kind = kind;
  putAt(agent, l, s, VEHICLE_SPECS[kind].position === 'spread' ? (l.minOffset + l.maxOffset) / 2 : home(kind, l), 0);
  return { sim, agent };
}

function parkedCars(): Obstacle[] {
  const out: Obstacle[] = [];
  for (const s of carSpots(city, 7)) {
    const fx = Math.sin(s.yaw) * 1.1;
    const fz = Math.cos(s.yaw) * 1.1;
    out.push({ x: s.x + fx, z: s.z + fz, radius: 1.05 }, { x: s.x - fx, z: s.z - fz, radius: 1.05 });
  }
  return out;
}

describe('loại xe', () => {
  it('chia đàn: xe máy trước, rồi ô tô (có buýt, taxi), rồi xe thô sơ', () => {
    const kinds = fleetKinds(5, 7, 3);
    expect(kinds.slice(0, 5).every((k) => k === 'bike')).toBe(true);
    expect(kinds.slice(5, 12)).toContain('bus');
    expect(kinds.slice(5, 12)).toContain('taxi');
    expect(kinds.slice(5, 12)).toContain('pickup');
    expect(kinds.slice(12)).toEqual(['baGac', 'xichLo', 'cart']);
    // Ba ô tô đầu tiên đã có một xe buýt, bốn chiếc có một xe công an đi tuần (máy yếu chỉ có 4 ô tô).
    expect(fleetKinds(0, 3, 0)).toContain('bus');
    expect(fleetKinds(0, 4, 0).filter((k) => k === 'police')).toHaveLength(1);
    expect(fleetKinds(0, 10, 0).filter((k) => k === 'police')).toHaveLength(1);
  });

  it('mô phỏng tạo đúng số xe, xe máy nằm đầu mảng', () => {
    const sim = new TrafficSim(net, center, { count: 20, cars: 6, slow: 3 });
    expect(sim.agents).toHaveLength(29);
    expect(sim.bikes).toBe(20);
    expect(sim.agents.slice(0, 20).every((a) => a.kind === 'bike')).toBe(true);
    expect(sim.agents.slice(20).some((a) => a.kind === 'bike')).toBe(false);
    sim.agents.forEach((a, i) => expect(a.id).toBe(i));
  });

  it('thân va chạm vừa với kích thước từng loại', () => {
    expect(bodyHalfExtents('bike')).toEqual({ x: 0.32, y: 0.6, z: 0.95 });
    for (const kind of NON_BIKES) {
      const spec = VEHICLE_SPECS[kind];
      const half = bodyHalfExtents(kind);
      expect(half.z).toBeCloseTo(spec.length / 2);
      expect(half.x).toBeLessThan(spec.halfWidth);
      expect(half.y * 2).toBeCloseTo(spec.height);
    }
    // Ô tô to hơn xe máy, buýt to hơn ô tô; xe thô sơ chậm dần: ba gác > xích lô > xe đẩy.
    expect(VEHICLE_SPECS.bus.length).toBeGreaterThan(VEHICLE_SPECS.sedan.length * 1.8);
    expect(VEHICLE_SPECS.baGac.maxSpeed).toBeGreaterThan(VEHICLE_SPECS.xichLo.maxSpeed);
    expect(VEHICLE_SPECS.xichLo.maxSpeed).toBeGreaterThan(VEHICLE_SPECS.cart.maxSpeed);
  });

  it.each(NON_BIKES)('mẫu xe %s nằm gọn trong kích thước đã khai', (kind) => {
    const spec = VEHICLE_SPECS[kind];
    const parts = npcVehicleParts(kind);
    expect(parts.length).toBeGreaterThan(8);
    let lowest = Infinity;
    for (const p of parts) {
      const [sx, sy, sz] = p.shape === 'box' ? p.size : [p.size[1], p.size[0] * 2, p.size[0] * 2];
      // Khối nghiêng: nới thêm cho phần chéo ra; khối thẳng: cản xe, biển số nhô ra vài phân.
      const slack = p.tilt ? 0.2 : 0.08;
      expect(Math.abs(p.pos[0]) + sx / 2, `${kind}: bề ngang`).toBeLessThanOrEqual(spec.halfWidth + 0.25);
      expect(Math.abs(p.pos[2]) + sz / 2, `${kind}: chiều dài`).toBeLessThanOrEqual(spec.length / 2 + slack);
      expect(p.pos[1] + sy / 2, `${kind}: chiều cao`).toBeLessThanOrEqual(spec.height + slack);
      lowest = Math.min(lowest, p.pos[1] - sy / 2);
    }
    // Bánh xe (hoặc chân người đẩy) chạm đất, không khối nào chìm dưới mặt đường.
    expect(lowest).toBeGreaterThanOrEqual(-0.03);
    expect(lowest).toBeLessThan(0.03);
    const motor = kind !== 'xichLo' && kind !== 'cart';
    if (motor) {
      expect(parts.some((p) => p.lamp && p.pos[2] > spec.length / 4)).toBe(true);
      expect(parts.some((p) => p.lamp && p.pos[2] < -spec.length / 4)).toBe(true);
    }
  });
});

describe('TrafficSim — nhiều loại xe', () => {
  it('cùng seed → cùng diễn biến', () => {
    const a = new TrafficSim(net, center, { count: 30, cars: 7, slow: 4 });
    const b = new TrafficSim(net, center, { count: 30, cars: 7, slow: 4 });
    for (let i = 0; i < 15 * 60; i++) {
      a.step(STEP, center);
      b.step(STEP, center);
    }
    expect(a.agents.map((g) => [g.kind, g.x.toFixed(4), g.z.toFixed(4)])).toEqual(b.agents.map((g) => [g.kind, g.x.toFixed(4), g.z.toFixed(4)]));
  });

  it('đủ loại xe cùng chạy: không ra khỏi lòng đường, không kẹt cứng, xe lớn không chồng lên nhau', () => {
    const sim = new TrafficSim(net, center, { count: 80, cars: 10, slow: 6 });
    const obstacles = parkedCars();
    let bikeSpeed = 0;
    let bikeSamples = 0;
    let bigSpeed = 0;
    let bigSamples = 0;
    let worstBig = Infinity;
    const longestStop = sim.agents.map(() => 0);
    let worstStop = 0;
    for (let i = 0; i < 150 * 60; i++) {
      sim.step(STEP, center, obstacles);
      if (i % 30 !== 0) continue;
      sim.agents.forEach((a, k) => {
        const spec = VEHICLE_SPECS[a.kind];
        expect(city.roads.some((r) => containsPoint(r.rect, a.x, a.z))).toBe(true);
        if (!a.turn) {
          // Cả thân xe nằm trong nửa đường của mình: không lấn tim đường / dải phân cách, không leo lề.
          const l = lane(a.lane);
          expect(a.offset - spec.halfWidth).toBeGreaterThan(l.road.kind === 'avenue' ? 0.9 : 0);
          expect(a.offset + spec.halfWidth).toBeLessThan(l.road.width / 2);
        }
        if (a.kind === 'bike') {
          bikeSpeed += a.speed;
          bikeSamples++;
        } else if (spec.big) {
          bigSpeed += a.speed;
          bigSamples++;
        }
        longestStop[k] = a.speed < 0.2 ? (longestStop[k] as number) + 0.5 : 0;
        worstStop = Math.max(worstStop, longestStop[k] as number);
      });
      const bigs = sim.agents.filter((a) => VEHICLE_SPECS[a.kind].big && !a.turn);
      for (let p = 0; p < bigs.length; p++) {
        for (let q = p + 1; q < bigs.length; q++) {
          const a = bigs[p] as TrafficAgent;
          const b = bigs[q] as TrafficAgent;
          if (a.lane !== b.lane) continue;
          const lat = Math.abs(a.offset - b.offset) - (VEHICLE_SPECS[a.kind].halfWidth + VEHICLE_SPECS[b.kind].halfWidth);
          const lon = Math.abs(a.s - b.s) - (VEHICLE_SPECS[a.kind].length + VEHICLE_SPECS[b.kind].length) / 2;
          worstBig = Math.min(worstBig, Math.max(lat, lon));
        }
      }
    }
    // Xe máy vẫn chạy thoáng (> 20 km/h trung bình); ô tô có chờ ở ngã tư nhưng vẫn đi được.
    expect(bikeSpeed / bikeSamples).toBeGreaterThan(5.5);
    expect(bigSpeed / bigSamples).toBeGreaterThan(2.5);
    // Không xe nào đứng ì quá một phút rưỡi (kẹt vĩnh viễn thì con số này bằng cả thời gian chạy).
    expect(worstStop).toBeLessThan(90);
    // Hai xe lớn cùng làn giữ khoảng cách (cho phép chạm nhẹ lúc nhập làn).
    expect(worstBig).toBeGreaterThan(-0.6);
  });

  it('xe lớn qua giao lộ theo lượt: xe rẽ trái có giao lộ cho riêng mình, xe đi thẳng / rẽ phải cùng trục thì đi chung', () => {
    const sim = new TrafficSim(net, center, { count: 40, cars: 14, slow: 4 });
    let shared = 0;
    for (let i = 0; i < 180 * 60; i++) {
      sim.step(STEP, center);
      const inJunction = new Map<number, TrafficAgent[]>();
      for (const a of sim.agents) {
        if (!a.turn || !VEHICLE_SPECS[a.kind].big) continue;
        const node = lane(a.lane).to;
        inJunction.set(node, [...(inJunction.get(node) ?? []), a]);
      }
      for (const group of inJunction.values()) {
        if (group.length < 2) continue;
        shared++;
        const axes = new Set(group.map((a) => (Math.abs(lane(a.lane).dx) > 0.5 ? 'x' : 'z')));
        expect(axes.size).toBe(1);
        for (const a of group) expect(['straight', 'right']).toContain(turnKind(lane(a.lane), lane(a.next)));
      }
    }
    // Có lúc hai xe cùng qua (không phải lúc nào cũng từng chiếc một).
    expect(shared).toBeGreaterThan(0);
  });

  it('ô tô chạy sát tim đường, xe thô sơ sát lề', () => {
    const sim = new TrafficSim(net, center, { count: 0, cars: 7, slow: 6 });
    for (let i = 0; i < 20 * 60; i++) sim.step(STEP, center);
    for (const a of sim.agents) {
      if (a.turn || a.hold > 0) continue;
      const l = lane(a.lane);
      const spec = VEHICLE_SPECS[a.kind];
      const mid = (l.minOffset + l.maxOffset) / 2;
      if (spec.position === 'inner') expect(a.targetOffset).toBeLessThan(mid);
      else expect(a.targetOffset).toBeGreaterThan(mid);
    }
  });

  it('tốc độ theo loại: ô tô > buýt > ba gác > xích lô > xe đẩy (đi bộ)', () => {
    const l = longest('avenue');
    const top: Record<string, number> = {};
    for (const kind of ['sedan', 'bus', 'baGac', 'xichLo', 'cart'] as const) {
      const { sim, agent } = solo(kind, l);
      agent.temper = 1;
      let best = 0;
      for (let i = 0; i < 14 * 60 && agent.lane === l.id && !agent.turn; i++) {
        sim.step(STEP, { x: agent.x, z: agent.z });
        if (l.length - agent.s > 45) best = Math.max(best, agent.speed);
      }
      top[kind] = best;
    }
    expect(top.sedan).toBeGreaterThan(top.bus as number);
    expect(top.bus).toBeGreaterThan(top.baGac as number);
    expect(top.baGac).toBeGreaterThan(top.xichLo as number);
    expect(top.xichLo).toBeGreaterThan(top.cart as number);
    expect(top.sedan).toBeGreaterThan(11);
    expect(top.cart).toBeLessThan(1.5);
    expect(top.cart).toBeGreaterThan(0.9);
  });

  it('ô tô lách vật cản đứng yên trên vệt của mình rồi trở về vệt cũ', () => {
    const l = longest('avenue');
    const { sim, agent } = solo('sedan', l);
    const line = home('sedan', l);
    const rock = { ...lanePoint(l, 40, line), radius: 0.8 };
    let closest = Infinity;
    let widest = 0;
    for (let i = 0; i < 14 * 60 && agent.lane === l.id && !agent.turn && agent.s < 75; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, [rock]);
      closest = Math.min(closest, Math.hypot(agent.x - rock.x, agent.z - rock.z));
      widest = Math.max(widest, agent.offset - line);
    }
    expect(agent.s).toBeGreaterThan(60);
    // Không cán qua vật cản: tim xe cách tâm vật cản hơn (nửa bề ngang xe + bán kính).
    expect(closest).toBeGreaterThan(VEHICLE_SPECS.sedan.halfWidth + rock.radius);
    expect(widest).toBeGreaterThan(1.5);
    expect(Math.abs(agent.offset - line)).toBeLessThan(0.15);
  });

  it('xe đẩy sát lề lách qua ô tô đậu rồi về lại sát lề', () => {
    const l = longest('street');
    const { sim, agent } = solo('cart', l, 10);
    const line = home('cart', l);
    // Ô tô đậu sát bó vỉa (hai vòng tròn đầu + đuôi như game báo cho giao thông).
    const curb = l.road.width / 2 - 0.35 - 0.9;
    const parked = [20.9, 23.1].map((s) => ({ ...lanePoint(l, s, curb), radius: 1.05 }));
    let closest = Infinity;
    for (let i = 0; i < 40 * 60 && agent.s < 30; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, parked);
      for (const o of parked) closest = Math.min(closest, Math.hypot(agent.x - o.x, agent.z - o.z));
    }
    expect(agent.s).toBeGreaterThanOrEqual(30);
    expect(closest).toBeGreaterThan(VEHICLE_SPECS.cart.halfWidth + 1.05);
    for (let i = 0; i < 12 * 60 && agent.lane === l.id && !agent.turn; i++) sim.step(STEP, { x: agent.x, z: agent.z }, parked);
    if (agent.lane === l.id && !agent.turn) expect(Math.abs(agent.offset - line)).toBeLessThan(0.15);
  });

  it('ô tô không chen lấn xe máy đang chạy, nhưng xe máy thì vượt xe đẩy', () => {
    const l = longest('avenue');
    // Ô tô sau một xe máy chạy 9 m/s cùng vệt: bám theo, không đánh lái.
    const follow = new TrafficSim(net, center, { count: 1, cars: 1 });
    const bike = follow.agents[0] as TrafficAgent;
    const car = follow.agents[1] as TrafficAgent;
    expect(car.kind).toBe('sedan');
    const line = home('sedan', l);
    putAt(bike, l, 22, line, 9);
    putAt(car, l, 5, line, 9);
    bike.weaveTimer = 99;
    let drift = 0;
    for (let i = 0; i < 4 * 60; i++) {
      follow.step(STEP, { x: car.x, z: car.z });
      drift = Math.max(drift, Math.abs(car.offset - line));
    }
    expect(drift).toBeLessThan(0.05);
    expect(bike.s - car.s).toBeGreaterThan((VEHICLE_SPECS.sedan.length + VEHICLE_SPECS.bike.length) / 2);

    // Xe máy sau một xe đẩy (đi bộ): dạt ra vượt.
    const pass = new TrafficSim(net, center, { count: 1, slow: 3 });
    const rider = pass.agents[0] as TrafficAgent;
    const cart = pass.agents.find((a) => a.kind === 'cart') as TrafficAgent;
    for (const a of pass.agents) if (a !== rider && a !== cart) putAt(a, lane(l.id ^ 1), 0, 3, 0);
    const curb = home('cart', l);
    putAt(cart, l, 30, curb, 1);
    putAt(rider, l, 5, curb - 0.2, 8);
    rider.weaveTimer = 99;
    for (let i = 0; i < 10 * 60 && rider.lane === l.id && !rider.turn && rider.s < cart.s + 6; i++) pass.step(STEP, { x: rider.x, z: rider.z });
    expect(rider.s).toBeGreaterThan(cart.s + 3);
  });

  it('xe buýt bám đại lộ: còn đường đại lộ để đi tiếp thì không rẽ vào đường thường', () => {
    const l = longest('avenue');
    const { sim, agent } = solo('bus', l);
    let previous = agent.lane;
    let choices = 0;
    let onAvenue = 0;
    let samples = 0;
    for (let i = 0; i < 240 * 60; i++) {
      // Tiêu điểm đi theo xe buýt nên nó không bị thả lại.
      sim.step(STEP, { x: agent.x, z: agent.z });
      if (agent.lane !== previous) {
        const from = lane(previous);
        const options = (net.nodes[from.to]?.out ?? []).filter((id) => lane(id).to !== from.from);
        if (options.some((id) => lane(id).road.kind === 'avenue')) {
          choices++;
          expect(lane(agent.lane).road.kind).toBe('avenue');
        }
        previous = agent.lane;
      }
      if (i % 60 === 0) {
        samples++;
        if (lane(agent.lane).road.kind === 'avenue') onAvenue++;
      }
    }
    expect(sim.respawns).toBe(0);
    expect(choices).toBeGreaterThan(3);
    // Đại lộ chỉ chiếm 1/6 số làn; xe buýt ở trên đó nhiều gấp mấy lần mức ngẫu nhiên (ra tới rìa khu thì phải vòng lại).
    expect(onAvenue / samples).toBeGreaterThan(0.35);
  });

  it('bị chắn đường: xe có còi thì bóp, xích lô và xe đẩy thì không', () => {
    const l = longest('avenue');
    const honksOf = (kind: TrafficKind): number => {
      const { sim, agent } = solo(kind, l);
      const wall: Obstacle[] = [];
      for (let k = l.minOffset - 1.5; k <= l.maxOffset + 1.5; k += 0.8) wall.push({ ...lanePoint(l, 18, k), radius: 0.5 });
      let honks = 0;
      for (let i = 0; i < 16 * 60; i++) {
        sim.step(STEP, { x: agent.x, z: agent.z }, wall);
        honks += sim.honks.filter((h) => h.kind === kind).length;
      }
      expect(agent.s).toBeLessThan(18);
      return honks;
    };
    expect(honksOf('bus')).toBeGreaterThanOrEqual(1);
    expect(honksOf('sedan')).toBeGreaterThanOrEqual(1);
    expect(honksOf('xichLo')).toBe(0);
    expect(honksOf('cart')).toBe(0);
  });
});
