import * as THREE from 'three/webgpu';

export type Backend = 'WebGPU' | 'WebGL2';

/** Tỉ lệ điểm ảnh cao nhất game dùng (màn hình Retina/4K có devicePixelRatio 2–3). */
export const MAX_PIXEL_RATIO = 1.5;

/**
 * Tạo WebGPURenderer. Trình duyệt không có WebGPU (hoặc thêm `?webgl` vào URL) sẽ tự lùi về WebGL2.
 */
export async function createRenderer(parent: HTMLElement): Promise<{ renderer: THREE.WebGPURenderer; backend: Backend; maxPixelRatio: number }> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  // Màn hình độ nét cao: vẽ tối đa 1,5× là đủ nét, và không cần khử răng cưa MSAA (tốn gấp 4 lần mẫu điểm ảnh).
  const maxPixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  const renderer = new THREE.WebGPURenderer({ antialias: window.devicePixelRatio < 1.5, forceWebGL });
  renderer.setPixelRatio(maxPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap đã bỏ trong WebGPURenderer (tự đổi về PCF kèm cảnh báo).
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  await renderer.init();
  parent.appendChild(renderer.domElement);

  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  return { renderer, backend, maxPixelRatio };
}
