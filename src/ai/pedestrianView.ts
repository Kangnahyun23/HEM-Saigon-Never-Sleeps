import * as THREE from 'three/webgpu';
import { createRng, pick } from '@/core/random';
import { PAD_HEIGHT } from '@/world/city/layout';
import type { Walker } from './pedestrians';

/**
 * Hình người đi bộ: thân, đầu, tóc, tay, chân là hộp trong MỘT InstancedMesh; nón lá là InstancedMesh thứ hai.
 * Chân tay đung đưa theo pha bước của mô phỏng; mỗi khung hình chỉ ghi lại ma trận.
 */

type Role = 'shirt' | 'pants' | 'skin' | 'hair' | 'shoe';

interface Part {
  role: Role;
  size: [number, number, number];
  /** Khớp quay (vai / hông) và tâm hộp tính từ khớp. */
  pivot: [number, number, number];
  offset: [number, number, number];
  /** 'leg' / 'arm' đung đưa ngược pha nhau; 0 = đứng yên. */
  swing: 0 | 1 | -1;
  limb?: 'leg' | 'arm';
}

const PARTS: Part[] = [
  { role: 'pants', size: [0.13, 0.78, 0.14], pivot: [0.09, 0.84, 0], offset: [0, -0.39, 0], swing: 1, limb: 'leg' },
  { role: 'pants', size: [0.13, 0.78, 0.14], pivot: [-0.09, 0.84, 0], offset: [0, -0.39, 0], swing: -1, limb: 'leg' },
  { role: 'shoe', size: [0.12, 0.07, 0.24], pivot: [0.09, 0.84, 0], offset: [0, -0.8, 0.04], swing: 1, limb: 'leg' },
  { role: 'shoe', size: [0.12, 0.07, 0.24], pivot: [-0.09, 0.84, 0], offset: [0, -0.8, 0.04], swing: -1, limb: 'leg' },
  { role: 'shirt', size: [0.36, 0.6, 0.21], pivot: [0, 1.14, 0], offset: [0, 0, 0], swing: 0 },
  { role: 'shirt', size: [0.09, 0.56, 0.1], pivot: [0.23, 1.42, 0], offset: [0, -0.27, 0], swing: -1, limb: 'arm' },
  { role: 'shirt', size: [0.09, 0.56, 0.1], pivot: [-0.23, 1.42, 0], offset: [0, -0.27, 0], swing: 1, limb: 'arm' },
  { role: 'skin', size: [0.08, 0.1, 0.09], pivot: [0.23, 1.42, 0], offset: [0, -0.6, 0], swing: -1, limb: 'arm' },
  { role: 'skin', size: [0.08, 0.1, 0.09], pivot: [-0.23, 1.42, 0], offset: [0, -0.6, 0], swing: 1, limb: 'arm' },
  { role: 'skin', size: [0.19, 0.22, 0.2], pivot: [0, 1.6, 0], offset: [0, 0, 0], swing: 0 },
  { role: 'hair', size: [0.21, 0.09, 0.22], pivot: [0, 1.73, -0.01], offset: [0, 0, 0], swing: 0 },
];

const SHIRTS = ['#e9e4d8', '#b8452f', '#3f6fae', '#d9a441', '#4e8a5a', '#8a5aa0', '#2b2b2b', '#e88ba1', '#6fb7c4', '#c96b2c'];
const PANTS = ['#2b2f3a', '#3d4b6b', '#6b5a45', '#1f1f1f', '#8a8a8a', '#2f4a3a'];
const SKINS = ['#c88d62', '#e0ac7f', '#a66d45', '#d9a07a'];
const HAIR = ['#151210', '#2a1d16', '#3b2a20', '#8c8c8c'];
const HAT_CHANCE = 0.3;

const _w = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _x = new THREE.Vector3(1, 0, 0);
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const HAT_LOCAL = new THREE.Matrix4().makeTranslation(0, 1.79, -0.01);
/** Nằm ngửa: xoay cả người −90° quanh trục X cục bộ (đầu ngả ra sau), nhấc lên khỏi mặt đất. */
const LYING = new THREE.Matrix4().makeTranslation(0, 0.11, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));

