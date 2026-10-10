import * as THREE from 'three/webgpu';
import { mergeStaticMeshes } from '@/render/merge';

/** Trang phục của Tín: áo khoác xe ôm công nghệ (hãng hư cấu), quần jean, giày trắng, mũ bảo hiểm cam. */
export const TIN_COLORS = {
  jacket: '#1a9e83',
  stripe: '#ff8c1a',
  shirt: '#f2efe6',
  jeans: '#2d3f6b',
  shoes: '#eeeeea',
  skin: '#c88d62',
  hair: '#151515',
  helmet: '#ff8c1a',
  visor: '#20262c',
  bag: '#ff8c1a',
} as const;

export type CharacterMode = 'foot' | 'ride';

export interface AnimState {
  mode: CharacterMode;
  /** Tốc độ ngang (m/s). */
  speed: number;
  grounded: boolean;
  /** Đang chạy (giữ Shift). */
  running: boolean;
  /** Xe dừng hẳn: chống chân xuống đất. */
  footDown?: boolean;
  /** Góc lái hiện tại (rad) để tay xoay theo ghi-đông. */
  steer?: number;
  /** Đang mở điện thoại (phím P): đứng yên thì áp máy lên tai. */
  phone?: boolean;
}

/** Mọi khối hộp dùng chung một vật liệu, màu nằm trong đỉnh — để gộp được các khối cùng khớp thành một mesh. */
const clothMat = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75 });

