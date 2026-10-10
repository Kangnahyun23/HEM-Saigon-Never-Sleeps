import type { AnimationName } from '@/assets/manifest';
import type { ItemId } from './inventory';

/**
 * Cận chiến (thuần logic, có unit test): đòn nhẹ 3 nhịp combo, đòn mạnh, tầm + góc đánh trúng, sát thương theo vũ khí.
 * Không phụ thuộc Three/Rapier — game chỉ hỏi "đòn này có trúng ai, mất bao nhiêu máu".
 */

export interface AttackDef {
  /** Động tác (clip) của đòn. */
  readonly clip: AnimationName;
  readonly damage: number;
  /** Tầm với tính từ tâm người đánh (m). */
  readonly reach: number;
  /** Nửa góc quạt phía trước (rad). */
  readonly arc: number;
  /** Thời điểm đòn chạm (s, từ lúc ra đòn). */
  readonly hitAt: number;
  /** Tổng thời gian đòn (s) — hết mới ra đòn tiếp. */
  readonly duration: number;
  /** Đánh ngã (đòn mạnh / nhịp cuối combo). */
  readonly knock: boolean;
}

/** Chỉ số vũ khí cận chiến: hệ số sát thương, tầm cộng thêm, tốc độ ra đòn (×). */
export const WEAPON_STATS: Record<'fists' | Extract<ItemId, 'maTau' | 'gaySat' | 'daoBam' | 'conNhiKhuc'>, { damage: number; reach: number; speed: number }> = {
  fists: { damage: 1, reach: 0, speed: 1 },
  maTau: { damage: 3.2, reach: 0.55, speed: 0.8 },
  gaySat: { damage: 2.3, reach: 0.6, speed: 0.85 },
  daoBam: { damage: 2.6, reach: 0.1, speed: 1.25 },
  conNhiKhuc: { damage: 1.9, reach: 0.35, speed: 1.15 },
};

const FIST_COMBO: readonly AttackDef[] = [
  { clip: 'jab', damage: 8, reach: 1.05, arc: 0.7, hitAt: 0.16, duration: 0.42, knock: false },
  { clip: 'cross', damage: 10, reach: 1.1, arc: 0.7, hitAt: 0.2, duration: 0.48, knock: false },
  { clip: 'hook', damage: 14, reach: 1.1, arc: 0.9, hitAt: 0.28, duration: 0.62, knock: true },
];
const BLADE_COMBO: readonly AttackDef[] = [
  { clip: 'slashA', damage: 9, reach: 1.15, arc: 0.95, hitAt: 0.22, duration: 0.55, knock: false },
  { clip: 'slashB', damage: 10, reach: 1.15, arc: 0.95, hitAt: 0.24, duration: 0.6, knock: false },
  { clip: 'slashC', damage: 13, reach: 1.2, arc: 1.1, hitAt: 0.3, duration: 0.72, knock: true },
];
const FIST_HEAVY: AttackDef = { clip: 'hook', damage: 18, reach: 1.15, arc: 0.8, hitAt: 0.34, duration: 0.8, knock: true };
const BLADE_HEAVY: AttackDef = { clip: 'slashC', damage: 16, reach: 1.25, arc: 1.2, hitAt: 0.36, duration: 0.85, knock: true };

/** Nghỉ quá ngần này (s) sau đòn trước thì combo về nhịp đầu. */
export const COMBO_WINDOW = 0.7;

export function weaponStats(weapon: ItemId | null): { damage: number; reach: number; speed: number } {
  return weapon && weapon in WEAPON_STATS ? WEAPON_STATS[weapon as keyof typeof WEAPON_STATS] : WEAPON_STATS.fists;
}

/** Nhịp combo kế tiếp (0..2) — vòng lại sau nhịp 3, về 0 nếu nghỉ quá COMBO_WINDOW. */
export function nextCombo(prev: number, sinceLast: number): number {
  return sinceLast > COMBO_WINDOW ? 0 : (prev + 1) % 3;
}

/** Đòn thực tế theo vũ khí đang cầm: sát thương × hệ số, tầm + thêm, thời gian ÷ tốc độ. */
export function attackFor(weapon: ItemId | null, combo: number, heavy: boolean): AttackDef {
  const stats = weaponStats(weapon);
  // Cầm vũ khí (mã tấu, gậy, dao, côn) thì dùng động tác vung; tay không thì đấm.
  const armed = weapon !== null;
  const base = heavy ? (armed ? BLADE_HEAVY : FIST_HEAVY) : (armed ? BLADE_COMBO : FIST_COMBO)[combo % 3]!;
  return {
    ...base,
    damage: Math.round(base.damage * stats.damage),
    reach: base.reach + stats.reach,
    hitAt: base.hitAt / stats.speed,
    duration: base.duration / stats.speed,
  };
}

/** Điểm (tx, tz) có nằm trong quạt đánh của người ở (ax, az) nhìn hướng yaw không. */
export function inStrike(ax: number, az: number, yaw: number, reach: number, arc: number, tx: number, tz: number, targetRadius = 0.3): boolean {
  const dx = tx - ax;
  const dz = tz - az;
  const dist = Math.hypot(dx, dz);
  if (dist > reach + targetRadius) return false;
  if (dist < 0.35) return true;
  const fwd = (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / dist;
  return fwd >= Math.cos(arc);
}

export type HitResult = 'hurt' | 'down' | 'dead';

/** Máu còn lại + phản ứng sau một đòn (đòn ngã hoặc mất ≥ 35 % máu một lần ⇒ ngã). */
export function resolveHit(health: number, maxHealth: number, damage: number, knock: boolean): { health: number; result: HitResult } {
  const left = Math.max(0, health - damage);
  if (left <= 0) return { health: 0, result: 'dead' };
  return { health: left, result: knock || damage >= maxHealth * 0.35 ? 'down' : 'hurt' };
}
