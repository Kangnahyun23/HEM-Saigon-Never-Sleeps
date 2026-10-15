import * as THREE from 'three/webgpu';
import { createRng, pick } from '@/core/random';
import { PAD_HEIGHT } from '@/world/city/layout';
import type { Walker } from './pedestrians';

/**
 * Hình người đi bộ: thân, đầu, tóc, tay, chân là hộp trong MỘT InstancedMesh; nón lá là InstancedMesh thứ hai.
 * Chân tay đung đưa theo pha bước của mô phỏng; mỗi khung hình chỉ ghi lại ma trận.
 */

type Role = 'shirt' | 'pants' | 'skin' | 'hair' | 'shoe';

export interface Part {
  role: Role;
  size: [number, number, number];
  /** Khớp quay (vai / hông) và tâm hộp tính từ khớp. */
  pivot: [number, number, number];
  offset: [number, number, number];
  /** 'leg' / 'arm' đung đưa ngược pha nhau; 0 = đứng yên. */
  swing: 0 | 1 | -1;
  limb?: 'leg' | 'arm';
}

/** Các khối của một người (xuất ra cho unit test). */
export const PARTS: readonly Part[] = [
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

const _c = new THREE.Color();
/** Nón lá: tâm đáy nón so với chân (m). */
const HAT_Y = 1.79;
const HAT_Z = -0.01;
/** Nằm ngửa: cả người xoay −90° quanh trục X cục bộ (đầu ngả ra sau), nhấc lên khỏi mặt đất ngần này (m). */
const LYING_LIFT = 0.11;
/** Nhảy tránh xe: hai tay giơ lên (góc quanh vai). */
const DODGE_COS = Math.cos(-2.6);
const DODGE_SIN = Math.sin(-2.6);

/**
 * Khung người đang ghi: f[0..8] = ma trận quay 3×3 (theo hàng), f[9..11] = dịch; f[12], f[13] = cos / sin góc đung đưa
 * của khối đang ghi. Truyền qua mảng số thực thay vì tham số: gọi hàm (không inline) với số thực thì V8 phải "đóng hộp"
 * từng số ⇒ rác bộ nhớ (hơn 1 000 khối mỗi khung hình).
 */
const _f = new Float64Array(14);

/** Ghi ma trận (theo cột, như three.js) của khối `part` vào `out` tại `o`: khung người · T(khớp) · Rx(góc) · T(lệch) · S(cỡ). */
function writePart(out: Float32Array, o: number, part: Part): void {
  const f = _f;
  const c = f[12]!;
  const s = f[13]!;
  const sx = part.size[0];
  const sy = part.size[1];
  const sz = part.size[2];
  // Cột 1, 2 của Rx(góc)·S(cỡ) (cột 0 là (sx, 0, 0)); tâm khối = khớp + Rx(góc)·lệch.
  const a1y = c * sy;
  const a1z = s * sy;
  const a2y = -s * sz;
  const a2z = c * sz;
  const ux = part.pivot[0] + part.offset[0];
  const uy = part.pivot[1] + c * part.offset[1] - s * part.offset[2];
  const uz = part.pivot[2] + s * part.offset[1] + c * part.offset[2];
  out[o] = f[0]! * sx;
  out[o + 1] = f[3]! * sx;
  out[o + 2] = f[6]! * sx;
  out[o + 3] = 0;
  out[o + 4] = f[1]! * a1y + f[2]! * a1z;
  out[o + 5] = f[4]! * a1y + f[5]! * a1z;
  out[o + 6] = f[7]! * a1y + f[8]! * a1z;
  out[o + 7] = 0;
  out[o + 8] = f[1]! * a2y + f[2]! * a2z;
  out[o + 9] = f[4]! * a2y + f[5]! * a2z;
  out[o + 10] = f[7]! * a2y + f[8]! * a2z;
  out[o + 11] = 0;
  out[o + 12] = f[0]! * ux + f[1]! * uy + f[2]! * uz + f[9]!;
  out[o + 13] = f[3]! * ux + f[4]! * uy + f[5]! * uz + f[10]!;
  out[o + 14] = f[6]! * ux + f[7]! * uy + f[8]! * uz + f[11]!;
  out[o + 15] = 1;
}

/** Ma trận "ẩn" (co về một điểm) cho `count` ô liên tiếp từ `o`. */
function writeHidden(out: Float32Array, o: number, count: number): void {
  out.fill(0, o, o + count * 16);
  for (let k = 0; k < count; k++) out[o + k * 16 + 15] = 1;
}

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
    const out = this.bodies.instanceMatrix.array as Float32Array;
    const hats = this.hats.instanceMatrix.array as Float32Array;
    const f = _f;
    for (let i = 0; i < n; i++) {
      const w = walkers[i] as Walker;
      const base = i * PARTS.length * 16;
      if (skip?.has(w.id)) {
        writeHidden(out, base, PARTS.length);
        writeHidden(hats, i * 16, 1);
        continue;
      }
      const look = this.look(w);
      const dyaw = Math.atan2(Math.sin(w.yaw - w.prevYaw), Math.cos(w.yaw - w.prevYaw));
      const yaw = w.prevYaw + dyaw * alpha;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      // Bị đánh ngã / gục: nằm ngửa dưới đất (quay quanh Y rồi ngả −90° quanh X cục bộ).
      const lying = w.dead || w.down > 0;
      if (lying) {
        f[0] = c;
        f[1] = -s;
        f[2] = 0;
        f[3] = 0;
        f[4] = 0;
        f[5] = 1;
        f[6] = -s;
        f[7] = -c;
        f[8] = 0;
      } else {
        f[0] = c;
        f[1] = 0;
        f[2] = s;
        f[3] = 0;
        f[4] = 1;
        f[5] = 0;
        f[6] = -s;
        f[7] = 0;
        f[8] = c;
      }
      f[9] = w.prevX + (w.x - w.prevX) * alpha;
      f[10] = PAD_HEIGHT + (lying ? LYING_LIFT : 0);
      f[11] = w.prevZ + (w.z - w.prevZ) * alpha;
      // Biên độ bước theo tốc độ; đứng yên / nằm thì tay chân thả thẳng.
      const amp = lying ? 0 : Math.min(1, w.speed / 1.3);
      const legSwing = Math.sin(w.phase) * 0.55 * amp;
      const legCos = Math.cos(legSwing);
      const legSin = Math.sin(legSwing);
      // Nhảy tránh xe: giơ hai tay lên (hoạt hình); không thì tay vung ngược chân, biên độ nhỏ hơn.
      const dodging = w.dodge > 0;
      const armCos = dodging ? DODGE_COS : Math.cos(legSwing * 0.8);
      const armSin = dodging ? DODGE_SIN : Math.sin(legSwing * 0.8);
      for (let k = 0; k < PARTS.length; k++) {
        const part = PARTS[k]!;
        if (part.limb === 'leg') {
          f[12] = legCos;
          f[13] = legSin * part.swing;
        } else if (part.limb === 'arm') {
          f[12] = armCos;
          f[13] = dodging ? armSin : armSin * part.swing;
        } else {
          f[12] = 1;
          f[13] = 0;
        }
        writePart(out, base + k * 16, part);
      }
      const h = i * 16;
      if (!look.hat) {
        writeHidden(hats, h, 1);
        continue;
      }
      // Nón: theo khung người, không co giãn.
      hats[h] = f[0]!;
      hats[h + 1] = f[3]!;
      hats[h + 2] = f[6]!;
      hats[h + 3] = 0;
      hats[h + 4] = f[1]!;
      hats[h + 5] = f[4]!;
      hats[h + 6] = f[7]!;
      hats[h + 7] = 0;
      hats[h + 8] = f[2]!;
      hats[h + 9] = f[5]!;
      hats[h + 10] = f[8]!;
      hats[h + 11] = 0;
      hats[h + 12] = f[1]! * HAT_Y + f[2]! * HAT_Z + f[9]!;
      hats[h + 13] = f[4]! * HAT_Y + f[5]! * HAT_Z + f[10]!;
      hats[h + 14] = f[7]! * HAT_Y + f[8]! * HAT_Z + f[11]!;
      hats[h + 15] = 1;
    }
    this.bodies.count = n * PARTS.length;
    this.hats.count = n;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.hats.instanceMatrix.needsUpdate = true;
  }
}
