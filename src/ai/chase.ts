import { createRng, range, type Rng } from '@/core/random';
import type { SightGrid } from '@/systems/heat';
import { lanePoint, type TrafficLane, type TrafficNetwork } from './trafficNetwork';

/**
 * Đàn em của Phát "CEO" đi xe máy truy đuổi (thuần logic, 60 Hz, có seed, có unit test).
 *
 * Xe truy đuổi bám theo mạng đường lớn (tìm đường ngắn nhất giữa các giao lộ); khi thấy Tín trong tầm nhìn và
 * đủ gần thì lao thẳng tới. Chúng KHÔNG vào hẻm ⇒ chui hẻm, khuất tầm nhìn là cách cắt đuôi.
 * Bị một xe áp sát khi đang đứng / chạy chậm thì "bị chặn đầu" (game trừ tiền, theo kiểu hoạt hình).
 */

export interface Chaser {
  id: number;
  x: number;
  z: number;
  yaw: number;
  lean: number;
  speed: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  prevLean: number;
  generation: number;
  /** Danh sách nút giao lộ còn phải đi qua. */
  path: number[];
  repath: number;
  /** Đang rút lui (hết truy đuổi) — đi xa rồi biến mất. */
  leaving: boolean;
}

export interface ChasePlayer {
  x: number;
  z: number;
  /** Tốc độ hiện tại (m/s). */
  speed: number;
}

