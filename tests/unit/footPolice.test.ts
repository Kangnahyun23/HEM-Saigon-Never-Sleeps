import { describe, expect, it } from 'vitest';
import { ChaseSim, POLICE_CHASE } from '@/ai/chase';
import { FOOT_POLICE, FootPoliceSim, type FootPlayer } from '@/ai/footPolice';
import { HemMap } from '@/ai/hemNav';
import { buildTrafficNetwork, lanePoint } from '@/ai/trafficNetwork';
import { SightGrid } from '@/systems/heat';
import { generateCity } from '@/world/city/layout';

/** Công an xuống xe đuổi bộ (R3): còng Tín đứng yên, chạy chậm hơn Tín, đánh được, đánh lại, về xe khi Tín lên xe. */

const city = generateCity();
const net = buildTrafficNetwork(city);
const lots = city.lots.map((l) => l.rect);
const sight = new SightGrid(lots);
const hems = new HemMap(city.hems, lots);
const STEP = 1 / 60;
const RUN_SPEED = 6.4;
const avenue = net.lanes.filter((l) => l.road.kind === 'avenue').reduce((best, l) => (l.length > best.length ? l : best));
const mid = (avenue.minOffset + avenue.maxOffset) / 2;
const yaw = Math.atan2(avenue.dx, avenue.dz);

/** Tín đứng giữa đại lộ; `bikes` xe máy công an chạy tới từ phía sau (cách 30 m, 36 m…). */
function scene(level: number, bikes: number, capacity = 3) {
  const sim = new ChaseSim(net, sight, 5, POLICE_CHASE, hems);
  const foot = new FootPoliceSim(sim, sight, hems, capacity, 9);
  const at = avenue.length / 2;
  const p = lanePoint(avenue, at, mid);
  const player: FootPlayer = { x: p.x, z: p.z, speed: 0, onFoot: true, dirX: avenue.dx, dirZ: avenue.dz };
  for (let k = 0; k < bikes; k++) {
    const s = lanePoint(avenue, at - 30 - 6 * k, mid + (k % 2 ? 1.2 : -1.2));
    sim.spawnAt(s.x, s.z, yaw, 'bike', 8);
  }
  let caught = false;
  let busted = false;
  /** Một bước như trong game: xe trước, người đi bộ sau. */
  const step = (lvl = level) => {
    caught ||= sim.update(STEP, player, lvl);
    busted ||= foot.update(STEP, player, lvl);
  };
  /** Chạy tới khi có người xuống xe (tối đa `seconds`). */
  const untilOfficer = (seconds = 15) => {
    for (let i = 0; i < seconds * 60 && foot.officers.length === 0; i++) step();
    expect(foot.officers.length).toBeGreaterThan(0);
    return foot.officers[0]!;
  };
  return { sim, foot, player, step, untilOfficer, get caught() { return caught; }, get busted() { return busted; } };
}

