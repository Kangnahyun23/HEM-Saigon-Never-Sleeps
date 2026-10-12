import type { CharacterId } from '@/assets/manifest';
import { createRng } from '@/core/random';

/**
 * Mẫu người đi đường (thuần logic — dùng chung cho mô phỏng và hình vẽ). Mô phỏng cần biết ai là thanh niên (có thể
 * xông vào đánh trả), ai lớn tuổi (hay gọi báo hơn); hình vẽ dùng đúng mẫu đó (CC0, xem CREDITS.md).
 */
export interface CivilianLook {
  readonly id: CharacterId;
  readonly female: boolean;
  readonly height: readonly [number, number];
  /** Thanh niên: một số sẽ xông vào đánh trả. */
  readonly young: boolean;
  readonly old: boolean;
}

export const CIVILIANS: readonly CivilianLook[] = [
  { id: 'man-shirt', female: false, height: [1.62, 1.74], young: true, old: false },
  { id: 'man-tee', female: false, height: [1.62, 1.74], young: true, old: false },
  { id: 'man-polo', female: false, height: [1.62, 1.74], young: true, old: false },
  { id: 'old-man', female: false, height: [1.58, 1.68], young: false, old: true },
  { id: 'woman-young', female: true, height: [1.52, 1.64], young: false, old: false },
  { id: 'woman-style', female: true, height: [1.52, 1.64], young: false, old: false },
  { id: 'old-woman', female: true, height: [1.48, 1.58], young: false, old: true },
];

/** Hạt giống hình dáng của người đi bộ `id` ở lần xuất hiện thứ `generation` (hình vẽ dùng tiếp chuỗi này). */
export const lookSeed = (id: number, generation: number): number => id * 4099 + generation * 7919 + 101;

/** Chỉ số mẫu người (trong CIVILIANS) — lượt rút ngẫu nhiên đầu tiên của chuỗi lookSeed. */
export function lookOf(id: number, generation: number): number {
  return Math.floor(createRng(lookSeed(id, generation))() * CIVILIANS.length);
}
