import { createRng, range, type Rng } from '@/core/random';
import type { SightGrid } from '@/systems/heat';
import { lanePoint, type TrafficLane, type TrafficNetwork } from './trafficNetwork';

/**
 * Đàn em của Phát "CEO" đi xe máy truy đuổi (thuần logic, 60 Hz, có seed, có unit test).
 *
 * Xe truy đuổi bám theo mạng đường lớn (tìm đường ngắn nhất giữa các giao lộ); khi thấy Tín trong tầm nhìn và
 * đủ gần thì lao thẳng tới. Chúng KHÔNG vào hẻm ⇒ chui hẻm, khuất tầm nhìn là cách cắt đuôi.
 * Bị một xe áp sát khi đang đứng / chạy chậm thì "bị chặn đầu" (game trừ tiền, theo kiểu hoạt hình).
 *
 * Công an (N7.3) dùng chung bộ máy này, thêm: ô tô công an từ 3 sao (to, nhanh trên đường thẳng, cua kém xe máy) và
 * CHỐT CHẶN — ô tô đỗ chắn ngang đường phía trước khi Tín đang phóng xe; Tín qua khỏi chốt thì chúng rút đi.
 */

export type ChaserKind = 'bike' | 'car';

export interface Chaser {
  id: number;
  kind: ChaserKind;
  /** 'chase' = bám theo Tín; 'block' = ô tô đỗ chắn ngang đường (chốt chặn), đứng yên tới khi Tín qua khỏi. */
  mode: 'chase' | 'block';
  /** Chốt chặn: còn đứng bao lâu (s), và hướng con đường lúc đặt chốt (để biết Tín đã vượt qua chưa). */
  life: number;
  roadX: number;
  roadZ: number;
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
  /** Hướng đang chạy (vector đơn vị) — để đặt chốt chặn phía trước. Không có thì không đặt chốt. */
  dirX?: number;
  dirZ?: number;
}

/** Thông số riêng của ô tô truy đuổi (xe máy dùng các trường chung của ChaseConfig). */
export interface ChaseCarConfig {
  readonly maxSpeed: number;
  readonly accel: number;
  readonly turnRate: number;
  readonly catchRange: number;
  /** Dừng cách Tín ngần này (m, tâm tới tâm). */
  readonly stopGap: number;
  /** Bán kính chiếm chỗ khi tách khỏi xe khác (m). */
  readonly radius: number;
}

/** Chốt chặn đường: từ `level` sao, Tín chạy nhanh hơn `minSpeed` thì đặt chốt cách phía trước `distance` m. */
export interface RoadblockConfig {
  readonly level: number;
  readonly distance: number;
  readonly minSpeed: number;
  /** Nghỉ giữa hai lần đặt chốt (s). */
  readonly cooldown: number;
  /** Chốt đứng tối đa bao lâu (s). */
  readonly life: number;
  /** Tín vượt qua chốt ngần này (m) thì chốt rút. */
  readonly passed: number;
}

/** Thông số một phe truy đuổi (đàn em của Phát, công an). */
export interface ChaseConfig {
  /** Số xe theo cấp (Độ Nóng 0–3 / sao truy nã 0–5). */
  readonly perLevel: readonly number[];
  readonly maxSpeed: number;
  readonly accel: number;
  readonly turnRate: number;
  readonly sightRange: number;
  /** Áp sát trong khoảng này và Tín chậm hơn `stopSpeed` đủ `catchTime` giây ⇒ bị chặn đầu / bị bắt. */
  readonly catchRange: number;
  readonly stopSpeed: number;
  readonly catchTime: number;
  /** Xuất hiện cách Tín trong khoảng này (m). */
  readonly spawnMin: number;
  readonly spawnMax: number;
  /** Số ô tô trong tổng số xe theo cấp (thiếu = chỉ có xe máy). */
  readonly carsPerLevel?: readonly number[];
  readonly car?: ChaseCarConfig;
  readonly roadblock?: RoadblockConfig;
}

