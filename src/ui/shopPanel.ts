import { formatVnd } from '@/systems/wallet';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Một dòng hàng trong bảng: tên, mô tả, giá, ghi chú ("Có 2", "Đã có"), không mua / bán được thì mờ. */
export interface ShopRow {
  readonly key: string;
  readonly name: string;
  readonly desc: string;
  readonly color: string;
  readonly price: number;
  /** Giá gốc khi đã mặc cả được (gạch ngang). */
  readonly listPrice?: number;
  readonly note?: string;
  readonly disabled?: boolean;
}

export type ShopMode = 'buy' | 'sell';

/**
 * Bảng mua bán trong cửa hàng (phím E khi đứng trong tiệm): danh sách hàng, chọn bằng chuột / ↑ ↓, E / Enter mua (bán),
 * B mặc cả, Tab chuyển Mua ⇄ Bán (tiệm cầm đồ), Esc đóng. Chỉ hiển thị — game quyết định mua được không, giá bao nhiêu.
 */
export class ShopPanel {
  readonly root: HTMLElement;
  open = false;
  mode: ShopMode = 'buy';
  private rows: readonly ShopRow[] = [];
  private selected = 0;
  private canSell = false;
  private readonly list: HTMLElement;
  private readonly head: HTMLElement;
  private readonly talk: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly tabs: HTMLElement;
  /** Game gán: bấm mua / bán dòng `key`, bấm mặc cả, đổi chế độ, đóng. */
  onConfirm: ((key: string, mode: ShopMode) => void) | null = null;
  onBargain: (() => void) | null = null;
  onMode: ((mode: ShopMode) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-shop panel';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="shop-head" data-shop-head></div>
      <div class="shop-talk" data-shop-talk></div>
      <div class="shop-tabs" data-shop-tabs></div>
      <div class="shop-list" data-shop-list></div>
      <div class="shop-foot" data-shop-foot></div>
      <div class="shop-keys"><kbd>↑</kbd><kbd>↓</kbd> chọn · <kbd>E</kbd> mua · <kbd>B</kbd> mặc cả · <kbd>Esc</kbd> đi ra</div>`;
    parent.appendChild(this.root);
    const q = (s: string): HTMLElement => this.root.querySelector(s) as HTMLElement;
    this.head = q('[data-shop-head]');
    this.talk = q('[data-shop-talk]');
    this.tabs = q('[data-shop-tabs]');
    this.list = q('[data-shop-list]');
    this.foot = q('[data-shop-foot]');
    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const row = el.closest('[data-shop-row]') as HTMLElement | null;
      if (row) {
        const i = Number(row.dataset.shopRow);
        if (i === this.selected) this.confirm();
        else this.select(i);
      }
      if (el.closest('[data-shop-bargain]')) this.onBargain?.();
      const tab = el.closest('[data-shop-mode]') as HTMLElement | null;
      if (tab) this.setMode(tab.dataset.shopMode as ShopMode);
    });
  }

  /** Mở bảng của tiệm `title`; `canSell` = tiệm có mua lại đồ (cầm đồ). */
  show(title: string, color: string, canSell: boolean): void {
    this.open = true;
    this.root.hidden = false;
    this.root.style.borderTopColor = color;
    this.head.innerHTML = `<b>${esc(title)}</b><span><kbd>Esc</kbd> đi ra</span>`;
    this.canSell = canSell;
    this.mode = 'buy';
    this.selected = 0;
    this.renderTabs();
  }

  hide(): void {
    this.open = false;
    this.root.hidden = true;
  }

  setTalk(text: string): void {
    this.talk.textContent = `“${text}”`;
  }

  setRows(rows: readonly ShopRow[], cash: number, bargained: string): void {
    this.rows = rows;
    this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
    this.list.innerHTML =
      rows.length === 0
        ? `<p class="muted">${this.mode === 'sell' ? 'Không có món nào tiệm này mua lại.' : 'Hết hàng.'}</p>`
        : rows
            .map(
              (r, i) => `<button type="button" class="shop-row${i === this.selected ? ' on' : ''}${r.disabled ? ' off' : ''}" data-shop-row="${i}">
                <i style="background:${r.color}"></i>
                <span><b>${esc(r.name)}</b><small>${esc(r.desc)}</small></span>
                <em>${r.listPrice && r.listPrice !== r.price ? `<s>${formatVnd(r.listPrice)}</s>` : ''}${formatVnd(r.price)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</em>
              </button>`,
            )
            .join('');
    this.foot.innerHTML = `<span>Tiền mặt: <b>${formatVnd(cash)}</b></span>${this.mode === 'buy' ? `<button type="button" data-shop-bargain${bargained ? ' disabled' : ''}>${bargained ? esc(bargained) : 'Mặc cả (B)'}</button>` : ''}`;
  }

  move(delta: number): void {
    if (this.rows.length === 0) return;
    this.select((this.selected + delta + this.rows.length) % this.rows.length);
  }

  select(i: number): void {
    this.selected = Math.max(0, Math.min(this.rows.length - 1, i));
    this.list.querySelectorAll('.shop-row').forEach((el, k) => el.classList.toggle('on', k === this.selected));
  }

  confirm(): void {
    const r = this.rows[this.selected];
    if (r && !r.disabled) this.onConfirm?.(r.key, this.mode);
  }

  setMode(mode: ShopMode): void {
    if (mode === this.mode || (mode === 'sell' && !this.canSell)) return;
    this.mode = mode;
    this.selected = 0;
    this.renderTabs();
    this.onMode?.(mode);
  }

  private renderTabs(): void {
    this.tabs.hidden = !this.canSell;
    this.tabs.innerHTML = this.canSell
      ? `<button type="button" data-shop-mode="buy" class="${this.mode === 'buy' ? 'on' : ''}">Mua</button><button type="button" data-shop-mode="sell" class="${this.mode === 'sell' ? 'on' : ''}">Bán / cầm đồ <kbd>Tab</kbd></button>`
      : '';
  }
}
