import * as THREE from 'three/webgpu';

export type Backend = 'WebGPU' | 'WebGL2';

/**
 * Tạo WebGPURenderer. Trình duyệt không có WebGPU (hoặc thêm `?webgl` vào URL) sẽ tự lùi về WebGL2.
 */
export async function createRenderer(parent: HTMLElement): Promise<{ renderer: THREE.WebGPURenderer; backend: Backend }> {
  const forceWebGL = new URLSearchParams(location.search).has('webgl');
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  await renderer.init();
  parent.appendChild(renderer.domElement);

  const backend: Backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  return { renderer, backend };
}
