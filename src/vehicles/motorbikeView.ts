import * as THREE from 'three/webgpu';
import { mergeStaticMeshes } from '@/render/merge';
import { BIKE, BIKE_PARTS, BIKE_ROLE_COLORS, type BikePart } from './bikeModel';
import { BIKE_TUNING, type MotorbikePhysics } from './motorbikePhysics';

const RAKE = 0.32;

/** Hình xe máy dựng từ BIKE_PARTS: cụm tay lái xoay quanh cổ phuộc nghiêng, bánh quay, thân nghiêng khi cua. */
export class MotorbikeView {
  readonly root = new THREE.Group();
  /** Gốc ở mặt đất giữa hai bánh; nghiêng quanh đường tiếp đất. */
  readonly model = new THREE.Group();
  /** Chỗ gắn người lái (ngồi trên yên). */
  readonly seat = new THREE.Group();
  private readonly steerGroup = new THREE.Group();
  private readonly frontSpin = new THREE.Group();
  private readonly rearSpin = new THREE.Group();
  private readonly headlight: THREE.MeshStandardNodeMaterial;
  private readonly taillight: THREE.MeshStandardNodeMaterial;

  constructor(bodyColor: string) {
    this.root.add(this.model);
    const mats = new Map<string, THREE.MeshStandardNodeMaterial>();
    const matFor = (p: BikePart): THREE.MeshStandardNodeMaterial => {
      const color = p.role === 'body' ? bodyColor : BIKE_ROLE_COLORS[p.role];
      let m = mats.get(p.role);
      if (!m) {
        m = new THREE.MeshStandardNodeMaterial({
          color,
          roughness: p.role === 'body' ? 0.3 : p.role === 'metal' || p.role === 'rim' ? 0.35 : 0.7,
          metalness: p.role === 'metal' || p.role === 'rim' ? 0.8 : 0.05,
        });
        if (p.role === 'light') {
          m.emissive = new THREE.Color('#fff2c8');
          m.emissiveIntensity = 0.6;
        }
        if (p.role === 'tail') {
          m.emissive = new THREE.Color('#ff2020');
          m.emissiveIntensity = 0.3;
        }
        mats.set(p.role, m);
      }
      return m;
    };
    this.headlight = matFor({ shape: 'box', size: [1, 1, 1], pos: [0, 0, 0], role: 'light' });
    this.taillight = matFor({ shape: 'box', size: [1, 1, 1], pos: [0, 0, 0], role: 'tail' });

    // Cụm lái: trục quay nghiêng về sau một góc RAKE, đi qua steerPivot.
    const [px, py, pz] = BIKE.steerPivot;
    const axis = new THREE.Group();
    axis.position.set(px, py, pz);
    axis.rotation.x = -RAKE;
    this.model.add(axis);
    axis.add(this.steerGroup);
    const content = new THREE.Group();
    content.rotation.x = RAKE;
    content.position.set(-px, 0, 0);
    // Đặt lại gốc: content ở toạ độ xe sau khi bù trục.
    const shift = new THREE.Vector3(0, -py, -pz).applyAxisAngle(new THREE.Vector3(1, 0, 0), RAKE);
    content.position.copy(shift);
    this.steerGroup.add(content);

    const half = BIKE.wheelBase / 2;
    this.frontSpin.position.set(0, BIKE.wheelRadius, half);
    this.rearSpin.position.set(0, BIKE.wheelRadius, -half);
    content.add(this.frontSpin);
    this.model.add(this.rearSpin);

    for (const p of BIKE_PARTS) {
      const geo =
        p.shape === 'box'
          ? new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2])
          : new THREE.CylinderGeometry(p.size[0], p.size[0], p.size[1], 18).rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, matFor(p));
      mesh.castShadow = true;
      mesh.rotation.x = p.tilt ?? 0;
      if (p.wheel) {
        // Bánh: đặt tâm trùng tâm cụm quay; thêm nan hoa cho thấy bánh đang lăn.
        (p.wheel === 'front' ? this.frontSpin : this.rearSpin).add(mesh);
        continue;
      }
      mesh.position.set(p.pos[0], p.pos[1], p.pos[2]);
      (p.steer ? content : this.model).add(mesh);
    }
    // Nan hoa (3 thanh) để thấy bánh quay.
    const spokeMat = matFor({ shape: 'box', size: [1, 1, 1], pos: [0, 0, 0], role: 'metal' });
    for (const g of [this.frontSpin, this.rearSpin]) {
      for (let k = 0; k < 3; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, BIKE.wheelRadius * 1.25), spokeMat);
        spoke.rotation.x = (k * Math.PI) / 3;
        g.add(spoke);
      }
    }

    this.seat.position.set(0, -0.03, -0.27);
    this.model.add(this.seat);
    mergeStaticMeshes(this.model);
  }

  /** Bật/tắt đèn pha; `night` 0..1 làm đèn hậu rực hơn khi tối. */
  setLights(on: boolean, night = 0): void {
    this.headlight.emissiveIntensity = on ? 2.5 + night * 3 : 0.6;
    this.taillight.emissiveIntensity = on ? 0.3 + night * 2.5 : 0.3;
  }

  /** Đồng bộ với vật lý (gọi mỗi khung hình). `alpha` = vị trí giữa bước vật lý trước và sau (0..1). */
  sync(phys: MotorbikePhysics, alpha = 1): void {
    const a = phys.prev;
    const b = phys.curr;
    this.root.position.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
    const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    this.root.rotation.set(0, a.yaw + dyaw * alpha, 0);
    const susp = (phys.suspension(0) + phys.suspension(1)) / 2;
    this.model.position.y = BIKE_TUNING.connectionY - susp - BIKE.wheelRadius;
    // Chúc đầu nhẹ theo chênh lệch giảm xóc trước/sau (phanh gấp, lên vỉa).
    this.model.rotation.x = Math.atan2(phys.suspension(1) - phys.suspension(0), BIKE.wheelBase) * 0.8;
    this.model.rotation.z = -phys.lean;
    this.steerGroup.rotation.y = phys.steer;
    this.frontSpin.rotation.x = phys.wheelSpin[0] as number;
    this.rearSpin.rotation.x = phys.wheelSpin[1] as number;
  }
}