/**
 * Công an (theo sao truy nã 0–5): nhanh hơn đàn em của Phát nhưng vẫn chậm hơn xe Tín chạy hết ga; nhìn xa hơn;
 * áp sát khi Tín đứng yên / chạy chậm đủ 2 giây thì bắt. Cũng không vào hẻm.
 */
export const POLICE_CHASE: ChaseConfig = {
  perLevel: [0, 1, 2, 3, 4, 6],
  maxSpeed: 18.5,
  accel: 6.5,
  turnRate: 2.5,
  sightRange: 60,
  catchRange: 2.4,
  stopSpeed: 2,
  catchTime: 2,
  spawnMin: 60,
  spawnMax: 110,
  // Từ 3 sao có ô tô: nhanh hơn xe máy của Tín trên đường thẳng (Tín lái ô tô hết ga vẫn nhanh hơn), cua kém hơn.
  carsPerLevel: [0, 0, 0, 1, 2, 3],
  car: { maxSpeed: 23, accel: 5.5, turnRate: 1.7, catchRange: 3.8, stopGap: 3.3, radius: 2.3 },
  roadblock: { level: 3, distance: 140, minSpeed: 8, cooldown: 30, life: 45, passed: 25 },
};

/** Số xe truy đuổi theo cấp Độ Nóng. */
export const CHASERS_PER_LEVEL = [0, 2, 3, 5] as const;
export const CHASE: ChaseConfig = {
  perLevel: CHASERS_PER_LEVEL,
  /** Nhanh hơn xe NPC nhưng chậm hơn xe Tín chạy hết ga (21 m/s) để còn đường thoát. */
  maxSpeed: 17,
  accel: 6,
  turnRate: 2.4,
  sightRange: 50,
  catchRange: 2.4,
  stopSpeed: 2.5,
  catchTime: 1.2,
  spawnMin: 55,
  spawnMax: 95,
};

