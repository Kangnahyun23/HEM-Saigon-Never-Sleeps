import { describe, expect, it } from 'vitest';
import { ChaseSim, chaserCapacity, POLICE_CHASE, type ChasePlayer } from '@/ai/chase';
import { PATROL, patrolWitness, type PatrolAgent } from '@/ai/patrol';
import { buildTrafficNetwork, lanePoint, type TrafficLane } from '@/ai/trafficNetwork';
import { containsPoint } from '@/core/rect';
import { SightGrid } from '@/systems/heat';
import { generateCity } from '@/world/city/layout';

/** Xe tuần tra (N7.3): ô tô công an trong truy đuổi, chốt chặn từ 3 sao, xe tuần tra trong dòng xe thấy Tín gây án. */

const city = generateCity();
const net = buildTrafficNetwork(city);
const sight = new SightGrid(city.lots.map((l) => l.rect));
const STEP = 1 / 60;
const onSidewalkOrHouse = (x: number, z: number): boolean => city.blocks.some((b) => containsPoint(b.rect, x, z));
const avenue = net.lanes.filter((l) => l.road.kind === 'avenue').reduce((best, l) => (l.length > best.length ? l : best));

/** Tín chạy dọc làn `lane` từ quãng `s` với tốc độ `speed`. */
function runner(lane: TrafficLane, s: number, speed: number): ChasePlayer {
  const p = lanePoint(lane, s, (lane.minOffset + lane.maxOffset) / 2);
  return { x: p.x, z: p.z, speed, dirX: lane.dx, dirZ: lane.dz };
}

describe('ô tô công an truy đuổi', () => {
  it('từ 3 sao có ô tô trong đoàn xe, số ô tô tăng theo sao', () => {
    const player = { x: city.spawn.x, z: city.spawn.z, speed: 0 };
    for (const [level, cars] of [[1, 0], [2, 0], [3, 1], [4, 2], [5, 3]] as const) {
      const sim = new ChaseSim(net, sight, 5, POLICE_CHASE);
      sim.update(STEP, player, level);
      expect(sim.chasers).toHaveLength(POLICE_CHASE.perLevel[level]!);
      expect(sim.chasers.filter((c) => c.kind === 'car')).toHaveLength(cars);
    }
  });

  it('ô tô không nghiêng khi cua, nhanh hơn xe máy trên đường thẳng, dừng trước Tín trong tầm bắt', () => {
    const sim = new ChaseSim(net, sight, 9, POLICE_CHASE);
    // Một ô tô và một xe máy cùng xuất phát trên đại lộ; Tín ở xa ngoài tầm nhìn ⇒ cả hai chạy theo mạng đường.
    const start = lanePoint(avenue, 5, avenue.minOffset + 1);
    const start2 = lanePoint(avenue, 5, avenue.maxOffset - 1);
    const yaw = Math.atan2(avenue.dx, avenue.dz);
    const car = sim.spawnAt(start.x, start.z, yaw, 'car', 0);
    const bike = sim.spawnAt(start2.x, start2.z, yaw, 'bike', 0);
    const far = { x: start.x + avenue.dx * 600, z: start.z + avenue.dz * 600, speed: 0 };
    let carTop = 0;
    let bikeTop = 0;
    let lean = 0;
    for (let i = 0; i < 15 * 60; i++) {
      // Sao cao (đủ xe) để không xe nào bị cho rút lui.
      sim.update(STEP, far, 5);
      carTop = Math.max(carTop, car.speed);
      bikeTop = Math.max(bikeTop, bike.speed);
      lean = Math.max(lean, Math.abs(car.lean));
    }
    expect(lean).toBe(0);
    expect(carTop).toBeGreaterThan(bikeTop);
    expect(carTop).toBeLessThanOrEqual(POLICE_CHASE.car!.maxSpeed + 0.01);
    // Tín đứng yên ngay trước mũi ô tô: ô tô phanh, dừng xa hơn xe máy dừng nhưng vẫn trong tầm bắt.
    const from = lanePoint(avenue, 5, avenue.minOffset + 1);
    const p = lanePoint(avenue, 45, avenue.minOffset + 1);
    Object.assign(car, { x: from.x, z: from.z, prevX: from.x, prevZ: from.z, yaw, speed: 0 });
    Object.assign(bike, { x: from.x + 400, z: from.z, leaving: true });
    const near = { x: p.x, z: p.z, speed: 0 };
    for (let i = 0; i < 10 * 60; i++) sim.update(STEP, near, 5);
    const dCar = Math.hypot(car.x - near.x, car.z - near.z);
    expect(dCar).toBeGreaterThan(POLICE_CHASE.car!.stopGap - 0.4);
    expect(dCar).toBeLessThan(POLICE_CHASE.car!.catchRange);
  });

  it('xe bỏ lại (công an bị hạ) không làm đoàn xe vượt sức chứa: bỏ bớt xe bỏ lại ở xa nhất, xe đuổi vẫn đủ', () => {
    const cap = chaserCapacity(POLICE_CHASE);
    const player = runner(avenue, avenue.length / 2, 0);
    const sim = new ChaseSim(net, sight, 5, POLICE_CHASE);
    // 16 xe bỏ lại xếp hàng sau lưng Tín (cách 5, 8, 11… m): 8 ô tô, 8 xe máy — như sau một trận hạ nhiều công an.
    const abandoned = [];
    for (let k = 0; k < 16; k++) {
      const p = lanePoint(avenue, avenue.length / 2 - 5 - 3 * k, (avenue.minOffset + avenue.maxOffset) / 2);
      const c = sim.spawnAt(p.x, p.z, 0, k % 2 ? 'bike' : 'car', 0);
      c.mode = 'parked';
      c.rider = false;
      c.leaving = true;
      abandoned.push(c);
    }
    for (let i = 0; i < 30; i++) {
      sim.update(STEP, player, 5);
      expect(sim.chasers.filter((c) => c.kind === 'bike').length).toBeLessThanOrEqual(cap.bike);
      expect(sim.chasers.filter((c) => c.kind === 'car').length).toBeLessThanOrEqual(cap.car);
    }
    expect(sim.chasers.filter((c) => !c.leaving)).toHaveLength(POLICE_CHASE.perLevel[5]!);
    // Bỏ chiếc xa Tín nhất trước, chiếc gần nhất còn nguyên.
    expect(sim.chasers).toContain(abandoned[0]);
    expect(sim.chasers).toContain(abandoned[1]);
    expect(sim.chasers).not.toContain(abandoned[14]);
    expect(sim.chasers).not.toContain(abandoned[15]);
  });

  it('spawnAt: xe tuần tra quay sang đuổi ngay tại chỗ, giữ hướng và tốc độ', () => {
    const sim = new ChaseSim(net, sight, 3, POLICE_CHASE);
    const c = sim.spawnAt(10, 20, 1.2, 'car', 7);
    expect(c).toMatchObject({ x: 10, z: 20, yaw: 1.2, kind: 'car', speed: 7, mode: 'chase', leaving: false });
    expect(sim.chasers).toContain(c);
    // 1 sao chỉ cần 1 xe: chiếc vừa thêm là đủ, không sinh thêm xe máy.
    sim.update(STEP, { x: 10, z: 60, speed: 0 }, 1);
    expect(sim.chasers.filter((o) => !o.leaving)).toHaveLength(1);
  });
});

