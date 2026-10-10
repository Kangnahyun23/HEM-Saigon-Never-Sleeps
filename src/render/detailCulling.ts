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
    const add = (attr: THREE.BufferAttribute): void => {
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

  /** Chọn lại các instance trong tầm quanh (x, z). */
  update(x: number, z: number): void {
    const n = selectWithin(this.xz, x, z, this.distance, this.picked);
    for (const { attr, source, size } of this.channels) {
      const dst = attr.array as Float32Array;
      for (let j = 0; j < n; j++) {
        const from = (this.picked[j] as number) * size;
        dst.set(source.subarray(from, from + size), j * size);
      }
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * size);
      attr.needsUpdate = true;
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) this.mesh.computeBoundingSphere();
  }
}
