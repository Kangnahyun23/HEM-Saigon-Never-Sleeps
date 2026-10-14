import { createRng, range, type Rng } from '@/core/random';
import { fleetKinds, VEHICLE_SPECS, type TrafficKind, type VehicleSpec } from './trafficKinds';
import { lanePoint, turnKind, type TrafficLane, type TrafficNetwork } from './trafficNetwork';

/**
 * Mô phỏng dòng xe NPC (thuần logic, chạy theo bước cố định 60 Hz).
 *
 * Mỗi xe chạy dọc một làn với độ lệch ngang riêng (xe máy dàn hàng ngang), tới giao lộ thì chọn hướng đi tiếp và
 * cua theo đường cong Bézier. Xe giữ khoảng cách với vật cản phía trước, lách sang bên khi bị chặn, nhường xe bên
 * phải ở giao lộ. Để phố lúc nào cũng đông, xe đi quá xa người chơi được "thả" lại quanh người chơi (bong bóng).
 *
 * Ngoài xe máy còn có ô tô / taxi / buýt chạy sát tim đường và ba gác / xích lô / xe đẩy chạy chậm sát lề
 * (trafficKinds.ts): các loại này giữ một vệt cố định, chỉ lách ra khi bị chặn rồi trở về vệt cũ.
 * Xe lớn (ô tô, buýt, ba gác) qua giao lộ theo "lượt": các xe đi thẳng cùng một trục đường được qua cùng lúc, xe rẽ
 * thì phải có giao lộ cho riêng mình; xe chưa tới lượt chờ ở vạch dừng — không có hai xe lớn chắn ngang nhau giữa ngã
 * tư. Xe nhỏ nhường xe lớn đang chắn ngang đường mình.
 */

export interface Obstacle {
  x: number;
  z: number;
  /** Bán kính chiếm chỗ (m). */
  radius: number;
  /** Người đi bộ (Tín): ô tô / buýt dừng lại chờ + bóp còi chứ không lách qua ngay như với xe đậu. */
  person?: boolean;
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
  /** Loại xe — cố định suốt đời xe (thả lại vẫn là loại đó). */
  kind: TrafficKind;
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
  /** Quãng còn phải giữ vệt lách trước khi trở về vệt của mình (m) — chỉ dùng cho xe có vệt cố định. */
  hold: number;
  /** Xe lớn: giao lộ đang giữ lượt (sắp vào / đang qua) và giao lộ vừa qua nhưng đuôi xe chưa ra hẳn; −1 = không. */
  node: number;
  leaving: number;
}

/** Một tiếng còi phát ra trong bước mô phỏng vừa rồi. */
export interface Honk {
  id: number;
  kind: TrafficKind;
  x: number;
  z: number;
}

export interface TrafficOptions {
  seed: number;
  /** Số xe máy. */
  count: number;
  /** Số ô tô (sedan, taxi, buýt, bán tải — chia theo CAR_MIX) và số xe thô sơ (ba gác, xích lô, xe đẩy). */
  cars: number;
  slow: number;
  /** Xe xa người chơi hơn mức này thì được thả lại gần (m). */
  despawnRadius: number;
  /** Khoảng cách thả lại (m). */
  respawnMin: number;
  respawnMax: number;
}

export const DEFAULT_TRAFFIC: TrafficOptions = { seed: 7, count: 80, cars: 0, slow: 0, despawnRadius: 140, respawnMin: 45, respawnMax: 125 };

/** Thông số chung cho mọi loại xe; kích thước / sức máy từng loại nằm ở VEHICLE_SPECS. */
export const AGENT = {
  /** Khoảng hở tối thiểu khi dừng sau vật cản (m). */
  minGap: 1.1,
  /** Thời gian giãn cách (s). */
  headway: 0.85,
} as const;

const BIKE = VEHICLE_SPECS.bike;

