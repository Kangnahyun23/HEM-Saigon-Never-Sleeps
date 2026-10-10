/**
 * Phần tính toán của âm thanh (thuần logic, có unit test): tiếng máy xe theo tốc độ / ga, tiếng phố theo giờ / mưa /
 * mật độ xe, đường cong âm lượng. Phần phát tiếng (WebAudio) ở engineSound.ts, ambience.ts, sfx.ts.
 */

export interface EngineTone {
  /** Tần số cơ bản (Hz) của tiếng máy. */
  freq: number;
  /** Độ to 0…1. */
  gain: number;
  /** Tần số cắt bộ lọc (Hz): ga mạnh thì tiếng gắt, sáng hơn. */
  cutoff: number;
  /** Nhịp "nổ" (Hz) — điều biến biên độ cho tiếng "pạch pạch" của xe số một xi-lanh. */
  pulse: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Tốc độ tối đa dùng để quy đổi (m/s) — khớp BIKE_TUNING.maxSpeed (21 m/s ≈ 75 km/h). */
export const ENGINE_TOP_SPEED = 21;

/**
 * Tiếng máy xe số 110 cc: nổ máy cầm chừng khi đứng yên, vòng tua tăng theo tốc độ qua 4 số (mỗi lần lên số tụt tua),
 * ga mạnh thì to và gắt hơn. `speed` m/s (lấy trị tuyệt đối), `throttle` 0…1. Không lái xe ⇒ im.
 */
export function engineTone(riding: boolean, speed: number, throttle: number, out: EngineTone): EngineTone {
  if (!riding) {
    out.freq = 40;
    out.gain = 0;
    out.cutoff = 300;
    out.pulse = 10;
    return out;
  }
  const v = clamp01(Math.abs(speed) / ENGINE_TOP_SPEED);
  const t = clamp01(throttle);
  // Bốn số: trong mỗi số vòng tua đi từ 0,35 lên 1; lên số thì tụt về đầu khoảng.
  const gears = 4;
  const g = Math.min(gears - 1, Math.floor(v * gears));
  const inGear = v * gears - g;
  const rpm = v < 0.02 ? 0 : 0.35 + 0.65 * inGear * (0.85 + 0.15 * (g / (gears - 1)));
  out.freq = 42 + rpm * 120 + t * 10;
  out.gain = 0.22 + 0.25 * rpm + 0.25 * t;
  out.cutoff = 380 + rpm * 1100 + t * 600;
  out.pulse = 9 + rpm * 38;
  return out;
}

export interface AmbienceLevels {
  /** Tiếng ồn xe cộ xa xa (0…1). */
  hum: number;
  /** Tiếng dế ban đêm (0…1). */
  crickets: number;
}

/**
 * Tiếng phố: ồn xe theo số xe NPC ở gần (đông nhất giờ tan tầm, vắng lúc khuya), dế kêu khi trời tối (mưa thì im).
 * `hour` 0–24, `rain` 0…1, `nearbyTraffic` số xe trong ~60 m.
 */
export function ambienceLevels(hour: number, rain: number, nearbyTraffic: number, out: AmbienceLevels): AmbienceLevels {
  const h = ((hour % 24) + 24) % 24;
  // Nhịp phố: vắng 1–5 giờ sáng, đông 7–9 và 17–19 giờ.
  const rush = Math.exp(-(((h - 8) / 1.6) ** 2)) + Math.exp(-(((h - 18) / 1.8) ** 2));
  const awake = h >= 1 && h < 5 ? 0.25 : 0.6;
  const density = clamp01(nearbyTraffic / 12);
  out.hum = clamp01((awake + 0.4 * rush) * (0.35 + 0.65 * density) * (1 - 0.5 * rain));
  const dark = h >= 19 || h < 5 ? 1 : h >= 18 ? h - 18 : h < 6 ? 6 - h : 0;
  out.crickets = clamp01(dark * (1 - rain) * (1 - 0.6 * density));
  return out;
}

/** Âm lượng người chơi chọn (0…1) → hệ số khuếch đại: tai người nghe theo thang log nên bình phương cho đều tay. */
export function volumeCurve(volume: number): number {
  const v = clamp01(volume);
  return v * v;
}
