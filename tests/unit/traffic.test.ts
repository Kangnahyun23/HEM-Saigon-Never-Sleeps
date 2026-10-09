import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { TrafficSim, type Focus, type Obstacle } from '@/ai/traffic';
import { buildTrafficNetwork, lanePoint, turnKind, type TrafficLane } from '@/ai/trafficNetwork';
import { generateCity } from '@/world/city/layout';

const city = generateCity();
const net = buildTrafficNetwork(city);
const STEP = 1 / 60;
const center: Focus = { x: city.spawn.x, z: city.spawn.z };

function run(sim: TrafficSim, seconds: number, focus: Focus = center, obstacles: Obstacle[] = []): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) sim.step(STEP, focus, obstacles);
}

const longestLane = (): TrafficLane => net.lanes.reduce((best, l) => (l.length > best.length ? l : best));

/** Đặt xe ở quãng `s` trên làn, độ lệch giữa dải, tốc độ `speed`. */
function putAt(agent: TrafficSim['agents'][number], lane: TrafficLane, s: number, speed: number): void {
  agent.lane = lane.id;
  agent.turn = null;
  agent.s = s;
  agent.offset = agent.targetOffset = (lane.minOffset + lane.maxOffset) / 2;
  agent.speed = speed;
  const p = lanePoint(lane, s, agent.offset);
  agent.x = p.x;
  agent.z = p.z;
  agent.yaw = Math.atan2(lane.dx, lane.dz);
}

const onSomeRoad = (x: number, z: number): boolean => city.roads.some((r) => containsPoint(r.rect, x, z));

describe('buildTrafficNetwork', () => {
  it('mỗi giao lộ là một nút, mỗi đoạn đường có hai làn ngược chiều', () => {
    const nz = city.roads.filter((r) => r.axis === 'z').length;
    const nx = city.roads.filter((r) => r.axis === 'x').length;
    expect(net.nodes).toHaveLength(nz * nx);
    expect(net.lanes).toHaveLength(2 * (nz * (nx - 1) + nx * (nz - 1)));
    for (const node of net.nodes) expect(node.out.length).toBeGreaterThanOrEqual(2);
  });

  it('đi bên phải: hướng +x nằm phía +z, hướng +z nằm phía −x so với tim đường', () => {
    for (const lane of net.lanes) {
      const mid = lanePoint(lane, lane.length / 2, (lane.minOffset + lane.maxOffset) / 2);
      if (lane.dx > 0.9) expect(mid.z).toBeGreaterThan(lane.road.pos);
      if (lane.dz > 0.9) expect(mid.x).toBeLessThan(lane.road.pos);
      expect(lane.maxOffset).toBeGreaterThan(lane.minOffset);
      expect(lane.maxOffset).toBeLessThan(lane.road.width / 2);
      expect(lane.length).toBeGreaterThan(10);
    }
  });

  it('phân loại hướng rẽ', () => {
    const lane = net.lanes.find((l) => l.dx > 0.9) as TrafficLane;
    const kinds = new Set(net.nodes[lane.to]?.out.map((id) => turnKind(lane, net.lanes[id] as TrafficLane)));
    expect(kinds.has('uturn')).toBe(true);
    expect([...kinds].some((k) => k === 'straight' || k === 'left' || k === 'right')).toBe(true);
    // Đang chạy +x thì bên phải là +z ⇒ rẽ sang làn hướng +z là rẽ phải.
    const right = net.lanes.find((l) => l.from === lane.to && l.dz > 0.9);
    if (right) expect(turnKind(lane, right)).toBe('right');
  });
});

describe('TrafficSim', () => {
  it('cùng seed → cùng diễn biến', () => {
    const a = new TrafficSim(net, center, { count: 30 });
    const b = new TrafficSim(net, center, { count: 30 });
    run(a, 10);
    run(b, 10);
    expect(a.agents.map((g) => [g.x.toFixed(4), g.z.toFixed(4)])).toEqual(b.agents.map((g) => [g.x.toFixed(4), g.z.toFixed(4)]));
  });

  it('xe luôn chạy trên mặt đường, không kẹt cứng cả phố', () => {
    const sim = new TrafficSim(net, center, { count: 80 });
    let speedSum = 0;
    let samples = 0;
    for (let sec = 0; sec < 90; sec++) {
      run(sim, 1);
      for (const g of sim.agents) {
        expect(onSomeRoad(g.x, g.z)).toBe(true);
        speedSum += g.speed;
        samples++;
      }
    }
    // Trung bình phải chạy được (> 15 km/h), không phải cả đàn đứng chờ nhau.
    expect(speedSum / samples).toBeGreaterThan(4);
    const moving = sim.agents.filter((g) => g.speed > 1).length;
    expect(moving).toBeGreaterThan(sim.agents.length * 0.5);
  });

  it('xe không chồng lên nhau khi chạy cùng chiều', () => {
    const sim = new TrafficSim(net, center, { count: 80 });
    let worst = Infinity;
    for (let sec = 0; sec < 60; sec++) {
      run(sim, 0.5);
      const agents = sim.agents.filter((g) => !g.turn);
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const a = agents[i]!;
          const b = agents[j]!;
          if (a.lane !== b.lane) continue;
          worst = Math.min(worst, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
    }
    expect(worst).toBeGreaterThan(0.9);
  });

  it('phanh dừng trước người chơi chắn hết bề ngang đường, rồi bóp còi', () => {
    const sim = new TrafficSim(net, center, { count: 1 });
    const agent = sim.agents[0]!;
    const lane = longestLane();
    putAt(agent, lane, 0, 9);
    // Một hàng vật cản phủ kín nửa đường cách 30 m: không lách được, phải dừng.
    const wall: Obstacle[] = [];
    for (let k = lane.minOffset - 1; k <= lane.maxOffset + 1; k += 0.8) wall.push({ ...lanePoint(lane, 30, k), radius: 0.5 });
    let honks = 0;
    for (let i = 0; i < 8 * 60; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, wall);
      honks += sim.honks.length;
    }
    expect(agent.lane).toBe(lane.id);
    // Bị chắn đường thì bóp còi, nhưng không inh ỏi liên tục (tối đa một lần / 3,5 s).
    expect(honks).toBeGreaterThanOrEqual(1);
    expect(honks).toBeLessThanOrEqual(3);
    expect(agent.speed).toBeLessThan(0.3);
    expect(30 - agent.s).toBeGreaterThan(1.5);
  });

  it('lách qua vật cản đứng yên khi bên cạnh còn chỗ', () => {
    const sim = new TrafficSim(net, center, { count: 1, seed: 3 });
    const agent = sim.agents[0]!;
    const lane = longestLane();
    putAt(agent, lane, 0, 8);
    const stone = lanePoint(lane, 30, agent.offset);
    const obstacles = [{ ...stone, radius: 0.5 }];
    let passed = false;
    for (let i = 0; i < 60 * 10; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, obstacles);
      if (agent.lane === lane.id && agent.s > 32) {
        passed = true;
        break;
      }
    }
    expect(passed).toBe(true);
  });

  it('bong bóng: người chơi đi xa thì xe được thả lại quanh người chơi', () => {
    const sim = new TrafficSim(net, center, { count: 40 });
    run(sim, 1);
    const far: Focus = { x: -center.x, z: -center.z + 10 };
    run(sim, 1, far);
    for (const g of sim.agents) expect(Math.hypot(g.x - far.x, g.z - far.z)).toBeLessThanOrEqual(sim.options.despawnRadius + 20);
    expect(sim.respawns).toBeGreaterThan(0);
  });
});
