/**
 * Thời gian trong ngày và ánh sáng tương ứng (thuần logic, không đụng three — có unit test).
 *
 * Sài Gòn gần xích đạo: mặt trời mọc ~6 giờ ở phía ĐÔNG (+X), lên cao gần đỉnh đầu buổi trưa (lệch nhẹ về −Z),
 * lặn ~18 giờ ở phía TÂY (−X). Ban đêm ánh sáng chính là trăng (xanh nhạt, yếu) + quầng sáng cam của thành phố.
 * Màu viết dạng sRGB 0..1; lớp hình tự đổi sang không gian tuyến tính.
 */

export type RGB = readonly [number, number, number];
export type Vec3 = readonly [number, number, number];

export interface Lighting {
  hour: number;
  /** Vị trí mặt trời thật (có thể dưới chân trời) — cho shader bầu trời. */
  sunDir: Vec3;
  /** Hướng nguồn sáng chính (mặt trời ban ngày, trăng ban đêm) — cho đèn + bóng đổ. */
  lightDir: Vec3;
  lightColor: RGB;
  lightIntensity: number;
  hemiSky: RGB;
  hemiGround: RGB;
  hemiIntensity: number;
  fogColor: RGB;
  /** Cường độ phản chiếu môi trường (PMREM nướng từ trời ban ngày). */
  envIntensity: number;
  exposure: number;
  /** 0 = ngày, 1 = đêm hẳn: bật đèn đường, cửa sổ, đèn xe. */
  night: number;
}

interface Key {
  h: number;
  sun: RGB;
  sunI: number;
  sky: RGB;
  ground: RGB;
  hemiI: number;
  fog: RGB;
  env: number;
  exposure: number;
}

