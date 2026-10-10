import type * as THREE from 'three/webgpu';

/**
 * Phản chiếu môi trường (IBL — ảnh bầu trời) CHỈ cho vật liệu thật sự cần: kim loại bóng (bồn inox, trạm biến áp,
 * xe máy), mặt nước. Gắn IBL cho cả cảnh (`scene.environment`) bắt MỌI điểm ảnh tra bản đồ môi trường nhiều lần —
 * đo được chiếm 25–40 % thời gian vẽ — trong khi với tường, đường, vỉa hè nó chỉ góp ánh sáng nền, việc mà một
 * đèn bán cầu làm gần như y hệt với vài phép tính (xem `envFill` trong environment.ts).
 */
const materials: THREE.MeshStandardNodeMaterial[] = [];
let envMap: THREE.Texture | null = null;
let intensity = 0.1;

/** Đánh dấu vật liệu cần phản chiếu bầu trời; trả lại chính vật liệu đó. */
export function reflective<T extends THREE.MeshStandardNodeMaterial>(material: T): T {
  materials.push(material);
  material.envMap = envMap;
  material.envMapIntensity = intensity;
  return material;
}

/** Ảnh môi trường (PMREM) dùng cho mọi vật liệu phản chiếu. */
export function setReflectionMap(texture: THREE.Texture | null): void {
  envMap = texture;
  for (const m of materials) {
    m.envMap = texture;
    m.needsUpdate = true;
  }
}

/** Cường độ phản chiếu theo giờ trong ngày (gọi mỗi khung hình; chỉ đổi uniform, không biên dịch lại shader). */
export function setReflectionIntensity(value: number): void {
  intensity = value;
  for (const m of materials) m.envMapIntensity = value;
}
