import type { Tier } from './hardware';
import type { KeyValueStore } from './save';

/**
 * Cài đặt của người chơi (thuần logic, có unit test): chất lượng đồ hoạ, hiện FPS, độ nhạy chuột, âm lượng, máu nhẹ. Lưu riêng với bản
 * lưu game (chơi lại từ đầu bằng ?moi=1 không mất cài đặt). Bộ nhớ trình duyệt bị chặn / dữ liệu hỏng ⇒ dùng mặc định.
 */

export type Quality = 'auto' | 'low' | 'medium' | 'high';

export interface Settings {
  quality: Quality;
  /** Hiện FPS, tỉ lệ điểm ảnh, số lệnh vẽ ở mép trên màn hình. */
  showFps: boolean;
  /** Hệ số độ nhạy chuột khi xoay camera (0,4–2,5). */
  mouseSensitivity: number;
  /** Đảo trục dọc khi xoay camera. */
  invertY: boolean;
  /** Âm lượng tổng 0…1 (0 = tắt tiếng). */
  volume: number;
  /** Máu nhẹ khi đánh nhau (giọt bắn, vũng máu) — tắt thì không còn máu. */
  blood: boolean;
  /** Đã xác nhận đủ 18 tuổi ở màn hình cảnh báo (chỉ hỏi lần đầu). */
  adultConfirmed: boolean;
}

export const SETTINGS_KEY = 'hem.settings.v1';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  quality: 'auto',
  showFps: false,
  mouseSensitivity: 1,
  invertY: false,
  volume: 0.8,
  blood: true,
  adultConfirmed: false,
};

export const QUALITY_LABELS: Record<Quality, string> = { auto: 'Tự động', low: 'Thấp', medium: 'Vừa', high: 'Cao' };

export const SENSITIVITY_MIN = 0.4;
export const SENSITIVITY_MAX = 2.5;

const QUALITIES: readonly Quality[] = ['auto', 'low', 'medium', 'high'];

export const clampSensitivity = (v: number): number => Math.round(Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, v)) * 10) / 10;

/** Âm lượng làm tròn theo nấc 10 %, trong 0…1. */
export const clampVolume = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 10) / 10;

/** Đọc cài đặt; trường thiếu / sai kiểu thì lấy mặc định từng trường (không bỏ cả bản). */
export function parseSettings(text: string | null): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  if (!text) return out;
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return out;
  }
  if (typeof d !== 'object' || d === null) return out;
  const s = d as Partial<Record<keyof Settings, unknown>>;
  if (QUALITIES.includes(s.quality as Quality)) out.quality = s.quality as Quality;
  if (typeof s.showFps === 'boolean') out.showFps = s.showFps;
  if (typeof s.mouseSensitivity === 'number' && Number.isFinite(s.mouseSensitivity)) out.mouseSensitivity = clampSensitivity(s.mouseSensitivity);
  if (typeof s.invertY === 'boolean') out.invertY = s.invertY;
  if (typeof s.volume === 'number' && Number.isFinite(s.volume)) out.volume = clampVolume(s.volume);
  if (typeof s.blood === 'boolean') out.blood = s.blood;
  if (typeof s.adultConfirmed === 'boolean') out.adultConfirmed = s.adultConfirmed;
  return out;
}

export class SettingsStore {
  constructor(private readonly store: KeyValueStore | null) {}

  static browser(): SettingsStore {
    try {
      return new SettingsStore(window.localStorage);
    } catch {
      return new SettingsStore(null);
    }
  }

  load(): Settings {
    try {
      return parseSettings(this.store?.getItem(SETTINGS_KEY) ?? null);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save(s: Settings): boolean {
    try {
      if (!this.store) return false;
      this.store.setItem(SETTINGS_KEY, JSON.stringify(s));
      return true;
    } catch {
      return false;
    }
  }
}

/** Thông số đồ hoạ ứng với một mức chất lượng. */
export interface QualityProfile {
  /** Tỉ lệ điểm ảnh lúc bắt đầu (đã kẹp theo màn hình). */
  pixelRatio: number;
  /** Tỉ lệ điểm ảnh cao nhất được nâng lên (mức Tự động; mức cố định = pixelRatio). */
  maxPixelRatio: number;
  /** Tự hạ / nâng chất lượng theo FPS (ResolutionGovernor). */
  adaptive: boolean;
  /** Đổ bóng mặt trời. */
  shadows: boolean;
  /** Hệ số tầm nhìn của chi tiết nhỏ (chậu cây, xe đậu…). */
  detailScale: number;
  /** Bloom ban đêm: độ phân giải ảnh bloom so với màn hình (0 = tắt). */
  bloom: number;
}

/**
 * Bảng mức chất lượng. Đo trên máy không GPU: bóng đổ ~8–40 % thời gian vẽ (lượt vẽ bóng + lọc bóng mỗi điểm ảnh),
 * số điểm ảnh ~40 % — nên "Thấp" tắt bóng và vẽ 0,75×, "Vừa" giữ bóng nhưng tối đa 1×.
 * Bloom ban đêm (neon, LED…) tắt ở "Thấp"; "Vừa" làm mờ trên ảnh 0,35× màn hình, "Cao" 0,5×.
 * "Tự động" bắt đầu từ mức hợp với bậc máy nhận diện được (`autoTier`, xem hardware.ts) rồi tự hạ / nâng theo FPS thật.
 */
export function qualityProfile(q: Quality, devicePixelRatio: number, autoTier: Tier = 'high'): QualityProfile {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const top = Math.min(dpr, 1.5);
  switch (q) {
    case 'low': {
      const pr = Math.min(dpr, 0.75);
      return { pixelRatio: pr, maxPixelRatio: pr, adaptive: false, shadows: false, detailScale: 0.6, bloom: 0 };
    }
    case 'medium': {
      const pr = Math.min(dpr, 1);
      return { pixelRatio: pr, maxPixelRatio: pr, adaptive: false, shadows: true, detailScale: 0.85, bloom: 0.35 };
    }
    case 'high':
      return { pixelRatio: top, maxPixelRatio: top, adaptive: false, shadows: true, detailScale: 1.25, bloom: 0.5 };
    default: {
      const start = autoTier === 'high' ? { ...qualityProfile('high', dpr), detailScale: 1 } : qualityProfile(autoTier, dpr);
      return { ...start, maxPixelRatio: top, adaptive: true };
    }
  }
}

/** Bậc máy dùng để dựng cảnh (số xe, người đi bộ, mưa, bản đồ bóng): mức cố định theo lựa chọn, Tự động theo máy. */
export function sceneTier(q: Quality, autoTier: Tier): Tier {
  return q === 'auto' ? autoTier : q;
}
