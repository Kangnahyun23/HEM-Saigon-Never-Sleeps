import { createRng, range, type Rng } from '@/core/random';
import { resolveHit, type HitResult } from '@/systems/combat';
import type { SightGrid } from '@/systems/heat';
import type { Chaser, ChaserKind, ChasePlayer, ChaseSim } from './chase';
import type { HemMap } from './hemNav';

/**
 * Công an xuống xe đuổi bộ (R3 — thuần logic, 60 Hz, có seed, có unit test).
 *
 * Xe công an (xe máy, ô tô) tới gần Tín đang đi bộ mà thấy Tín thì dừng lại, người lái xuống đuổi bộ: chạy chậm hơn Tín
 * (chạy là thoát), áp sát Tín đứng yên đủ lâu thì còng tay — bị bắt. Đánh được như người đi đường nhưng khoẻ hơn; đã có
 * ai đánh công an (hoặc từ 4 sao) thì công an rút dùi cui đánh lại. Tín lên xe / mất dấu lâu thì công an về xe chạy tiếp
 * (khuất mặt Tín thì "lên xe" luôn); người lái bị hạ thì xe bỏ lại bên đường, đoàn truy đuổi gọi xe khác tới.
 */

export interface FootPlayer extends ChasePlayer {
  /** Tín đang đi bộ (không lái xe). */
  onFoot: boolean;
}

export interface Officer {
  id: number;
  /** Xe đã chở người này (Chaser.id). */
  vehicle: number;
  kind: ChaserKind;
  /** = Chaser.id + 1, như người lái trên xe (NearRiderView byGeneration) ⇒ xuống xe vẫn đúng người đó. */
  generation: number;
  x: number;
  z: number;
  yaw: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  /** Tốc độ bước vừa rồi (m/s) — hình chọn động tác chạy / đứng. */
  speed: number;
  health: number;
  /** Loạng choạng vì trúng đòn / nằm dưới đất còn bao lâu (s). */
  hurt: number;
  down: number;
  dead: boolean;
  /** Đã gục bao lâu (s). */
  deadT: number;
  /** 'chase' = đuổi / còng Tín; 'return' = về xe. */
  mode: 'chase' | 'return';
  /** Chỗ thấy Tín lần cuối và đã bao lâu (s). */
  lastX: number;
  lastZ: number;
  lastSeen: number;
  /** Đang vung dùi cui (s còn lại) và chờ tới cú kế. */
  strike: number;
  strikeCd: number;
  /** Đã nắm được Tín bao lâu (s) — đủ `arrestTime` là còng xong. */
  grab: number;
}

export interface FootPoliceConfig {
  /** Xe cách Tín (đang đi bộ, nhìn thấy) dưới ngần này (m) thì dừng cho người lái xuống. */
  readonly dismountRange: number;
  /** Chạy (m/s) — chậm hơn Tín chạy bộ (6,4 m/s). */
  readonly runSpeed: number;
  readonly sightRange: number;
  /** Đứng cách Tín (m, tâm tới tâm). */
  readonly stopGap: number;
  /** Còng tay: trong tầm này, Tín chậm hơn `arrestSpeed` đủ `arrestTime` giây. */
  readonly arrestRange: number;
  readonly arrestSpeed: number;
  readonly arrestTime: number;
  /** Máu (người đi đường 100). */
  readonly health: number;
  readonly hurtTime: number;
  readonly downTime: number;
  /** Dùi cui: tầm, sát thương mỗi cú, thời gian một cú (trúng ở giữa nhịp), nghỉ giữa hai cú. */
  readonly strikeRange: number;
  readonly strikeDamage: number;
  readonly strikeTime: number;
  readonly strikeRest: readonly [number, number];
  /** Khuất mặt quá ngần này (s) thì thôi đuổi, về xe. */
  readonly lostTime: number;
  /** Từ ngần này sao công an đánh luôn (không chỉ còng). */
  readonly hostileLevel: number;
}

export const FOOT_POLICE: FootPoliceConfig = {
  dismountRange: 9,
  runSpeed: 5.6,
  sightRange: 40,
  stopGap: 0.85,
  arrestRange: 1.3,
  arrestSpeed: 2,
  arrestTime: 2,
  health: 130,
  hurtTime: 0.7,
  downTime: 3,
  strikeRange: 1.45,
  strikeDamage: 8,
  strikeTime: 0.6,
  strikeRest: [1.2, 1.8],
  lostTime: 5,
  hostileLevel: 4,
};

