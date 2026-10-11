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