const TURN_SPEED = { straight: Infinity, right: 4.2, left: 5.5, uturn: 2.5 } as const;
const TURN_WEIGHT = { straight: 0.55, right: 0.25, left: 0.2, uturn: 0 } as const;
const COMFORT_DECEL = 2.8;
/** Khe hở ngang tối thiểu giữa hai xe chạy song song (m) — hai xe máy: tim cách tim 1,15 m. */
const SIDE_GAP = 0.15;
/** Khe hở ngang chừa ra khi lách qua vật cản (m). */
const DODGE_GAP = 0.35;
/** Xe dài hơn mức này mà cắt ngang thì chắn đường bằng cả chiều dài thân. */
const LONG_VEHICLE = 2.5;
/** Xe lớn đi thẳng qua giao lộ cũng phải chậm lại (m/s) — còn kịp phanh khi có xe nhỏ băng ngang trước mũi. */
const BIG_JUNCTION_SPEED = 7.5;
/** Xe lớn đang qua giao lộ phanh cho xe nhỏ nằm trong khoảng này trước mũi: NOSE_REACH + tốc độ × NOSE_TIME (m). */
const NOSE_REACH = 1.5;
const NOSE_TIME = 0.4;
/** Trạng thái lượt xe lớn ở một giao lộ. */
const NODE_FREE = 0;
const NODE_ALONG_X = 1;
const NODE_ALONG_Z = 2;
const NODE_TURNING = 3;
/** Xe lớn chờ lượt: mũi xe dừng cách đầu làn chừng này về phía giao lộ (m) — chưa lấn sang đường cắt ngang. */
const STOP_LINE_NOSE = 1.2;
/** Xe lớn bị người đi bộ chắn đường: chờ ngần này giây (bóp còi) rồi mới lách qua. */
export const PERSON_PATIENCE = 6;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

interface SafeInfo {
  speed: number;
  gap: number;
  lateral: number;
  slow: boolean;
  side: number;
  /** Khoảng cách ngang (tim tới tim) cần có với xe sát sườn đó. */
  sideClear: number;
  byObstacle: boolean;
  /** Vật chắn gần nhất là người đi bộ. */
  byPerson: boolean;
  leaderSpeed: number;
  /** Nửa bề ngang và khoảng tim-tới-tim theo chiều dọc của vật chắn gần nhất. */
  blockHalf: number;
  ahead: number;
  /** Tốc độ tối đa của vật chắn gần nhất (0 = vật cản đứng yên). */
  blockTop: number;
  look: number;
  fx: number;
  fz: number;
}

export class TrafficSim {
  readonly agents: TrafficAgent[] = [];
  readonly options: TrafficOptions;
  private readonly rng: Rng;
  /** Đếm số lần thả lại (thống kê / test). */
  respawns = 0;
  /** Nhân với tốc độ mọi xe (trời mưa chạy chậm lại). */
  speedFactor = 1;
  /** Các tiếng còi trong bước vừa chạy (xoá đầu mỗi bước). */
  readonly honks: Honk[] = [];
  /** Số xe máy: `agents` xếp xe máy trước (0 … bikes − 1), các loại xe khác theo sau. */
  readonly bikes: number;
  /** Lượt xe lớn ở từng giao lộ: đang dành cho hướng nào (NODE_FREE / đi thẳng theo trục X / trục Z / một xe rẽ) và mấy xe đang giữ. */
  private readonly nodeMode: number[];
  private readonly nodeCount: number[];

  constructor(
    readonly network: TrafficNetwork,
    focus: Focus,
    options: Partial<TrafficOptions> = {},
  ) {
    this.options = { ...DEFAULT_TRAFFIC, ...options };
    this.rng = createRng(this.options.seed);
    this.bikes = this.options.count;
    this.nodeMode = network.nodes.map(() => NODE_FREE);
    this.nodeCount = network.nodes.map(() => 0);
    const kinds = fleetKinds(this.options.count, this.options.cars, this.options.slow);
    for (let i = 0; i < kinds.length; i++) {
      const agent = this.blankAgent(i, kinds[i] as TrafficKind);
      this.agents.push(agent);
      this.place(agent, focus, 12, this.options.respawnMax, false);
    }
  }

  private lane(id: number): TrafficLane {
    return this.network.lanes[id] as TrafficLane;
  }

  /** Dải độ lệch ngang hợp lệ cho tim xe loại `spec` trên làn (dải của làn tính cho xe máy). */
  private bandMin(spec: VehicleSpec, lane: TrafficLane): number {
    return lane.minOffset - BIKE.halfWidth + spec.halfWidth;
  }

  private bandMax(spec: VehicleSpec, lane: TrafficLane): number {
    return lane.maxOffset + BIKE.halfWidth - spec.halfWidth;
  }

