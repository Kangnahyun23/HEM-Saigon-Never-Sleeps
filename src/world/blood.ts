import { createRng, type Rng } from '@/core/random';

/**
 * Máu nhẹ (thuần logic, có unit test): giọt máu bắn ra khi trúng đòn rơi xuống đất thành vết nhỏ, vũng máu loang dần
 * dưới người gục. Bể cố định (không tạo đối tượng mỗi khung), hết chỗ thì ghi đè cái cũ nhất. Mọi thứ tự mờ.
 * Tắt được trong Cài đặt (game không gọi spray / pool nữa, vết cũ vẫn mờ hết theo thời gian).
 */

/** Số giọt bay cùng lúc tối đa. */
export const MAX_DROPS = 96;
/** Số vết / vũng trên đất tối đa. */
export const MAX_SPLATS = 40;
/** Vết trên đất tồn tại (s) — `SPLAT_FADE` giây cuối thu nhỏ dần rồi mất. */
export const SPLAT_LIFE = 50;
export const SPLAT_FADE = 10;
/** Vũng máu loang hết cỡ sau (s). */
export const POOL_SPREAD = 3.5;
const GRAVITY = 9.8;

export class BloodSim {
  readonly px = new Float32Array(MAX_DROPS);
  readonly py = new Float32Array(MAX_DROPS);
  readonly pz = new Float32Array(MAX_DROPS);
  private readonly vx = new Float32Array(MAX_DROPS);
  private readonly vy = new Float32Array(MAX_DROPS);
  private readonly vz = new Float32Array(MAX_DROPS);
  private readonly floor = new Float32Array(MAX_DROPS);
  /** > 0: giọt đang bay. */
  readonly dropLife = new Float32Array(MAX_DROPS);
  readonly dropSize = new Float32Array(MAX_DROPS);

  readonly sx = new Float32Array(MAX_SPLATS);
  readonly sy = new Float32Array(MAX_SPLATS);
  readonly sz = new Float32Array(MAX_SPLATS);
  /** Bán kính tối đa (m) của vết. */
  readonly sr = new Float32Array(MAX_SPLATS);
  /** Góc xoay ngẫu nhiên (vết không giống hệt nhau). */
  readonly srot = new Float32Array(MAX_SPLATS);
  /** Tuổi (s); < 0 là ô trống. */
  readonly sage = new Float32Array(MAX_SPLATS).fill(-1);
  /** Thời gian loang (s): vũng to loang chậm, vết giọt hiện ngay. */
  private readonly sgrow = new Float32Array(MAX_SPLATS);

  private nextDrop = 0;
  private nextSplat = 0;
  private readonly rng: Rng;

  constructor(
    seed = 1,
    /** Điểm (x, z) có nằm trên mặt đất cùng cao độ với chỗ bị đánh không (vỉa hè) — rơi ra ngoài thì không để vết. */
    private readonly onFloor: (x: number, z: number) => boolean = () => true,
  ) {
    this.rng = createRng(seed);
  }

  /**
   * Bắn `count` giọt từ (x, y, z) về hướng (dirX, dirZ) (hướng đòn đánh), rơi xuống mặt đất ở độ cao `groundY`.
   */
  spray(x: number, y: number, z: number, dirX: number, dirZ: number, count: number, groundY: number): void {
    const len = Math.hypot(dirX, dirZ) || 1;
    const fx = dirX / len;
    const fz = dirZ / len;
    const rng = this.rng;
    for (let k = 0; k < count; k++) {
      const i = this.nextDrop;
      this.nextDrop = (i + 1) % MAX_DROPS;
      // Bay gần (rơi trong khoảng 0,3–1 m), toả quạt ±0,7 rad quanh hướng đòn, hơi hất lên.
      const speed = 0.6 + rng() * 1.0;
      const a = (rng() - 0.5) * 1.4;
      const c = Math.cos(a);
      const s = Math.sin(a);
      this.px[i] = x + (rng() - 0.5) * 0.12;
      this.py[i] = y + (rng() - 0.5) * 0.15;
      this.pz[i] = z + (rng() - 0.5) * 0.12;
      this.vx[i] = (fx * c - fz * s) * speed;
      this.vz[i] = (fx * s + fz * c) * speed;
      this.vy[i] = 0.3 + rng() * 0.9;
      this.floor[i] = groundY;
      this.dropLife[i] = 2;
      this.dropSize[i] = 0.012 + rng() * 0.016;
    }
  }

  /** Vết / vũng tròn bán kính `radius` ở (x, y, z); `grow` > 0 thì loang dần trong ngần ấy giây. */
  splat(x: number, y: number, z: number, radius: number, grow = 0): void {
    const i = this.nextSplat;
    this.nextSplat = (i + 1) % MAX_SPLATS;
    this.sx[i] = x;
    this.sy[i] = y;
    this.sz[i] = z;
    this.sr[i] = radius;
    this.srot[i] = this.rng() * Math.PI * 2;
    this.sage[i] = 0;
    this.sgrow[i] = grow;
  }

  /** Vũng máu loang dưới người gục. */
  pool(x: number, y: number, z: number, radius: number): void {
    this.splat(x, y, z, radius, POOL_SPREAD);
  }

  step(dt: number): void {
    for (let i = 0; i < MAX_DROPS; i++) {
      if (this.dropLife[i]! <= 0) continue;
      this.dropLife[i]! -= dt;
      this.vy[i]! -= GRAVITY * dt;
      this.px[i]! += this.vx[i]! * dt;
      this.py[i]! += this.vy[i]! * dt;
      this.pz[i]! += this.vz[i]! * dt;
      if (this.py[i]! <= this.floor[i]!) {
        // Chạm đất: thành vết nhỏ (1/4 số giọt, khỏi tốn chỗ) — nếu còn trên vỉa hè.
        this.dropLife[i] = 0;
        if (this.rng() < 0.25 && this.onFloor(this.px[i]!, this.pz[i]!)) this.splat(this.px[i]!, this.floor[i]!, this.pz[i]!, 0.035 + this.rng() * 0.05);
      }
    }
    for (let i = 0; i < MAX_SPLATS; i++) {
      if (this.sage[i]! < 0) continue;
      this.sage[i]! += dt;
      if (this.sage[i]! > SPLAT_LIFE) this.sage[i] = -1;
    }
  }

  /** Bán kính hiện tại của vết `i` (0 nếu ô trống): loang ra lúc đầu, thu nhỏ trong `SPLAT_FADE` giây cuối. */
  splatRadius(i: number): number {
    const age = this.sage[i]!;
    if (age < 0) return 0;
    const grow = this.sgrow[i]!;
    // Loang nhanh lúc đầu rồi chậm dần (như chất lỏng).
    const spread = grow > 0 ? 1 - (1 - Math.min(1, age / grow)) ** 2 : 1;
    const fade = Math.min(1, (SPLAT_LIFE - age) / SPLAT_FADE);
    return this.sr[i]! * spread * fade;
  }

  /** Số giọt đang bay (để test). */
  get flying(): number {
    let n = 0;
    for (let i = 0; i < MAX_DROPS; i++) if (this.dropLife[i]! > 0) n++;
    return n;
  }

  /** Số vết trên đất (để test). */
  get splats(): number {
    let n = 0;
    for (let i = 0; i < MAX_SPLATS; i++) if (this.sage[i]! >= 0) n++;
    return n;
  }

  /** Xoá hết (đổi khu / tải bản lưu). */
  clear(): void {
    this.dropLife.fill(0);
    this.sage.fill(-1);
  }
}
