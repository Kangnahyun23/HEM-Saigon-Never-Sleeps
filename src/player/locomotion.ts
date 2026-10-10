/**
 * Trộn động tác di chuyển theo tốc độ (thuần logic, có unit test): đứng → đi → chạy nhẹ → chạy nhanh.
 * Dùng cho nhân vật có xương (người chơi, người đi đường gần camera).
 */

/** Mốc tốc độ (m/s): đứng, đi (2,3 = tốc độ đi bộ của game), chạy nhẹ, chạy nhanh (6,4 = giữ Shift). */
export const SPEED_KNOTS = [0, 2.3, 4.2, 6.4] as const;
/** Tốc độ mà mỗi clip đi / chạy nhẹ / chạy nhanh khớp bước chân (m/s) — để chỉnh nhịp clip theo tốc độ thật. */
export const CLIP_SPEEDS = [1.6, 3.6, 6.2] as const;

/**
 * Trọng số [đứng, đi, chạy nhẹ, chạy nhanh] ở tốc độ `speed` — nội suy tuyến tính giữa hai mốc kề nhau, tổng luôn = 1.
 * Ghi vào `out` (không tạo mảng mới mỗi khung hình).
 */
export function locomotionWeights(speed: number, out: number[]): number[] {
  const v = Math.min(Math.max(speed, 0), SPEED_KNOTS[3]);
  out[0] = out[1] = out[2] = out[3] = 0;
  for (let k = 0; k < 3; k++) {
    const a = SPEED_KNOTS[k]!;
    const b = SPEED_KNOTS[k + 1]!;
    if (v <= b || k === 2) {
      const f = Math.min(1, Math.max(0, (v - a) / (b - a)));
      out[k] = 1 - f;
      out[k + 1] = f;
      break;
    }
  }
  return out;
}

/** Nhịp phát clip thứ `k` (0 đi, 1 chạy nhẹ, 2 chạy nhanh) để bước chân khớp tốc độ thật, kẹp 0,55–1,6×. */
export function clipTimeScale(k: number, speed: number): number {
  return Math.min(1.6, Math.max(0.55, speed / CLIP_SPEEDS[k]!));
}
