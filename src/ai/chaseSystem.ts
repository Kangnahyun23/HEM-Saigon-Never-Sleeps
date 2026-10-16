import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import { float, mix, vec3 } from 'three/tsl';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import type { SightGrid } from '@/systems/heat';
import { nightUniform } from '@/world/nightGlow';
import { CHASE, ChaseSim, chaserCapacity, type ChaseConfig, type Chaser, type ChaserKind, type ChasePlayer } from './chase';
import type { HemMap } from './hemNav';
import type { NearRiderView } from './nearRiders';
import type { Obstacle } from './traffic';
import { TrafficFleetView, type FleetPose } from './trafficFleetView';
import { bodyHalfExtents } from './trafficKinds';
import type { TrafficNetwork } from './trafficNetwork';
import { TrafficView, type BikePose, type RiderStyle } from './trafficView';

const PARK_Y = -60;

/** Xe đang truy đuổi (không tính xe đang rút lui) cho bản đồ nhỏ. */
export interface ChaseUnit {
  x: number;
  z: number;
  yaw: number;
}

/** Thân Rapier dùng chung cho một loại xe: thân rảnh nằm cất dưới đất, có xe thì gán thân. */
interface BodyPool {
  bodies: RAPIER.RigidBody[];
  /** Id xe đang dùng thân tương ứng (-1 = rảnh). */
  owner: number[];
  /** Độ cao tâm thân. */
  y: number;
}

/** Đèn chớp trên từng loại xe: tâm ô đèn bên trái (x, cao, lùi) — ô bên phải đối xứng — và cỡ ô đèn. */
const LIGHT_BAR: Record<ChaserKind, { x: number; y: number; z: number; size: readonly [number, number, number] }> = {
  // Giá sau yên xe máy.
  bike: { x: 0.1, y: 1.1, z: -0.74, size: [0.18, 0.1, 0.1] },
  // Giàn đèn trên nóc ô tô (trùng chỗ hai ô đèn của mẫu xe công an, to hơn một chút để chớp nổi lên).
  car: { x: 0.27, y: 1.49, z: -0.15, size: [0.5, 0.13, 0.25] },
};

/**
 * Xe truy đuổi trong game (đàn em của Phát hoặc công an): mô phỏng + thân Rapier kinematic (đâm vào là té) + hình.
 * Xe máy dùng chung lớp vẽ xe máy NPC; ô tô công an (từ 3 sao, chốt chặn) dùng lớp vẽ đàn xe NPC với mẫu 'police'.
 * Công an có thêm đèn chớp đỏ – xanh. Không tạo mảng / đối tượng mỗi khung hình.
 */