/** Tín còn thấy công an trong tầm này (m, không bị nhà che) thì công an không "biến" lên xe được. */
const PLAYER_SIGHT = 45;
/** Xa Tín quá ngần này (m) thì dọn luôn (xác, người đang về xe). */
const FAR = 90;
/** Xác nằm lại ít nhất ngần này (s), khuất mặt Tín thì dọn. */
const CORPSE_TIME = 25;
/** Xác nằm lại tối đa bấy nhiêu cái (thêm nữa thì dọn cái cũ nhất). */
export const MAX_CORPSES = 2;
/** Tốc độ quay người (rad/s). */
const TURN_RATE = 10;
/** Hai công an đứng cách nhau ít nhất ngần này (m). */
const PERSONAL = 0.7;

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class FootPoliceSim {
  readonly officers: Officer[] = [];
  /** Có công an đi bộ thấy Tín (bước vừa rồi). */
  seen = false;
  /** Đã có người đánh công an trong lượt truy nã này ⇒ công an đánh lại (hết sao thì thôi). */
  hostile = false;
  /** Sự kiện cho game đọc rồi tự đặt lại về 0: máu Tín mất vì dùi cui, số người vừa xuống xe. */
  damageToPlayer = 0;
  dismounted = 0;
  /** Tiến độ còng tay lớn nhất (0..1) — HUD báo "sắp bị còng". */
  grabProgress = 0;
  private nextId = 0;
  private readonly rng: Rng;
  /** Điểm tạm dùng lại (không tạo đối tượng mỗi bước). */
  private readonly point = { x: 0, z: 0 };

  constructor(
    private readonly chase: ChaseSim,
    private readonly sight: SightGrid,
    private readonly hems: HemMap | null,
    /** Số công an đi bộ cùng lúc tối đa (theo sức máy); 0 = không ai xuống xe (xe tự bắt như trước). */
    readonly capacity: number,
    seed = 41,
    readonly config: FootPoliceConfig = FOOT_POLICE,
  ) {
    this.rng = createRng(seed);
  }

  /** Số công an còn đứng được (chưa gục). */
  get alive(): number {
    let n = 0;
    for (const o of this.officers) if (!o.dead) n++;
    return n;
  }

  /** Một bước. `level`: sao truy nã. Trả về true nếu Tín vừa bị còng tay (bị bắt). */
  update(dt: number, player: FootPlayer, level: number): boolean {
    const cfg = this.config;
    if (level <= 0) this.hostile = false;
    const angry = this.hostile || level >= cfg.hostileLevel;
    this.dismount(player, level);
    this.seen = false;
    let busted = false;
    let grab = 0;
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const o = this.officers[i]!;
      o.prevX = o.x;
      o.prevZ = o.z;
      o.prevYaw = o.yaw;
      o.speed = 0;
      const d = Math.hypot(player.x - o.x, player.z - o.z);
      const watched = d < PLAYER_SIGHT && this.sight.clear(player.x, player.z, o.x, o.z);
      if (o.dead) {
        o.deadT += dt;
        if (d > FAR || (o.deadT > CORPSE_TIME && !watched)) this.officers.splice(i, 1);
        continue;
      }
      if (o.down > 0 || o.hurt > 0) {
        o.down = Math.max(0, o.down - dt);
        o.hurt = Math.max(0, o.hurt - dt);
        o.grab = 0;
        o.strike = 0;
        continue;
      }
      const vehicle = this.vehicleOf(o);
      // Thôi đuổi: Tín lên xe, hết sao, xe của mình phải rút / không còn, hoặc mất dấu quá lâu.
      if (o.mode === 'chase' && (!player.onFoot || level <= 0 || !vehicle || vehicle.leaving || o.lastSeen > cfg.lostTime)) o.mode = 'return';
      if (o.mode === 'return') {
        o.grab = 0;
        o.strike = 0;
        if (this.stepReturn(o, vehicle, watched, d, dt)) this.officers.splice(i, 1);
        continue;
      }

      const visible = d < cfg.sightRange && this.sight.clear(o.x, o.z, player.x, player.z);
      if (visible) {
        o.lastX = player.x;
        o.lastZ = player.z;
        o.lastSeen = 0;
        this.seen = true;
      } else o.lastSeen += dt;
      // Đang vung dùi cui thì đứng tấn; không thì chạy tới Tín (thấy) / chỗ thấy Tín lần cuối / men theo hẻm ra.
      if (o.strike <= 0) {
        if (visible) this.moveToward(o, player.x, player.z, cfg.stopGap, dt);
        else if (Math.hypot(o.lastX - o.x, o.lastZ - o.z) > 0.5) this.moveToward(o, o.lastX, o.lastZ, 0, dt);
        else if (this.hemExit(o, player.x, player.z)) this.moveToward(o, this.point.x, this.point.z, 0, dt);
      }
      if (visible && o.speed < 0.5) this.face(o, player.x, player.z, dt);
      // Còng tay: nắm được Tín đang đứng / đi chậm đủ lâu (bị đánh trúng thì tuột tay — xem `hit`).
      if (visible && player.onFoot && d <= cfg.arrestRange && player.speed < cfg.arrestSpeed && o.strike <= 0) o.grab += dt;
      else o.grab = Math.max(0, o.grab - dt * 2);
      if (o.grab >= cfg.arrestTime) busted = true;
      grab = Math.max(grab, o.grab / cfg.arrestTime);
      if (angry && visible) this.stepStrike(o, d, dt);
      else o.strike = 0;
    }
    this.separate();
    this.grabProgress = Math.min(1, grab);
    return busted;
  }

  /**
   * Tín đánh công an `id` (đòn `damage` từ hướng (fromX, fromZ)): loạng choạng, ngã, hoặc gục (xe của người đó bỏ lại).
   * Từ đó công an đánh lại. Trả null nếu không có ai / đã gục.
   */
  hit(id: number, damage: number, fromX: number, fromZ: number, knock: boolean): HitResult | null {
    const o = this.find(id);
    if (!o || o.dead) return null;
    const cfg = this.config;
    const r = resolveHit(o.health, cfg.health, damage, knock || o.down > 0);
    o.health = r.health;
    o.yaw = o.prevYaw = Math.atan2(fromX - o.x, fromZ - o.z);
    o.grab = 0;
    o.strike = 0;
    o.strikeCd = Math.max(o.strikeCd, 0.4);
    o.mode = 'chase';
    o.lastX = fromX;
    o.lastZ = fromZ;
    o.lastSeen = 0;
    this.hostile = true;
    if (r.result === 'dead') {
      o.dead = true;
      o.down = 0;
      o.hurt = 0;
      // Xe bỏ lại bên đường: không tính vào đoàn truy đuổi nữa (gọi xe khác tới), xa rồi thì biến mất.
      const v = this.vehicleOf(o);
      if (v) v.leaving = true;
    } else if (r.result === 'down') o.down = cfg.downTime;
    else o.hurt = cfg.hurtTime;
    return r.result;
  }

  /** Dọn hết (Tín bị bắt / gục — được đưa đi chỗ khác): người còn sống lên lại xe, xác biến mất. */
  clear(): void {
    for (const o of this.officers) {
      const v = o.dead ? null : this.vehicleOf(o);
      if (v) this.chase.unpark(v);
    }
    // Xe đang phanh để người lái xuống: thôi, chạy tiếp.
    for (const c of this.chase.chasers) if (c.mode === 'parked' && c.rider) this.chase.unpark(c);
    this.officers.length = 0;
    this.hostile = false;
    this.grabProgress = 0;
    this.seen = false;
  }

  find(id: number): Officer | null {
    for (const o of this.officers) if (o.id === id) return o;
    return null;
  }

  /** Xe công an tới gần Tín đang đi bộ (thấy Tín) thì dừng; xe đứng hẳn thì người lái xuống. */
  private dismount(player: FootPlayer, level: number): void {
    const cfg = this.config;
    let busy = this.alive;
    for (const c of this.chase.chasers) if (c.mode === 'parked' && c.rider && !c.leaving) busy++;
    for (const c of this.chase.chasers) {
      if (c.mode === 'parked') {
        if (!c.rider) continue;
        // Chưa kịp xuống mà Tín đã lên xe / hết sao / xe phải rút ⇒ chạy tiếp.
        if (!player.onFoot || level <= 0 || c.leaving) {
          this.chase.unpark(c);
          continue;
        }
        if (c.speed > 0.5) continue;
        c.rider = false;
        this.spawn(c);
        this.dismounted++;
        continue;
      }
      if (c.mode !== 'chase' || c.leaving || !c.rider || !player.onFoot || level <= 0 || busy >= this.capacity) continue;
      const d = Math.hypot(player.x - c.x, player.z - c.z);
      if (d < cfg.dismountRange && this.sight.clear(c.x, c.z, player.x, player.z)) {
        this.chase.park(c);
        busy++;
      }
    }
  }

  private spawn(c: Chaser): void {
    // Quá nhiều xác thì dọn xác cũ nhất trước.
    let corpses = 0;
    for (const o of this.officers) if (o.dead) corpses++;
    if (corpses >= MAX_CORPSES) {
      const i = this.officers.findIndex((o) => o.dead);
      if (i >= 0) this.officers.splice(i, 1);
    }
    this.doorOf(c);
    const { x, z } = this.point;
    this.officers.push({
      id: this.nextId++,
      vehicle: c.id,
      kind: c.kind,
      generation: c.id + 1,
      x,
      z,
      yaw: c.yaw,
      prevX: x,
      prevZ: z,
      prevYaw: c.yaw,
      speed: 0,
      health: this.config.health,
      hurt: 0,
      down: 0,
      dead: false,
      deadT: 0,
      mode: 'chase',
      lastX: c.lastX,
      lastZ: c.lastZ,
      lastSeen: 0,
      strike: 0,
      strikeCd: 0.6,
      grab: 0,
    });
  }

  /** Chỗ lên / xuống xe: bên trái xe (bên lái), ghi vào `point`. */
  private doorOf(c: Chaser): void {
    const side = c.kind === 'car' ? 1.35 : 0.65;
    this.point.x = c.x + Math.cos(c.yaw) * side;
    this.point.z = c.z - Math.sin(c.yaw) * side;
  }

  private vehicleOf(o: Officer): Chaser | null {
    const chasers = this.chase.chasers;
    for (let i = 0; i < chasers.length; i++) if (chasers[i]!.id === o.vehicle) return chasers[i]!;
    return null;
  }

  /**
   * Về xe: chạy tới cửa xe nếu đường thẳng không bị nhà chắn (trong hẻm thì men theo hẻm ra trước); Tín không còn thấy
   * thì lên xe luôn. Trả true nếu người này đã rời đi (lên xe / xe không còn).
   */
  private stepReturn(o: Officer, vehicle: Chaser | null, watched: boolean, d: number, dt: number): boolean {
    if (!vehicle) return !watched || d > FAR;
    this.doorOf(vehicle);
    const dx = this.point.x - o.x;
    const dz = this.point.z - o.z;
    if (!watched || d > FAR || Math.hypot(dx, dz) < 0.6) {
      this.chase.unpark(vehicle);
      return true;
    }
    if (this.sight.clear(o.x, o.z, this.point.x, this.point.z)) this.moveToward(o, this.point.x, this.point.z, 0, dt);
    else if (this.hemExit(o, vehicle.x, vehicle.z)) this.moveToward(o, this.point.x, this.point.z, 0, dt);
    return false;
  }

  /** Đang trong hẻm thì lấy điểm ra (đầu thông gần (gx, gz)) vào `point`. */
  private hemExit(o: Officer, gx: number, gz: number): boolean {
    if (!this.hems) return false;
    const h = this.hems.at(o.x, o.z);
    return h >= 0 && this.hems.exit(h, gx, gz, this.point);
  }

  /** Chạy thẳng tới (tx, tz), dừng cách `gap` m. */
  private moveToward(o: Officer, tx: number, tz: number, gap: number, dt: number): void {
    const dx = tx - o.x;
    const dz = tz - o.z;
    const dist = Math.hypot(dx, dz);
    const step = Math.min(this.config.runSpeed * dt, Math.max(0, dist - gap));
    if (step <= 1e-4) return;
    o.x += (dx / dist) * step;
    o.z += (dz / dist) * step;
    o.speed = step / dt;
    this.face(o, tx, tz, dt);
  }

  private face(o: Officer, tx: number, tz: number, dt: number): void {
    if (Math.hypot(tx - o.x, tz - o.z) < 1e-3) return;
    const diff = wrap(Math.atan2(tx - o.x, tz - o.z) - o.yaw);
    const max = TURN_RATE * dt;
    o.yaw = wrap(o.yaw + (diff > max ? max : diff < -max ? -max : diff));
  }

  /** Dùi cui: tới tầm thì vung, trúng ở giữa nhịp nếu Tín còn trong tầm. */
  private stepStrike(o: Officer, d: number, dt: number): void {
    const cfg = this.config;
    if (o.strike > 0) {
      const before = o.strike;
      o.strike -= dt;
      const mid = cfg.strikeTime / 2;
      if (before > mid && o.strike <= mid && d <= cfg.strikeRange + 0.25) this.damageToPlayer += cfg.strikeDamage;
      if (o.strike < 0) o.strike = 0;
      return;
    }
    o.strikeCd -= dt;
    if (o.strikeCd <= 0 && d <= cfg.strikeRange) {
      o.strike = cfg.strikeTime;
      o.strikeCd = range(this.rng, cfg.strikeRest[0], cfg.strikeRest[1]);
    }
  }

  /** Công an không đứng chồng lên nhau. */
  private separate(): void {
    const list = this.officers;
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        if (dist >= PERSONAL || dist < 1e-4) continue;
        const push = (PERSONAL - dist) / 2;
        a.x -= (dx / dist) * push;
        a.z -= (dz / dist) * push;
        b.x += (dx / dist) * push;
        b.z += (dz / dist) * push;
      }
    }
  }
}