describe('công an xuống xe đuổi bộ', () => {
  it('xe tới gần Tín đang đi bộ thì dừng, người lái xuống (xe không còn người lái); Tín đứng yên thì bị còng', () => {
    const s = scene(2, 2);
    const o = s.untilOfficer();
    const bike = s.sim.chasers.find((c) => c.id === o.vehicle)!;
    expect(bike.mode).toBe('parked');
    expect(bike.rider).toBe(false);
    expect(Math.hypot(bike.x - s.player.x, bike.z - s.player.z)).toBeLessThan(FOOT_POLICE.dismountRange);
    expect(o.generation).toBe(bike.id + 1);
    for (let i = 0; i < 60 * 15 && !s.busted; i++) s.step();
    expect(s.busted).toBe(true);
    // Còng tay là việc của người đi bộ: xe đã dừng thì không "bắt" nữa.
    expect(s.caught).toBe(false);
    expect(s.foot.officers.length).toBe(2);
  });

  it('Tín chạy bộ thì công an không đuổi kịp, không còng được', () => {
    const s = scene(2, 1);
    s.untilOfficer();
    s.player.speed = RUN_SPEED;
    const gap0 = Math.min(...s.foot.officers.map((o) => Math.hypot(o.x - s.player.x, o.z - s.player.z)));
    for (let i = 0; i < 60 * 5; i++) {
      s.player.x += avenue.dx * RUN_SPEED * STEP;
      s.player.z += avenue.dz * RUN_SPEED * STEP;
      s.step();
    }
    const gap = Math.min(...s.foot.officers.map((o) => Math.hypot(o.x - s.player.x, o.z - s.player.z)));
    expect(FOOT_POLICE.runSpeed).toBeLessThan(RUN_SPEED);
    expect(gap).toBeGreaterThan(gap0 + 3);
    expect(s.busted).toBe(false);
  });

  it('đánh được: trúng đòn như người đi đường nhưng khoẻ hơn; bị đánh thì tuột tay, rồi rút dùi cui đánh lại', () => {
    const s = scene(2, 1);
    const o = s.untilOfficer();
    // Để công an áp sát (đang nắm tay Tín).
    for (let i = 0; i < 60 * 3 && o.grab <= 0; i++) s.step();
    expect(o.grab).toBeGreaterThan(0);
    expect(s.foot.hostile).toBe(false);
    expect(s.foot.hit(o.id, 10, s.player.x, s.player.z, false)).toBe('hurt');
    expect(o.health).toBe(FOOT_POLICE.health - 10);
    expect(o.grab).toBe(0);
    expect(s.foot.hostile).toBe(true);
    // Người đi đường 100 máu: đòn 46 làm ngã; công an khoẻ hơn — chưa ngã.
    expect(s.foot.hit(o.id, 40, s.player.x, s.player.z, false)).toBe('hurt');
    // Hoàn hồn thì đánh lại (Tín đứng yên cạnh đó).
    s.foot.damageToPlayer = 0;
    for (let i = 0; i < 60 * 4; i++) s.step();
    expect(s.foot.damageToPlayer).toBeGreaterThanOrEqual(FOOT_POLICE.strikeDamage);
  });

  it('hạ gục công an: xe bỏ lại bên đường, đoàn truy đuổi gọi xe khác tới', () => {
    const s = scene(1, 1);
    const o = s.untilOfficer();
    let r: string | null = null;
    for (let k = 0; k < 10 && r !== 'dead'; k++) r = s.foot.hit(o.id, 32, s.player.x, s.player.z, false);
    expect(r).toBe('dead');
    expect(o.dead).toBe(true);
    expect(s.foot.hit(o.id, 32, s.player.x, s.player.z, false)).toBeNull();
    const bike = s.sim.chasers.find((c) => c.id === o.vehicle)!;
    expect(bike.leaving).toBe(true);
    expect(bike.mode).toBe('parked');
    s.step();
    // 1 sao = 1 xe: xe bỏ lại không tính, có xe mới.
    expect(s.sim.chasers.filter((c) => !c.leaving)).toHaveLength(1);
    // Xe bỏ lại đứng yên (không ai lái).
    const x = bike.x;
    for (let i = 0; i < 120; i++) s.step();
    expect(bike.x).toBe(x);
  });

  it('Tín lên xe chạy đi: công an về xe, xe có người lái lại và đuổi tiếp', () => {
    const s = scene(2, 2);
    s.untilOfficer();
    for (let i = 0; i < 60; i++) s.step();
    s.player.onFoot = false;
    s.player.speed = 12;
    for (let i = 0; i < 60 * 6 && s.foot.officers.length > 0; i++) {
      s.player.x += avenue.dx * 12 * STEP;
      s.player.z += avenue.dz * 12 * STEP;
      s.step();
    }
    expect(s.foot.officers).toHaveLength(0);
    for (const c of s.sim.chasers) {
      expect(c.rider).toBe(true);
      expect(c.mode).toBe('chase');
    }
  });

  it('số người xuống xe theo sức máy; 0 chỗ thì không ai xuống — xe tự bắt như cũ; Tín ngồi trên xe thì không xuống', () => {
    const one = scene(5, 4, 1);
    let most = 0;
    for (let i = 0; i < 60 * 12; i++) {
      one.step();
      most = Math.max(most, one.foot.alive);
    }
    expect(most).toBe(1);

    const none = scene(2, 2, 0);
    for (let i = 0; i < 60 * 15 && !none.caught; i++) none.step();
    expect(none.foot.officers).toHaveLength(0);
    expect(none.caught).toBe(true);

    const riding = scene(2, 2);
    riding.player.onFoot = false;
    for (let i = 0; i < 60 * 15 && !riding.caught; i++) riding.step();
    expect(riding.foot.officers).toHaveLength(0);
    expect(riding.caught).toBe(true);
  });

  it('dọn hết khi Tín bị bắt / gục: người còn sống lên lại xe', () => {
    const s = scene(2, 2);
    s.untilOfficer();
    s.foot.clear();
    expect(s.foot.officers).toHaveLength(0);
    expect(s.sim.chasers.every((c) => c.rider && c.mode !== 'parked')).toBe(true);
  });
});
