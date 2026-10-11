import * as THREE from 'three/webgpu';
import { createRng } from '@/core/random';
import { MAX_DROPS, MAX_SPLATS, type BloodSim } from './blood';

/** Vết máu: hình tròn méo (bán kính 1) nằm phẳng — mỗi vết xoay một góc nên không giống nhau. */
function splatGeometry(): THREE.BufferGeometry {
  const rng = createRng(77);
  const n = 18;
  const pos: number[] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // Mép lồi lõm như chất lỏng loang trên gạch.
    const r = 0.72 + rng() * 0.28;
    pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
  }
  const index: number[] = [];
  // Nhìn từ trên xuống: (tâm, i + 1, i) ngược chiều kim đồng hồ ⇒ mặt hướng lên.
  for (let i = 1; i <= n; i++) index.push(0, (i % n) + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(index);
  return g;
}

/**
 * Hình của máu nhẹ: giọt bay (một InstancedMesh) + vết / vũng trên đất (một InstancedMesh). Mỗi khung chỉ chép các
 * phần tử còn sống lên đầu bộ đệm (không tạo đối tượng mới); không còn gì thì khỏi vẽ.
 */
export class BloodView {
  readonly root = new THREE.Group();
  private readonly drops: THREE.InstancedMesh;
  private readonly splats: THREE.InstancedMesh;

  constructor() {
    this.root.name = 'blood';
    const dropMat = new THREE.MeshStandardNodeMaterial({ color: '#5c0a0d', roughness: 0.3 });
    this.drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), dropMat, MAX_DROPS);
    const splatMat = new THREE.MeshStandardNodeMaterial({ color: '#3a0507', roughness: 0.35 });
    // Nằm sát mặt vỉa hè: đẩy lên trước trong bộ đệm sâu để khỏi nhấp nháy.
    splatMat.polygonOffset = true;
    splatMat.polygonOffsetFactor = -3;
    splatMat.polygonOffsetUnits = -3;
    this.splats = new THREE.InstancedMesh(splatGeometry(), splatMat, MAX_SPLATS);
    for (const m of [this.drops, this.splats]) {
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = m === this.splats;
      this.root.add(m);
    }
    this.drops.name = 'blood-drops';
    this.splats.name = 'blood-splats';
  }

  update(sim: BloodSim): void {
    const d = this.drops.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (sim.dropLife[i]! <= 0) continue;
      const s = sim.dropSize[i]!;
      const o = n * 16;
      d.fill(0, o, o + 16);
      d[o] = s;
      d[o + 5] = s * 1.4; // hơi dài theo chiều rơi
      d[o + 10] = s;
      d[o + 12] = sim.px[i]!;
      d[o + 13] = sim.py[i]!;
      d[o + 14] = sim.pz[i]!;
      d[o + 15] = 1;
      n++;
    }
    if (n > 0 || this.drops.count > 0) this.drops.instanceMatrix.needsUpdate = true;
    this.drops.count = n;

    const m = this.splats.instanceMatrix.array as Float32Array;
    n = 0;
    for (let i = 0; i < MAX_SPLATS; i++) {
      const r = sim.splatRadius(i);
      if (r <= 0.002) continue;
      const c = Math.cos(sim.srot[i]!) * r;
      const s = Math.sin(sim.srot[i]!) * r;
      const o = n * 16;
      m.fill(0, o, o + 16);
      // Xoay quanh trục Y rồi co giãn theo bán kính (cột 0 và cột 2), giữ nguyên trục Y.
      m[o] = c;
      m[o + 2] = -s;
      m[o + 5] = 1;
      m[o + 8] = s;
      m[o + 10] = c;
      m[o + 12] = sim.sx[i]!;
      // Vết sau nằm cao hơn vết trước một chút (vết chồng nhau không nhấp nháy).
      m[o + 13] = sim.sy[i]! + 0.004 + (i % 8) * 0.0004;
      m[o + 14] = sim.sz[i]!;
      m[o + 15] = 1;
      n++;
    }
    if (n > 0 || this.splats.count > 0) this.splats.instanceMatrix.needsUpdate = true;
    this.splats.count = n;
    this.root.visible = this.drops.count + this.splats.count > 0;
  }
}
