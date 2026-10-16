/** Phím mà trình duyệt có hành động riêng (cuộn trang, chuyển ô, trang trợ giúp F1) — game chặn lại. */
const BROWSER_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1']);

function anyIn(set: ReadonlySet<string>, a: string, b?: string, c?: string, d?: string): boolean {
  return set.has(a) || (b !== undefined && set.has(b)) || (c !== undefined && set.has(c)) || (d !== undefined && set.has(d));
}

/**
 * Bàn phím + chuột. Phím theo `KeyboardEvent.code` (không phụ thuộc bố cục phím / bộ gõ tiếng Việt).
 * Chuột: bấm vào khung game để khoá con trỏ (pointer lock), rê chuột xoay camera, cuộn để zoom.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  /** Độ dời chuột cộng dồn từ khung hình trước (px). */
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  /** Lần cuối người chơi chủ động xoay camera (giây, theo performance.now). */
  lastLookTime = -Infinity;
  private dragging = false;

  constructor(
    target: Window = window,
    private readonly element: HTMLElement | null = null,
  ) {
    target.addEventListener('keydown', (e) => {
      // F1: bảng phím của game (không mở trang trợ giúp của trình duyệt).
      if (BROWSER_KEYS.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());

    const el = element;
    if (el) {
      el.addEventListener('click', () => {
        if (document.pointerLockElement !== el) void el.requestPointerLock?.()?.catch?.(() => undefined);
      });
      // Không khoá được con trỏ (iframe, trình duyệt chặn): kéo chuột trái để xoay.
      // Đã khoá con trỏ: nút chuột thành "phím" Mouse0 (trái — đánh nhẹ) / Mouse2 (phải — đánh mạnh).
      el.addEventListener('mousedown', (e) => {
        if (document.pointerLockElement === el) {
          const code = `Mouse${e.button}`;
          if (!this.down.has(code)) this.pressed.add(code);
          this.down.add(code);
        } else this.dragging = true;
      });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      target.addEventListener('mouseup', (e) => {
        this.dragging = false;
        this.down.delete(`Mouse${e.button}`);
      });
      target.addEventListener('blur', () => (this.dragging = false));
      target.addEventListener('mousemove', (e) => {
        if (this.dragging && (e.buttons & 1) === 0) this.dragging = false; // nhả chuột ngoài cửa sổ
        if (document.pointerLockElement === el || this.dragging) {
          this.mouseDX += e.movementX;
          this.mouseDY += e.movementY;
          this.lastLookTime = performance.now() / 1000;
        }
      });
      el.addEventListener(
        'wheel',
        (e) => {
          // Bàn di chuột gửi nhiều sự kiện nhỏ: quy đổi theo độ lớn thay vì đếm mỗi sự kiện là một nấc.
          const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
          this.wheel += Math.max(-1, Math.min(1, px / 100));
          e.preventDefault();
        },
        { passive: false },
      );
    }
  }

  get pointerLocked(): boolean {
    return this.element !== null && document.pointerLockElement === this.element;
  }

  // Tối đa 4 mã phím, không dùng tham số rest: gọi nhiều lần mỗi khung hình, rest / closure là rác bộ nhớ.
  isDown(a: string, b?: string, c?: string, d?: string): boolean {
    return anyIn(this.down, a, b, c, d);
  }

  /** Đúng một lần cho mỗi lần nhấn; gọi `endFrame()` cuối mỗi khung hình. */
  wasPressed(a: string, b?: string, c?: string, d?: string): boolean {
    return anyIn(this.pressed, a, b, c, d);
  }

  /** Trục -1..1 từ hai nhóm phím. */
  axis(negative: readonly string[], positive: readonly string[]): number {
    return (this.anyDown(positive) ? 1 : 0) - (this.anyDown(negative) ? 1 : 0);
  }

  private anyDown(codes: readonly string[]): boolean {
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i]!)) return true;
    return false;
  }

  /** Giả lập phím (dùng cho test e2e / điều khiển cảm ứng sau này). */
  setKey(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    } else this.down.delete(code);
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
  }
}
