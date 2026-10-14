import { describe, expect, it } from 'vitest';
import { CALL_TIME, PedestrianSim } from '@/ai/pedestrians';
import { PERSON_PATIENCE, TrafficSim, type Focus, type TrafficAgent } from '@/ai/traffic';
import { VEHICLE_SPECS, type TrafficKind } from '@/ai/trafficKinds';
import { buildTrafficNetwork, lanePoint, type TrafficLane } from '@/ai/trafficNetwork';
import { containsPoint } from '@/core/rect';
import { CARJACK, distanceToBody, driverDoor, jackableKind, jackTarget, type JackAgent } from '@/systems/carjack';
import { CAR_BODY_COLORS, TAXI_COLORS } from '@/vehicles/carModel';
import { npcCarPaint } from '@/vehicles/npcVehicleModels';
import { generateCity } from '@/world/city/layout';

/** Cướp xe (N7.1 phần 2): chọn xe, ô tô dừng chờ người chắn đầu, tài xế chạy lên vỉa hè gọi báo, xe NPC nhường chỗ. */

const city = generateCity();
const net = buildTrafficNetwork(city);
const STEP = 1 / 60;
const center: Focus = { x: city.spawn.x, z: city.spawn.z };

const car = (over: Partial<JackAgent> = {}): JackAgent => ({ kind: 'sedan', x: 0, z: 0, yaw: 0, speed: 0, ...over });

