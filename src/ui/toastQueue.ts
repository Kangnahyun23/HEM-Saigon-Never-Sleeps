/**
 * Hàng thông báo nhanh (thuần logic, có unit test): xếp chồng ở góc màn hình, tối đa `max` dòng, cũ nhất bị đẩy ra;
 * cùng nội dung thì chỉ làm mới thời gian (không lặp dòng). HUD chỉ vẽ lại khi `update`/`push` báo có đổi.
 */

export interface ToastItem {
  readonly id: number;
  readonly text: string;
  /** Còn hiện bao lâu (s). */
  time: number;
}

export class ToastQueue {
  readonly items: ToastItem[] = [];
  private nextId = 1;

  constructor(readonly max = 3) {}

  push(text: string, seconds: number): ToastItem {
    const same = this.items.find((t) => t.text === text);
    if (same) {
      same.time = Math.max(same.time, seconds);
      return same;
    }
    const item: ToastItem = { id: this.nextId++, text, time: seconds };
    this.items.push(item);
    while (this.items.length > this.max) this.items.shift();
    return item;
  }

  /** Trừ thời gian, bỏ dòng hết hạn. Trả true nếu danh sách đổi (cần vẽ lại). */
  update(dt: number): boolean {
    let changed = false;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i]!;
      t.time -= dt;
      if (t.time <= 0) {
        this.items.splice(i, 1);
        changed = true;
      }
    }
    return changed;
  }
}
