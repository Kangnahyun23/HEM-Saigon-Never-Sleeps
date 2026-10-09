import { createRng, range, type Rng } from '@/core/random';
import { lanePoint, turnKind, type TrafficLane, type TrafficNetwork } from './trafficNetwork';

/**
 * Mô phỏng dòng xe máy NPC (thuần logic, chạy theo bước cố định 60 Hz).
 *
 * Mỗi xe chạy dọc một làn với độ lệch ngang riêng (xe máy dàn hàng ngang), tới giao lộ thì chọn hướng đi tiếp và
 * cua theo đường cong Bézier. Xe giữ khoảng cách với vật cản phía trước, lách sang bên khi bị chặn, nhường xe bên
 * phải ở giao lộ. Để phố lúc nào cũng đông, xe đi quá xa người chơi được "thả" lại quanh người chơi (bong bóng).
 */

export interface Obstacle {
  x: number;
  z: number;
  /** Bán kính chiếm chỗ (m). */
  radius: number;
}

export interface Focus {
  x: number;
  z: number;
  /** Hướng camera (để ưu tiên thả xe sau lưng người chơi). Không bắt buộc. */
  dirX?: number;
  dirZ?: number;
}

interface TurnPath {
  p0x: number;
  p0z: number;
  p1x: number;
  p1z: number;
  p2x: number;
  p2z: number;
  length: number;
  t: number;
}

export interface TrafficAgent {
  id: number;
  lane: number;
  /** Làn sẽ rẽ vào ở giao lộ kế tiếp (chọn sẵn để biết đường giảm tốc). */
  next: number;
  /** Quãng đã đi trên phần thẳng của làn (m). */
  s: number;
  offset: number;
  targetOffset: number;
  nextOffset: number;
  turn: TurnPath | null;
  speed: number;
  /** Tính khí: nhân với tốc độ làn (0.8…1.15). */
  temper: number;
  x: number;
  z: number;
  /** Hướng đầu xe: tiến = (sin yaw, cos yaw). */
  yaw: number;
  /** Độ nghiêng khi cua (rad, dương = nghiêng trái). */
  lean: number;
  /** Góc quay bánh (rad). */
  wheel: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  prevLean: number;
  /** Thời gian gần như đứng yên liên tục (s). */
  stuck: number;
  /** Còn bao lâu nữa thì bỏ qua xe khác để "nhích" khỏi chỗ kẹt (s). */
  creep: number;
  weaveTimer: number;
  /** Đổi mỗi lần xe được thả lại (để lớp hình đổi màu áo, hàng chở…). */
  generation: number;
  /** Thời gian bị người chơi chắn đường liên tục (s) và thời gian chờ trước lần bóp còi kế (s). */
  blocked: number;
  honkCooldown: number;
}

/** Một tiếng còi phát ra trong bước mô phỏng vừa rồi. */
export interface Honk {
  id: number;
  x: number;
  z: number;
}

export interface TrafficOptions {
  seed: number;
  count: number;
  /** Xe xa người chơi hơn mức này thì được thả lại gần (m). */
  despawnRadius: number;
  /** Khoảng cách thả lại (m). */
  respawnMin: number;
  respawnMax: number;
}

export const DEFAULT_TRAFFIC: TrafficOptions = { seed: 7, count: 80, despawnRadius: 140, respawnMin: 45, respawnMax: 125 };

export const AGENT = {
  length: 1.9,
  /** Bề ngang tính cả người lái + khoảng hở khi xét va chạm. */
  halfWidth: 0.5,
  accel: 2.6,
  brake: 7,
  /** Khoảng hở tối thiểu khi dừng sau vật cản (m). */
  minGap: 1.1,
  /** Thời gian giãn cách (s). */
  headway: 0.85,
  /** Tốc độ dạt ngang tối đa (m/s). */
  lateralSpeed: 0.9,
} as const;