/** Số xe truy đuổi theo cấp Độ Nóng. */
export const CHASERS_PER_LEVEL = [0, 2, 3, 5] as const;
export const CHASE = {
  /** Nhanh hơn xe NPC nhưng chậm hơn xe Tín chạy hết ga (21 m/s) để còn đường thoát. */
  maxSpeed: 17,
  accel: 6,
  turnRate: 2.4,
  sightRange: 50,
  /** Áp sát trong khoảng này và Tín chậm hơn `stopSpeed` đủ `catchTime` giây ⇒ bị chặn đầu. */
  catchRange: 2.4,
  stopSpeed: 2.5,
  catchTime: 1.2,
} as const;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export class ChaseSim {
  readonly chasers: Chaser[] = [];
  private readonly rng: Rng;
  private nextId = 0;
  private closeTime = 0;
  /** Lần cuối xe truy đuổi thấy Tín (để HUD báo "đang bị bám"). */
  seen = false;

  constructor(
    private readonly network: TrafficNetwork,
    private readonly sight: SightGrid,
    seed = 31,
  ) {
    this.rng = createRng(seed);
  }

  /** Nút giao lộ gần điểm (x, z) nhất. */
  nearestNode(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (const n of this.network.nodes) {
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    return best;
  }

  /** Đường ngắn nhất giữa hai nút (Dijkstra trên vài chục nút). */
  route(from: number, to: number): number[] {
    const nodes = this.network.nodes;
    const dist = new Array<number>(nodes.length).fill(Infinity);
    const prev = new Array<number>(nodes.length).fill(-1);
    const done = new Array<boolean>(nodes.length).fill(false);
    dist[from] = 0;
    for (let k = 0; k < nodes.length; k++) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && (u === -1 || (dist[i] as number) < (dist[u] as number))) u = i;
      if (u === -1 || dist[u] === Infinity) break;
      done[u] = true;
      if (u === to) break;
      for (const laneId of nodes[u]?.out ?? []) {
        const lane = this.network.lanes[laneId] as TrafficLane;
        const nd = (dist[u] as number) + lane.length;
        if (nd < (dist[lane.to] as number)) {
          dist[lane.to] = nd;
          prev[lane.to] = u;
        }
      }
    }
    const path: number[] = [];
    for (let v = to; v !== -1; v = prev[v] as number) {
      path.unshift(v);
      if (v === from) break;
    }
    return path[0] === from ? path : [to];
  }

  private spawn(player: ChasePlayer): void {
    const lanes = this.network.lanes;
    let best: { x: number; z: number; yaw: number } | null = null;
    for (let i = 0; i < 40; i++) {
      const lane = lanes[Math.floor(this.rng() * lanes.length)] as TrafficLane;
      const p = lanePoint(lane, range(this.rng, 0, lane.length), (lane.minOffset + lane.maxOffset) / 2);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < 55 || d > 95) continue;
      best = { x: p.x, z: p.z, yaw: Math.atan2(lane.dx, lane.dz) };
      // Ưu tiên chỗ khuất tầm nhìn (không "hiện ra" ngay trước mặt).
      if (!this.sight.clear(p.x, p.z, player.x, player.z)) break;
    }
    best ??= { x: player.x + 70, z: player.z, yaw: -Math.PI / 2 };
    this.chasers.push({
      id: this.nextId++,
      ...best,
      lean: 0,
      speed: 6,
      prevX: best.x,
      prevZ: best.z,
      prevYaw: best.yaw,
      prevLean: 0,
      generation: 0,
      path: [],
      repath: 0,
      leaving: false,
    });
  }

  /** Một bước. `level`: Độ Nóng hiện tại. Trả về true nếu Tín vừa bị chặn đầu. */
  update(dt: number, player: ChasePlayer, level: number): boolean {
    const want = CHASERS_PER_LEVEL[clamp(level, 0, 3)] as number;
    const active = this.chasers.filter((c) => !c.leaving);
    for (let i = active.length; i < want; i++) this.spawn(player);
    // Hạ cấp / hết truy đuổi: các xe thừa rút lui.
    active.slice(want).forEach((c) => (c.leaving = true));

    this.seen = false;
    let close = false;
    for (const c of this.chasers) {
      c.prevX = c.x;
      c.prevZ = c.z;
      c.prevYaw = c.yaw;
      c.prevLean = c.lean;
      const d = Math.hypot(player.x - c.x, player.z - c.z);
      const visible = d < CHASE.sightRange && this.sight.clear(c.x, c.z, player.x, player.z);
      if (!c.leaving && visible) this.seen = true;
      if (!c.leaving && d < CHASE.catchRange) close = true;

      // Chọn điểm hướng tới: thấy & gần ⇒ lao thẳng; không thì theo đường lớn.
      let tx: number;
      let tz: number;
      if (!c.leaving && visible) {
        tx = player.x;
        tz = player.z;
        c.path = [];
      } else {
        c.repath -= dt;
        if (c.repath <= 0 || c.path.length === 0) {
          c.repath = 1;
          const goal = c.leaving ? this.nearestNode(c.x * 2 - player.x, c.z * 2 - player.z) : this.nearestNode(player.x, player.z);
          c.path = this.route(this.nearestNode(c.x, c.z), goal);
          // Đã đi quá nút đầu (đang nằm giữa nút 0 và nút 1) ⇒ bỏ nút đầu, khỏi quay đầu chạy ngược.
          const n0 = this.network.nodes[c.path[0] ?? -1];
          const n1 = this.network.nodes[c.path[1] ?? -1];
          if (n0 && n1 && Math.hypot(n1.x - c.x, n1.z - c.z) < Math.hypot(n1.x - n0.x, n1.z - n0.z)) c.path.shift();
        }
        const node = this.network.nodes[c.path[0] ?? -1];
        if (node && Math.hypot(node.x - c.x, node.z - c.z) < 7) c.path.shift();
        // Hết nút (tới giao lộ gần Tín nhất mà không thấy Tín — Tín đang trốn trong hẻm) ⇒ đi tuần sang một giao lộ
        // lân cận ngẫu nhiên để tìm, KHÔNG lao xuyên nhà.
        if (c.path.length === 0) {
          const here = this.network.nodes[this.nearestNode(c.x, c.z)];
          const out = here?.out ?? [];
          const lane = this.network.lanes[out[Math.floor(this.rng() * out.length)] ?? -1];
          c.path = lane ? [lane.to] : [];
          c.repath = 4;
        }
        const target = this.network.nodes[c.path[0] ?? -1];
        tx = target ? target.x : c.x + Math.sin(c.yaw) * 20;
        tz = target ? target.z : c.z + Math.cos(c.yaw) * 20;
      }

      // Lái: quay đầu có giới hạn, cua gắt thì giảm tốc.
      const want = Math.atan2(tx - c.x, tz - c.z);
      const diff = wrap(want - c.yaw);
      const turn = clamp(diff, -CHASE.turnRate * dt, CHASE.turnRate * dt);
      c.yaw = wrap(c.yaw + turn);
      const distT = Math.hypot(tx - c.x, tz - c.z);
      let target = CHASE.maxSpeed * Math.max(0.3, Math.cos(diff));
      if (!c.leaving && visible && d < 6) target = Math.min(target, player.speed + 2 + d); // áp sát, không đâm xuyên
      if (distT < 3 && !visible) target = Math.min(target, 6);
      c.speed += clamp(target - c.speed, -CHASE.accel * 1.5 * dt, CHASE.accel * dt);

      // Tách nhau ra, không chồng lên xe khác.
      let px = 0;
      let pz = 0;
      for (const o of this.chasers) {
        if (o === c) continue;
        const ox = c.x - o.x;
        const oz = c.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od > 0.01 && od < 2) {
          px += (ox / od) * (2 - od);
          pz += (oz / od) * (2 - od);
        }
      }
      c.x += Math.sin(c.yaw) * c.speed * dt + px * dt * 2;
      c.z += Math.cos(c.yaw) * c.speed * dt + pz * dt * 2;
      const leanGoal = clamp(Math.atan((c.speed * (turn / dt)) / 9.81), -0.5, 0.5);
      c.lean += (leanGoal - c.lean) * (1 - Math.exp(-5 * dt));
    }
    // Xe rút lui đi đủ xa thì biến mất.
    for (let i = this.chasers.length - 1; i >= 0; i--) {
      const c = this.chasers[i] as Chaser;
      if (c.leaving && Math.hypot(c.x - player.x, c.z - player.z) > 80) this.chasers.splice(i, 1);
    }

    this.closeTime = close && player.speed < CHASE.stopSpeed ? this.closeTime + dt : 0;
    if (this.closeTime >= CHASE.catchTime) {
      this.closeTime = 0;
      return true;
    }
    return false;
  }

  /** Cho tất cả rút lui (sau khi bị chặn đầu / cắt đuôi). */
  disperse(): void {
    for (const c of this.chasers) c.leaving = true;
  }
}
