import { createRng, range, type Rng } from '@/core/random';
import { resolveHit, type HitResult } from '@/systems/combat';
import type { Block, CityLayout } from '@/world/city/layout';

/**
 * Người đi bộ trên vỉa hè (thuần logic, 60 Hz, có seed, có unit test).
 *
 * Mỗi người đi vòng quanh vỉa hè một block (4 cạnh), cách mép bó vỉa một khoảng `d`. Vỉa hè Sài Gòn chật kín cột điện,
 * cây, xe máy đậu nên họ phải lách qua; thỉnh thoảng đứng lại. Xe của người chơi lao tới thì nhảy tránh (hoạt hình,
 * không va chạm). Người đi quá xa người chơi được thả lại gần (bong bóng) như xe NPC.
 */

export interface Walker {
  id: number;
  block: number;
  /** Cạnh 0: mép −Z (đi theo +X) · 1: mép +X (đi +Z) · 2: mép +Z (đi −X) · 3: mép −X (đi −Z). */
  side: number;
  /** Quãng dọc cạnh tính từ góc đầu cạnh (m). */
  t: number;
  /** Khoảng cách từ mép bó vỉa vào trong (m). */
  d: number;
  targetD: number;
  /** +1 đi xuôi vòng 0→1→2→3, −1 đi ngược. */
  dir: 1 | -1;
  speed: number;
  cruise: number;
  /** Đứng lại còn bao lâu (s). */
  idle: number;
  /** Đang nhảy tránh xe còn bao lâu (s). */
  dodge: number;
  x: number;
  z: number;
  yaw: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  /** Pha bước chân (rad) cho hoạt hoạ. */
  phase: number;
  generation: number;
  /** Máu 0..100 (cận chiến). */
  health: number;
  /** Đang loạng choạng vì trúng đòn còn bao lâu (s). */
  hurt: number;
  /** Đang nằm dưới đất (bị đánh ngã) còn bao lâu (s). */
  down: number;
  /** Bỏ chạy còn bao lâu (s) — sau khi bị đánh / thấy đánh nhau. */
  flee: number;
  dead: boolean;
}

/** Tốc độ chạy trốn (m/s). */
export const FLEE_SPEED = 4.2;

export interface Threat {
  x: number;
  z: number;
  /** Vận tốc (m/s) — xe đang lao tới. */
  vx: number;
  vz: number;
}

export interface PedestrianOptions {
  seed: number;
  count: number;
  despawnRadius: number;
  respawnMin: number;
  respawnMax: number;
}

export const DEFAULT_PEDESTRIANS: PedestrianOptions = { seed: 23, count: 60, despawnRadius: 110, respawnMin: 35, respawnMax: 95 };

interface Obstacle {
  x: number;
  z: number;
  r: number;
}

const CELL = 4;
const MARGIN = 0.35;
const BODY = 0.3;

/** Lưới băm các vật cản tĩnh trên vỉa hè để tra cứu nhanh. */
const NO_OBSTACLES: readonly Obstacle[] = [];

class ObstacleGrid {
  private readonly cells = new Map<number, Obstacle[]>();
  /** Khoá số (không tạo chuỗi mỗi lần tra): khu phố nằm trong ±4 km. */
  private static key(cx: number, cz: number): number {
    return (cx + 1000) * 4096 + (cz + 1000);
  }
  add(o: Obstacle): void {
    const key = ObstacleGrid.key(Math.floor(o.x / CELL), Math.floor(o.z / CELL));
    const list = this.cells.get(key);
    if (list) list.push(o);
    else this.cells.set(key, [o]);
  }
  near(x: number, z: number, out: Obstacle[]): Obstacle[] {
    out.length = 0;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of this.cells.get(ObstacleGrid.key(cx + i, cz + j)) ?? NO_OBSTACLES) out.push(o);
    return out;
  }
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export interface SideInfo {
  len: number;
  width: number;
}

export interface SidePoint {
  x: number;
  z: number;
  fx: number;
  fz: number;
}

function set(p: SidePoint, x: number, z: number, fx: number, fz: number): SidePoint {
  p.x = x;
  p.z = z;
  p.fx = fx;
  p.fz = fz;
  return p;
}

export class PedestrianSim {
  readonly walkers: Walker[] = [];
  readonly options: PedestrianOptions;
  private readonly rng: Rng;
  private readonly grid = new ObstacleGrid();
  private readonly blocks: Block[];
  private readonly scratch: Obstacle[] = [];
  /** Đối tượng tạm dùng lại trong `step` (không tạo rác mỗi khung hình). */
  private readonly info: SideInfo = { len: 0, width: 0 };
  private readonly here: SidePoint = { x: 0, z: 0, fx: 0, fz: 0 };
  respawns = 0;

