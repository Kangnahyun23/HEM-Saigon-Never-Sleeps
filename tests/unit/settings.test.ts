import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '@/systems/save';
import { DEFAULT_SETTINGS, parseSettings, qualityProfile, SETTINGS_KEY, SettingsStore } from '@/systems/settings';

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
    expect(s.save({ quality: 'low', showFps: true, mouseSensitivity: 1.6, invertY: true })).toBe(true);
    expect(s.load()).toEqual({ quality: 'low', showFps: true, mouseSensitivity: 1.6, invertY: true });
    expect(store.data.has(SETTINGS_KEY)).toBe(true);
  });

  it('dữ liệu hỏng: trường nào sai thì trường đó về mặc định', () => {
    expect(parseSettings('{hỏng')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: 'ultra', showFps: 'có', mouseSensitivity: 99, invertY: true }))).toEqual({
      quality: 'auto',
      showFps: false,
      mouseSensitivity: 2.5,
      invertY: true,
    });
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
  });
});
