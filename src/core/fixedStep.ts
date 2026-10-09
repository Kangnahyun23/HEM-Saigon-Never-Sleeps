/**
 * Gom thời gian khung hình thành các bước vật lý cố định (mặc định 60 Hz).
 * Vật lý chạy ổn định bất kể FPS; khung hình quá dài bị cắt để tránh "vòng xoáy tử thần".
 */
export class FixedStepAccumulator {
  private accumulator = 0;

  constructor(
    readonly step = 1 / 60,
    readonly maxSubSteps = 5,
  ) {
    if (step <= 0) throw new Error('step phải > 0');
    if (maxSubSteps < 1) throw new Error('maxSubSteps phải >= 1');
  }

  /** Cộng dồn dt (giây) và trả về số bước cố định cần chạy trong khung hình này. */
  advance(dtSeconds: number): number {
    const dt = Number.isFinite(dtSeconds) ? Math.max(0, dtSeconds) : 0;
    this.accumulator += Math.min(dt, this.step * this.maxSubSteps);
    let steps = 0;
    // Sai số dấu phẩy động: coi như đủ một bước khi chỉ thiếu cỡ 1e-9.
    while (this.accumulator + 1e-9 >= this.step && steps < this.maxSubSteps) {
      this.accumulator -= this.step;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }

  /** Phần dư giữa hai bước (0..1), dùng để nội suy hình ảnh. */
  get alpha(): number {
    return Math.min(1, this.accumulator / this.step);
  }

  reset(): void {
    this.accumulator = 0;
  }
}