  constructor(
    layout: CityLayout,
    focus: { x: number; z: number },
    options: Partial<PedestrianOptions> = {},
  ) {
    this.options = { ...DEFAULT_PEDESTRIANS, ...options };
    this.rng = createRng(this.options.seed);
    this.blocks = layout.blocks;
    for (const p of layout.poles) this.grid.add({ x: p.x, z: p.z, r: 0.22 });
    for (const t of layout.trees) if (t.kind !== 'park') this.grid.add({ x: t.x, z: t.z, r: 0.35 });
    for (const b of layout.bikes) {
      // Xe đậu dài 1.9 m: hai vòng tròn dọc thân xe.
      const fx = Math.sin(b.yaw) * 0.5;
      const fz = Math.cos(b.yaw) * 0.5;
      this.grid.add({ x: b.x + fx, z: b.z + fz, r: 0.45 });
      this.grid.add({ x: b.x - fx, z: b.z - fz, r: 0.45 });
    }
    for (let i = 0; i < this.options.count; i++) {
      const w = this.blank(i);
      this.walkers.push(w);
      this.place(w, focus, 6, this.options.respawnMax);
    }
  }

  private blank(id: number): Walker {
    return { id, block: 0, side: 0, t: 0, d: 1, targetD: 1, dir: 1, speed: 0, cruise: 1.3, idle: 0, dodge: 0, x: 0, z: 0, yaw: 0, prevX: 0, prevZ: 0, prevYaw: 0, phase: 0, generation: 0, health: 100, hurt: 0, down: 0, flee: 0, dead: false };
  }

  /**
   * Người đi bộ `id` trúng đòn `damage` từ hướng (fromX, fromZ): loạng choạng, ngã (đòn ngã / mất nhiều máu) hoặc gục.
   * Đứng dậy được thì bỏ chạy ngược hướng người đánh. Trả null nếu đã gục từ trước.
   */
  hit(id: number, damage: number, fromX: number, fromZ: number, knock: boolean): HitResult | null {
    const w = this.walkers[id];
    if (!w || w.dead) return null;
    const r = resolveHit(w.health, 100, damage, knock || w.down > 0);
    w.health = r.health;
    w.idle = 0;
    w.dodge = 0;
    w.speed = 0;
    // Quay mặt về phía người đánh (ngã ngửa ra sau).
    w.yaw = w.prevYaw = Math.atan2(fromX - w.x, fromZ - w.z);
    if (r.result === 'dead') {
      w.dead = true;
      w.down = 0;
      w.hurt = 0;
    } else if (r.result === 'down') w.down = 2.6;
    else w.hurt = 0.9; // đủ dài để nhát combo kế tiếp kịp tới (nhịp chém ~0,7 s)
    this.runFrom(w, fromX, fromZ, 7);
    return r.result;
  }

