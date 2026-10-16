import type * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';

/**
 * Mức "đêm" dùng chung cho mọi vật liệu phát sáng ban đêm (cửa sổ, bảng hiệu, đèn đường, đèn xe…):
 * 0 = ban ngày, 1 = tối hẳn. Môi trường cập nhật mỗi khung hình theo đồng hồ game.
 */
export const nightUniform = uniform(0);

/** Tỉ lệ tiệm mặt đường đã kéo cửa cuốn 0..1 theo giờ (xem shopsClosedFraction trong timeOfDay.ts). */
export const closedUniform = uniform(0.15);

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

/**
 * Vật chỉ có tác dụng khi trời tối VÀ đường ướt (vệt bảng hiệu phản chiếu trên đường): đêm khô chúng sáng bằng 0
 * mà vẫn tốn công vẽ (vệt kéo dài về phía camera, phủ nhiều điểm ảnh) nên ẩn hẳn.
 */
const wetNightOnly: THREE.Object3D[] = [];

/** Ngưỡng độ ướt để hiện các vật chỉ dùng khi đường ướt. */
export const WET_VISIBLE = 0.002;

const wetNightVisible = (): boolean => nightUniform.value > NIGHT_VISIBLE && wetUniform.value > WET_VISIBLE;

export function addWetNightOnly(object: THREE.Object3D): void {
  wetNightOnly.push(object);
  object.visible = wetNightVisible();
}

function showWetNight(): void {
  const show = wetNightVisible();
  for (const o of wetNightOnly) o.visible = show;
}

/** Gọi khi mức đêm đổi (môi trường gọi mỗi khung hình). */
export function setNightLevel(level: number): void {
  nightUniform.value = level;
  const show = level > NIGHT_VISIBLE;
  for (const o of nightOnly) o.visible = show;
  showWetNight();
}

/** Gọi khi độ ướt mặt đường đổi (game gọi mỗi khung hình theo thời tiết). */
export function setWetLevel(level: number): void {
  wetUniform.value = level;
  showWetNight();
}