const TURN_SPEED = { straight: Infinity, right: 4.2, left: 5.5, uturn: 2.5 } as const;
const TURN_WEIGHT = { straight: 0.55, right: 0.25, left: 0.2, uturn: 0 } as const;
const COMFORT_DECEL = 2.8;
/** Khoảng cách ngang tối thiểu giữa tim hai xe chạy song song (m). */
const SIDE_CLEARANCE = 1.15;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class TrafficSim {
  readonly agents: TrafficAgent[] = [];
  readonly options: TrafficOptions;
  private readonly rng: Rng;
  /** Đếm số lần thả lại (thống kê / test). */
  respawns = 0;
  /** Các tiếng còi trong bước vừa chạy (xoá đầu mỗi bước). */
  readonly honks: Honk[] = [];

  constructor(
    readonly network: TrafficNetwork,
    focus: Focus,
    options: Partial<TrafficOptions> = {},
  ) {
    this.options = { ...DEFAULT_TRAFFIC, ...options };
    this.rng = createRng(this.options.seed);
    for (let i = 0; i < this.options.count; i++) {
      const agent = this.blankAgent(i);
      this.agents.push(agent);
      this.place(agent, focus, 12, this.options.respawnMax, false);
    }
  }

  private lane(id: number): TrafficLane {
    return this.network.lanes[id] as TrafficLane;
  }

  private blankAgent(id: number): TrafficAgent {
    return {
      id,
      lane: 0,
      next: 0,
      s: 0,
      offset: 0,
      targetOffset: 0,
      nextOffset: 0,
      turn: null,
      speed: 0,
      temper: 1,
      x: 0,
      z: 0,
      yaw: 0,
      lean: 0,
      wheel: 0,
      prevX: 0,
      prevZ: 0,
      prevYaw: 0,
      prevLean: 0,
      stuck: 0,
      creep: 0,
      weaveTimer: 0,
      generation: 0,
      blocked: 0,
      honkCooldown: 0,
    };
  }

  /** Chọn làn đi tiếp ở cuối làn `laneId`: thẳng nhiều hơn rẽ, không quay đầu trừ khi hết đường. */
  private chooseNext(laneId: number): number {
    const lane = this.lane(laneId);
    const node = this.network.nodes[lane.to];
    const options = (node?.out ?? []).filter((id) => this.lane(id).to !== lane.from);
    if (options.length === 0) return (node?.out[0] ?? laneId) as number;
    let total = 0;
    for (const id of options) total += TURN_WEIGHT[turnKind(lane, this.lane(id))];
    let r = this.rng() * total;
    for (const id of options) {
      r -= TURN_WEIGHT[turnKind(lane, this.lane(id))];
      if (r <= 0) return id;
    }
    return options[options.length - 1] as number;
  }

  /** Đặt xe ở một chỗ ngẫu nhiên trên mạng làn, cách `focus` trong [minR, maxR], không đè lên xe khác. */
  private place(agent: TrafficAgent, focus: Focus, minR: number, maxR: number, preferBehind: boolean): void {
    const lanes = this.network.lanes;
    let best: { lane: TrafficLane; s: number; offset: number; score: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const lane = lanes[Math.floor(this.rng() * lanes.length)] as TrafficLane;
      if (lane.length < 4) continue;
      const s = range(this.rng, 0, lane.length);
      const offset = range(this.rng, lane.minOffset, lane.maxOffset);
      const p = lanePoint(lane, s, offset);
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d < minR || d > maxR) continue;
      let crowded = false;
      for (const o of this.agents) {
        if (o !== agent && Math.abs(o.x - p.x) < 4 && Math.abs(o.z - p.z) < 4) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
      // Ưu tiên chỗ sau lưng camera để xe không "hiện ra" ngay trước mắt.
      let score = this.rng();
      if (preferBehind && focus.dirX !== undefined && focus.dirZ !== undefined) {
        const ahead = ((p.x - focus.x) * focus.dirX + (p.z - focus.z) * focus.dirZ) / d;
        score += ahead > 0.2 ? 1 : 0;
      }
      if (!best || score < best.score) best = { lane, s, offset, score };
      if (best.score < 0.5) break;
    }
    // Không tìm được chỗ phù hợp (khu quá nhỏ trong test): đặt bất kỳ.
    if (!best) {
      const lane = lanes[Math.floor(this.rng() * lanes.length)] as TrafficLane;
      best = { lane, s: range(this.rng, 0, lane.length), offset: (lane.minOffset + lane.maxOffset) / 2, score: 0 };
    }

    const { lane, s, offset } = best;
    const p = lanePoint(lane, s, offset);
    agent.lane = lane.id;
    agent.next = this.chooseNext(lane.id);
    agent.s = s;
    agent.offset = offset;
    agent.targetOffset = offset;
    agent.turn = null;
    agent.temper = range(this.rng, 0.8, 1.15);
    agent.speed = lane.speedLimit * agent.temper * 0.8;
    agent.x = agent.prevX = p.x;
    agent.z = agent.prevZ = p.z;
    agent.yaw = agent.prevYaw = Math.atan2(lane.dx, lane.dz);
    agent.lean = agent.prevLean = 0;
    agent.stuck = 0;
    agent.creep = 0;
    agent.weaveTimer = range(this.rng, 2, 8);
    agent.blocked = 0;
    agent.honkCooldown = 0;
    agent.generation++;
  }

  /** Độ lệch tương ứng trên làn mới, giữ nguyên tỉ lệ trong dải (sát lề vẫn sát lề). */
  private mapOffset(from: TrafficLane, to: TrafficLane, offset: number): number {
    const f = clamp((offset - from.minOffset) / Math.max(0.01, from.maxOffset - from.minOffset), 0, 1);
    return to.minOffset + f * (to.maxOffset - to.minOffset);
  }

  private beginTurn(agent: TrafficAgent, overshoot: number): void {
    const a = this.lane(agent.lane);
    const b = this.lane(agent.next);
    agent.nextOffset = this.mapOffset(a, b, agent.offset);
    const p0 = lanePoint(a, a.length, agent.offset);
    const p2 = lanePoint(b, 0, agent.nextOffset);
    let p1x = (p0.x + p2.x) / 2;
    let p1z = (p0.z + p2.z) / 2;
    // Rẽ: điểm điều khiển là giao điểm hai đường thẳng (hướng cũ qua p0, hướng mới qua p2).
    const cross = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(cross) > 0.5) {
      const t = ((p2.x - p0.x) * b.dz - (p2.z - p0.z) * b.dx) / cross;
      p1x = p0.x + a.dx * t;
      p1z = p0.z + a.dz * t;
    }
    // Chiều dài cung xấp xỉ bằng 12 đoạn thẳng.
    let length = 0;
    let lx = p0.x;
    let lz = p0.z;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * p1x + t * t * p2.x;
      const z = u * u * p0.z + 2 * u * t * p1z + t * t * p2.z;
      length += Math.hypot(x - lx, z - lz);
      lx = x;
      lz = z;
    }
    agent.turn = { p0x: p0.x, p0z: p0.z, p1x, p1z, p2x: p2.x, p2z: p2.z, length: Math.max(0.1, length), t: 0 };
    agent.turn.t = Math.min(1, overshoot / agent.turn.length);
  }

  private endTurn(agent: TrafficAgent, overshoot: number): void {
    agent.lane = agent.next;
    agent.offset = agent.targetOffset = agent.nextOffset;
    agent.turn = null;
    agent.s = overshoot;
    agent.next = this.chooseNext(agent.lane);
  }

  /** Tốc độ an toàn khi xét các vật cản phía trước; trả về luôn vật cản gần nhất để tính đường lách. */
  private safeSpeed(
    agent: TrafficAgent,
    obstacles: readonly Obstacle[],
  ): { speed: number; gap: number; lateral: number; slow: boolean; side: number; byObstacle: boolean } {
    const fx = Math.sin(agent.yaw);
    const fz = Math.cos(agent.yaw);
    const rx = -fz;
    const rz = fx;
    const look = Math.max(7, agent.speed * 1.8 + 5);
    let gap = Infinity;
    let lateral = 0;
    let slow = false;
    let leaderSpeed = 0;
    /** Độ lệch ngang của xe chạy song song gần nhất (0 = không có). */
    let side = 0;
    let byObstacle = false;

    const consider = (ox: number, oz: number, halfWidth: number, ahead: number, speed: number, obstacle: boolean): void => {
      const dx = ox - agent.x;
      const dz = oz - agent.z;
      const d = dx * fx + dz * fz;
      if (d <= 0 || d > look) return;
      const l = dx * rx + dz * rz;
      if (Math.abs(l) > AGENT.halfWidth + halfWidth) return;
      const g = d - ahead;
      if (g < gap) {
        gap = g;
        lateral = l;
        leaderSpeed = speed;
        slow = speed < agent.speed * 0.7 || speed < 1;
        byObstacle = obstacle;
      }
    };

    if (agent.creep <= 0) {
      for (const o of this.agents) {
        if (o === agent) continue;
        // Lọc nhanh theo hộp bao trước khi chiếu.
        if (Math.abs(o.x - agent.x) > look || Math.abs(o.z - agent.z) > look) continue;
        const ofx = Math.sin(o.yaw);
        const ofz = Math.cos(o.yaw);
        const align = ofx * fx + ofz * fz;
        if (Math.abs(align) < 0.5) {
          // Xe cắt ngang: nhường xe đến từ bên phải; xe bên trái thì chỉ để ý khi đã sát mũi.
          const l = (o.x - agent.x) * rx + (o.z - agent.z) * rz;
          const d = (o.x - agent.x) * fx + (o.z - agent.z) * fz;
          if (l < -0.2 && d > 4) continue;
        } else if (align > 0.5) {
          // Xe chạy song song sát sườn: ghi lại để dạt ra.
          const l = (o.x - agent.x) * rx + (o.z - agent.z) * rz;
          const d = (o.x - agent.x) * fx + (o.z - agent.z) * fz;
          if (Math.abs(d) < AGENT.length && Math.abs(l) < SIDE_CLEARANCE && (side === 0 || Math.abs(l) < Math.abs(side))) side = l || 0.01;
        }
        consider(o.x, o.z, AGENT.halfWidth, AGENT.length, Math.max(0, o.speed * align), false);
      }
    }
    for (const ob of obstacles) {
      if (Math.abs(ob.x - agent.x) > look || Math.abs(ob.z - agent.z) > look) continue;
      consider(ob.x, ob.z, ob.radius, ob.radius + AGENT.length / 2, 0, true);
    }

    if (gap === Infinity) return { speed: Infinity, gap, lateral, slow, side, byObstacle };
    // Theo xe trước: không vượt quá tốc độ xe trước + phần khoảng hở dư.
    const free = Math.max(0, gap - AGENT.minGap);
    const speed = Math.min(free / AGENT.headway, leaderSpeed + free * 0.9);
    return { speed: Math.max(0, speed), gap, lateral, slow, side, byObstacle };
  }

  /** Một bước mô phỏng. `obstacles`: người chơi, xe của người chơi… (vật cản xe NPC phải tránh). */
  step(dt: number, focus: Focus, obstacles: readonly Obstacle[] = []): void {
    const opt = this.options;
    this.honks.length = 0;
    for (const agent of this.agents) {
      if (Math.hypot(agent.x - focus.x, agent.z - focus.z) > opt.despawnRadius) {
        this.place(agent, focus, opt.respawnMin, opt.respawnMax, true);
        this.respawns++;
      }
    }

    for (const agent of this.agents) {
      agent.prevX = agent.x;
      agent.prevZ = agent.z;
      agent.prevYaw = agent.yaw;
      agent.prevLean = agent.lean;

      const lane = this.lane(agent.lane);
      const nextLane = this.lane(agent.next);
      const kind = turnKind(lane, nextLane);
      let desired = lane.speedLimit * agent.temper;
      const turnSpeed = Math.min(desired, TURN_SPEED[kind]);
      if (agent.turn) desired = turnSpeed;
      else desired = Math.min(desired, Math.sqrt(turnSpeed * turnSpeed + 2 * COMFORT_DECEL * Math.max(0, lane.length - agent.s)));

      const safe = this.safeSpeed(agent, obstacles);
      desired = Math.min(desired, safe.speed);

      // Lách: bị xe chậm / vật cản chặn trên phần thẳng ⇒ dạt sang bên còn chỗ.
      if (!agent.turn) {
        agent.weaveTimer -= dt;
        const roomLeft = lane.length - agent.s > 4;
        if (safe.slow && safe.gap < 9 && roomLeft) {
          const blocker = agent.offset + safe.lateral;
          const clear = AGENT.halfWidth * 2 + 0.35;
          const candidates = [blocker - clear, blocker + clear].filter((c) => c >= lane.minOffset && c <= lane.maxOffset);
          if (candidates.length > 0) {
            candidates.sort((p, q) => Math.abs(p - agent.offset) - Math.abs(q - agent.offset));
            agent.targetOffset = candidates[0] as number;
          }
        } else if (safe.side !== 0) {
          // Có xe sát sườn: dạt ra cho đủ khoảng hở.
          const push = SIDE_CLEARANCE - Math.abs(safe.side) + 0.1;
          agent.targetOffset = clamp(agent.offset - Math.sign(safe.side) * push, lane.minOffset, lane.maxOffset);
        } else if (agent.weaveTimer <= 0) {
          agent.weaveTimer = range(this.rng, 3, 9);
          agent.targetOffset = clamp(agent.offset + range(this.rng, -1.2, 1.2), lane.minOffset, lane.maxOffset);
        }
        const maxShift = AGENT.lateralSpeed * dt * Math.min(1, agent.speed / 2);
        agent.offset += clamp(agent.targetOffset - agent.offset, -maxShift, maxShift);
      }

      if (agent.speed < desired) agent.speed = Math.min(desired, agent.speed + AGENT.accel * dt);
      else agent.speed = Math.max(desired, agent.speed - AGENT.brake * dt);
      if (agent.speed < 0.01) agent.speed = 0;

      // Kẹt lâu (ví dụ bốn xe nhường nhau ở giao lộ) ⇒ tạm bỏ qua xe khác để nhích đi.
      if (agent.speed < 0.3 && safe.gap > 0.6) agent.stuck += dt;
      else agent.stuck = 0;
      if (agent.stuck > 4) {
        agent.stuck = 0;
        agent.creep = 1.5;
      }
      if (agent.creep > 0) agent.creep -= dt;

      // Bị người chơi chắn đường quá 1 giây ⇒ bóp còi (mỗi xe tối đa một lần / 3,5 s).
      agent.honkCooldown -= dt;
      if (safe.byObstacle && safe.gap < 6 && agent.speed < 2.5) agent.blocked += dt;
      else agent.blocked = 0;
      if (agent.blocked > 1 && agent.honkCooldown <= 0) {
        agent.honkCooldown = 3.5;
        this.honks.push({ id: agent.id, x: agent.x, z: agent.z });
      }

      // Di chuyển.
      const ds = agent.speed * dt;
      if (agent.turn) {
        agent.turn.t += ds / agent.turn.length;
        if (agent.turn.t >= 1) this.endTurn(agent, (agent.turn.t - 1) * agent.turn.length);
      } else {
        agent.s += ds;
        if (agent.s >= lane.length) this.beginTurn(agent, agent.s - lane.length);
      }

      let x: number;
      let z: number;
      if (agent.turn) {
        const tr = agent.turn;
        const t = Math.min(1, tr.t);
        const u = 1 - t;
        x = u * u * tr.p0x + 2 * u * t * tr.p1x + t * t * tr.p2x;
        z = u * u * tr.p0z + 2 * u * t * tr.p1z + t * t * tr.p2z;
      } else {
        const p = lanePoint(this.lane(agent.lane), agent.s, agent.offset);
        x = p.x;
        z = p.z;
      }
      const mx = x - agent.x;
      const mz = z - agent.z;
      agent.x = x;
      agent.z = z;
      if (mx * mx + mz * mz > 1e-8) agent.yaw = Math.atan2(mx, mz);

      // Nghiêng vào cua theo gia tốc hướng tâm v·ω; quay bánh.
      const yawRate = wrapAngle(agent.yaw - agent.prevYaw) / dt;
      const leanGoal = clamp(Math.atan((agent.speed * yawRate) / 9.81), -0.5, 0.5);
      agent.lean += (leanGoal - agent.lean) * (1 - Math.exp(-5 * dt));
      agent.wheel = (agent.wheel + ds / 0.29) % (Math.PI * 2);
    }
  }
}
