import { ITEMS } from '@/systems/inventory';
import type { WheelEntry } from '@/systems/wheel';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const MARK: Record<WheelEntry['kind'], string> = { hand: 'TAY', weapon: 'VK', food: 'ĂN', medicine: 'Y' };

/**
 * Vòng chọn đồ (giữ Tab): các ô xếp thành vòng tròn giữa màn hình, ô đang trỏ sáng lên, giữa vòng ghi tên + số lượng.
 * Chỉ vẽ lại khi mở hoặc khi ô đang trỏ đổi.
 */
export class WeaponWheel {
  readonly root: HTMLElement;
  private entries: WheelEntry[] = [];
  private shown = -2;
  private readonly ring: HTMLElement;
  private readonly center: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-wheel';
    this.root.hidden = true;
    this.root.innerHTML = '<div class="wheel-ring" data-wheel-ring></div><div class="wheel-center" data-wheel-center></div>';
    parent.appendChild(this.root);
    this.ring = this.root.querySelector('[data-wheel-ring]') as HTMLElement;
    this.center = this.root.querySelector('[data-wheel-center]') as HTMLElement;
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(entries: WheelEntry[], selected: number, equippedLabel: string): void {
    this.entries = entries;
    this.root.hidden = false;
    const n = entries.length;
    this.ring.innerHTML = entries
      .map((e, i) => {
        // Ô 0 ở đỉnh, theo chiều kim đồng hồ (khớp sectorAt).
        const a = (i / n) * Math.PI * 2;
        const x = Math.sin(a) * 118;
        const y = -Math.cos(a) * 118;
        const color = e.kind === 'hand' ? '#6b7280' : ITEMS[e.id].color;
        const count = e.kind !== 'hand' && e.count > 1 ? `<b>×${e.count}</b>` : '';
        return `<div class="wheel-item" data-wheel-item="${i}" style="transform:translate(${x.toFixed(1)}px,${y.toFixed(1)}px)"><span style="background:${color}">${MARK[e.kind]}</span><small>${esc(e.label)}</small>${count}</div>`;
      })
      .join('');
    this.shown = -2;
    this.select(selected, equippedLabel);
  }

  select(index: number, equippedLabel: string): void {
    if (index === this.shown) return;
    this.shown = index;
    this.ring.querySelectorAll('.wheel-item').forEach((el, i) => el.classList.toggle('on', i === index));
    const e = this.entries[index];
    this.center.innerHTML = e
      ? `<b>${esc(e.label)}</b><small>${e.kind === 'weapon' ? 'Cầm lên tay' : e.kind === 'hand' ? 'Cất vũ khí' : `Dùng 1 (${e.kind === 'food' ? 'ăn' : 'băng bó'})`}</small>`
      : `<b>${esc(equippedLabel)}</b><small>Rê chuột để chọn</small>`;
  }

  hide(): void {
    this.root.hidden = true;
  }
}
