/**
 * Nhiệm vụ = chuỗi mục tiêu (thuần logic, có unit test). Dùng chung cho kèo giao hàng lặp lại (M3.1),
 * truy đuổi (M3.2) và nhiệm vụ cốt truyện Hồi 1 (M3.3).
 */

export type Objective =
  /** Tới một điểm (bán kính `radius`). `bike: true` = phải đang chạy xe. */
  | { kind: 'goto'; x: number; z: number; radius: number; label: string; bike?: boolean; place?: string }
  /** Lên xe máy. */
  | { kind: 'mount'; label: string }
  /** Đứng chờ / nói chuyện `seconds` giây trong bán kính quanh một điểm. */
  | { kind: 'wait'; x: number; z: number; radius: number; seconds: number; label: string }
  /** Cắt đuôi: Độ Nóng về 0. */
  | { kind: 'escape'; label: string };

export interface MissionDef {
  id: string;
  title: string;
  /** Tiền công khi xong (đồng). */
  reward: number;
  objectives: Objective[];
  /**
   * Giới hạn giờ (giây thật) tính từ khi hoàn thành mục tiêu số `timerFrom` (mặc định 0 = ngay khi nhận).
   * Quá giờ: `late: 'fail'` thì thất bại, `late: 'half'` thì vẫn xong nhưng chỉ nhận nửa tiền.
   */
  timeLimit?: number;
  timerFrom?: number;
  late?: 'fail' | 'half';
  /** Tới mục tiêu số `at` thì bị bám đuôi với Độ Nóng `level` (hàng nóng, gặp đàn em của Phát…). */
  heat?: { at: number; level: number };
}

/** Trạng thái người chơi mà nhiệm vụ cần biết mỗi bước. */
export interface MissionContext {
  x: number;
  z: number;
  riding: boolean;
  /** Độ Nóng hiện tại (0 = không ai đuổi). */
  heat: number;
}

export type MissionEvent =
  | { type: 'objective'; index: number; objective: Objective }
  | { type: 'complete'; reward: number; late: boolean }
  | { type: 'fail'; reason: string };

export class MissionRunner {
  index = 0;
  /** Giây đã trôi từ khi bắt đầu tính giờ (null = chưa tính). */
  timer: number | null = null;
  done = false;
  failed = false;
  late = false;
  private waited = 0;

  constructor(readonly def: MissionDef) {
    if ((def.timerFrom ?? 0) === 0 && def.timeLimit) this.timer = 0;
  }

  get objective(): Objective | null {
    return this.def.objectives[this.index] ?? null;
  }

  /** Thời gian còn lại (giây) hoặc null nếu không giới hạn / chưa bắt đầu tính. */
  get remaining(): number | null {
    if (this.timer === null || !this.def.timeLimit) return null;
    return this.def.timeLimit - this.timer;
  }

  /** Một bước; trả về các sự kiện xảy ra (mục tiêu mới, hoàn thành, thất bại). */
  update(dt: number, ctx: MissionContext): MissionEvent[] {
    if (this.done || this.failed) return [];
    const events: MissionEvent[] = [];
    if (this.timer !== null) {
      this.timer += dt;
      const limit = this.def.timeLimit ?? Infinity;
      if (this.timer > limit && !this.late) {
        if (this.def.late === 'fail') {
          this.failed = true;
          return [{ type: 'fail', reason: 'Hết giờ' }];
        }
        this.late = true;
      }
    }
    // Có thể xong nhiều mục tiêu trong một bước (ví dụ đã đứng sẵn ở điểm tới).
    for (let guard = 0; guard < this.def.objectives.length; guard++) {
      const o = this.objective;
      if (!o || !this.reached(o, dt, ctx)) break;
      this.index++;
      this.waited = 0;
      if (this.def.timeLimit && this.timer === null && this.index === this.def.timerFrom) this.timer = 0;
      const next = this.objective;
      if (next) {
        events.push({ type: 'objective', index: this.index, objective: next });
        // Bước cắt đuôi chỉ xét từ bước sau: Độ Nóng do sự kiện vừa rồi gây ra chưa kịp tính vào ctx.
        if (next.kind === 'escape') break;
      }
      else {
        this.done = true;
        const reward = this.late && this.def.late === 'half' ? Math.round(this.def.reward / 2 / 1000) * 1000 : this.def.reward;
        events.push({ type: 'complete', reward, late: this.late });
        break;
      }
    }
    return events;
  }

  private reached(o: Objective, dt: number, ctx: MissionContext): boolean {
    switch (o.kind) {
      case 'goto':
        return Math.hypot(ctx.x - o.x, ctx.z - o.z) <= o.radius && (!o.bike || ctx.riding);
      case 'mount':
        return ctx.riding;
      case 'wait':
        if (Math.hypot(ctx.x - o.x, ctx.z - o.z) > o.radius) {
          this.waited = 0;
          return false;
        }
        this.waited += dt;
        return this.waited >= o.seconds;
      case 'escape':
        return ctx.heat <= 0;
    }
  }

  /** Điểm cần tới của mục tiêu hiện tại (cho điểm đánh dấu / bản đồ). */
  target(): { x: number; z: number } | null {
    const o = this.objective;
    return o && (o.kind === 'goto' || o.kind === 'wait') ? { x: o.x, z: o.z } : null;
  }
}
