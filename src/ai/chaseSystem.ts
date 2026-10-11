import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import { float, mix, vec3 } from 'three/tsl';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import type { SightGrid } from '@/systems/heat';
import { nightUniform } from '@/world/nightGlow';
import { CHASE, ChaseSim, type ChaseConfig, type Chaser, type ChasePlayer } from './chase';
import type { TrafficNetwork } from './trafficNetwork';
import { TrafficView, type BikePose, type RiderStyle } from './trafficView';

const PARK_Y = -60;

/** Xe đang truy đuổi (không tính xe đang rút lui) cho bản đồ nhỏ. */
export interface ChaseUnit {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Xe truy đuổi trong game (đàn em của Phát hoặc công an): mô phỏng + thân Rapier kinematic (đâm vào là té) + hình
 * (dùng chung lớp vẽ xe NPC). Công an có thêm đèn chớp đỏ – xanh sau yên. Không tạo mảng / đối tượng mỗi khung hình.
 */
export class ChaseSystem {
  readonly sim: ChaseSim;
  private readonly view: TrafficView;
  private readonly bodies: RAPIER.RigidBody[] = [];
  /** Thân vật lý đang gán cho xe có id tương ứng (-1 = rảnh). */
  private readonly bodyOwner: number[] = [];
  private readonly poses: BikePose[] = [];
  /** Xe đang truy đuổi (cập nhật mỗi lần render) — bản đồ nhỏ đọc `units` + `unitCount`. */
  readonly units: ChaseUnit[] = [];
  unitCount = 0;
  private readonly lights: THREE.InstancedMesh | null = null;
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  /** Vị trí / hướng thân vật lý dùng lại mỗi bước. */
  private readonly bodyPos = { x: 0, y: 0.6, z: 0 };
  private readonly bodyRot = { x: 0, y: 0, z: 0, w: 1 };

