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
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1'].includes(e.code)) e.preventDefault();
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
      el.addEventListener('mousedown', () => (this.dragging = true));
      target.addEventListener('mouseup', () => (this.dragging = false));
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

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  /** Đúng một lần cho mỗi lần nhấn; gọi `endFrame()` cuối mỗi khung hình. */
  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Trục -1..1 từ hai nhóm phím. */
  axis(negative: string[], positive: string[]): number {
    return (this.isDown(...positive) ? 1 : 0) - (this.isDown(...negative) ? 1 : 0);
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