const box = (w: number, h: number, d: number, color: string, y = 0, z = 0, x = 0): THREE.Mesh => {
  const geo = new THREE.BoxGeometry(w, h, d);
  const c = new THREE.Color(color);
  const colors = new Float32Array(geo.attributes.position!.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.Mesh(geo, clothMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

/**
 * Nhân vật low-poly dựng từ khối hộp, có khớp hông/gối/vai/khuỷu để hoạt hoạ thủ tục
 * (đi, chạy, nhảy, ngồi xe, chống chân). Gốc toạ độ ở giữa hai bàn chân, mặt hướng +Z.
 */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly helmet = new THREE.Group();
  private readonly legs: [Limb, Limb];
  private readonly arms: [Limb, Limb];
  private phase = 0;
  private time = 0;

  constructor() {
    const C = TIN_COLORS;
    this.root.name = 'tin';
    this.hips.position.y = 0.95;
    this.root.add(this.hips);

    // Hông + thân.
    this.hips.add(box(0.34, 0.16, 0.2, C.jeans, 0));
    this.hips.add(this.torso);
    this.torso.add(box(0.4, 0.5, 0.24, C.jacket, 0.3));
    this.torso.add(box(0.41, 0.05, 0.25, C.stripe, 0.3));
    this.torso.add(box(0.18, 0.14, 0.02, C.shirt, 0.48, 0.12));
    this.torso.add(box(0.42, 0.08, 0.26, C.jacket, 0.57)); // vai áo
    this.torso.add(box(0.3, 0.36, 0.14, C.bag, 0.32, -0.19)); // ba lô giao hàng

    // Đầu.
    this.head.position.y = 0.62;
    this.torso.add(this.head);
    this.head.add(box(0.1, 0.08, 0.1, C.skin, 0.03));
    this.head.add(box(0.22, 0.25, 0.23, C.skin, 0.2));
    this.head.add(box(0.235, 0.08, 0.245, C.hair, 0.33));
    this.head.add(box(0.235, 0.12, 0.06, C.hair, 0.27, -0.1));
    this.head.add(box(0.05, 0.03, 0.01, '#111111', 0.22, 0.116, 0.055)); // mắt
    this.head.add(box(0.05, 0.03, 0.01, '#111111', 0.22, 0.116, -0.055));

    // Mũ bảo hiểm (chỉ hiện khi đi xe).
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(0.165, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardNodeMaterial({ color: C.helmet, roughness: 0.35 }),
    );
    shell.scale.set(1, 1.05, 1.12);
    shell.position.y = 0.25;
    shell.castShadow = true;
    this.helmet.add(shell);
    this.helmet.add(box(0.2, 0.06, 0.04, C.visor, 0.29, 0.17));
    this.helmet.visible = false;
    this.head.add(this.helmet);

    // Chân.
    const leg = (side: number): Limb => {
      const upper = new THREE.Group();
      upper.position.set(side * 0.1, 0, 0);
      upper.add(box(0.15, 0.46, 0.17, C.jeans, -0.23));
      const lower = new THREE.Group();
      lower.position.y = -0.46;
      lower.add(box(0.135, 0.44, 0.15, C.jeans, -0.22));
      lower.add(box(0.13, 0.08, 0.27, C.shoes, -0.46, 0.05));
      upper.add(lower);
      this.hips.add(upper);
      return { upper, lower };
    };
    this.legs = [leg(1), leg(-1)];

    // Tay.
    const arm = (side: number): Limb => {
      const upper = new THREE.Group();
      upper.position.set(side * 0.255, 0.55, 0);
      upper.add(box(0.105, 0.32, 0.12, C.jacket, -0.15));
      const lower = new THREE.Group();
      lower.position.y = -0.31;
      lower.add(box(0.095, 0.28, 0.105, C.jacket, -0.13));
      lower.add(box(0.08, 0.09, 0.09, C.skin, -0.31));
      upper.add(lower);
      this.torso.add(upper);
      return { upper, lower };
    };
    this.arms = [arm(1), arm(-1)];
    mergeStaticMeshes(this.root);
  }

  setHelmet(on: boolean): void {
    this.helmet.visible = on;
  }

  update(dt: number, s: AnimState): void {
    this.time += dt;
    const [lL, rL] = this.legs;
    const [lA, rA] = this.arms;
    const k = 14;
    let hipsY = 0.95;
    let lean = 0;
    let headPitch = 0;
    const t: Record<string, number> = {};

    if (s.mode === 'ride') {
      // Ngồi xe: đùi đưa ra trước, gối gập, tay nắm ghi-đông, người hơi đổ về trước.
      hipsY = 0.95;
      lean = 0.22;
      const steer = s.steer ?? 0;
      t.lUx = -1.35; t.lLx = 1.45; t.lUz = 0.08;
      t.rUx = -1.35; t.rLx = 1.45; t.rUz = -0.08;
      if (s.footDown) {
        // Chống chân trái xuống đất khi dừng.
        t.lUx = -0.35; t.lLx = 0.15; t.lUz = 0.38;
      }
      t.laX = -1.05 + steer * 0.6; t.laL = -0.5; t.laZ = 0.12;
      t.raX = -1.05 - steer * 0.6; t.raL = -0.5; t.raZ = -0.12;
      headPitch = -0.15;
    } else if (!s.grounded) {
      // Trên không: co chân, giơ tay.
      t.lUx = -0.7; t.lLx = 0.9; t.lUz = 0.05;
      t.rUx = -0.2; t.rLx = 0.5; t.rUz = -0.05;
      t.laX = -0.4; t.laL = -0.6; t.laZ = 0.5;
      t.raX = -0.4; t.raL = -0.6; t.raZ = -0.5;
      lean = 0.05;
    } else if (s.speed > 0.15) {
      // Đi/chạy: pha bước tỉ lệ quãng đường.
      const runBlend = THREE.MathUtils.clamp((s.speed - 2.5) / 3.5, 0, 1);
      const stride = THREE.MathUtils.lerp(1.35, 2.3, runBlend);
      this.phase += (s.speed / stride) * Math.PI * 2 * dt;
      const ph = this.phase;
      const a = THREE.MathUtils.lerp(0.5, 0.9, runBlend);
      const sin = Math.sin(ph);
      t.lUx = sin * a; t.rUx = -sin * a;
      t.lLx = Math.max(0, -Math.sin(ph + 0.9)) * (0.6 + runBlend * 0.9) + 0.05;
      t.rLx = Math.max(0, Math.sin(ph + 0.9)) * (0.6 + runBlend * 0.9) + 0.05;
      t.lUz = 0.02; t.rUz = -0.02;
      const armA = THREE.MathUtils.lerp(0.45, 0.85, runBlend);
      t.laX = -sin * armA; t.raX = sin * armA;
      t.laL = -THREE.MathUtils.lerp(0.25, 1.3, runBlend); t.raL = t.laL;
      t.laZ = 0.06; t.raZ = -0.06;
      lean = THREE.MathUtils.lerp(0.04, 0.2, runBlend);
      hipsY = 0.95 + Math.abs(Math.cos(ph)) * THREE.MathUtils.lerp(0.025, 0.06, runBlend) - 0.02;
    } else {
      // Đứng yên: thở nhẹ.
      const b = Math.sin(this.time * 2.1);
      t.lUx = 0; t.rUx = 0; t.lLx = 0.03; t.rLx = 0.03; t.lUz = 0.04; t.rUz = -0.04;
      t.laX = 0.03 * b; t.raX = -0.03 * b; t.laL = -0.12; t.raL = -0.12; t.laZ = 0.09; t.raZ = -0.09;
      hipsY = 0.95 + b * 0.004;
    }

    lL.upper.rotation.x = damp(lL.upper.rotation.x, t.lUx ?? 0, k, dt);
    rL.upper.rotation.x = damp(rL.upper.rotation.x, t.rUx ?? 0, k, dt);
    lL.upper.rotation.z = damp(lL.upper.rotation.z, t.lUz ?? 0, k, dt);
    rL.upper.rotation.z = damp(rL.upper.rotation.z, t.rUz ?? 0, k, dt);
    lL.lower.rotation.x = damp(lL.lower.rotation.x, t.lLx ?? 0, k, dt);
    rL.lower.rotation.x = damp(rL.lower.rotation.x, t.rLx ?? 0, k, dt);
    lA.upper.rotation.x = damp(lA.upper.rotation.x, t.laX ?? 0, k, dt);
    rA.upper.rotation.x = damp(rA.upper.rotation.x, t.raX ?? 0, k, dt);
    lA.upper.rotation.z = damp(lA.upper.rotation.z, t.laZ ?? 0, k, dt);
    rA.upper.rotation.z = damp(rA.upper.rotation.z, t.raZ ?? 0, k, dt);
    lA.lower.rotation.x = damp(lA.lower.rotation.x, t.laL ?? 0, k, dt);
    rA.lower.rotation.x = damp(rA.lower.rotation.x, t.raL ?? 0, k, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, lean, 8, dt);
    this.head.rotation.x = damp(this.head.rotation.x, headPitch - lean * 0.5, 8, dt);
    this.hips.position.y = damp(this.hips.position.y, hipsY, 20, dt);
  }
}
