import { describe, expect, it } from 'vitest';
import { Inbox } from '@/systems/inbox';
import { formatVnd, Wallet } from '@/systems/wallet';

describe('Wallet', () => {
  it('nhận, tiêu, trả nợ; không âm tiền; ghi sổ', () => {
    const w = new Wallet({ cash: 100_000, debt: 1_000_000 });
    w.earn(250_000, 'Kèo giao hàng', 17);
    expect(w.cash).toBe(350_000);
    expect(w.spend(500_000, 'Bị giật túi')).toBe(350_000);
    expect(w.cash).toBe(0);
    w.earn(2_000_000, 'Thưởng');
    expect(w.payDebt(5_000_000)).toBe(1_000_000);
    expect(w.debt).toBe(0);
    expect(w.cash).toBe(1_000_000);
    expect(w.ledger.map((e) => e.amount)).toEqual([250_000, -350_000, 2_000_000, -1_000_000]);
  });

  it('lưu / nạp lại qua JSON', () => {
    const w = new Wallet({ cash: 5, debt: 7 });
    w.earn(10, 'x');
    const again = new Wallet(JSON.parse(JSON.stringify(w)));
    expect(again.cash).toBe(15);
    expect(again.debt).toBe(7);
    expect(again.ledger).toHaveLength(1);
  });

  it('định dạng tiền kiểu Việt Nam', () => {
    expect(formatVnd(0)).toBe('0 đ');
    expect(formatVnd(1250000)).toBe('1.250.000 đ');
    expect(formatVnd(-35000)).toBe('−35.000 đ');
    expect(formatVnd(999)).toBe('999 đ');
  });
});

describe('Inbox', () => {
  it('nhận tin, đếm chưa đọc, đánh dấu đã đọc, cuộc trò chuyện mới lên đầu', () => {
    const box = new Inbox();
    const got: string[] = [];
    box.onMessage = (m) => got.push(m.text);
    box.receive('Ngân', 'Anh ơi', 16.5);
    box.receive('Chú Sáu', 'Ghé chú', 16.6);
    box.receive('Ngân', 'Họ tới nhà rồi', 16.7);
    expect(box.unread).toBe(3);
    expect(box.threads[0]?.contact).toBe('Ngân');
    box.markRead('Ngân');
    expect(box.unread).toBe(1);
    box.reply('Ngân', 'Anh về liền');
    expect(box.thread('Ngân').messages.at(-1)?.from).toBe('Tín');
    expect(got).toEqual(['Anh ơi', 'Ghé chú', 'Họ tới nhà rồi']);
    const again = new Inbox(JSON.parse(JSON.stringify(box)));
    expect(again.unread).toBe(1);
  });
});
