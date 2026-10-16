import { CONTACTS, type Contact, type Message, type Thread } from './inbox';
import type { LedgerEntry, WalletData } from './wallet';
import { MAX_STARS } from './wanted';
import type { OutcomeKind } from '@/ui/outcome';

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
  /** Balo (Inventory.toJSON) — tuỳ chọn: bản lưu cũ không có thì dùng balo khởi đầu. */
  inventory?: unknown;
  /** Máu 0..100 — tuỳ chọn. */
  health?: number;
  /** Vũ khí đang cầm (mã món) — tuỳ chọn. */
  equipped?: string | null;
  /** Nâng cấp đã mua ở cửa hàng (điện thoại Pro…). Tuỳ chọn — bản lưu cũ không có. */
  services?: string[];
  /** Số tin nhắn mở màn đã nhận (lưu giữa lúc mở màn thì nạp lại gửi tiếp phần còn lại). Bản lưu cũ: coi như đủ. */
  intro?: number;
  /** Lưu giữa màn hình BỊ BẮT / GỤC: nạp lại thì xử luôn (nộp phạt / viện phí, về đồn / trạm y tế). */
  outcome?: OutcomeKind;
  /** Sao truy nã + tâm vùng tìm kiếm. */
  wanted?: { level: number; x: number; z: number };
  /** Độ Nóng (đàn em Phát truy đuổi) 0–3. */
  heat?: number;
}

/** Giao diện tối thiểu của localStorage (để test bằng bộ nhớ giả). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isContact = (v: unknown): v is Contact => (CONTACTS as readonly unknown[]).includes(v);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Dòng sổ ví hợp lệ (bỏ dòng hỏng), giữ 50 dòng cuối như Wallet. */
function parseLedger(v: unknown): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  if (!Array.isArray(v)) return out;
  for (const e of v) if (isObj(e) && isNum(e.hour) && isNum(e.amount) && typeof e.reason === 'string') out.push({ hour: e.hour, amount: e.amount, reason: e.reason });
  return out.slice(-50);
}

/** Cuộc trò chuyện hợp lệ: đúng người trong danh bạ, tin hỏng bỏ đi, số tin chưa đọc không quá số tin. */
function parseInbox(v: unknown): Thread[] {
  const out: Thread[] = [];
  if (!Array.isArray(v)) return out;
  for (const t of v) {
    if (!isObj(t) || !isContact(t.contact) || !Array.isArray(t.messages)) continue;
    const messages: Message[] = [];
    for (const m of t.messages) {
      if (isObj(m) && (m.from === 'Tín' || isContact(m.from)) && typeof m.text === 'string' && isNum(m.hour)) messages.push({ from: m.from, text: m.text, hour: m.hour });
    }
    const unread = isNum(t.unread) ? clamp(Math.floor(t.unread), 0, messages.length) : 0;
    out.push({ contact: t.contact, messages, unread });
  }
  return out;
}

/**
 * Đọc và kiểm tra dữ liệu lưu; sai phiên bản / thiếu trường chính / hỏng JSON ⇒ null (bắt đầu game mới). Trường phụ
 * hỏng (tin nhắn, dòng sổ ví, trường tuỳ chọn) thì bỏ riêng phần đó — không để một tin nhắn hỏng làm game không vào được
 * hay mất cả tiến độ.
 */
export function parseSave(text: string | null): SaveData | null {
  if (!text) return null;
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(d)) return null;
  const s = d as Partial<Record<keyof SaveData, unknown>>;
  if (s.version !== SAVE_VERSION) return null;
  if (!isNum(s.hour) || !isNum(s.jobsDone) || !isNum(s.savedAt)) return null;
  const wallet = s.wallet;
  if (!isObj(wallet) || !isNum(wallet.cash) || !isNum(wallet.debt)) return null;
  const story = s.story;
  if (!isObj(story) || !isNum(story.next)) return null;
  const player = s.player;
  if (!isObj(player) || !isNum(player.x) || !isNum(player.z) || !isNum(player.yaw)) return null;
  // Balo, máu, vũ khí, nâng cấp: game tự kiểm tra lúc nạp (Inventory.fromJSON…). Trường tuỳ chọn mới kiểm tra ở dưới.
  const { intro, outcome, wanted, heat, ...rest } = s;
  const out: SaveData = {
    ...(rest as SaveData),
    hour: ((s.hour % 24) + 24) % 24,
    jobsDone: Math.max(0, Math.floor(s.jobsDone)),
    wallet: { cash: wallet.cash, debt: wallet.debt, ledger: parseLedger(wallet.ledger) },
    inbox: parseInbox(s.inbox),
    story: { next: story.next },
    player: { x: player.x, z: player.z, yaw: player.yaw },
  };
  // Hỏng thì bỏ (game dùng giá trị mặc định).
  if (isNum(intro)) out.intro = Math.max(0, Math.floor(intro));
  if (outcome === 'busted' || outcome === 'wasted') out.outcome = outcome;
  if (isObj(wanted) && isNum(wanted.level) && isNum(wanted.x) && isNum(wanted.z)) out.wanted = { level: clamp(Math.round(wanted.level), 0, MAX_STARS), x: wanted.x, z: wanted.z };
  if (isNum(heat)) out.heat = clamp(Math.round(heat), 0, 3);
  return out;
}

export class SaveSlot {
  /** Lần lưu gần nhất có thành công không (để HUD báo nếu trình duyệt chặn lưu). */
  lastOk = true;
  /**
   * Tab khác (cùng trình duyệt) đã ghi bản lưu sau lần đọc / ghi gần nhất của tab này: tab này thôi lưu luôn để khỏi đè
   * tiến độ của tab kia (tải lại trang để chơi tiếp bản mới nhất).
   */
  conflict = false;
  /** Nội dung bản lưu theo hiểu biết của tab này (lần đọc / ghi / xoá gần nhất); undefined = chưa đọc lần nào. */
  private known: string | null | undefined = undefined;

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
      const text = this.store?.getItem(this.key) ?? null;
      this.known = text;
      return parseSave(text);
    } catch {
      return null;
    }
  }

  save(data: Omit<SaveData, 'version' | 'savedAt'>, now = Date.now()): boolean {
    try {
      if (!this.store) throw new Error('không có bộ nhớ');
      if (!this.conflict && this.known !== undefined && this.store.getItem(this.key) !== this.known) this.conflict = true;
      if (this.conflict) throw new Error('tab khác đã ghi bản lưu');
      const text = JSON.stringify({ version: SAVE_VERSION, savedAt: now, ...data });
      this.store.setItem(this.key, text);
      this.known = text;
      this.lastOk = true;
    } catch {
      this.lastOk = false;
    }
    return this.lastOk;
  }

  clear(): void {
    try {
      this.store?.removeItem(this.key);
      this.known = null;
    } catch {
      // Bị chặn thì thôi.
    }
  }
}
