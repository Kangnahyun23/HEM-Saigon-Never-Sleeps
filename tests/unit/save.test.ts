import { describe, expect, it } from 'vitest';
import { Inbox } from '@/systems/inbox';
import { Inventory, starterInventory } from '@/systems/inventory';
import { parseSave, SaveSlot, type KeyValueStore } from '@/systems/save';
import { Wallet } from '@/systems/wallet';

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

const sample = () => {
  const wallet = new Wallet({ cash: 420_000, debt: 28_500_000 });
  wallet.earn(50_000, 'Kèo: Giao trà sữa', 17.5);
  const inbox = new Inbox();
  inbox.receive('Ngân', 'Anh về chưa?', 18);
  return { hour: 18.25, wallet: wallet.toJSON(), inbox: inbox.toJSON(), story: { next: 3 }, jobsDone: 4, player: { x: 12.5, z: -40, yaw: 1.2 } };
};

describe('SaveSlot', () => {
  it('lưu rồi nạp lại đúng dữ liệu; khôi phục được ví và hộp thư', () => {
    const slot = new SaveSlot(new MemoryStore());
    expect(slot.load()).toBeNull();
    expect(slot.save(sample(), 1234)).toBe(true);
    const back = slot.load()!;
    expect(back.savedAt).toBe(1234);
    expect(back.story.next).toBe(3);
    expect(back.player).toEqual({ x: 12.5, z: -40, yaw: 1.2 });
    const wallet = new Wallet(back.wallet);
    expect(wallet.cash).toBe(470_000);
    expect(wallet.ledger).toHaveLength(1);
    const inbox = new Inbox(back.inbox);
    expect(inbox.unread).toBe(1);
    slot.clear();
    expect(slot.load()).toBeNull();
  });

  it('dữ liệu hỏng / sai phiên bản / thiếu trường ⇒ coi như chưa có bản lưu', () => {
    expect(parseSave('{không phải json')).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(), version: 99, savedAt: 1 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1, wallet: { cash: 'nhiều' } }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1, player: null }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1 }))).not.toBeNull();
  });

  it('trình duyệt chặn bộ nhớ: không văng lỗi, báo lưu thất bại', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const slot = new SaveSlot(broken);
    expect(slot.load()).toBeNull();
    expect(slot.save(sample())).toBe(false);
    expect(slot.lastOk).toBe(false);
    expect(() => slot.clear()).not.toThrow();
    expect(new SaveSlot(null).save(sample())).toBe(false);
  });

  it('trường lồng nhau hỏng (tin nhắn, sổ ví): bỏ phần hỏng, giữ phần còn lại — nạp vào hộp thư / ví không văng lỗi', () => {
    const raw = { ...sample(), version: 1, savedAt: 1 } as Record<string, unknown>;
    raw.inbox = [
      null,
      5,
      { contact: 'Người lạ', messages: [], unread: 0 },
      { contact: 'Ngân', messages: 'không phải mảng', unread: 0 },
      { contact: 'Ngân', messages: [null, { from: 'Ngân', text: 42, hour: 1 }, { from: 'Ngân', text: 'Còn đây', hour: 18 }], unread: 'nhiều' },
      { contact: 'Chú Sáu', messages: [{ from: 'Tín', text: 'Dạ', hour: 19 }, { from: 'Chú Sáu', text: 'Ừ', hour: 19.5 }], unread: 7 },
    ];
    raw.wallet = { cash: 1000, debt: 5000, ledger: [null, { hour: 1, amount: 'x', reason: 'y' }, { hour: 17.5, amount: 50_000, reason: 'Kèo' }] };
    const back = parseSave(JSON.stringify(raw));
    expect(back).not.toBeNull();
    expect(back!.inbox).toEqual([
      { contact: 'Ngân', messages: [{ from: 'Ngân', text: 'Còn đây', hour: 18 }], unread: 0 },
      // Số tin chưa đọc không quá số tin.
      { contact: 'Chú Sáu', messages: [{ from: 'Tín', text: 'Dạ', hour: 19 }, { from: 'Chú Sáu', text: 'Ừ', hour: 19.5 }], unread: 2 },
    ]);
    expect(back!.wallet.ledger).toEqual([{ hour: 17.5, amount: 50_000, reason: 'Kèo' }]);
    expect(() => new Inbox(back!.inbox)).not.toThrow();
    expect(() => new Wallet(back!.wallet)).not.toThrow();
    // Hộp thư / sổ ví không phải mảng ⇒ coi như trống, không bỏ cả bản lưu (mất hết tiến độ).
    const empty = parseSave(JSON.stringify({ ...raw, inbox: { a: 1 }, wallet: { cash: 1000, debt: 5000, ledger: null } }));
    expect(empty!.inbox).toEqual([]);
    expect(empty!.wallet.ledger).toEqual([]);
  });

  it('giờ / số kèo lạ được đưa về khoảng hợp lệ', () => {
    const back = parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1, hour: -3, jobsDone: -2.5 }));
    expect(back!.hour).toBe(21);
    expect(back!.jobsDone).toBe(0);
    expect(parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1, hour: 49.5, jobsDone: 3.7 }))).toMatchObject({ hour: 1.5, jobsDone: 3 });
  });

  it('lưu số tin mở màn đã nhận, kết cục đang dở, sao truy nã, Độ Nóng; giá trị hỏng thì bỏ qua', () => {
    const slot = new SaveSlot(new MemoryStore());
    slot.save({ ...sample(), intro: 2, outcome: 'busted', wanted: { level: 3, x: 5, z: -6 }, heat: 2 });
    const back = slot.load()!;
    expect(back.intro).toBe(2);
    expect(back.outcome).toBe('busted');
    expect(back.wanted).toEqual({ level: 3, x: 5, z: -6 });
    expect(back.heat).toBe(2);
    const bad = parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1, intro: 'x', outcome: 'trốn', wanted: { level: 2, x: 'a', z: 0 }, heat: '3' }))!;
    expect(bad).not.toBeNull();
    expect(bad.intro).toBeUndefined();
    expect(bad.outcome).toBeUndefined();
    expect(bad.wanted).toBeUndefined();
    expect(bad.heat).toBeUndefined();
    // Ngoài khoảng ⇒ kẹp lại (5 sao, Độ Nóng 3).
    const big = parseSave(JSON.stringify({ ...sample(), version: 1, savedAt: 1, intro: -4, wanted: { level: 9.4, x: 1, z: 2 }, heat: 7 }))!;
    expect(big.intro).toBe(0);
    expect(big.wanted).toEqual({ level: 5, x: 1, z: 2 });
    expect(big.heat).toBe(3);
  });

  it('hai tab: tab có bản lưu đã bị tab khác ghi đè thì thôi lưu (không đè tiến độ của tab kia)', () => {
    const store = new MemoryStore();
    const a = new SaveSlot(store);
    const b = new SaveSlot(store);
    a.load();
    expect(a.save(sample(), 1)).toBe(true);
    // Mở tab B: nạp bản của A, chơi tiếp rồi lưu.
    b.load();
    expect(b.save({ ...sample(), jobsDone: 9 }, 2)).toBe(true);
    // Tab A lưu tiếp ⇒ không ghi đè bản của B, báo xung đột (và thôi lưu luôn).
    expect(a.save(sample(), 3)).toBe(false);
    expect(a.conflict).toBe(true);
    expect(a.save(sample(), 4)).toBe(false);
    expect(new SaveSlot(store).load()!.jobsDone).toBe(9);
    // Tab B vẫn lưu bình thường, lưu liên tiếp nhiều lần không tự coi là xung đột.
    expect(b.save(sample(), 5)).toBe(true);
    expect(b.save(sample(), 6)).toBe(true);
    expect(b.conflict).toBe(false);
  });

  it('chơi lại từ đầu (xoá bản lưu) rồi lưu: không coi là xung đột', () => {
    const store = new MemoryStore();
    new SaveSlot(store).save(sample(), 1);
    const slot = new SaveSlot(store);
    slot.clear();
    expect(slot.load()).toBeNull();
    expect(slot.save(sample(), 2)).toBe(true);
    expect(slot.conflict).toBe(false);
  });

  it('lưu cả balo + máu; bản lưu cũ (chưa có balo) vẫn đọc được', () => {
    const slot = new SaveSlot(new MemoryStore());
    const inv = starterInventory();
    inv.add('maTau', 1);
    slot.save({ ...sample(), inventory: inv.toJSON(), health: 64 });
    const back = slot.load()!;
    expect(back.health).toBe(64);
    expect(Inventory.fromJSON(back.inventory).toJSON()).toEqual(inv.toJSON());
    slot.save(sample());
    const old = slot.load()!;
    expect(old.inventory).toBeUndefined();
    expect(old.health).toBeUndefined();
  });
});