export class PedestrianView {
  readonly root = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly hats: THREE.InstancedMesh;
  private readonly looks: Array<{ generation: number; hat: boolean }> = [];

  constructor(private readonly capacity: number) {
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 });
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, capacity * PARTS.length);
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * PARTS.length * 3), 3);
    // Nón lá: chóp nón đan lá cọ màu vàng rơm.
    const hatGeo = new THREE.ConeGeometry(0.3, 0.17, 14, 1, true);
    const hatMat = new THREE.MeshStandardNodeMaterial({ color: '#d8c08a', roughness: 0.9, side: THREE.DoubleSide });
    this.hats = new THREE.InstancedMesh(hatGeo, hatMat, capacity);
    for (const m of [this.bodies, this.hats]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      this.root.add(m);
    }
    this.root.name = 'pedestrians';
  }

  private look(w: Walker): { hat: boolean } {
    let look = this.looks[w.id];
    if (look && look.generation === w.generation) return look;
    const rng = createRng(w.id * 4099 + w.generation * 7919 + 17);
    const colors: Record<Role, string> = { shirt: pick(rng, SHIRTS), pants: pick(rng, PANTS), skin: pick(rng, SKINS), hair: pick(rng, HAIR), shoe: '#2a2622' };
    look = { generation: w.generation, hat: rng() < HAT_CHANCE };
    PARTS.forEach((p, k) => this.bodies.setColorAt(w.id * PARTS.length + k, _c.set(colors[p.role])));
    (this.bodies.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.looks[w.id] = look;
    return look;
  }

  /** `skip`: người đang được vẽ bằng nhân vật có xương (gần camera) — ở đây ẩn đi. */
  update(walkers: readonly Walker[], alpha: number, skip?: { has(id: number): boolean }): void {
    const n = Math.min(walkers.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const w = walkers[i] as Walker;
      if (skip?.has(w.id)) {
        for (let k = 0; k < PARTS.length; k++) this.bodies.setMatrixAt(i * PARTS.length + k, ZERO);
        this.hats.setMatrixAt(i, ZERO);
        continue;
      }
      const look = this.look(w);
      const dyaw = Math.atan2(Math.sin(w.yaw - w.prevYaw), Math.cos(w.yaw - w.prevYaw));
      _p.set(w.prevX + (w.x - w.prevX) * alpha, PAD_HEIGHT, w.prevZ + (w.z - w.prevZ) * alpha);
      _q.setFromAxisAngle(_up, w.prevYaw + dyaw * alpha);
      _w.compose(_p, _q, _one);
      // Bị đánh ngã / gục: nằm ngửa dưới đất.
      const lying = w.dead || w.down > 0;
      if (lying) _w.multiply(LYING);
      // Biên độ bước theo tốc độ; đứng yên / nằm thì tay chân thả thẳng.
      const amp = lying ? 0 : Math.min(1, w.speed / 1.3);
      const legSwing = Math.sin(w.phase) * 0.55 * amp;
      // Nhảy tránh xe: giơ hai tay lên (hoạt hình).
      const dodging = w.dodge > 0;
      PARTS.forEach((part, k) => {
        let angle = 0;
        if (part.limb === 'leg') angle = legSwing * part.swing;
        else if (part.limb === 'arm') angle = dodging ? -2.6 : legSwing * part.swing * 0.8;
        _a.makeTranslation(part.pivot[0], part.pivot[1], part.pivot[2]);
        _m.makeRotationAxis(_x, angle);
        _a.multiply(_m);
        _m.compose(_s.set(part.offset[0], part.offset[1], part.offset[2]), _q.identity(), _one);
        _a.multiply(_m);
        _a.scale(_s.set(part.size[0], part.size[1], part.size[2]));
        this.bodies.setMatrixAt(i * PARTS.length + k, _m.multiplyMatrices(_w, _a));
      });
      this.hats.setMatrixAt(i, look.hat ? _m.multiplyMatrices(_w, HAT_LOCAL) : ZERO);
    }
    this.bodies.count = n * PARTS.length;
    this.hats.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.hats.instanceMatrix.needsUpdate = true;
  }
}
