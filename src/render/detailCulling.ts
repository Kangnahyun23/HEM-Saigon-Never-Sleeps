import * as THREE from 'three/webgpu';

/**
 * Chọn các điểm nằm trong bán kính `r` quanh (x, z) (thuần logic, có unit test).
 * `xz` xếp liền nhau: x0, z0, x1, z1… Ghi chỉ số vào `out`, trả về số điểm được chọn.
 */
export function selectWithin(xz: ArrayLike<number>, x: number, z: number, r: number, out: Uint32Array): number {
  const r2 = r * r;
  let n = 0;
  for (let i = 0; i * 2 < xz.length; i++) {
    const dx = (xz[i * 2] as number) - x;
    const dz = (xz[i * 2 + 1] as number) - z;
    if (dx * dx + dz * dz <= r2) out[n++] = i;
  }
  return n;
}

interface Channel {
  attr: THREE.BufferAttribute;
  source: Float32Array;
  size: number;
}

/**
 * Chi tiết nhỏ (chậu cây ban công, xe đậu, cục nóng máy lạnh…) chỉ vẽ trong bán kính quanh camera.
 * Vẫn là MỘT InstancedMesh / một lệnh vẽ: giữ bản gốc của mọi instance, mỗi lần cập nhật chép các instance ở gần
 * lên đầu bộ đệm rồi đặt `count`. Ở xa thì đằng nào cũng chỉ còn vài điểm ảnh chìm trong sương.
 */
export class DetailCuller {
  private readonly xz: Float32Array;
  private readonly picked: Uint32Array;
  private readonly channels: Channel[] = [];
  /** Khối cầu bao (tính sẵn): mọi instance vươn xa tim nó tối đa `reach` m; tim nằm trong khoảng cao [minY, maxY]. */
  private readonly reach: number;
  private readonly minY: number;
  private readonly maxY: number;

  constructor(
    readonly mesh: THREE.InstancedMesh,
    /** Tầm nhìn (m); đổi được theo cài đặt chất lượng — có hiệu lực ở lần `update` sau. */
    public distance: number,
  ) {
    // Dung lượng bộ đệm, không phải `count` (count bị thu nhỏ sau mỗi lần cập nhật).
    const total = mesh.instanceMatrix.count;
    this.xz = new Float32Array(total * 2);
    const m = mesh.instanceMatrix.array;
    for (let i = 0; i < total; i++) {
      this.xz[i * 2] = m[i * 16 + 12] as number;
      this.xz[i * 2 + 1] = m[i * 16 + 14] as number;
    }
    this.picked = new Uint32Array(total);
    // Tầm vươn của một instance quanh tim nó = bán kính hình × hệ số co giãn lớn nhất của ma trận.
    if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
    const geo = mesh.geometry.boundingSphere as THREE.Sphere;
    const geoReach = geo.radius + geo.center.length();
    let reach = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < total; i++) {
      const o = i * 16;
      const sx = Math.hypot(m[o] as number, m[o + 1] as number, m[o + 2] as number);
      const sy = Math.hypot(m[o + 4] as number, m[o + 5] as number, m[o + 6] as number);
      const sz = Math.hypot(m[o + 8] as number, m[o + 9] as number, m[o + 10] as number);
      reach = Math.max(reach, geoReach * Math.max(sx, sy, sz));
      const y = m[o + 13] as number;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    this.reach = reach;
    this.minY = total > 0 ? minY : 0;
    this.maxY = total > 0 ? maxY : 0;
    const add =(attr: THREE.BufferAttribute): void => {
      this.channels.push({ attr, source: Float32Array.from(attr.array as ArrayLike<number>), size: attr.itemSize });
    };
    add(mesh.instanceMatrix);
    if (mesh.instanceColor) add(mesh.instanceColor);
    for (const attr of Object.values(mesh.geometry.attributes)) {
      if (attr instanceof THREE.InstancedBufferAttribute) add(attr);
    }
  }

  /** Tổng số instance (kể cả đang ẩn). */
  get total(): number {
    return this.picked.length;
  }

  /** Chọn lại các instance trong tầm quanh (x, z). Không tạo đối tượng mới (chạy vài lần mỗi giây khi đi xe). */
  update(x: number, z: number): void {
    const n = selectWithin(this.xz, x, z, this.distance, this.picked);
    for (let c = 0; c < this.channels.length; c++) {
      const { attr, source, size } = this.channels[c] as Channel;
      const dst = attr.array as Float32Array;
      for (let j = 0; j < n; j++) {
        const from = (this.picked[j] as number) * size;
        const to = j * size;
        for (let k = 0; k < size; k++) dst[to + k] = source[from + k] as number;
      }
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * size);
      attr.needsUpdate = true;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      // Khối cầu bao hình trụ quanh (x, z): bán kính ngang = tầm chọn + tầm vươn, cao từ minY tới maxY (± tầm vươn).
      // Rộng hơn chút so với duyệt từng instance (computeBoundingSphere) nhưng chỉ dùng để loại cả lô ngoài khung nhìn.
      const sphere = (this.mesh.boundingSphere ??= new THREE.Sphere());
      const half = (this.maxY - this.minY) / 2 + this.reach;
      sphere.center.set(x, (this.minY + this.maxY) / 2, z);
      sphere.radius = Math.hypot(this.distance + this.reach, half);
    }
  }
}
