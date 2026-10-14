import * as THREE from 'three/webgpu';

/**
 * Làm nóng pipeline lúc tải. Lần đầu một loại vật được vẽ (ô tô đậu lọt vào tầm, vật chỉ hiện ban đêm, mưa, xe công an,
 * mẫu người mới, lượt bloom khi trời vừa tối…), trình duyệt phải biên dịch shader ngay giữa lúc chơi — trên D3D11 luồng
 * chính đứng chờ GPU 60–90 ms mỗi lần (riêng lượt bloom đầu tiên gần 1 giây). Vẽ trước MỌI vật một lần khi màn hình tải
 * còn che.
 */

/**
 * Tạm hiện mọi vật trong cây: vật đang ẩn, vật ngoài khung nhìn (tắt frustumCulled), InstancedMesh đang 0 bản (cho 1 bản).
 * Trả về hàm khôi phục đúng trạng thái cũ.
 */
export function revealAll(root: THREE.Object3D): () => void {
  const hidden: THREE.Object3D[] = [];
  const culled: THREE.Object3D[] = [];
  const empty: THREE.InstancedMesh[] = [];
  root.traverse((o) => {
    if (!o.visible) {
      hidden.push(o);
      o.visible = true;
    }
    if (o.frustumCulled) {
      culled.push(o);
      o.frustumCulled = false;
    }
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh && inst.count === 0 && inst.instanceMatrix.count > 0) {
      empty.push(inst);
      inst.count = 1;
    }
  });
  return () => {
    for (const o of hidden) o.visible = false;
    for (const o of culled) o.frustumCulled = true;
    for (const m of empty) m.count = 0;
  };
}

export interface WarmUpOptions {
  /** Vật chưa có trong cảnh nhưng sẽ xuất hiện lúc chơi (mỗi mẫu người một thân…) — tạm thêm vào rồi bỏ ra. */
  samples?: THREE.Object3D;
  /** Lượt vẽ khác cần pipeline riêng (bloom vẽ vào ảnh HDR — định dạng khác ⇒ pipeline khác). */
  extra?: () => void;
}

/**
 * Vẽ thật một lần với mọi vật hiện ra: tạo pipeline cho cả lượt vẽ chính lẫn lượt bóng đổ. Vẽ đồng bộ (compileAsync
 * chậm gấp nhiều lần trên Chrome / D3D11 và không làm lượt bóng) ở độ phân giải rất thấp — pipeline không phụ thuộc cỡ
 * khung hình.
 */
export function warmUpPipelines(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, options: WarmUpOptions = {}): void {
  const ratio = renderer.getPixelRatio();
  if (options.samples) scene.add(options.samples);
  const restore = revealAll(scene);
  try {
    renderer.setPixelRatio(Math.min(ratio, 0.25));
    // Bóng đổ chỉ vẽ một lần mỗi camera mỗi khung (ShadowNode), mà trước vòng lặp hoạt ảnh khung chưa sang ⇒ lượt này dùng
    // bản sao camera để lượt `extra` (bloom, camera thật) vẫn vẽ bóng — bóng trong lượt bloom cũng có pipeline riêng.
    renderer.render(scene, camera.clone());
    options.extra?.();
  } finally {
    restore();
    if (options.samples) scene.remove(options.samples);
    renderer.setPixelRatio(ratio);
  }
}

/**
 * Chờ GPU làm xong mọi việc đã gửi — gồm cả biên dịch shader. Trên Chrome / D3D11 lệnh tạo pipeline trả về ngay, tiến
 * trình GPU biên dịch dần phía sau: lần đầu ~7 giây (lần sau Chrome đã lưu shader, ~2,5 giây). Không chờ thì khung hình
 * đầu tiên cần đồng bộ với GPU đứng hình chừng ấy — ngay sau khi màn hình tải vừa tắt. WebGL2 thì không cần chờ.
 */
export async function gpuIdle(renderer: THREE.WebGPURenderer): Promise<void> {
  const device = (renderer.backend as { device?: { queue: { onSubmittedWorkDone(): Promise<void> } } }).device;
  if (device) await device.queue.onSubmittedWorkDone();
}
