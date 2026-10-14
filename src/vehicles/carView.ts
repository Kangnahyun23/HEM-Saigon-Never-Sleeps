import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { reflective } from '@/world/reflections';
import { CAR, CAR_ROLE_COLORS, CAR_WHEELS, carParts, type CarKind, type CarPart } from './carModel';
import { CAR_TUNING, rideHeight, type CarPhysics } from './carPhysics';

/** Tô một màu cho mọi đỉnh (các khối cùng vật liệu gộp thành một mesh, màu nằm trong đỉnh). */
function tinted(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function partGeometry(p: CarPart, atOrigin: boolean): THREE.BufferGeometry {
  const geo =
    p.shape === 'box' ? new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]) : new THREE.CylinderGeometry(p.size[0], p.size[0], p.size[1], 16).rotateZ(Math.PI / 2);
  if (!atOrigin) geo.translate(p.pos[0], p.pos[1], p.pos[2]);
  return geo;
}

/**
 * Hình ô tô dựng từ carParts: thân sơn (màu trong đỉnh) + kính + đèn pha + đèn hậu gộp thành vài mesh, bốn bánh quay,
 * hai bánh trước xoay theo lái; thân chúi / nghiêng nhẹ khi phanh, cua. Mỗi xe chỉ ~8 lệnh vẽ.
 */
export class CarView {
  readonly root = new THREE.Group();
  /** Thân xe; gốc ở mặt đất giữa bốn bánh. */
  readonly model = new THREE.Group();
  /** Chỗ người lái (trong khoang kín, kính tối — người lái được ẩn đi). */
  readonly seat = new THREE.Group();
  private readonly wheelSteer: THREE.Group[] = [];
  private readonly wheelSpin: THREE.Group[] = [];
  private readonly headlight: THREE.MeshStandardNodeMaterial;
  private readonly taillight: THREE.MeshStandardNodeMaterial;
  private readonly sign: THREE.MeshStandardNodeMaterial | null = null;

  constructor(
    readonly kind: CarKind,
    bodyColor: string,
    trimColor = bodyColor,
  ) {
    this.root.add(this.model);
    const paint = reflective(new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.35 }));
    const glass = reflective(new THREE.MeshStandardNodeMaterial({ color: CAR_ROLE_COLORS.glass, roughness: 0.08, metalness: 0.7 }));
    const rubber = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
    this.headlight = new THREE.MeshStandardNodeMaterial({ color: CAR_ROLE_COLORS.light, emissive: new THREE.Color('#fff2c8'), emissiveIntensity: 0.5 });
    this.taillight = new THREE.MeshStandardNodeMaterial({ color: CAR_ROLE_COLORS.tail, emissive: new THREE.Color('#ff2020'), emissiveIntensity: 0.3 });

    const colorOf = (p: CarPart): string => (p.role === 'body' ? bodyColor : p.role === 'trim' ? trimColor : CAR_ROLE_COLORS[p.role]);
    const groups: Record<'paint' | 'glass' | 'light' | 'tail' | 'sign', THREE.BufferGeometry[]> = { paint: [], glass: [], light: [], tail: [], sign: [] };
    const wheels: THREE.BufferGeometry[][] = [[], [], [], []];
    for (const p of carParts(kind)) {
      if (p.wheel !== undefined) (wheels[p.wheel] as THREE.BufferGeometry[]).push(tinted(partGeometry(p, true), colorOf(p)));
      else if (p.role === 'glass' || p.role === 'light' || p.role === 'tail' || p.role === 'sign') groups[p.role].push(partGeometry(p, false));
      else groups.paint.push(tinted(partGeometry(p, false), colorOf(p)));
    }
    const add = (parent: THREE.Object3D, geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true): void => {
      if (geos.length === 0) return;
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      mesh.castShadow = shadow;
      parent.add(mesh);
    };
    add(this.model, groups.paint, paint);
    add(this.model, groups.glass, glass);
    add(this.model, groups.light, this.headlight, false);
    add(this.model, groups.tail, this.taillight, false);
    if (groups.sign.length > 0) {
      this.sign = new THREE.MeshStandardNodeMaterial({ color: CAR_ROLE_COLORS.sign, emissive: new THREE.Color('#ffe060'), emissiveIntensity: 0.2 });
      add(this.model, groups.sign, this.sign, false);
    }
    // Bánh xe nằm ngoài thân (không chúi / nghiêng theo thân): nhóm lái (xoay quanh Y) bọc nhóm quay (quanh X).
    for (const geos of wheels) {
      const steer = new THREE.Group();
      const spin = new THREE.Group();
      steer.add(spin);
      add(spin, geos, rubber);
      this.root.add(steer);
      this.wheelSteer.push(steer);
      this.wheelSpin.push(spin);
    }

    this.seat.position.set(CAR.seat[0], CAR.seat[1], CAR.seat[2]);
    this.model.add(this.seat);
  }

  /** Gỡ khỏi cảnh và giải phóng bộ đệm (xe bị thay bằng chiếc khác). */
  dispose(): void {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    });
  }

  /** Bật/tắt đèn pha; `night` 0..1 làm đèn hậu và hộp đèn taxi rực hơn khi tối. */
  setLights(on: boolean, night = 0): void {
    this.headlight.emissiveIntensity = on ? 2.5 + night * 3 : 0.5;
    this.taillight.emissiveIntensity = on ? 0.3 + night * 2.5 : 0.3;
    if (this.sign) this.sign.emissiveIntensity = 0.2 + night * 2.2;
  }

  /** Đồng bộ với vật lý (gọi mỗi khung hình). `alpha` = vị trí giữa bước vật lý trước và sau (0..1). */
  sync(phys: CarPhysics, alpha = 1): void {
    const a = phys.prev;
    const b = phys.curr;
    this.root.position.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
    const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    this.root.rotation.set(0, a.yaw + dyaw * alpha, 0);
    // Thân bám theo gốc thân vật lý (lún theo giảm xóc); bánh nằm trên mặt đường theo độ nén từng giảm xóc.
    this.model.position.y = -rideHeight();
    this.model.rotation.set(phys.pitch, 0, phys.roll);
    for (let i = 0; i < 4; i++) {
      const steer = this.wheelSteer[i] as THREE.Group;
      const [wx, wz] = CAR_WHEELS[i] as readonly [number, number];
      steer.position.set(wx, CAR_TUNING.connectionY - phys.suspension(i), wz);
      steer.rotation.y = i < 2 ? phys.steer : 0;
      (this.wheelSpin[i] as THREE.Group).rotation.x = phys.wheelSpin[i] as number;
    }
  }
}