  /** Người còn đứng được trong bán kính `radius` quanh (x, z) hoảng sợ bỏ chạy (thấy đánh nhau). */
  scare(x: number, z: number, radius: number): void {
    for (const w of this.walkers) {
      if (w.dead || w.down > 0) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < radius && d > 0.5) this.runFrom(w, x, z, 5 + (1 - d / radius) * 4);
    }
  }

  /** Chạy dọc vỉa hè theo chiều xa (x, z) hơn trong `seconds` giây. */
  private runFrom(w: Walker, x: number, z: number, seconds: number): void {
    const block = this.block(w);
    const p = this.position(block, w.side, w.t, w.d, this.here);
    // Hướng đi hiện tại (dir) có làm xa người đánh không? Không thì quay đầu.
    if ((p.fx * (w.x - x) + p.fz * (w.z - z)) * w.dir < 0) w.dir = w.dir === 1 ? -1 : 1;
    w.flee = Math.max(w.flee, seconds);
  }

  private block(w: Walker): Block {
    return this.blocks[w.block] as Block;
  }

  /** Chiều dài cạnh và bề rộng vỉa hè của cạnh. */
  sideInfo(block: Block, side: number, out: SideInfo = { len: 0, width: 0 }): SideInfo {
    const r = block.rect;
    const s = block.sidewalk;
    switch (side) {
      case 0:
        out.len = r.x1 - r.x0;
        out.width = s.minZ;
        break;
      case 1:
        out.len = r.z1 - r.z0;
        out.width = s.maxX;
        break;
      case 2:
        out.len = r.x1 - r.x0;
        out.width = s.maxZ;
        break;
      default:
        out.len = r.z1 - r.z0;
        out.width = s.minX;
    }
    return out;
  }

  /** Toạ độ thế giới + hướng đi xuôi của cạnh. */
  position(block: Block, side: number, t: number, d: number, out: SidePoint = { x: 0, z: 0, fx: 0, fz: 0 }): SidePoint {
    const r = block.rect;
    switch (side) {
      case 0:
        return set(out, r.x0 + t, r.z0 + d, 1, 0);
      case 1:
        return set(out, r.x1 - d, r.z0 + t, 0, 1);
      case 2:
        return set(out, r.x1 - t, r.z1 - d, -1, 0);
      default:
        return set(out, r.x0 + d, r.z1 - t, 0, -1);
    }
  }

  private place(w: Walker, focus: { x: number; z: number }, minR: number, maxR: number): void {
    let chosen: { block: number; side: number; t: number; d: number } | null = null;
    for (let attempt = 0; attempt < 40 && !chosen; attempt++) {
      const block = Math.floor(this.rng() * this.blocks.length);
      const b = this.blocks[block] as Block;
      const side = Math.floor(this.rng() * 4);
      const { len, width } = this.sideInfo(b, side);
      if (width < 1.5) continue;
      const d = range(this.rng, MARGIN + 0.2, Math.min(width - MARGIN, 1.4));
      const t = range(this.rng, d + 1, len - d - 1);
      const p = this.position(b, side, t, d);
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (dist < minR || dist > maxR) continue;
      if (this.blocked(p.x, p.z, BODY + 0.1)) continue;
      chosen = { block, side, t, d };
    }
    if (!chosen) {
      const b = this.blocks[0] as Block;
      chosen = { block: 0, side: 0, t: this.sideInfo(b, 0).len / 2, d: 1 };
    }
    Object.assign(w, chosen);
    w.targetD = w.d;
    w.dir = this.rng() < 0.5 ? 1 : -1;
    w.cruise = range(this.rng, 1.0, 1.6);
    w.speed = w.cruise;
    w.idle = 0;
    w.dodge = 0;
    w.phase = this.rng() * Math.PI * 2;
    w.health = 100;
    w.hurt = 0;
    w.down = 0;
    w.flee = 0;
    w.dead = false;
    const p = this.position(this.block(w), w.side, w.t, w.d);
    w.x = w.prevX = p.x;
    w.z = w.prevZ = p.z;
    w.yaw = w.prevYaw = Math.atan2(p.fx * w.dir, p.fz * w.dir);
    w.generation++;
  }

  /** Có vật cản tĩnh nào trong bán kính `r` quanh (x, z)? */
  blocked(x: number, z: number, r: number): boolean {
    for (const o of this.grid.near(x, z, this.scratch)) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
    return false;
  }

  step(dt: number, focus: { x: number; z: number }, threats: readonly Threat[] = []): void {
    const opt = this.options;
    for (const w of this.walkers) {
      if (Math.hypot(w.x - focus.x, w.z - focus.z) > opt.despawnRadius) {
        this.place(w, focus, opt.respawnMin, opt.respawnMax);
        this.respawns++;
      }
    }

    for (const w of this.walkers) {
      w.prevX = w.x;
      w.prevZ = w.z;
      w.prevYaw = w.yaw;
      // Gục / nằm / loạng choạng thì đứng yên tại chỗ.
      if (w.dead) {
        w.speed = 0;
        continue;
      }
      if (w.down > 0 || w.hurt > 0) {
        w.down = Math.max(0, w.down - dt);
        w.hurt = Math.max(0, w.hurt - dt);
        w.speed = 0;
        continue;
      }
      const block = this.block(w);
      const { len, width } = this.sideInfo(block, w.side, this.info);
      const lo = MARGIN;
      const hi = Math.max(lo, width - MARGIN);
      const here = this.position(block, w.side, w.t, w.d, this.here);
      const fx = here.fx * w.dir;
      const fz = here.fz * w.dir;

      // Xe lao tới (trong 6 m, đang tiến lại gần, nhanh hơn 4 m/s) ⇒ nhảy tránh vào sát nhà.
      for (const th of threats) {
        const dx = w.x - th.x;
        const dz = w.z - th.z;
        const dist = Math.hypot(dx, dz);
        const v = Math.hypot(th.vx, th.vz);
        if (dist < 6 && v > 4 && (dx * th.vx + dz * th.vz) / (dist * v + 1e-6) > 0.5) {
          w.dodge = 1.1;
          w.idle = 0;
          w.targetD = hi;
        }
      }

      let desired = w.cruise;
      if (w.flee > 0) {
        // Bỏ chạy: chạy nhanh, không đứng lại ngó nghiêng.
        w.flee -= dt;
        w.idle = 0;
        desired = FLEE_SPEED;
      } else if (w.dodge > 0) {
        w.dodge -= dt;
        desired = 0;
      } else if (w.idle > 0) {
        w.idle -= dt;
        desired = 0;
      } else if (this.rng() < dt * 0.04) {
        // Thỉnh thoảng đứng lại (ngó hàng, nghe điện thoại…).
        w.idle = range(this.rng, 2, 6);
      }

      // Lách vật cản phía trước (cột, cây, xe đậu) hoặc người đi ngược chiều.
      if (desired > 0 && w.dodge <= 0) {
        const aheadX = w.x + fx * 1.2;
        const aheadZ = w.z + fz * 1.2;
        let hit = false;
        let hitLateral = 0;
        let hitR = 0;
        for (const o of this.grid.near(aheadX, aheadZ, this.scratch)) {
          const ox = o.x - w.x;
          const oz = o.z - w.z;
          const along = ox * fx + oz * fz;
          if (along < 0 || along > 1.8) continue;
          // Độ lệch ngang theo trục d (vào trong vỉa hè).
          const lateral = this.lateralOf(w, o.x, o.z);
          if (Math.abs(lateral - w.d) < o.r + BODY + 0.05) {
            hit = true;
            hitLateral = lateral;
            hitR = o.r;
          }
        }
        if (hit) {
          // Lách sang bên còn chỗ, gần vị trí hiện tại hơn.
          const clear = hitR + BODY + 0.15;
          const a = hitLateral - clear;
          const b = hitLateral + clear;
          const okA = a >= lo && a <= hi;
          const okB = b >= lo && b <= hi;
          if (okA && (!okB || Math.abs(a - w.d) <= Math.abs(b - w.d))) w.targetD = a;
          else if (okB) w.targetD = b;
          else {
            // Kẹt cứng: quay đầu.
            w.dir = w.dir === 1 ? -1 : 1;
            w.idle = 0.6;
          }
        }
      }

      w.speed += clamp(desired - w.speed, -6 * dt, (w.flee > 0 ? 8 : 3) * dt);
      const lateralSpeed = w.dodge > 0 ? 3 : 0.9;
      w.d = clamp(w.d + clamp(w.targetD - w.d, -lateralSpeed * dt, lateralSpeed * dt), lo, hi);
      if (Math.abs(w.targetD - w.d) < 0.01 && w.dodge <= 0 && this.rng() < dt * 0.1) w.targetD = range(this.rng, lo, Math.min(hi, 1.6));

      // Đi dọc cạnh; tới góc thì rẽ sang cạnh kế (điểm rẽ chừa đúng `d` nên vị trí liền mạch).
      w.t += w.speed * dt * w.dir;
      if (w.dir === 1 && w.t >= len - w.d) {
        w.side = (w.side + 1) % 4;
        w.t = w.d;
      } else if (w.dir === -1 && w.t <= w.d) {
        w.side = (w.side + 3) % 4;
        w.t = this.sideInfo(block, w.side, this.info).len - w.d;
      }
      const p = this.position(block, w.side, w.t, w.d, this.here);
      const mx = p.x - w.x;
      const mz = p.z - w.z;
      w.x = p.x;
      w.z = p.z;
      if (mx * mx + mz * mz > 1e-8) w.yaw = Math.atan2(mx, mz);
      else if (w.dodge > 0 && threats[0]) w.yaw = Math.atan2(threats[0].x - w.x, threats[0].z - w.z); // quay lại nhìn xe
      w.phase += (w.speed / 0.65) * Math.PI * dt;
    }
  }

  /** Khoảng cách từ mép bó vỉa vào trong của điểm (x, z) theo cạnh hiện tại của người đi bộ. */
  private lateralOf(w: Walker, x: number, z: number): number {
    const r = this.block(w).rect;
    switch (w.side) {
      case 0:
        return z - r.z0;
      case 1:
        return r.x1 - x;
      case 2:
        return r.z1 - z;
      default:
        return x - r.x0;
    }
  }
}
