import type { Thread } from './inbox';
import type { WalletData } from './wallet';

/**
 * Lưu game vào localStorage (thuần logic, có unit test). Bộ nhớ trình duyệt có thể bị chặn / đầy / hỏng
 * (tab ẩn danh, chặn cookie…) nên mọi thao tác đều bọc try/catch và game vẫn chạy bình thường khi không lưu được.
 */

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'hem.save.v1';

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** Thời điểm lưu (ms, Date.now). */
  savedAt: number;
  hour: number;
  wallet: WalletData;
  inbox: Thread[];
  story: { next: number };
  jobsDone: number;
  player: { x: number; z: number; yaw: number };
}

/** Giao diện tối thiểu của localStorage (để test bằng bộ nhớ giả). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Đọc và kiểm tra dữ liệu lưu; sai phiên bản / thiếu trường / hỏng JSON ⇒ null (bắt đầu game mới). */
export function parseSave(text: string | null): SaveData | null {
  if (!text) return null;
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof d !== 'object' || d === null) return null;
  const s = d as Partial<SaveData>;
  if (s.version !== SAVE_VERSION) return null;
  if (!isNum(s.hour) || !isNum(s.jobsDone) || !isNum(s.savedAt)) return null;
  if (!s.wallet || !isNum(s.wallet.cash) || !isNum(s.wallet.debt) || !Array.isArray(s.wallet.ledger)) return null;
  if (!Array.isArray(s.inbox)) return null;
  if (!s.story || !isNum(s.story.next)) return null;
  if (!s.player || !isNum(s.player.x) || !isNum(s.player.z) || !isNum(s.player.yaw)) return null;
  return s as SaveData;
}

export class SaveSlot {
  /** Lần lưu gần nhất có thành công không (để HUD báo nếu trình duyệt chặn lưu). */
  lastOk = true;

  constructor(
    private readonly store: KeyValueStore | null,
    private readonly key = SAVE_KEY,
  ) {}

  /** localStorage của trình duyệt, hoặc null nếu bị chặn. */
  static browser(): SaveSlot {
    try {
      return new SaveSlot(window.localStorage);
    } catch {
      return new SaveSlot(null);
    }
  }

  load(): SaveData | null {
    try {
      return parseSave(this.store?.getItem(this.key) ?? null);
    } catch {
      return null;
    }
  }

  save(data: Omit<SaveData, 'version' | 'savedAt'>, now = Date.now()): boolean {
    try {
      if (!this.store) throw new Error('không có bộ nhớ');
      this.store.setItem(this.key, JSON.stringify({ version: SAVE_VERSION, savedAt: now, ...data }));
      this.lastOk = true;
    } catch {
      this.lastOk = false;
    }
    return this.lastOk;
  }

  clear(): void {
    try {
      this.store?.removeItem(this.key);
    } catch {
      // Bị chặn thì thôi.
    }
  }
}
