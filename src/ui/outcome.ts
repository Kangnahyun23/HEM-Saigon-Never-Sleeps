/**
 * Màn hình kết cục kiểu GTA: "BỊ BẮT" (công an) / "GỤC" (hết máu) — chữ lớn giữa màn hình, khung hình mất màu, rồi
 * mờ đen để chuyển cảnh (đưa về đồn / trạm y tế). Game điều khiển nhịp (theo thời gian trong game, chạy được cả khi test).
 */
export type OutcomeKind = 'busted' | 'wasted';

const TITLES: Record<OutcomeKind, { title: string; sub: string }> = {
  busted: { title: 'BỊ BẮT', sub: 'Mời về phường làm việc' },
  wasted: { title: 'GỤC', sub: 'Có người gọi xe cấp cứu…' },
};

export class OutcomeScreen {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly sub: HTMLElement;
  private readonly black: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-outcome';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="outcome-band"><b data-outcome-title></b><small data-outcome-sub></small></div>';
    this.black = document.createElement('div');
    this.black.className = 'hud-black';
    parent.append(this.root, this.black);
    this.title = this.root.querySelector('[data-outcome-title]') as HTMLElement;
    this.sub = this.root.querySelector('[data-outcome-sub]') as HTMLElement;
  }

  show(kind: OutcomeKind): void {
    const t = TITLES[kind];
    this.title.textContent = t.title;
    this.sub.textContent = t.sub;
    this.root.className = `hud-outcome ${kind}`;
    this.root.hidden = false;
    // Khung hình mất màu (lọc CSS trên canvas — trình duyệt ghép lớp, không tốn lượt vẽ).
    document.body.classList.add('outcome-desat');
  }

  /** Mờ đen toàn màn hình (true) / sáng lại (false) — chuyển cảnh có hiệu ứng CSS. */
  setBlack(on: boolean): void {
    this.black.classList.toggle('on', on);
  }

  hide(): void {
    this.root.hidden = true;
    document.body.classList.remove('outcome-desat');
  }
}