describe('chốt chặn', () => {
  it('3 sao, Tín phóng xe trên đại lộ ⇒ ô tô đỗ chắn ngang nửa đường phía trước, đứng yên, ngoài vỉa hè', () => {
    const sim = new ChaseSim(net, sight, 21, POLICE_CHASE);
    const p = runner(avenue, 5, 16);
    sim.update(STEP, p, 3);
    const blocks = sim.chasers.filter((c) => c.mode === 'block');
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    expect(sim.blocking).toBe(true);
    const rb = POLICE_CHASE.roadblock!;
    for (const b of blocks) {
      expect(b.kind).toBe('car');
      // Phía trước Tín chừng `distance` m, theo đúng chiều đang chạy.
      const ahead = (b.x - p.x) * avenue.dx + (b.z - p.z) * avenue.dz;
      expect(ahead).toBeGreaterThan(rb.distance - 60);
      expect(ahead).toBeLessThan(rb.distance + 60);
      // Đỗ ngang đường: thân xe vuông góc với chiều đường.
      expect(Math.abs(Math.sin(b.yaw) * avenue.dx + Math.cos(b.yaw) * avenue.dz)).toBeLessThan(0.05);
      expect(onSidewalkOrHouse(b.x, b.z)).toBe(false);
    }
    // Đứng yên dù Tín (vẫn ở xa) chạy tới.
    const before = blocks.map((b) => [b.x, b.z]);
    for (let i = 0; i < 3 * 60; i++) sim.update(STEP, p, 3);
    blocks.forEach((b, k) => {
      expect(b.x).toBe(before[k]![0]);
      expect(b.z).toBe(before[k]![1]);
      expect(b.mode).toBe('block');
    });
    // Các ô tô chốt nối nhau nhưng không chồng lên nhau.
    for (let i = 0; i < blocks.length; i++)
      for (let k = i + 1; k < blocks.length; k++) expect(Math.hypot(blocks[i]!.x - blocks[k]!.x, blocks[i]!.z - blocks[k]!.z)).toBeGreaterThan(4);
    // Chốt không tính vào số xe đuổi theo sao.
    expect(sim.chasers.filter((c) => c.mode === 'chase' && !c.leaving)).toHaveLength(POLICE_CHASE.perLevel[3]!);
  });

  it('Tín vượt qua chốt thì chốt rút đi; hết hạn cũng rút', () => {
    const rb = POLICE_CHASE.roadblock!;
    const sim = new ChaseSim(net, sight, 21, POLICE_CHASE);
    sim.update(STEP, runner(avenue, 5, 16), 3);
    const blocks = sim.chasers.filter((c) => c.mode === 'block');
    const b = blocks[0]!;
    // Đứng chậm (không đặt chốt mới) ở chỗ đã vượt qua chốt.
    const past = { x: b.x + avenue.dx * (rb.passed + 5), z: b.z + avenue.dz * (rb.passed + 5), speed: 0 };
    sim.update(STEP, past, 3);
    expect(blocks.every((c) => c.leaving && c.mode === 'chase')).toBe(true);
    expect(sim.blocking).toBe(false);

    const sim2 = new ChaseSim(net, sight, 21, POLICE_CHASE);
    const start = runner(avenue, 5, 16);
    sim2.update(STEP, start, 3);
    const still = { ...start, speed: 0 };
    for (let t = 0; t < rb.life + 1; t += 0.5) sim2.update(0.5, still, 3);
    expect(sim2.chasers.filter((c) => c.mode === 'block')).toHaveLength(0);
  });

  it('dưới 3 sao, hoặc Tín đi chậm, hoặc không biết hướng chạy thì không đặt chốt', () => {
    for (const [level, speed, dir] of [[2, 16, true], [3, 4, true], [3, 16, false]] as const) {
      const sim = new ChaseSim(net, sight, 21, POLICE_CHASE);
      const p = runner(avenue, 5, speed);
      if (!dir) {
        delete p.dirX;
        delete p.dirZ;
      }
      for (let i = 0; i < 60; i++) sim.update(STEP, p, level);
      expect(sim.blocking).toBe(false);
    }
  });

  it('chốt trên đường thường (không dải phân cách) chắn cả lòng đường nhưng chừa khe sát lề', () => {
    const street = net.lanes.filter((l) => l.road.kind === 'street').reduce((best, l) => (l.length > best.length ? l : best));
    const sim = new ChaseSim(net, sight, 4, { ...POLICE_CHASE, roadblock: { ...POLICE_CHASE.roadblock!, distance: street.length / 2 } });
    const p = runner(street, 0, 16);
    expect(sim.placeRoadblock(p)).toBe(true);
    const blocks = sim.chasers.filter((c) => c.mode === 'block');
    const lateral = blocks.map((b) => (b.x - p.x) * street.rx + (b.z - p.z) * street.rz);
    const half = street.road.width / 2;
    // Có xe ở cả hai nửa đường; mép ngoài thân xe (nửa dài 2,15 m) vẫn cách bó vỉa một khe.
    expect(Math.min(...lateral) + (street.minOffset + street.maxOffset) / 2).toBeLessThan(0);
    for (const l of lateral) {
      const fromCenter = Math.abs(l + (street.minOffset + street.maxOffset) / 2);
      expect(fromCenter + 2.15).toBeLessThan(half - 0.5);
    }
  });
});

