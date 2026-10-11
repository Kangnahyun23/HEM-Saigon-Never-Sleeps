import * as THREE from 'three/webgpu';
import type { Pickups } from '@/systems/pickups';

/** Màu mũ bảo hiểm "thời trang" hay gặp ngoài phố. */
const HELMET_COLORS = ['#e7c22d', '#d8342c', '#f2f2f2', '#2b2b2f', '#3f7fd1', '#e88aa8', '#5aa469'];
/** Màu đã đổi sang tuyến tính (như setColorAt) để chép thẳng vào bộ đệm. */
const HELMET_RGB: ReadonlyArray<readonly [number, number, number]> = HELMET_COLORS.map((h) => {
  const c = new THREE.Color(h);
  return [c.r, c.g, c.b] as const;
});
/** Chỉ vẽ mũ trong bán kính này quanh camera (xe đậu ở xa cũng đã ẩn). */
const RANGE = 100;
/** Camera đi quá ngần này (m) thì chọn lại các mũ cần vẽ. */
const REFRESH = 8;

/**
 * Mũ bảo hiểm để trên yên xe đậu (đồ nhặt được): MỘT InstancedMesh, chỉ chép các mũ còn (chưa bị lấy) và ở gần
 * camera lên đầu bộ đệm. Chỉ cập nhật khi có mũ bị lấy / có lại hoặc camera đi xa — không tạo đối tượng mỗi khung.
 */
export class PickupView {
  readonly mesh: THREE.InstancedMesh;
  /** Chỉ số vật nhặt (trong Pickups) ứng với từng mũ. */
  private readonly ids: number[] = [];
  private readonly matrices: Float32Array;
  private version = -1;
  private lastX = Infinity;
  private lastZ = Infinity;

  constructor(private readonly pickups: Pickups) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    pickups.spots.forEach((spot, i) => {
      if (spot.item === 'muBaoHiem') this.ids.push(i);
    });
    // Nửa quả cầu, hơi dài theo trước – sau như mũ thật.
    const shell = new THREE.SphereGeometry(0.135, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1.12);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.05 });
    this.mesh = new THREE.InstancedMesh(shell, mat, Math.max(1, this.ids.length));
    this.mesh.name = 'pickup-helmets';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, this.ids.length) * 3), 3);
    this.matrices = new Float32Array(this.ids.length * 16);
    this.ids.forEach((id, k) => {
      const spot = pickups.spots[id]!;
      // Mũ úp trên yên, lệch nhẹ mỗi cái một kiểu.
      q.setFromAxisAngle(up, spot.yaw + ((k * 2.39996) % 1) - 0.5);
      m.compose(p.set(spot.x, spot.y, spot.z), q, s);
      m.toArray(this.matrices, k * 16);
    });
    this.mesh.count = 0;
  }

  /** `now`: giờ game (xem Pickups). */
  update(camX: number, camZ: number, now: number): void {
    const moved = (camX - this.lastX) ** 2 + (camZ - this.lastZ) ** 2 > REFRESH * REFRESH;
    if (!moved && this.version === this.pickups.version) return;
    this.version = this.pickups.version;
    this.lastX = camX;
    this.lastZ = camZ;
    const out = this.mesh.instanceMatrix.array as Float32Array;
    const colors = this.mesh.instanceColor!.array as Float32Array;
    const src = this.matrices;
    let n = 0;
    // Chép ma trận + màu của mũ k vào ô thứ n.
    for (let k = 0; k < this.ids.length; k++) {
      const id = this.ids[k]!;
      const x = src[k * 16 + 12]!;
      const z = src[k * 16 + 14]!;
      if ((x - camX) ** 2 + (z - camZ) ** 2 > RANGE * RANGE || !this.pickups.available(id, now)) continue;
      for (let j = 0; j < 16; j++) out[n * 16 + j] = src[k * 16 + j]!;
      const c = HELMET_RGB[(k * 5 + 3) % HELMET_RGB.length]!;
      colors[n * 3] = c[0];
      colors[n * 3 + 1] = c[1];
      colors[n * 3 + 2] = c[2];
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