describe('chọn xe để cướp', () => {
  it('chỉ ô tô con mới cướp được', () => {
    expect(jackableKind('sedan')).toBe('sedan');
    expect(jackableKind('taxi')).toBe('taxi');
    expect(jackableKind('pickup')).toBe('pickup');
    for (const k of ['bike', 'bus', 'baGac', 'xichLo', 'cart'] as TrafficKind[]) expect(jackableKind(k)).toBeNull();
  });

  it('khoảng cách tính tới thân xe theo hướng xe, không phải tới tâm', () => {
    const half = VEHICLE_SPECS.sedan.halfWidth;
    const len = VEHICLE_SPECS.sedan.length / 2;
    // yaw = 0: đầu xe hướng +Z, bên trái là +X.
    expect(distanceToBody(car(), half + 1, 0)).toBeCloseTo(1);
    expect(distanceToBody(car(), 0, len + 0.5)).toBeCloseTo(0.5);
    expect(distanceToBody(car(), 0.2, 1)).toBe(0);
    // Xe quay ngang (đầu hướng +X): hông xe giờ nằm theo trục Z.
    expect(distanceToBody(car({ yaw: Math.PI / 2 }), 0, half + 1)).toBeCloseTo(1);
    expect(distanceToBody(car({ yaw: Math.PI / 2 }), len + 0.5, 0)).toBeCloseTo(0.5);
  });

  it('lấy xe gần nhất trong tầm tay, bỏ qua xe đang chạy nhanh, xe không cướp được, xe máy', () => {
    const side = VEHICLE_SPECS.sedan.halfWidth;
    const agents: JackAgent[] = [
      car({ kind: 'bike', x: 0.8 }), // xe máy NPC (trước `first`)
      car({ x: side + 1.1 }), // ô tô đứng yên, cách thân 1,1 m
      car({ kind: 'taxi', x: -(side + 0.6) }), // taxi gần hơn
      car({ kind: 'bus', x: 0, z: 6 }),
    ];
    expect(jackTarget(agents, 1, 0, 0)).toBe(2);
    (agents[2] as JackAgent).speed = CARJACK.maxSpeed + 0.5;
    expect(jackTarget(agents, 1, 0, 0)).toBe(1);
    (agents[1] as JackAgent).x = side + CARJACK.reach + 0.2;
    expect(jackTarget(agents, 1, 0, 0)).toBe(-1);
    // Xe buýt ngay trước mặt cũng không tính.
    expect(jackTarget(agents, 1, 0, 6 - VEHICLE_SPECS.bus.length / 2 - 0.3)).toBe(-1);
  });

  it('tài xế bị kéo ra bên trái xe', () => {
    const out = VEHICLE_SPECS.sedan.halfWidth + CARJACK.doorOut;
    expect(driverDoor(car())).toEqual({ x: out, z: 0 });
    const turned = driverDoor(car({ x: 10, z: 5, yaw: Math.PI / 2 }));
    expect(turned.x).toBeCloseTo(10);
    expect(turned.z).toBeCloseTo(5 - out);
  });

  it('màu xe cướp được trùng màu chiếc NPC: có seed theo số xe + lượt thả', () => {
    expect(npcCarPaint('taxi', 3, 1)).toEqual(TAXI_COLORS);
    const seen = new Set<string>();
    for (let id = 0; id < 40; id++) {
      const p = npcCarPaint('sedan', id, 1);
      expect(npcCarPaint('sedan', id, 1)).toEqual(p);
      expect(CAR_BODY_COLORS as readonly string[]).toContain(p.body);
      expect(p.trim).toBe(p.body);
      seen.add(p.body);
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('giao thông khi có người cướp xe', () => {
  const avenue = net.lanes.filter((l) => l.road.kind === 'avenue').reduce((best, l) => (l.length > best.length ? l : best));
  const line = (l: TrafficLane): number => l.minOffset - 0.5 + VEHICLE_SPECS.sedan.halfWidth;

  function sedanOn(l: TrafficLane): { sim: TrafficSim; agent: TrafficAgent } {
    const sim = new TrafficSim(net, center, { count: 1 });
    const agent = sim.agents[0] as TrafficAgent;
    agent.kind = 'sedan';
    agent.lane = l.id;
    agent.turn = null;
    agent.s = 0;
    agent.offset = agent.targetOffset = line(l);
    agent.speed = 0;
    const p = lanePoint(l, 0, agent.offset);
    agent.x = agent.prevX = p.x;
    agent.z = agent.prevZ = p.z;
    agent.yaw = agent.prevYaw = Math.atan2(l.dx, l.dz);
    return { sim, agent };
  }

  it('ô tô dừng lại chờ người đứng chắn đầu xe (đủ lâu để cướp), chờ mãi không được mới lách qua', () => {
    const { sim, agent } = sedanOn(avenue);
    const person = { ...lanePoint(avenue, 45, line(avenue)), radius: 0.45, person: true };
    let stoppedAt = -1;
    let waited = 0;
    let closest = Infinity;
    let i = 0;
    for (; i < 60 * 60 && agent.lane === avenue.id && !agent.turn && agent.s < 60; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, [person]);
      closest = Math.min(closest, Math.hypot(agent.x - person.x, agent.z - person.z));
      // Xe trườn chậm dần tới sát người (không bao giờ đứng khựng hẳn): dưới 0,5 m/s coi như đã dừng.
      if (agent.speed < 0.5 && agent.s > 30) {
        if (stoppedAt < 0) stoppedAt = agent.s;
        // Còn đứng nguyên trên vệt của mình (chưa đánh lái lách).
        if (Math.abs(agent.offset - line(avenue)) < 0.05) waited += STEP;
      }
    }
    // Dừng hẳn trước mặt người đó: mũi xe (cách tâm nửa chiều dài) còn cách người một khoảng.
    expect(stoppedAt).toBeGreaterThan(30);
    expect(45 - stoppedAt - VEHICLE_SPECS.sedan.length / 2).toBeGreaterThan(0.8);
    expect(waited).toBeGreaterThan(PERSON_PATIENCE - 2.5);
    // Rồi cũng đi tiếp được, không cán qua người.
    expect(agent.s).toBeGreaterThanOrEqual(60);
    expect(closest).toBeGreaterThan(VEHICLE_SPECS.sedan.halfWidth + 0.45);
  });

  it('vật cản không phải người (xe đậu, tảng đá) thì ô tô lách qua luôn, không đứng chờ', () => {
    const { sim, agent } = sedanOn(avenue);
    const rock = { ...lanePoint(avenue, 45, line(avenue)), radius: 0.45 };
    let stopped = 0;
    for (let i = 0; i < 30 * 60 && agent.lane === avenue.id && !agent.turn && agent.s < 60; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, [rock]);
      if (agent.speed < 0.5 && agent.s > 30) stopped += STEP;
    }
    expect(agent.s).toBeGreaterThanOrEqual(60);
    expect(stopped).toBeLessThan(1);
  });

  it('xe máy vẫn lách qua người như cũ (không đứng chờ)', () => {
    const sim = new TrafficSim(net, center, { count: 1 });
    const agent = sim.agents[0] as TrafficAgent;
    const mid = (avenue.minOffset + avenue.maxOffset) / 2;
    agent.lane = avenue.id;
    agent.turn = null;
    agent.s = 0;
    agent.offset = agent.targetOffset = mid;
    agent.weaveTimer = 99;
    const p = lanePoint(avenue, 0, mid);
    agent.x = agent.prevX = p.x;
    agent.z = agent.prevZ = p.z;
    const person = { ...lanePoint(avenue, 45, mid), radius: 0.45, person: true };
    let stopped = 0;
    for (let i = 0; i < 30 * 60 && agent.lane === avenue.id && !agent.turn && agent.s < 60; i++) {
      sim.step(STEP, { x: agent.x, z: agent.z }, [person]);
      if (agent.speed < 0.5 && agent.s > 30) stopped += STEP;
    }
    expect(agent.s).toBeGreaterThanOrEqual(60);
    expect(stopped).toBeLessThan(1);
  });

  it('respawn(): xe bị cướp hiện lại ở xa người chơi như một chiếc khác', () => {
    const sim = new TrafficSim(net, center, { count: 4, cars: 3 });
    for (let i = 0; i < 120; i++) sim.step(STEP, center);
    const index = sim.bikes;
    const agent = sim.agents[index] as TrafficAgent;
    const generation = agent.generation;
    const before = sim.respawns;
    sim.respawn(index, center);
    expect(agent.generation).toBe(generation + 1);
    expect(sim.respawns).toBe(before + 1);
    const d = Math.hypot(agent.x - center.x, agent.z - center.z);
    expect(d).toBeGreaterThanOrEqual(sim.options.respawnMin);
    expect(d).toBeLessThanOrEqual(sim.options.respawnMax);
    expect(agent.kind).toBe('sedan');
    // Chỉ số ngoài dải thì bỏ qua.
    expect(() => sim.respawn(99, center)).not.toThrow();
  });
});

describe('tài xế bị kéo khỏi xe', () => {
  // Một chỗ giữa lòng đường: tim làn xe đầu tiên của một con đường thường.
  const street = net.lanes.find((l) => l.road.kind === 'street' && l.length > 40) as TrafficLane;
  const spot = lanePoint(street, street.length / 2, street.minOffset);
  const player = { x: spot.x + 1.5, z: spot.z + 1.5 };
  const onSidewalk = (x: number, z: number): boolean => city.blocks.some((b) => containsPoint(b.rect, x, z));

  it('lấy người ở xa nhất làm tài xế: bắt đầu ở cửa xe, chạy lên vỉa hè gần đó rồi gọi công an', () => {
    const sim = new PedestrianSim(city, player, { count: 30 });
    const farthest = [...sim.walkers].sort((a, b) => Math.hypot(b.x - player.x, b.z - player.z) - Math.hypot(a.x - player.x, a.z - player.z))[0]!;
    const generation = farthest.generation;
    expect(onSidewalk(spot.x, spot.z)).toBe(false);
    const driver = sim.eject(spot.x, spot.z, player);
    expect(driver).toBe(farthest);
    if (!driver) return;
    expect(driver.generation).toBe(generation + 1);
    expect(driver.x).toBeCloseTo(spot.x);
    expect(driver.z).toBeCloseTo(spot.z);
    expect(driver.react).toBe('call');
    expect(driver.enter).toBeGreaterThan(0);

    // Chạy lên vỉa hè: mỗi bước đi liền mạch, tới nơi thì đứng trên vỉa hè cách cửa xe không xa.
    let maxStep = 0;
    let frames = 0;
    while (driver.enter > 0 && frames < 600) {
      const x = driver.x;
      const z = driver.z;
      sim.step(STEP, player);
      maxStep = Math.max(maxStep, Math.hypot(driver.x - x, driver.z - z));
      frames++;
    }
    expect(frames).toBeLessThan(5 * 60);
    expect(maxStep).toBeLessThan(0.12);
    expect(onSidewalk(driver.x, driver.z)).toBe(true);
    expect(Math.hypot(driver.x - spot.x, driver.z - spot.z)).toBeLessThan(street.road.width);

    // Gọi xong (CALL_TIME giây) thì có một cuộc báo công an.
    expect(sim.reports).toBe(0);
    for (let i = 0; i < (CALL_TIME + 1) * 60; i++) sim.step(STEP, player);
    expect(sim.reports).toBe(1);
    expect(driver.react).toBe('none');
  });

  it('đánh tài xế lúc đang gọi thì cuộc gọi bị cắt, không có báo công an', () => {
    const sim = new PedestrianSim(city, player, { count: 30 });
    const driver = sim.eject(spot.x, spot.z, player)!;
    for (let i = 0; i < 60 && driver.enter > 0; i++) sim.step(STEP, player);
    sim.hit(driver.id, 10, player.x, player.z, false);
    expect(sim.callsStopped).toBe(1);
    for (let i = 0; i < (CALL_TIME + 3) * 60; i++) sim.step(STEP, player);
    expect(sim.reports).toBe(0);
  });

  it('không còn ai rảnh thì trả null', () => {
    const sim = new PedestrianSim(city, player, { count: 3 });
    for (const w of sim.walkers) w.dead = true;
    expect(sim.eject(spot.x, spot.z, player)).toBeNull();
  });
});
