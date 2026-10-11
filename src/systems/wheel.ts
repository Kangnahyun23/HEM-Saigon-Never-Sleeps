import { ITEMS, type Inventory, type ItemDef, type ItemId } from './inventory';

/**
 * Vòng chọn đồ (giữ Tab, thuần logic, có unit test): tay không, từng loại vũ khí trong balo, món ăn hồi nhiều máu nhất,
 * thuốc tốt nhất. Chọn ô theo hướng rê chuột (như cần analog), ô 0 ở đỉnh, đi theo chiều kim đồng hồ.
 */

export type WheelEntry =
  | { readonly kind: 'hand'; readonly label: string }
  | { readonly kind: 'weapon' | 'food' | 'medicine'; readonly id: ItemId; readonly label: string; readonly count: number };

/** Tối đa ô trên vòng. */
export const WHEEL_SLOTS = 8;

export function buildWheel(inv: Inventory): WheelEntry[] {
  const out: WheelEntry[] = [{ kind: 'hand', label: 'Tay không' }];
  const seen = new Set<ItemId>();
  for (const s of inv.slots) {
    if (!s || seen.has(s.id) || ITEMS[s.id].kind !== 'weapon') continue;
    seen.add(s.id);
    out.push({ kind: 'weapon', id: s.id, label: ITEMS[s.id].name, count: inv.count(s.id) });
  }
  for (const kind of ['food', 'medicine'] as const) {
    let best: ItemId | null = null;
    let bestHeal = -1;
    for (const s of inv.slots) {
      if (!s) continue;
      const def: ItemDef = ITEMS[s.id];
      if (def.kind === kind && (def.heal ?? 0) > bestHeal) {
        best = s.id;
        bestHeal = def.heal ?? 0;
      }
    }
    if (best) out.push({ kind, id: best, label: ITEMS[best].name, count: inv.count(best) });
  }
  return out.slice(0, WHEEL_SLOTS);
}

/**
 * Ô đang trỏ theo vector (dx, dy) tích luỹ từ chuột (dy dương = kéo xuống). Trong vùng chết thì giữ ô cũ (`current`).
 * Ô 0 ở đỉnh, tăng theo chiều kim đồng hồ.
 */
export function sectorAt(dx: number, dy: number, count: number, current: number, deadzone = 24): number {
  if (count <= 0) return -1;
  if (dx * dx + dy * dy < deadzone * deadzone) return current;
  const angle = Math.atan2(dx, -dy); // 0 = lên, π/2 = phải
  const turn = (angle + Math.PI * 2) % (Math.PI * 2);
  const sector = (Math.PI * 2) / count;
  return Math.floor((turn + sector / 2) / sector) % count;
}
