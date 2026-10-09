import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export interface InstanceOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Ghi màu từng instance (nhân với màu vật liệu). */
  colors?: boolean;
  /** Thuộc tính riêng theo instance: tên → số thành phần. */
  attributes?: Record<string, 1 | 2 | 3 | 4>;
  name?: string;
}

/**
 * Gom nhiều bản sao của cùng một hình (geometry + material) rồi dựng thành MỘT InstancedMesh ⇒ một draw call.
 * Dùng cho nhà, ban công, cây, cột điện… để cả khu phố chỉ tốn vài chục draw call.
 */
export class InstanceBatch {
  private readonly matrices: number[] = [];
  private readonly colorData: number[] = [];
  private readonly attrData = new Map<string, number[]>();
  count = 0;

  constructor(
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly options: InstanceOptions = {},
  ) {
    for (const name of Object.keys(options.attributes ?? {})) this.attrData.set(name, []);
  }

  /** Thêm một bản sao. `rotation`: số = xoay quanh trục Y (rad), hoặc Euler/Quaternion. */
  add(
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rotation: number | THREE.Euler | THREE.Quaternion = 0,
    color?: THREE.ColorRepresentation,
    attrs?: Record<string, number | readonly number[]>,
  ): this {
    _p.set(x, y, z);
    _s.set(sx, sy, sz);
    if (typeof rotation === 'number') _q.setFromAxisAngle(UP, rotation);
    else if (rotation instanceof THREE.Euler) _q.setFromEuler(rotation);
    else _q.copy(rotation);
    _m.compose(_p, _q, _s);
    for (let i = 0; i < 16; i++) this.matrices.push(_m.elements[i] as number);
    if (this.options.colors) {
      _c.set(color ?? 0xffffff);
      this.colorData.push(_c.r, _c.g, _c.b);
    }
    for (const [name, size] of Object.entries(this.options.attributes ?? {})) {
      const v = attrs?.[name];
      const arr = this.attrData.get(name) as number[];
      if (typeof v === 'number') arr.push(v);
      else for (let k = 0; k < size; k++) arr.push(v?.[k] ?? 0);
    }
    this.count++;
    return this;
  }

  /** Thêm bằng ma trận dựng sẵn (dùng cho cụm chi tiết xoay theo vật cha). */
  addMatrix(m: THREE.Matrix4, color?: THREE.ColorRepresentation): this {
    for (let i = 0; i < 16; i++) this.matrices.push(m.elements[i] as number);
    if (this.options.colors) {
      _c.set(color ?? 0xffffff);
      this.colorData.push(_c.r, _c.g, _c.b);
    }
    this.count++;
    return this;
  }

  build(): THREE.InstancedMesh | null {
    if (this.count === 0) return null;
    const geometry = this.geometry.clone();
    for (const [name, size] of Object.entries(this.options.attributes ?? {})) {
      geometry.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(this.attrData.get(name) as number[]), size));
    }
    const mesh = new THREE.InstancedMesh(geometry, this.material, this.count);
    mesh.instanceMatrix.array.set(this.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (this.options.colors) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colorData), 3);
    }
    mesh.castShadow = this.options.castShadow ?? true;
    mesh.receiveShadow = this.options.receiveShadow ?? true;
    mesh.name = this.options.name ?? '';
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    return mesh;
  }
}

/** Euler tiện dụng (thứ tự YXZ: xoay hướng trước rồi mới nghiêng). */
export function euler(x: number, y: number, z: number): THREE.Euler {
  return _e.set(x, y, z, 'YXZ').clone();
}
