import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '@/systems/save';
import { DEFAULT_SETTINGS, parseSettings, qualityProfile, sceneTier, SETTINGS_KEY, SettingsStore } from '@/systems/settings';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

describe('cài đặt', () => {
  it('lưu rồi đọc lại đúng', () => {
    const store = new MemoryStore();
    const s = new SettingsStore(store);
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    const mine = { quality: 'low', showFps: true, mouseSensitivity: 1.6, invertY: true, volume: 0.3, blood: false, adultConfirmed: true } as const;
    expect(s.save(mine)).toBe(true);
    expect(s.load()).toEqual(mine);
    expect(store.data.has(SETTINGS_KEY)).toBe(true);
  });

  it('dữ liệu hỏng: trường nào sai thì trường đó về mặc định', () => {
    expect(parseSettings('{hỏng')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: 'ultra', showFps: 'có', mouseSensitivity: 99, invertY: true, volume: 7, blood: 0 }))).toEqual({
      quality: 'auto',
      showFps: false,
      mouseSensitivity: 2.5,
      invertY: true,
      volume: 1,
      blood: true,
      adultConfirmed: false,
    });
    // Bản cài đặt cũ (trước N5.2): máu bật, chưa xác nhận 18+ ⇒ hỏi một lần.
    expect(parseSettings(JSON.stringify({ quality: 'low' })).adultConfirmed).toBe(false);
    // Bản cài đặt cũ chưa có âm lượng: lấy mặc định.
    expect(parseSettings(JSON.stringify({ quality: 'low' })).volume).toBe(0.8);
    expect(parseSettings(JSON.stringify({ quality: 'medium' })).quality).toBe('medium');
  });

  it('bộ nhớ bị chặn: không văng lỗi, dùng mặc định', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const s = new SettingsStore(broken);
    expect(s.load()).toEqual(DEFAULT_SETTINGS);
    expect(s.save({ ...DEFAULT_SETTINGS })).toBe(false);
    expect(new SettingsStore(null).save({ ...DEFAULT_SETTINGS })).toBe(false);
  });

  it('mức chất lượng: thấp tắt bóng và vẽ ít điểm ảnh; không vượt độ nét màn hình', () => {
    const low = qualityProfile('low', 2);
    expect(low.shadows).toBe(false);
    expect(low.pixelRatio).toBe(0.75);
    expect(qualityProfile('medium', 2).pixelRatio).toBe(1);
    expect(qualityProfile('high', 2).pixelRatio).toBe(1.5);
    expect(qualityProfile('high', 1).pixelRatio).toBe(1);
    expect(qualityProfile('auto', 3).adaptive).toBe(true);
    expect(qualityProfile('high', 2).adaptive).toBe(false);
    expect(qualityProfile('low', 0.5).pixelRatio).toBe(0.5);
    // Bloom ban đêm: tắt ở Thấp, ảnh bloom nhỏ hơn ở Vừa.
    expect(low.bloom).toBe(0);
    expect(qualityProfile('medium', 2).bloom).toBeGreaterThan(0);
    expect(qualityProfile('medium', 2).bloom).toBeLessThan(qualityProfile('high', 2).bloom);
    expect(qualityProfile('auto', 2, 'low').bloom).toBe(0);
  });

  it('Tự động bắt đầu theo bậc máy rồi vẫn được nâng tới 1,5×', () => {
    const weak = qualityProfile('auto', 2, 'low');
    expect(weak).toMatchObject({ pixelRatio: 0.75, maxPixelRatio: 1.5, adaptive: true, shadows: false });
    const mid = qualityProfile('auto', 2, 'medium');
    expect(mid).toMatchObject({ pixelRatio: 1, maxPixelRatio: 1.5, adaptive: true, shadows: true });
    const strong = qualityProfile('auto', 2, 'high');
    expect(strong).toMatchObject({ pixelRatio: 1.5, maxPixelRatio: 1.5, adaptive: true, shadows: true, detailScale: 1 });
    expect(sceneTier('auto', 'low')).toBe('low');
    expect(sceneTier('high', 'low')).toBe('high');
  });
});