const hex = (s: string): RGB => {
  const n = parseInt(s.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const NIGHT: Omit<Key, 'h'> = {
  sun: hex('#9fb4ff'),
  sunI: 0,
  sky: hex('#34406a'),
  ground: hex('#3a2a22'),
  hemiI: 0.13,
  fog: hex('#1c1f30'),
  env: 0.015,
  exposure: 1.2,
};

/** Các mốc trong ngày; giữa hai mốc nội suy tuyến tính (vòng qua nửa đêm). */
const KEYS: readonly Key[] = [
  { h: 0, ...NIGHT },
  { h: 5.0, ...NIGHT },
  { h: 5.7, sun: hex('#ff9a6a'), sunI: 0, sky: hex('#7a7aa8'), ground: hex('#4a3a34'), hemiI: 0.3, fog: hex('#6d6a86'), env: 0.03, exposure: 1.2 },
  { h: 6.4, sun: hex('#ffb27a'), sunI: 1.2, sky: hex('#c9b8c8'), ground: hex('#6e5c4c'), hemiI: 0.6, fog: hex('#d6b9a8'), env: 0.06, exposure: 1.1 },
  { h: 8, sun: hex('#ffe9c8'), sunI: 2.6, sky: hex('#cfe0f5'), ground: hex('#8b7a63'), hemiI: 0.9, fog: hex('#d9dde0'), env: 0.1, exposure: 1.05 },
  { h: 12, sun: hex('#fff3dc'), sunI: 3.2, sky: hex('#d4e4f7'), ground: hex('#8f7f68'), hemiI: 1.05, fog: hex('#d9dfe3'), env: 0.1, exposure: 1.0 },
  // 16 giờ: đúng ánh sáng "nắng chiều" của M1.
  { h: 16, sun: hex('#ffe1b3'), sunI: 3.0, sky: hex('#cfe0f5'), ground: hex('#8b7a63'), hemiI: 1.0, fog: hex('#d3d8da'), env: 0.1, exposure: 1.05 },
  { h: 17.3, sun: hex('#ffb877'), sunI: 2.3, sky: hex('#d7c9c4'), ground: hex('#86705a'), hemiI: 0.8, fog: hex('#e0c6a8'), env: 0.08, exposure: 1.08 },
  { h: 17.9, sun: hex('#ff8a48'), sunI: 1.1, sky: hex('#c99a8a'), ground: hex('#6b5446'), hemiI: 0.55, fog: hex('#c49478'), env: 0.06, exposure: 1.12 },
  { h: 18.1, sun: hex('#ff6a30'), sunI: 0, sky: hex('#9a7f96'), ground: hex('#4f3e3a'), hemiI: 0.42, fog: hex('#8a6f7c'), env: 0.045, exposure: 1.15 },
  { h: 18.8, sun: hex('#9fb4ff'), sunI: 0, sky: hex('#4d5684'), ground: hex('#3a2c26'), hemiI: 0.24, fog: hex('#363a55'), env: 0.025, exposure: 1.2 },
  { h: 19.5, ...NIGHT },
  { h: 24, ...NIGHT },
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Đưa giờ về [0, 24). */
export function wrapHour(h: number): number {
  return ((h % 24) + 24) % 24;
}

function normalize(x: number, y: number, z: number): Vec3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** Hướng tới mặt trời: góc quay quanh trục Đông–Tây, 6 giờ ở +X, 18 giờ ở −X; trưa lệch nhẹ về −Z. */
export function sunDirection(hour: number): Vec3 {
  const a = ((wrapHour(hour) - 6) / 12) * Math.PI;
  return normalize(Math.cos(a), Math.sin(a), -0.32 * Math.sin(a));
}

/** Trăng: đối diện mặt trời (đơn giản hoá), luôn đặt trên trời khi là nguồn sáng ban đêm. */
function moonDirection(hour: number): Vec3 {
  const s = sunDirection(hour);
  return normalize(-s[0], Math.max(0.35, -s[1]), -s[2] + 0.2);
}

/** Mức "đêm": 0 ban ngày, 1 khi đã tối hẳn; chuyển dần lúc chạng vạng và rạng sáng. */
export function nightFactor(hour: number): number {
  const h = wrapHour(hour);
  if (h < 12) return 1 - smooth(5.3, 6.6, h);
  return smooth(17.8, 19.0, h);
}

export function lightingAt(hour: number): Lighting {
  const h = wrapHour(hour);
  let i = 0;
  while (i < KEYS.length - 2 && (KEYS[i + 1] as Key).h <= h) i++;
  const a = KEYS[i] as Key;
  const b = KEYS[i + 1] as Key;
  const t = (h - a.h) / (b.h - a.h);

  const sunDir = sunDirection(h);
  const night = nightFactor(h);
  // Nắng tắt dần khi mặt trời sát chân trời (tránh nhảy cóc lúc đổi nguồn sáng sang trăng).
  const sunI = lerp(a.sunI, b.sunI, t) * smooth(0.0, 0.1, sunDir[1]);
  // Trăng sáng dần khi mặt trời đã tắt hẳn; nguồn sáng đổi sang trăng khi mặt trời xuống dưới chân trời.
  const moonI = 0.32 * night;
  const sunUp = sunDir[1] > 0.02 && sunI > 0.001;
  return {
    hour: h,
    sunDir,
    lightDir: sunUp ? sunDir : moonDirection(h),
    lightColor: sunUp ? lerp3(a.sun, b.sun, t) : NIGHT.sun,
    lightIntensity: sunUp ? sunI : moonI,
    hemiSky: lerp3(a.sky, b.sky, t),
    hemiGround: lerp3(a.ground, b.ground, t),
    hemiIntensity: lerp(a.hemiI, b.hemiI, t),
    fogColor: lerp3(a.fog, b.fog, t),
    envIntensity: lerp(a.env, b.env, t),
    exposure: lerp(a.exposure, b.exposure, t),
    night,
  };
}

/** Đồng hồ game: mặc định 1 giờ trong game = 1 phút ngoài đời (một ngày ≈ 24 phút). */
export class GameClock {
  hour: number;

  constructor(
    start = 16.5,
    /** Số giờ game trôi qua mỗi giây thật. */
    public rate = 1 / 60,
  ) {
    this.hour = wrapHour(start);
  }

  advance(dt: number): void {
    this.hour = wrapHour(this.hour + dt * this.rate);
  }

  /** "HH:MM" */
  label(): string {
    const total = Math.floor(this.hour * 60);
    const hh = Math.floor(total / 60) % 24;
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}