describe('xe tuần tra trong dòng xe', () => {
  const lane = avenue;
  const at = (s: number, offset = lane.minOffset + 1): PatrolAgent & { x: number; z: number } => ({ kind: 'police', ...lanePoint(lane, s, offset) });

  it('xe công an trong tầm nhìn thấy chỗ gây án; xe thường, xe ở quá xa thì không tính', () => {
    const crime = lanePoint(lane, lane.length / 2, lane.maxOffset);
    const agents: PatrolAgent[] = [
      { kind: 'bike', ...lanePoint(lane, lane.length / 2 + 2, lane.maxOffset) },
      { ...at(lane.length / 2 + 15), kind: 'sedan' },
      at(lane.length / 2 + PATROL.sight + 10),
      at(lane.length / 2 - 20),
    ];
    expect(patrolWitness(agents, 1, crime.x, crime.z, sight)).toBe(3);
    // Xe máy NPC nằm trước `first` thì không xét (dù là gì).
    expect(patrolWitness(agents, 4, crime.x, crime.z, sight)).toBe(-1);
    agents[3] = at(lane.length / 2 - PATROL.sight - 5);
    expect(patrolWitness(agents, 1, crime.x, crime.z, sight)).toBe(-1);
  });

  it('nhà cửa che mất thì không thấy', () => {
    // Một lô nhà: xe công an đứng một bên, chỗ gây án ở bên kia (đường nối hai điểm cắt qua lô nhà).
    const lot = city.lots.find((l) => l.rect.x1 - l.rect.x0 > 6 && l.rect.z1 - l.rect.z0 > 6)!;
    const cz = (lot.rect.z0 + lot.rect.z1) / 2;
    const agents: PatrolAgent[] = [{ kind: 'police', x: lot.rect.x0 - 3, z: cz }];
    expect(patrolWitness(agents, 0, lot.rect.x1 + 3, cz, sight)).toBe(-1);
    // Dọc lòng đại lộ thì thấy.
    const a = lanePoint(lane, 10, lane.minOffset + 1);
    const b = lanePoint(lane, 40, lane.maxOffset);
    expect(patrolWitness([{ kind: 'police', ...a }], 0, b.x, b.z, sight)).toBe(0);
  });
});
