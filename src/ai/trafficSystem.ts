import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import type { CityLayout } from '@/world/city/layout';
import { TrafficSim, type Focus, type Obstacle, type TrafficOptions } from './traffic';
import type { NearRiderView } from './nearRiders';
import { TrafficFleetView } from './trafficFleetView';
import { bodyHalfExtents } from './trafficKinds';
import { buildTrafficNetwork } from './trafficNetwork';
import { TrafficView } from './trafficView';

/**
 * Giao thông NPC gắn vào game: mô phỏng (logic) + thân va chạm kinematic trong Rapier + hình instanced.
 * Thân kinematic để xe người chơi đâm vào là té, và Tín đi bộ không xuyên qua xe.
 */
export class TrafficSystem {
  readonly sim: TrafficSim;
  /** Hình xe máy + người lái. */
  readonly view: TrafficView;
  /** Hình các loại xe khác (null nếu đàn xe chỉ có xe máy). */
  readonly fleet: TrafficFleetView | null;
  /** Người lái có xương cho các xe máy gần camera (null: mọi người lái là khối hộp). */
  riders: NearRiderView | null = null;
  private readonly bodies: RAPIER.RigidBody[] = [];
  /** Độ cao tâm thân va chạm của từng xe. */
  private readonly heights: number[] = [];
  private readonly generations: number[] = [];
  /** Vector / quaternion tạm dùng lại mỗi bước (Rapier chỉ đọc giá trị). */
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };

  constructor(scene: THREE.Scene, private readonly physics: PhysicsWorld, layout: CityLayout, focus: Focus, options: Partial<TrafficOptions> = {}) {
    this.sim = new TrafficSim(buildTrafficNetwork(layout), focus, options);
    const agents = this.sim.agents;
    this.view = new TrafficView(this.sim.bikes);
    scene.add(this.view.root);
    this.fleet = agents.length > this.sim.bikes ? new TrafficFleetView(agents.slice(this.sim.bikes).map((a) => a.kind)) : null;
    if (this.fleet) scene.add(this.fleet.root);

    const { RAPIER, world } = physics;
    for (const a of agents) {
      const half = bodyHalfExtents(a.kind);
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x, half.y, a.z));
      world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z).setCollisionGroups(interaction(GROUP.VEHICLE, GROUP.ALL)), body);
      this.bodies.push(body);
      this.heights.push(half.y);
      this.generations.push(a.generation);
    }
  }

  /** Một bước cố định, gọi TRƯỚC `physics.step()`. */
  step(dt: number, focus: Focus, obstacles: readonly Obstacle[]): void {
    this.sim.step(dt, focus, obstacles);
    const pos = this.pos;
    const rot = this.rot;
    const agents = this.sim.agents;
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i] as (typeof agents)[number];
      const body = this.bodies[i] as RAPIER.RigidBody;
      pos.x = a.x;
      pos.y = this.heights[i] as number;
      pos.z = a.z;
      rot.y = Math.sin(a.yaw / 2);
      rot.w = Math.cos(a.yaw / 2);
      if (this.generations[i] !== a.generation) {
        // Xe vừa được thả lại chỗ khác: dịch chuyển tức thời, không "quét" qua cả khu phố.
        this.generations[i] = a.generation;
        body.setTranslation(pos, true);
        body.setRotation(rot, true);
      } else {
        body.setNextKinematicTranslation(pos);
        body.setNextKinematicRotation(rot);
      }
    }
  }

  /** Cập nhật hình mỗi khung hình; (cx, cz) = camera — chọn xe nào có người lái vẽ bằng nhân vật có xương. */
  render(alpha: number, dt = 0, cx = 0, cz = 0): void {
    const riders = this.riders;
    if (riders) riders.update(this.sim.agents, this.sim.bikes, alpha, dt, cx, cz);
    this.view.update(this.sim.agents, alpha, this.sim.bikes, riders);
    this.fleet?.update(this.sim.agents, this.sim.bikes, alpha);
  }

  dispose(): void {
    for (const b of this.bodies) this.physics.world.removeRigidBody(b);
    this.view.root.removeFromParent();
    this.fleet?.root.removeFromParent();
  }
}
