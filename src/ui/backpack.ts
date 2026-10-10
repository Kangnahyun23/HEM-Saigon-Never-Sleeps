import { ITEMS, type Inventory, type ItemDef, type ItemKind } from '@/systems/inventory';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/** Ký hiệu loại đồ trên ô (chữ + màu riêng từng món — không cần ảnh). */
const KIND_MARK: Record<ItemKind, string> = { food: 'ĂN', medicine: 'Y', weapon: 'VK', quest: 'HÀNG', misc: 'GT' };
const COLS = 4;

/**
 * Giao diện balo (phím I): lưới ô đồ, chọn bằng chuột hoặc phím mũi tên, E / Enter dùng, X / Delete vứt, I / Esc đóng.
 * Game vẫn chạy khi mở balo (như điện thoại).
 */
export class Backpack {
  readonly root: HTMLElement;
  open = false;
  private selected = 0;
  private inventory: Inventory | null = null;
  private onUse: ((index: number) => void) | null = null;
  private onDrop: ((index: number) => void) | null = null;
  private readonly grid: HTMLElement;
  private readonly info: HTMLElement;
  private readonly title: HTMLElement;
  private dirty = true;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-backpack panel';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="bp-head"><b data-bp-title>Balo</b><span><kbd>I</kbd> đóng</span></div>
      <div class="bp-grid" data-bp-grid></div>
      <div class="bp-info" data-bp-info></div>
      <div class="bp-keys"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> chọn · <kbd>E</kbd> dùng · <kbd>X</kbd> vứt</div>`;
    parent.appendChild(this.root);
    this.grid = this.root.querySelector('[data-bp-grid]') as HTMLElement;
    this.info = this.root.querySelector('[data-bp-info]') as HTMLElement;
    this.title = this.root.querySelector('[data-bp-title]') as HTMLElement;
    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const slot = el.closest('[data-slot]') as HTMLElement | null;
      if (slot) this.select(Number(slot.dataset.slot));
      if (el.closest('[data-use]')) this.useSelected();
      if (el.closest('[data-drop]')) this.dropSelected();
      // Vẽ lại ngay (kể cả khi game đang tạm dừng).
      this.update();
    });
  }

  setInventory(inventory: Inventory, onUse: (index: number) => void, onDrop: (index: number) => void): void {
    this.inventory = inventory;
    this.onUse = onUse;
    this.onDrop = onDrop;
    this.dirty = true;
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.hidden = !open;
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.dirty = true;
      this.update();
    }
  }

  /** Đồ trong balo đổi (nhặt, mua, dùng…) ⇒ vẽ lại khi đang mở. */
  invalidate(): void {
    this.dirty = true;
  }

  select(index: number): void {
    const cap = this.inventory?.capacity ?? 0;
    if (cap === 0) return;
    this.selected = ((index % cap) + cap) % cap;
    this.dirty = true;
  }

  /** Di chuyển ô chọn theo lưới (dx: trái/phải, dy: lên/xuống). */
  move(dx: number, dy: number): void {
    this.select(this.selected + dx + dy * COLS);
  }

  useSelected(): void {
    this.onUse?.(this.selected);
    this.dirty = true;
  }

  dropSelected(): void {
    this.onDrop?.(this.selected);
    this.dirty = true;
  }

  update(): void {
    if (!this.open || !this.dirty || !this.inventory) return;
    this.dirty = false;
    const inv = this.inventory;
    const used = inv.slots.filter(Boolean).length;
    this.title.textContent = `Balo · ${used}/${inv.capacity} ô`;
    this.grid.innerHTML = inv.slots
      .map((s, i) => {
        const cls = `bp-slot${i === this.selected ? ' on' : ''}${s ? '' : ' empty'}`;
        if (!s) return `<button type="button" class="${cls}" data-slot="${i}"></button>`;
        const def: ItemDef = ITEMS[s.id];
        const wear = s.durability !== undefined && def.durability ? `<u style="transform:scaleX(${s.durability / def.durability})"></u>` : '';
        return `<button type="button" class="${cls}" data-slot="${i}" title="${esc(def.name)}"><span class="bp-icon" style="background:${def.color}">${KIND_MARK[def.kind]}</span><small>${esc(def.name)}</small>${s.count > 1 ? `<b>×${s.count}</b>` : ''}${wear}</button>`;
      })
      .join('');
    const s = inv.slots[this.selected];
    if (!s) {
      this.info.innerHTML = '<p class="muted">Ô trống.</p>';
      return;
    }
    const def: ItemDef = ITEMS[s.id];
    const usable = def.kind === 'food' || def.kind === 'medicine';
    const droppable = def.kind !== 'quest' && def.kind !== 'misc';
    this.info.innerHTML = `<b>${esc(def.name)}</b><p>${esc(def.desc)}</p><div class="bp-actions">${usable ? '<button type="button" data-use>Dùng (E)</button>' : ''}${
      droppable ? '<button type="button" class="ghost" data-drop>Vứt (X)</button>' : '<span class="muted">Đồ quan trọng — không vứt được</span>'
    }</div>`;
  }
}
