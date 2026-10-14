/**
 * Kho đồ dùng lại theo khoá (thuần logic, có unit test): lấy một món rảnh cùng khoá, hết thì tạo mới; trả lại khi thôi
 * dùng. Số món tạo ra = số món cùng khoá được dùng CÙNG LÚC nhiều nhất — không phình theo thời gian chơi.
 * Dùng cho NPC có xương: dựng một nhân vật tốn (nhân bản xương + bộ trộn động tác), còn hình ẩn thì không tốn gì.
 */
export class KeyedPool<T extends object> {
  private readonly free = new Map<string, T[]>();
  private readonly keys = new WeakMap<T, string>();
  private made = 0;

  constructor(
    /** Gọi khi một món được lấy ra (hiện lên). */
    private readonly onTake: (item: T) => void = () => undefined,
    /** Gọi khi một món được trả lại (ẩn đi). */
    private readonly onGive: (item: T) => void = () => undefined,
  ) {}

  /** Lấy một món rảnh có khoá `key`; không có thì `create()` (trả null = không tạo được, ví dụ thiếu mẫu). */
  take(key: string, create: () => T | null): T | null {
    let item = this.free.get(key)?.pop() ?? null;
    if (!item) {
      item = create();
      if (!item) return null;
      this.made++;
      this.keys.set(item, key);
    }
    this.onTake(item);
    return item;
  }

  /** Trả lại một món đã lấy bằng `take`. */
  give(item: T): void {
    const key = this.keys.get(item);
    if (key === undefined) return;
    this.onGive(item);
    let list = this.free.get(key);
    if (!list) this.free.set(key, (list = []));
    if (!list.includes(item)) list.push(item);
  }

  /** Tổng số món đã tạo. */
  get created(): number {
    return this.made;
  }

  /** Số món đang rảnh. */
  get idle(): number {
    let n = 0;
    for (const list of this.free.values()) n += list.length;
    return n;
  }
}