/** Xe truy đuổi dừng cách Tín ngần này (m, tâm tới tâm): đầu xe 0,95 m + thân người 0,3 m + khoảng chừa — vẫn trong tầm bắt. */
const STOP_GAP = 2;
/** Bán kính chiếm chỗ của xe máy truy đuổi khi tách khỏi xe khác. */
const BIKE_RADIUS = 1;
/** Đặt chốt không được (không có đường phía trước) thì thử lại sau ngần này giây. */
const BLOCK_RETRY = 2;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export class ChaseSim {
  readonly chasers: Chaser[] = [];
  private readonly rng: Rng;
  private nextId = 0;
  private closeTime = 0;
  private blockTimer = 0;
  /** Lần cuối xe truy đuổi thấy Tín (để HUD báo "đang bị bám"). */
  seen = false;
  /** Bộ nhớ tạm của `route` (dùng lại, không tạo mảng mỗi lần tìm đường). */
  private readonly dist: Float64Array;
  private readonly prev: Int32Array;
  private readonly done: Uint8Array;

  constructor(
    private readonly network: TrafficNetwork,
    private readonly sight: SightGrid,
    seed = 31,
    readonly config: ChaseConfig = CHASE,
  ) {
    this.rng = createRng(seed);
    const n = network.nodes.length;
    this.dist = new Float64Array(n);
    this.prev = new Int32Array(n);
    this.done = new Uint8Array(n);
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

  /** Đường ngắn nhất giữa hai nút (Dijkstra trên vài chục nút), ghi vào `out` (xoá trước) rồi trả về chính nó. */
  route(from: number, to: number, out: number[] = []): number[] {
    const nodes = this.network.nodes;
    const { dist, prev, done } = this;
    dist.fill(Infinity);
    prev.fill(-1);
    done.fill(0);
    dist[from] = 0;
    for (let k = 0; k < nodes.length; k++) {
      let u = -1;
      for (let i = 0; i < nodes.length; i++) if (!done[i] && (u === -1 || dist[i]! < dist[u]!)) u = i;
      if (u === -1 || dist[u] === Infinity) break;
      done[u] = 1;
      if (u === to) break;
      const outLanes = nodes[u]!.out;
      for (let j = 0; j < outLanes.length; j++) {
        const lane = this.network.lanes[outLanes[j]!] as TrafficLane;
        const nd = dist[u]! + lane.length;
        if (nd < dist[lane.to]!) {
          dist[lane.to] = nd;
          prev[lane.to] = u;
        }
      }
    }
    // Lần ngược từ đích về nguồn rồi đảo lại.
    out.length = 0;
    for (let v = to; v !== -1; v = prev[v]!) {
      out.push(v);
      if (v === from) break;
    }
    out.reverse();
    if (out[0] !== from) {
      out.length = 0;
      out.push(to);
    }
    return out;
  }

  /** Thêm một xe truy đuổi ở (x, z) hướng `yaw` — ví dụ xe tuần tra vừa thấy Tín gây án quay sang đuổi. */
  spawnAt(x: number, z: number, yaw: number, kind: ChaserKind, speed = 6): Chaser {
    const c: Chaser = {
      id: this.nextId++,
      kind,
      mode: 'chase',
      life: 0,
      roadX: 0,
      roadZ: 0,
      x,
      z,
      yaw,
      lean: 0,
      speed,
      prevX: x,
      prevZ: z,
      prevYaw: yaw,
      prevLean: 0,
      generation: 0,
      path: [],
      repath: 0,
      leaving: false,
    };
    this.chasers.push(c);
    return c;
  }

  /** Đang có chốt chặn (chưa rút)? */
  get blocking(): boolean {
    for (const c of this.chasers) if (c.mode === 'block' && !c.leaving) return true;
    return false;
  }

  /**
   * Đặt chốt chặn trên đoạn đường thẳng chừng `distance` m phía trước Tín (cùng chiều Tín đang chạy): ô tô đỗ ngang,
   * nối đuôi nhau lấp gần hết nửa đường đại lộ (dải phân cách chắn nửa kia) hoặc cả lòng đường thường — chừa khe sát
   * lề đủ cho xe máy lách. Trả false nếu phía trước không có đoạn đường nào hợp.
   */
  placeRoadblock(player: ChasePlayer): boolean {
    const rb = this.config.roadblock;
    const dx = player.dirX ?? 0;
    const dz = player.dirZ ?? 0;
    if (!rb || Math.hypot(dx, dz) < 0.5) return false;
    const ax = player.x + dx * rb.distance;
    const az = player.z + dz * rb.distance;
    let best: TrafficLane | null = null;
    let bestS = 0;
    let bestErr = Infinity;
    for (const lane of this.network.lanes) {
      if (lane.dx * dx + lane.dz * dz < 0.8) continue;
      const s = (ax - lane.x0) * lane.dx + (az - lane.z0) * lane.dz;
      // Không đặt trong lòng giao lộ: chừa hai đầu đoạn thẳng.
      if (s < 12 || s > lane.length - 12) continue;
      const lateral = (ax - lane.x0) * lane.rx + (az - lane.z0) * lane.rz;
      const err = Math.abs(lateral - (lane.minOffset + lane.maxOffset) / 2);
      if (err < bestErr && err < lane.road.width / 2 + 6) {
        bestErr = err;
        best = lane;
        bestS = s;
      }
    }
    if (!best) return false;
    const half = best.road.width / 2 - 0.3;
    // Đại lộ có dải phân cách (dải làn bắt đầu xa tim đường): chắn nửa của chiều Tín đi; đường thường chắn cả lòng.
    const divided = best.minOffset > 1.2;
    const inner = divided ? best.minOffset - 0.8 : -half;
    const span = half - inner;
    const n = Math.max(1, Math.round(span / 4.4));
    const yaw = Math.atan2(best.dx, best.dz) + Math.PI / 2;
    for (let k = 0; k < n; k++) {
      const p = lanePoint(best, bestS, inner + (span * (k + 0.5)) / n);
      const c = this.spawnAt(p.x, p.z, k % 2 === 0 ? yaw : yaw + Math.PI, 'car', 0);
      c.mode = 'block';
      c.life = rb.life;
      c.roadX = best.dx;
      c.roadZ = best.dz;
    }
    return true;
  }

  private spawn(player: ChasePlayer, kind: ChaserKind): void {
    const lanes = this.network.lanes;
    let best: { x: number; z: number; yaw: number } | null = null;
    for (let i = 0; i < 40; i++) {
      const lane = lanes[Math.floor(this.rng() * lanes.length)] as TrafficLane;
      const p = lanePoint(lane, range(this.rng, 0, lane.length), (lane.minOffset + lane.maxOffset) / 2);
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < this.config.spawnMin || d > this.config.spawnMax) continue;
      best = { x: p.x, z: p.z, yaw: Math.atan2(lane.dx, lane.dz) };
      // Ưu tiên chỗ khuất tầm nhìn (không "hiện ra" ngay trước mặt).
      if (!this.sight.clear(p.x, p.z, player.x, player.z)) break;
    }
    best ??= { x: player.x + 70, z: player.z, yaw: -Math.PI / 2 };
    this.spawnAt(best.x, best.z, best.yaw, kind);
  }

  /** Một bước. `level`: Độ Nóng / sao truy nã hiện tại. Trả về true nếu Tín vừa bị chặn đầu / bị bắt. */
  update(dt: number, player: ChasePlayer, level: number): boolean {
    const cfg = this.config;
    const lvl = clamp(level, 0, cfg.perLevel.length - 1);
    const want = cfg.perLevel[lvl] as number;
    const wantCars = Math.min(want, cfg.carsPerLevel?.[lvl] ?? 0);
    // Xe chốt chặn không tính vào số xe đuổi theo cấp. Hạ cấp / hết truy đuổi: các xe thừa (sau `want` xe đầu) rút lui.
    let active = 0;
    let cars = 0;
    for (let i = 0; i < this.chasers.length; i++) {
      const c = this.chasers[i]!;
      if (c.leaving || c.mode !== 'chase') continue;
      if (active >= want) {
        c.leaving = true;
        continue;
      }
      active++;
      if (c.kind === 'car') cars++;
    }
    for (let i = active; i < want; i++) this.spawn(player, cars++ < wantCars ? 'car' : 'bike');

    // Chốt chặn: đủ sao, Tín đang phóng xe, chưa có chốt nào ⇒ đặt chốt phía trước.
    const rb = cfg.roadblock;
    if (rb && lvl >= rb.level) {
      this.blockTimer -= dt;
      if (this.blockTimer <= 0 && player.speed >= rb.minSpeed && !this.blocking) this.blockTimer = this.placeRoadblock(player) ? rb.cooldown : BLOCK_RETRY;
    }

    this.seen = false;
    let close = false;
    for (const c of this.chasers) {
      c.prevX = c.x;
      c.prevZ = c.z;
      c.prevYaw = c.yaw;
      c.prevLean = c.lean;
      const car = c.kind === 'car' ? cfg.car : undefined;
      const d = Math.hypot(player.x - c.x, player.z - c.z);
      const visible = d < cfg.sightRange && this.sight.clear(c.x, c.z, player.x, player.z);
      if (!c.leaving && visible) this.seen = true;
      if (!c.leaving && d < (car?.catchRange ?? cfg.catchRange)) close = true;

      if (c.mode === 'block') {
        // Chốt chặn đứng yên; hết giờ, hạ sao, hoặc Tín đã vượt qua chốt thì rút đi (thành xe thường, chạy xa rồi biến mất).
        c.speed = 0;
        c.life -= dt;
        const past = (player.x - c.x) * c.roadX + (player.z - c.z) * c.roadZ;
        if (c.life <= 0 || !rb || lvl < rb.level || past > rb.passed) {
          c.mode = 'chase';
          c.leaving = true;
        }
        continue;
      }

      // Chọn điểm hướng tới: thấy & gần ⇒ lao thẳng; không thì theo đường lớn.
      let tx: number;
      let tz: number;
      if (!c.leaving && visible) {
        tx = player.x;
        tz = player.z;
        c.path.length = 0;
      } else {
        c.repath -= dt;
        if (c.repath <= 0 || c.path.length === 0) {
          c.repath = 1;
          const goal = c.leaving ? this.nearestNode(c.x * 2 - player.x, c.z * 2 - player.z) : this.nearestNode(player.x, player.z);
          this.route(this.nearestNode(c.x, c.z), goal, c.path);
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
          if (lane) c.path.push(lane.to);
          c.repath = 4;
        }
        const target = this.network.nodes[c.path[0] ?? -1];
        tx = target ? target.x : c.x + Math.sin(c.yaw) * 20;
        tz = target ? target.z : c.z + Math.cos(c.yaw) * 20;
      }

      // Lái: quay đầu có giới hạn, cua gắt thì giảm tốc.
      const want = Math.atan2(tx - c.x, tz - c.z);
      const diff = wrap(want - c.yaw);
      const turnRate = car?.turnRate ?? cfg.turnRate;
      const accel = car?.accel ?? cfg.accel;
      const turn = clamp(diff, -turnRate * dt, turnRate * dt);
      c.yaw = wrap(c.yaw + turn);
      const distT = Math.hypot(tx - c.x, tz - c.z);
      let target = (car?.maxSpeed ?? cfg.maxSpeed) * Math.max(0.3, Math.cos(diff));
      // Áp sát rồi dừng cách STOP_GAP (không đâm xuyên, không hất người đi bộ): tốc độ không quá mức còn phanh kịp.
      // Không cộng tốc độ của Tín vào đây — bị xe đẩy thì Tín "nhanh" lên, cộng vào sẽ thành vòng lặp càng đẩy càng nhanh;
      // Tín chạy thật thì xe vẫn bám theo ở khoảng cách mà đường phanh cho phép.
      if (!c.leaving && visible) target = Math.min(target, Math.sqrt(2 * accel * 1.5 * Math.max(0, d - (car?.stopGap ?? STOP_GAP))));
      if (distT < 3 && !visible) target = Math.min(target, 6);
      c.speed += clamp(target - c.speed, -accel * 1.5 * dt, accel * dt);

      // Tách nhau ra, không chồng lên xe khác.
      let px = 0;
      let pz = 0;
      const own = car?.radius ?? BIKE_RADIUS;
      for (const o of this.chasers) {
        if (o === c) continue;
        const ox = c.x - o.x;
        const oz = c.z - o.z;
        const od = Math.hypot(ox, oz);
        const room = own + (o.kind === 'car' ? (cfg.car?.radius ?? BIKE_RADIUS) : BIKE_RADIUS);
        if (od > 0.01 && od < room) {
          px += (ox / od) * (room - od);
          pz += (oz / od) * (room - od);
        }
      }
      c.x += Math.sin(c.yaw) * c.speed * dt + px * dt * 2;
      c.z += Math.cos(c.yaw) * c.speed * dt + pz * dt * 2;
      const leanGoal = car ? 0 : clamp(Math.atan((c.speed * (turn / dt)) / 9.81), -0.5, 0.5);
      c.lean += (leanGoal - c.lean) * (1 - Math.exp(-5 * dt));
    }
    // Xe rút lui đi đủ xa thì biến mất.
    for (let i = this.chasers.length - 1; i >= 0; i--) {
      const c = this.chasers[i] as Chaser;
      if (c.leaving && Math.hypot(c.x - player.x, c.z - player.z) > 80) this.chasers.splice(i, 1);
    }

    this.closeTime = close && player.speed < cfg.stopSpeed ? this.closeTime + dt : 0;
    if (this.closeTime >= cfg.catchTime) {
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
