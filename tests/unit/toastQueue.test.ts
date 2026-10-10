import { describe, expect, it } from 'vitest';
import { ToastQueue } from '@/ui/toastQueue';

describe('hàng thông báo nhanh', () => {
  it('xếp chồng theo thứ tự, tối đa `max` dòng — dòng cũ nhất bị đẩy ra', () => {
    const q = new ToastQueue(3);
    for (const t of ['a', 'b', 'c', 'd']) q.push(t, 2);
    expect(q.items.map((t) => t.text)).toEqual(['b', 'c', 'd']);
  });

  it('cùng nội dung thì chỉ làm mới thời gian, không lặp dòng', () => {
    const q = new ToastQueue(3);
    q.push('Đã lưu game', 1);
    q.update(0.8);
    q.push('Đã lưu game', 2);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]!.time).toBeCloseTo(2);
  });

  it('hết hạn thì tự biến mất; update báo có đổi để HUD vẽ lại', () => {
    const q = new ToastQueue(3);
    q.push('x', 1);
    q.push('y', 3);
    expect(q.update(0.5)).toBe(false);
    expect(q.update(0.6)).toBe(true);
    expect(q.items.map((t) => t.text)).toEqual(['y']);
    q.update(5);
    expect(q.items).toHaveLength(0);
  });
});