  constructor(
    scene: THREE.Scene,
    private readonly physics: PhysicsWorld,
    network: TrafficNetwork,
    sight: SightGrid,
    seed: number,
    style: RiderStyle = 'gang',
    config: ChaseConfig = CHASE,
  ) {
    this.sim = new ChaseSim(network, sight, seed, config);
    const max = Math.max(...config.perLevel) + 3;
    this.view = new TrafficView(max, style);
    scene.add(this.view.root);
    const { RAPIER, world } = physics;
    for (let i = 0; i < max; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PARK_Y - i * 3, 0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.32, 0.6, 0.95).setCollisionGroups(interaction(GROUP.VEHICLE, GROUP.ALL)), body);
      this.bodies.push(body);
      this.bodyOwner.push(-1);
      this.poses.push({ id: i, x: 0, z: 0, yaw: 0, lean: 0, prevX: 0, prevZ: 0, prevYaw: 0, prevLean: 0, generation: 0 });
      this.units.push({ x: 0, z: 0, yaw: 0 });
    }
    if (style === 'police') {
      // Đèn chớp: hai ô sáng (đỏ trái, xanh phải) sau yên mỗi xe; chớp bằng cách đổi cỡ, sáng hơn khi tối (ăn bloom).
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.colorNode = vec3(1, 1, 1).mul(mix(float(1.2), float(5), nightUniform));
      const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max * 2);
      lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color();
      for (let i = 0; i < max; i++) {
        lights.setColorAt(i * 2, c.set('#ff2a2a'));
        lights.setColorAt(i * 2 + 1, c.set('#2a6bff'));
      }
      lights.count = 0;
      lights.frustumCulled = false;
      lights.castShadow = false;
      lights.name = 'police-lights';
      scene.add(lights);
      this.lights = lights;
    }
  }

  /** Một bước cố định (trước physics.step). Trả về true nếu Tín vừa bị chặn đầu / bị bắt. */
  step(dt: number, player: ChasePlayer, level: number): boolean {
    const caught = this.sim.update(dt, player, level);
    const chasers = this.sim.chasers;
    // Trả thân của xe đã biến mất; gán thân rảnh cho xe mới; xe đang có thân thì dời tới chỗ mới.
    for (let b = 0; b < this.bodies.length; b++) {
      const owner = this.bodyOwner[b]!;
      if (owner < 0) continue;
      let alive = false;
      for (let i = 0; i < chasers.length; i++) if (chasers[i]!.id === owner) alive = true;
      if (!alive) {
        this.bodyOwner[b] = -1;
        this.bodies[b]!.setTranslation({ x: 0, y: PARK_Y - b * 3, z: 0 }, false);
      }
    }
    const pos = this.bodyPos;
    const rot = this.bodyRot;
    for (let i = 0; i < chasers.length; i++) {
      const c = chasers[i]!;
      const b = this.bodyOwner.indexOf(c.id);
      pos.x = c.x;
      pos.z = c.z;
      rot.y = Math.sin(c.yaw / 2);
      rot.w = Math.cos(c.yaw / 2);
      if (b >= 0) {
        this.bodies[b]!.setNextKinematicTranslation(pos);
        this.bodies[b]!.setNextKinematicRotation(rot);
        continue;
      }
      const free = this.bodyOwner.indexOf(-1);
      if (free < 0) continue;
      this.bodyOwner[free] = c.id;
      this.bodies[free]!.setTranslation(pos, true);
      this.bodies[free]!.setRotation(rot, true);
    }
    return caught;
  }

  render(alpha: number, dt = 0): void {
    const chasers = this.sim.chasers;
    const n = Math.min(chasers.length, this.poses.length);
    // Lớp vẽ đánh số theo vị trí trong mảng: dùng id xe làm "generation" để mỗi xe giữ diện mạo riêng.
    for (let i = 0; i < n; i++) copyPose(this.poses[i]!, chasers[i]!, i);
    this.view.update(this.poses, alpha, n);
    this.unitCount = 0;
    for (let i = 0; i < n; i++) {
      const c = chasers[i]!;
      if (c.leaving) continue;
      const u = this.units[this.unitCount++]!;
      u.x = c.prevX + (c.x - c.prevX) * alpha;
      u.z = c.prevZ + (c.z - c.prevZ) * alpha;
      u.yaw = c.yaw;
    }
    if (this.lights) this.renderLights(alpha, dt, n);
  }

  /** Đèn chớp sau yên: đỏ và xanh thay nhau (4 lần / giây), mỗi xe lệch pha một chút. */
  private renderLights(alpha: number, dt: number, n: number): void {
    const lights = this.lights as THREE.InstancedMesh;
    this.time += dt;
    for (let i = 0; i < n; i++) {
      const c = this.sim.chasers[i]!;
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.q.setFromEuler(this.e.set(0, c.yaw, -c.lean, 'YXZ'));
      const redOn = Math.floor(this.time * 8 + i * 0.5) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        const on = (k === 0) === redOn;
        // Thanh đèn trên giá sau yên (cục bộ: x ±0,1, cao 1,1, lùi 0,74).
        this.p.set(k === 0 ? -0.1 : 0.1, 1.1, -0.74).applyQuaternion(this.q);
        this.p.x += x;
        this.p.z += z;
        this.s.set(0.18, 0.1, 0.1).multiplyScalar(on ? 1 : 0.4);
        this.m.compose(this.p, this.q, this.s);
        lights.setMatrixAt(i * 2 + k, this.m);
      }
    }
    lights.count = n * 2;
    lights.instanceMatrix.needsUpdate = true;
  }

  /** Không dùng vật lý nữa (dọn dẹp khi huỷ game). */
  dispose(): void {
    for (const b of this.bodies) this.physics.world.removeRigidBody(b);
  }
}

function copyPose(out: BikePose, c: Chaser, slot: number): void {
  out.id = slot;
  out.generation = c.id + 1;
  out.x = c.x;
  out.z = c.z;
  out.yaw = c.yaw;
  out.lean = c.lean;
  out.prevX = c.prevX;
  out.prevZ = c.prevZ;
  out.prevYaw = c.prevYaw;
  out.prevLean = c.prevLean;
}