  /** Vệt chạy quen của xe có vệt cố định: sát tim đường hoặc sát lề. */
  private home(spec: VehicleSpec, lane: TrafficLane): number {
    return spec.position === 'inner' ? this.bandMin(spec, lane) : this.bandMax(spec, lane);
  }

  private blankAgent(id: number, kind: TrafficKind): TrafficAgent {
    return {
      id,
      kind,
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
      hold: 0,
      node: -1,
      leaving: -1,
    };
  }

  /** Không còn xe lớn nào đứng trước `agent` trên cùng làn — xe đứng sau mà giữ lượt thì xe trước kẹt mãi ở vạch. */
  private firstInLine(agent: TrafficAgent): boolean {
    for (const o of this.agents) {
      if (o !== agent && o.lane === agent.lane && !o.turn && o.s > agent.s && VEHICLE_SPECS[o.kind].big) return false;
    }
    return true;
  }

  /** Xin lượt qua giao lộ `node` cho một xe lớn đi từ làn `from` sang làn `to`. */
  private acquire(node: number, from: TrafficLane, to: TrafficLane): boolean {
    // Đi thẳng và rẽ phải (ôm sát góc phố) không cắt dòng xe cùng trục; rẽ trái / quay đầu cắt ngang nên cần giao lộ cho riêng mình.
    const kind = turnKind(from, to);
    const mode = kind === 'straight' || kind === 'right' ? (Math.abs(from.dx) > 0.5 ? NODE_ALONG_X : NODE_ALONG_Z) : NODE_TURNING;
    const current = this.nodeMode[node];
    if (current !== NODE_FREE && (current !== mode || mode === NODE_TURNING)) return false;
    this.nodeMode[node] = mode;
    this.nodeCount[node] = (this.nodeCount[node] as number) + 1;
    return true;
  }

  /** Trả lượt qua giao lộ `node` (xe đang giữ nó trong `agent.node` / `agent.leaving`). */
  private release(node: number): void {
    if (node < 0) return;
    const left = (this.nodeCount[node] as number) - 1;
    this.nodeCount[node] = left;
    if (left <= 0) this.nodeMode[node] = NODE_FREE;
  }

