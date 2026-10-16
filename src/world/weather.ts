import { createRng, range, type Rng } from '@/core/random';
import { createLighting, type Lighting, type RGB } from './timeOfDay';

/**
 * Thời tiết Sài Gòn mùa mưa (thuần logic, có seed, có unit test): nắng ⇄ mây ⇄ mưa rào.
 * Mưa hay đổ vào buổi chiều tối (14–20 giờ), rào nhanh rồi tạnh; mặt đường còn ướt một lúc sau khi tạnh.
 */

export type Sky = 'clear' | 'cloudy' | 'rain';

export interface WeatherState {
  /** Trạng thái đang hướng tới. */
  sky: Sky;
  /** 0..1, đổi mượt. */
  cloud: number;
  rain: number;
  /** Độ ướt mặt đường 0..1: ướt nhanh khi mưa, khô chậm. */
  wet: number;
}

const TARGET: Record<Sky, { cloud: number; rain: number }> = {
  clear: { cloud: 0, rain: 0 },
  cloudy: { cloud: 0.6, rain: 0 },
  rain: { cloud: 1, rain: 1 },
};

/** Xác suất trời chuyển sang mưa ở giờ `hour` (cao nhất chiều tối). */
export function rainChance(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 14 && h < 20) return 0.55;
  if (h >= 20 || h < 2) return 0.25;
  return 0.12;
}

export class WeatherSim {
  readonly state: WeatherState = { sky: 'clear', cloud: 0, rain: 0, wet: 0 };
  /** Số giờ game còn lại trước khi đổi trạng thái. */
  private remaining: number;
  /** Ép trạng thái (debug/test, ?mua=1). null = tự nhiên. */
  forced: Sky | null = null;
  private readonly rng: Rng;

  constructor(seed = 11, start: Sky = 'clear') {
    this.rng = createRng(seed);
    this.state.sky = start;
    const t = TARGET[start];
    this.state.cloud = t.cloud;
    this.state.rain = t.rain;
    this.state.wet = t.rain;
    this.remaining = range(this.rng, 0.6, 1.4);
  }

  /** `dtHours`: giờ game trôi qua; `hour`: giờ hiện tại. */
  update(dtHours: number, hour: number): WeatherState {
    const s = this.state;
    this.remaining -= dtHours;
    if (this.forced) s.sky = this.forced;
    else if (this.remaining <= 0) {
      s.sky = this.next(s.sky, hour);
      this.remaining = s.sky === 'rain' ? range(this.rng, 0.4, 1.5) : range(this.rng, 0.8, 3);
    }
    // Đổi mượt: mây kéo đến trong ~20 phút game, mưa nặng hạt / tạnh trong ~10 phút.
    const t = TARGET[s.sky];
    s.cloud = approach(s.cloud, t.cloud, dtHours * 3);
    s.rain = approach(s.rain, t.rain * Math.min(1, s.cloud / 0.8), dtHours * 6);
    s.wet = s.rain > s.wet ? approach(s.wet, s.rain, dtHours * 8) : approach(s.wet, 0, dtHours * 0.8);
    return s;
  }

  private next(sky: Sky, hour: number): Sky {
    const r = this.rng();
    if (sky === 'rain') return r < 0.6 ? 'cloudy' : 'clear';
    if (sky === 'cloudy') return r < rainChance(hour) * 1.4 ? 'rain' : r < 0.85 ? 'clear' : 'cloudy';
    return r < rainChance(hour) * 0.5 ? 'rain' : r < 0.5 ? 'cloudy' : 'clear';
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Độ sáng (xám) của một màu. */
const grey = (c: RGB): number => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
/** Ghi ba số vào mảng của đối tượng ánh sáng (ra ngoài là chỉ đọc; chỉ file này ghi). */
function set3(out: RGB, x: number, y: number, z: number): void {
  const o = out as [number, number, number];
  o[0] = x;
  o[1] = y;
  o[2] = z;
}
const copy3 = (out: RGB, a: RGB): void => set3(out, a[0], a[1], a[2]);

export interface WeatherLighting extends Lighting {
  fogNear: number;
  fogFar: number;
  cloud: number;
}

/** Đối tượng để `applyWeather` ghi vào — tạo một lần, dùng lại mỗi khung hình (không tạo rác). */
export function createWeatherLighting(): WeatherLighting {
  return { ...createLighting(), fogNear: 190, fogFar: 760, cloud: 0 };
}

/**
 * Áp thời tiết lên ánh sáng theo giờ: mây che nắng, trời xám lại, sương dày khi mưa.
 * Ghi vào `out` (mặc định tạo mới) và trả lại chính nó; `out` khác `l`.
 */
export function applyWeather(l: Lighting, w: WeatherState, out: WeatherLighting = createWeatherLighting()): WeatherLighting {
  const c = w.cloud;
  out.hour = l.hour;
  copy3(out.sunDir, l.sunDir);
  copy3(out.lightDir, l.lightDir);
  copy3(out.lightColor, l.lightColor);
  out.lightIntensity = l.lightIntensity * (1 - 0.8 * c);
  const sky = l.hemiSky;
  const skyGrey = grey(sky);
  const k = c * 0.7;
  set3(out.hemiSky, mix(sky[0], skyGrey, k), mix(sky[1], skyGrey, k), mix(sky[2], skyGrey, k));
  copy3(out.hemiGround, l.hemiGround);
  out.hemiIntensity = l.hemiIntensity * (1 - 0.25 * c);
  // Sương ngả xám, ban ngày pha thêm xám xanh của trời mưa.
  const fog = l.fogColor;
  const fogGrey = grey(fog);
  const blue = 0.4 * (1 - l.night);
  const f = c * 0.8;
  set3(out.fogColor, mix(fog[0], mix(fogGrey, 0.42, blue), f), mix(fog[1], mix(fogGrey, 0.45, blue), f), mix(fog[2], mix(fogGrey, 0.5, blue), f));
  out.envIntensity = l.envIntensity;
  out.exposure = l.exposure;
  out.fogNear = mix(190, 45, w.rain);
  out.fogFar = mix(760, 260, w.rain);
  out.cloud = c;
  // Trời mưa tối sớm hơn: đèn đường, cửa sổ bật khi mây dày.
  out.night = Math.max(l.night, c * 0.45);
  return out;
}
