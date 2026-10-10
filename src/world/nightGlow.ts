import type * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Mức "đêm" dùng chung cho mọi vật liệu phát sáng ban đêm (cửa sổ, bảng hiệu, đèn đường, đèn xe…):
 * 0 = ban ngày, 1 = tối hẳn. Môi trường cập nhật mỗi khung hình theo đồng hồ game.
 */
export const nightUniform = uniform(0);

/** Độ ướt mặt đường 0..1 (mưa): nhựa đường, vỉa hè sẫm lại và bóng lên. */
export const wetUniform = uniform(0);

/**
 * Vật chỉ có tác dụng khi trời tối (vòm trời đêm, vũng đèn đường, vệt đèn pha xe): ban ngày chúng vẫn được vẽ với độ
 * sáng 0 — tốn công card đồ hoạ vô ích (vòm trời phủ kín màn hình) — nên ẩn hẳn khi mức đêm gần 0.
 */
const nightOnly: THREE.Object3D[] = [];

/** Ngưỡng mức đêm để hiện các vật chỉ dùng ban đêm. */
export const NIGHT_VISIBLE = 0.002;

export function addNightOnly(object: THREE.Object3D): void {
  nightOnly.push(object);
  object.visible = nightUniform.value > NIGHT_VISIBLE;
}

/** Gọi khi mức đêm đổi (môi trường gọi mỗi khung hình). */
export function setNightLevel(level: number): void {
  nightUniform.value = level;
  const show = level > NIGHT_VISIBLE;
  for (const o of nightOnly) o.visible = show;
}