  /** Chọn làn đi tiếp ở cuối làn `laneId`: thẳng nhiều hơn rẽ, không quay đầu trừ khi hết đường. */
  private chooseNext(laneId: number, spec: VehicleSpec): number {
    const lane = this.lane(laneId);
    const node = this.network.nodes[lane.to];
    let options = (node?.out ?? []).filter((id) => this.lane(id).to !== lane.from);
    if (options.length === 0) return (node?.out[0] ?? laneId) as number;
    if (spec.avenueOnly) {
      // Xe buýt bám đại lộ; hết đại lộ (ra tới rìa khu) mới chịu rẽ vào đường thường.
      const avenues = options.filter((id) => this.lane(id).road.kind === 'avenue');
      if (avenues.length > 0) options = avenues;
    }
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
    const spec = VEHICLE_SPECS[agent.kind];
    const fixed = spec.position !== 'spread';
    let best: { lane: TrafficLane; s: number; offset: number; score: number } | null = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const lane = lanes[Math.floor(this.rng() * lanes.length)] as TrafficLane;
      if (lane.length < 4) continue;
      let s = range(this.rng, 0, lane.length);
      // Xe lớn phải xin lượt trước khi vào giao lộ: đừng thả sát cuối làn khi đang chạy nhanh.
      if (spec.big) s = Math.min(s, Math.max(0, lane.length - 15));
      let offset = range(this.rng, lane.minOffset, lane.maxOffset);
      if (fixed) offset = this.home(spec, lane);
      if (spec.avenueOnly && lane.road.kind !== 'avenue') continue;
      const p = lanePoint(lane, s, offset);
      const d = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (d < minR || d > maxR) continue;
      let crowded = false;
      for (const o of this.agents) {
        // Hai xe máy: cách nhau 4 m; xe dài thì cộng thêm phần thân.
        const room = 4 + (spec.length + VEHICLE_SPECS[o.kind].length) / 2 - BIKE.length;
        if (o !== agent && Math.abs(o.x - p.x) < room && Math.abs(o.z - p.z) < room) {
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
      best = { lane, s: range(this.rng, 0, lane.length), offset: fixed ? this.home(spec, lane) : (lane.minOffset + lane.maxOffset) / 2, score: 0 };
    }

    const { lane, s, offset } = best;
    const p = lanePoint(lane, s, offset);
    agent.lane = lane.id;
    agent.next = this.chooseNext(lane.id, spec);
    agent.s = s;
    agent.offset = offset;
    agent.targetOffset = offset;
    agent.turn = null;
    agent.temper = range(this.rng, 0.8, 1.15);
    agent.speed = Math.min(spec.maxSpeed, lane.speedLimit * spec.speedScale) * agent.temper * 0.8;
    agent.x = agent.prevX = p.x;
    agent.z = agent.prevZ = p.z;
    agent.yaw = agent.prevYaw = Math.atan2(lane.dx, lane.dz);
    agent.lean = agent.prevLean = 0;
    agent.stuck = 0;
    agent.creep = 0;
    agent.weaveTimer = range(this.rng, 2, 8);
    agent.blocked = 0;
    agent.honkCooldown = 0;
    agent.hold = 0;
    this.release(agent.node);
    this.release(agent.leaving);
    agent.node = agent.leaving = -1;
    agent.generation++;
  }

  /**
   * Đưa xe `index` đi chỗ khác ngay (xe vừa bị cướp: chiếc người chơi lái là xe thật, còn chỗ này trong đàn xe NPC
   * hiện lại ở xa như một chiếc khác — `generation` đổi nên màu sơn cũng đổi).
   */
  respawn(index: number, focus: Focus): void {
    const agent = this.agents[index];
    if (!agent) return;
    this.place(agent, focus, this.options.respawnMin, this.options.respawnMax, true);
    this.respawns++;
  }

  /** Độ lệch tương ứng trên làn mới, giữ nguyên tỉ lệ trong dải (sát lề vẫn sát lề). */
  private mapOffset(from: TrafficLane, to: TrafficLane, offset: number): number {
    const f = clamp((offset - from.minOffset) / Math.max(0.01, from.maxOffset - from.minOffset), 0, 1);
    return to.minOffset + f * (to.maxOffset - to.minOffset);
  }

  private beginTurn(agent: TrafficAgent, overshoot: number): void {
    const a = this.lane(agent.lane);
    const b = this.lane(agent.next);
    const spec = VEHICLE_SPECS[agent.kind];
    agent.nextOffset = spec.position === 'spread' ? this.mapOffset(a, b, agent.offset) : this.home(spec, b);
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
    agent.hold = 0;
    // Tim xe đã ra khỏi giao lộ nhưng đuôi còn trong đó: giữ lượt thêm một đoạn (xem `step`).
    agent.leaving = agent.node;
    agent.node = -1;
    agent.next = this.chooseNext(agent.lane, VEHICLE_SPECS[agent.kind]);
  }

  /** Kết quả `safeSpeed` (dùng lại một đối tượng, không tạo rác mỗi bước). */
  private readonly safe: SafeInfo = { speed: 0, gap: 0, lateral: 0, slow: false, side: 0, sideClear: 0, byObstacle: false, byPerson: false, leaderSpeed: 0, blockHalf: 0, ahead: 0, blockTop: 0, look: 0, fx: 0, fz: 0 };

  /**
   * Ghi nhận một vật phía trước nếu nó nằm trong hành lang của `agent` và gần hơn vật đã có.
   * `halfWidth`: nửa bề ngang vật đó (theo phương ngang của `agent`); `ahead`: khoảng tim-tới-tim khi hai bên chạm nhau;
   * `top`: tốc độ tối đa của vật đó (0 = vật cản đứng yên, không phải xe NPC).
   */
  private consider(agent: TrafficAgent, ownHalf: number, ox: number, oz: number, halfWidth: number, ahead: number, speed: number, top: number, person = false): void {
    const r = this.safe;
    const dx = ox - agent.x;
    const dz = oz - agent.z;
    const d = dx * r.fx + dz * r.fz;
    // Tầm nhìn tính cho hai xe máy; vật dài hơn thì nhìn xa thêm đúng phần thân dài hơn đó.
    if (d <= 0 || d > r.look + Math.max(0, ahead - BIKE.length)) return;
    const l = dx * -r.fz + dz * r.fx;
    if (Math.abs(l) > ownHalf + halfWidth) return;
    const g = d - ahead;
    if (g < r.gap) {
      r.gap = g;
      r.lateral = l;
      r.leaderSpeed = speed;
      r.slow = speed < agent.speed * 0.7 || speed < 1;
      r.byObstacle = top === 0;
      r.byPerson = person;
      r.blockHalf = halfWidth;
      r.ahead = ahead;
      r.blockTop = top;
    }
  }

  /** Tốc độ an toàn khi xét các vật cản phía trước; trả về luôn vật cản gần nhất để tính đường lách. */
  private safeSpeed(agent: TrafficAgent, obstacles: readonly Obstacle[]): SafeInfo {
    const fx = Math.sin(agent.yaw);
    const fz = Math.cos(agent.yaw);
    const rx = -fz;
    const rz = fx;
    const look = Math.max(7, agent.speed * 1.8 + 5);
    const spec = VEHICLE_SPECS[agent.kind];
    /** Xe lớn đang giữ lượt qua giao lộ trước mặt (hoặc đang ở giữa giao lộ). */
    const priority = spec.big && agent.node >= 0;
    const r = this.safe;
    r.fx = fx;
    r.fz = fz;
    r.look = look;
    r.gap = Infinity;
    r.lateral = 0;
    r.slow = false;
    r.leaderSpeed = 0;
    /** Độ lệch ngang của xe chạy song song gần nhất (0 = không có). */
    r.side = 0;
    r.sideClear = 0;
    r.byObstacle = false;
    r.byPerson = false;
    r.blockHalf = 0;
    r.ahead = 0;
    r.blockTop = 0;

    // Vòng chỉ số (không for…of): hàm này chạy cho mọi xe × mọi xe, 60 lần / giây.
    const agents = this.agents;
    for (let i = 0; i < agents.length; i++) {
      const o = agents[i] as TrafficAgent;
      if (o === agent) continue;
      const other = VEHICLE_SPECS[o.kind];
      const span = (spec.length + other.length) / 2;
      // Lọc nhanh theo hộp bao trước khi chiếu.
      const box = look + span - BIKE.length;
      if (Math.abs(o.x - agent.x) > box || Math.abs(o.z - agent.z) > box) continue;
      const ofx = Math.sin(o.yaw);
      const ofz = Math.cos(o.yaw);
      const align = ofx * fx + ofz * fz;
      // Đang "nhích" khỏi chỗ kẹt: bỏ qua xe nhỏ; xe lớn thì vẫn tránh (chui vào thân ô tô là nó hết đường đi).
      if (agent.creep > 0 && !other.big) continue;
      // Xe dài cắt ngang trước mũi: chắn đường bằng cả chiều dài thân, còn bề dày là bề ngang của nó.
      const across = Math.abs(align) < 0.5 && other.length > LONG_VEHICLE;
      const half = across ? other.length / 2 : other.halfWidth;
      const ahead = spec.length / 2 + (across ? other.halfWidth : other.length / 2);
      if (priority && align < 0.5) {
        // Xe lớn đang có lượt qua giao lộ: xe băng ngang / ngược chiều phải nhường, chỉ phanh khi đã sát mũi.
        const d = (o.x - agent.x) * fx + (o.z - agent.z) * fz;
        if (d - ahead > NOSE_REACH + agent.speed * NOSE_TIME) continue;
      } else if (Math.abs(align) < 0.5) {
        // Xe cắt ngang: nhường xe đến từ bên phải; xe bên trái thì chỉ để ý khi đã sát mũi. Xe lớn thì bên nào cũng nhường.
        const l = (o.x - agent.x) * rx + (o.z - agent.z) * rz;
        const d = (o.x - agent.x) * fx + (o.z - agent.z) * fz;
        if (l < -0.2 && d > 4 && !other.big) continue;
      } else if (align > 0.5) {
        // Xe chạy song song sát sườn: ghi lại để dạt ra.
        const l = (o.x - agent.x) * rx + (o.z - agent.z) * rz;
        const d = (o.x - agent.x) * fx + (o.z - agent.z) * fz;
        const clear = spec.halfWidth + other.halfWidth + SIDE_GAP;
        if (Math.abs(d) < span && Math.abs(l) < clear && (r.side === 0 || Math.abs(l) < Math.abs(r.side))) {
          r.side = l || 0.01;
          r.sideClear = clear;
        }
      }
      this.consider(agent, spec.halfWidth, o.x, o.z, half, ahead, Math.max(0, o.speed * align), Math.min(other.maxSpeed, 99));
    }
    for (let i = 0; i < obstacles.length; i++) {
      const ob = obstacles[i] as Obstacle;
      const box = look + spec.length / 2;
      if (Math.abs(ob.x - agent.x) > box || Math.abs(ob.z - agent.z) > box) continue;
      this.consider(agent, spec.halfWidth, ob.x, ob.z, ob.radius, ob.radius + spec.length / 2, 0, 0, ob.person === true);
    }

    if (r.gap === Infinity) {
      r.speed = Infinity;
      return r;
    }
    // Theo xe trước: không vượt quá tốc độ xe trước + phần khoảng hở dư.
    const free = Math.max(0, r.gap - AGENT.minGap);
    r.speed = Math.max(0, Math.min(free / AGENT.headway, r.leaderSpeed + free * 0.9));
    return r;
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

      const spec = VEHICLE_SPECS[agent.kind];
      const lane = this.lane(agent.lane);
      const nextLane = this.lane(agent.next);
      const kind = turnKind(lane, nextLane);
      let desired = Math.min(spec.maxSpeed, lane.speedLimit * spec.speedScale) * agent.temper * this.speedFactor;
      const cruise = desired;
      const turnSpeed = Math.min(desired, TURN_SPEED[kind] * spec.turnScale, spec.big ? BIG_JUNCTION_SPEED : Infinity);
      const remaining = lane.length - agent.s;
      if (agent.turn) desired = turnSpeed;
      else desired = Math.min(desired, Math.sqrt(turnSpeed * turnSpeed + 2 * COMFORT_DECEL * Math.max(0, remaining)));

      // Xe lớn xin lượt qua giao lộ khi tới gần; chưa tới lượt thì dừng ở vạch.
      let waiting = false;
      if (spec.big && !agent.turn) {
        if (agent.leaving >= 0 && agent.s > spec.length / 2 + 0.5) {
          this.release(agent.leaving);
          agent.leaving = -1;
        }
        const toLine = remaining - Math.max(0, spec.length / 2 - STOP_LINE_NOSE);
        if (agent.node !== lane.to && toLine < (agent.speed * agent.speed) / (2 * COMFORT_DECEL) + 4 && this.firstInLine(agent) && this.acquire(lane.to, lane, nextLane)) {
          agent.node = lane.to;
        }
        if (agent.node !== lane.to) {
          desired = Math.min(desired, Math.sqrt(2 * COMFORT_DECEL * Math.max(0, toLine)));
          waiting = toLine < 1;
        }
      }

      const safe = this.safeSpeed(agent, obstacles);
      desired = Math.min(desired, safe.speed);

      // Lách: bị xe chậm / vật cản chặn trên phần thẳng ⇒ dạt sang bên còn chỗ.
      if (!agent.turn) {
        const fixed = spec.position !== 'spread';
        const lo = this.bandMin(spec, lane);
        const hi = this.bandMax(spec, lane);
        agent.weaveTimer -= dt;
        const roomLeft = lane.length - agent.s > 4;
        // Xe có vệt cố định không chen lấn: chỉ lách vật cản đứng yên và loại xe vốn chậm hơn mình (xích lô, xe đẩy…).
        // Người đứng giữa đường thì xe lớn dừng lại bóp còi, chờ mãi không được mới lách qua.
        const patient = spec.big && safe.byPerson && agent.blocked < PERSON_PATIENCE;
        const worthPassing = (!fixed || safe.blockTop < cruise * 0.7) && !patient;
        if (safe.slow && safe.gap < 9 && roomLeft && worthPassing) {
          const blocker = agent.offset + safe.lateral;
          const clear = spec.halfWidth + safe.blockHalf + DODGE_GAP;
          // Hai chỗ lách (trái / phải vật chắn): lấy chỗ gần hơn trong dải cho phép.
          const left = blocker - clear;
          const right = blocker + clear;
          const leftOk = left >= lo && left <= hi;
          const rightOk = right >= lo && right <= hi;
          if (leftOk || rightOk) {
            agent.targetOffset = leftOk && (!rightOk || Math.abs(left - agent.offset) <= Math.abs(right - agent.offset)) ? left : right;
            // Giữ vệt lách cho tới khi đuôi xe qua hẳn vật chắn (vật chắn đang chạy thì quãng vượt dài hơn).
            const passing = cruise / Math.max(0.5, cruise - safe.leaderSpeed);
            agent.hold = Math.min(60, (safe.gap + 2 * safe.ahead + 0.5) * passing);
          }
        } else if (safe.side !== 0) {
          // Có xe sát sườn: dạt ra cho đủ khoảng hở.
          const push = safe.sideClear - Math.abs(safe.side) + 0.1;
          agent.targetOffset = clamp(agent.offset - Math.sign(safe.side) * push, lo, hi);
        } else if (fixed) {
          // Xe có vệt cố định: lách xong thì về lại vệt của mình.
          if (agent.hold <= 0) agent.targetOffset = this.home(spec, lane);
        } else if (agent.weaveTimer <= 0) {
          agent.weaveTimer = range(this.rng, 3, 9);
          agent.targetOffset = clamp(agent.offset + range(this.rng, -1.2, 1.2), lo, hi);
        }
        // Xe chậm (xích lô, xe đẩy) bẻ lái được ở tốc độ đi bộ; đang lách vật chắn thì vẫn nhích ngang được dù gần dừng.
        let steerable = Math.min(1, agent.speed / Math.min(2, spec.maxSpeed * 0.4));
        if (fixed && agent.hold > 0) steerable = Math.max(steerable, 0.35);
        const maxShift = spec.lateralSpeed * dt * steerable;
        agent.offset += clamp(agent.targetOffset - agent.offset, -maxShift, maxShift);
      }

      if (agent.speed < desired) agent.speed = Math.min(desired, agent.speed + spec.accel * dt);
      else agent.speed = Math.max(desired, agent.speed - spec.brake * dt);
      if (agent.speed < 0.01) agent.speed = 0;

      // Kẹt lâu (ví dụ bốn xe nhường nhau ở giao lộ) ⇒ tạm bỏ qua xe khác để nhích đi.
      if (agent.speed < 0.3 && safe.gap < Infinity && !waiting) agent.stuck += dt;
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
      if (agent.blocked > 1 && agent.honkCooldown <= 0 && spec.horn) {
        agent.honkCooldown = 3.5;
        this.honks.push({ id: agent.id, kind: agent.kind, x: agent.x, z: agent.z });
      }

      // Di chuyển.
      const ds = agent.speed * dt;
      if (agent.hold > 0) agent.hold -= ds;
      if (agent.turn) {
        agent.turn.t += ds / agent.turn.length;
        if (agent.turn.t >= 1) this.endTurn(agent, (agent.turn.t - 1) * agent.turn.length);
      } else {
        agent.s += ds;
        if (agent.s >= lane.length) {
          if (spec.big && agent.node !== lane.to) {
            // Chưa có lượt mà trôi tới cuối làn (vừa được thả sát giao lộ): đứng lại ngay mép.
            agent.s = lane.length - 0.01;
            agent.speed = 0;
          } else this.beginTurn(agent, agent.s - lane.length);
        }
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
        const l = this.lane(agent.lane);
        x = l.x0 + l.dx * agent.s + l.rx * agent.offset;
        z = l.z0 + l.dz * agent.s + l.rz * agent.offset;
      }
      const mx = x - agent.x;
      const mz = z - agent.z;
      agent.x = x;
      agent.z = z;
      if (mx * mx + mz * mz > 1e-8) agent.yaw = Math.atan2(mx, mz);

      // Nghiêng vào cua theo gia tốc hướng tâm v·ω; quay bánh.
      const yawRate = wrapAngle(agent.yaw - agent.prevYaw) / dt;
      const leanGoal = spec.leans ? clamp(Math.atan((agent.speed * yawRate) / 9.81), -0.5, 0.5) : 0;
      agent.lean += (leanGoal - agent.lean) * (1 - Math.exp(-5 * dt));
      agent.wheel = (agent.wheel + ds / 0.29) % (Math.PI * 2);
    }
  }
}