export class ChaseSystem {
  readonly sim: ChaseSim;
  /** Người lái có xương cho các xe máy truy đuổi gần camera (null: người lái khối hộp). Chọn người theo `generation`. */
  riders: NearRiderView | null = null;
  private readonly view: TrafficView;
  private readonly fleet: TrafficFleetView | null = null;
  private readonly pools: Record<ChaserKind, BodyPool>;
  private readonly bikePoses: BikePose[] = [];
  private readonly carPoses: FleetPose[] = [];
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
    hems: HemMap | null = null,
  ) {
    this.sim = new ChaseSim(network, sight, seed, config, hems);
    const { bike: max, car: maxCars } = chaserCapacity(config);
    this.view = new TrafficView(max, style);
    scene.add(this.view.root);
    const { RAPIER, world } = physics;
    const pool = (count: number, half: { x: number; y: number; z: number }, tag: number): BodyPool => {
      const out: BodyPool = { bodies: [], owner: [], y: half.y };
      for (let i = 0; i < count; i++) {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(tag * 40, PARK_Y - i * 3, 0));
        world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(interaction(GROUP.VEHICLE, GROUP.ALL)), body);
        out.bodies.push(body);
        out.owner.push(-1);
      }
      return out;
    };
    this.pools = { bike: pool(max, { x: 0.32, y: 0.6, z: 0.95 }, 0), car: pool(maxCars, bodyHalfExtents('police'), 1) };
    for (let i = 0; i < max; i++) {
      this.bikePoses.push({ id: i, x: 0, z: 0, yaw: 0, lean: 0, prevX: 0, prevZ: 0, prevYaw: 0, prevLean: 0, generation: 0 });
    }
    for (let i = 0; i < maxCars; i++) {
      this.carPoses.push({ id: i, kind: 'police', x: 0, z: 0, yaw: 0, prevX: 0, prevZ: 0, prevYaw: 0, wheel: 0, generation: 0 });
    }
    for (let i = 0; i < max + maxCars; i++) this.units.push({ x: 0, z: 0, yaw: 0 });
    if (maxCars > 0) {
      this.fleet = new TrafficFleetView(this.carPoses.map(() => 'police' as const));
      this.fleet.update(this.carPoses, 0, 1, 0);
      scene.add(this.fleet.root);
    }
    if (style === 'police') {
      // Đèn chớp: hai ô sáng (đỏ trái, xanh phải) mỗi xe; chớp bằng cách đổi cỡ, sáng hơn khi tối (ăn bloom).
      const total = max + maxCars;
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.colorNode = vec3(1, 1, 1).mul(mix(float(1.2), float(5), nightUniform));
      const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, total * 2);
      lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const c = new THREE.Color();
      for (let i = 0; i < total; i++) {
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
    for (const kind of ['bike', 'car'] as const) {
      const pool = this.pools[kind];
      // Trả thân của xe đã biến mất về chỗ cất.
      for (let b = 0; b < pool.bodies.length; b++) {
        const owner = pool.owner[b]!;
        if (owner < 0) continue;
        let alive = false;
        for (let i = 0; i < chasers.length; i++) if (chasers[i]!.id === owner) alive = true;
        if (!alive) {
          pool.owner[b] = -1;
          pool.bodies[b]!.setTranslation({ x: 0, y: PARK_Y - b * 3, z: kind === 'car' ? 40 : 0 }, false);
        }
      }
    }
    // Gán thân rảnh cho xe mới; xe đang có thân thì dời tới chỗ mới.
    const pos = this.bodyPos;
    const rot = this.bodyRot;
    for (let i = 0; i < chasers.length; i++) {
      const c = chasers[i]!;
      const pool = this.pools[c.kind];
      const b = pool.owner.indexOf(c.id);
      pos.x = c.x;
      pos.y = pool.y;
      pos.z = c.z;
      rot.y = Math.sin(c.yaw / 2);
      rot.w = Math.cos(c.yaw / 2);
      if (b >= 0) {
        pool.bodies[b]!.setNextKinematicTranslation(pos);
        pool.bodies[b]!.setNextKinematicRotation(rot);
        continue;
      }
      const free = pool.owner.indexOf(-1);
      if (free < 0) continue;
      pool.owner[free] = c.id;
      pool.bodies[free]!.setTranslation(pos, true);
      pool.bodies[free]!.setRotation(rot, true);
    }
    return caught;
  }

  /** Thêm vào `out` vật cản của các xe đứng giữa đường (chốt chặn, xe dừng cho công an xuống, xe bỏ lại). */
  addObstacles(out: Obstacle[]): void {
    this.sim.addObstacles(out);
  }

  /** Cập nhật hình mỗi khung hình; (cx, cz) = camera — chọn xe nào có người lái vẽ bằng nhân vật có xương. */
  render(alpha: number, dt = 0, cx = 0, cz = 0): void {
    const chasers = this.sim.chasers;
    let bikes = 0;
    let cars = 0;
    this.unitCount = 0;
    for (let i = 0; i < chasers.length; i++) {
      const c = chasers[i]!;
      // Lớp vẽ đánh số theo vị trí trong mảng: dùng id xe làm "generation" để mỗi xe giữ diện mạo riêng.
      if (c.kind === 'bike' && bikes < this.bikePoses.length) copyBike(this.bikePoses[bikes]!, c, bikes++);
      else if (c.kind === 'car' && cars < this.carPoses.length) copyCar(this.carPoses[cars]!, c, cars++);
      else continue;
      if (c.leaving) continue;
      const u = this.units[this.unitCount++]!;
      u.x = c.prevX + (c.x - c.prevX) * alpha;
      u.z = c.prevZ + (c.z - c.prevZ) * alpha;
      u.yaw = c.yaw;
    }
    const riders = this.riders;
    if (riders) riders.update(this.bikePoses, bikes, alpha, dt, cx, cz);
    this.view.update(this.bikePoses, alpha, bikes, riders);
    this.fleet?.update(this.carPoses, 0, alpha, cars);
    if (this.lights) this.renderLights(alpha, dt);
  }

  /** Đèn chớp: đỏ và xanh thay nhau (4 lần / giây), mỗi xe lệch pha một chút. */
  private renderLights(alpha: number, dt: number): void {
    const lights = this.lights as THREE.InstancedMesh;
    this.time += dt;
    const chasers = this.sim.chasers;
    const n = Math.min(chasers.length, lights.instanceMatrix.count / 2);
    for (let i = 0; i < n; i++) {
      const c = chasers[i]!;
      const bar = LIGHT_BAR[c.kind];
      const x = c.prevX + (c.x - c.prevX) * alpha;
      const z = c.prevZ + (c.z - c.prevZ) * alpha;
      this.q.setFromEuler(this.e.set(0, c.yaw, -c.lean, 'YXZ'));
      const redOn = Math.floor(this.time * 8 + i * 0.5) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        const on = (k === 0) === redOn;
        this.p.set(k === 0 ? -bar.x : bar.x, bar.y, bar.z).applyQuaternion(this.q);
        this.p.x += x;
        this.p.z += z;
        this.s.set(bar.size[0], bar.size[1], bar.size[2]).multiplyScalar(on ? 1 : 0.4);
        this.m.compose(this.p, this.q, this.s);
        lights.setMatrixAt(i * 2 + k, this.m);
      }
    }
    lights.count = n * 2;
    lights.visible = n > 0;
    lights.instanceMatrix.needsUpdate = true;
  }

  /** Không dùng vật lý nữa (dọn dẹp khi huỷ game). */
  dispose(): void {
    for (const pool of [this.pools.bike, this.pools.car]) for (const b of pool.bodies) this.physics.world.removeRigidBody(b);
  }
}

function copyBike(out: BikePose, c: Chaser, slot: number): void {
  out.id = slot;
  out.generation = c.id + 1;
  out.riderless = !c.rider;
  out.x = c.x;
  out.z = c.z;
  out.yaw = c.yaw;
  out.lean = c.lean;
  out.prevX = c.prevX;
  out.prevZ = c.prevZ;
  out.prevYaw = c.prevYaw;
  out.prevLean = c.prevLean;
}

function copyCar(out: FleetPose, c: Chaser, slot: number): void {
  out.id = slot;
  out.generation = c.id + 1;
  out.x = c.x;
  out.z = c.z;
  out.yaw = c.yaw;
  out.prevX = c.prevX;
  out.prevZ = c.prevZ;
  out.prevYaw = c.prevYaw;
}
