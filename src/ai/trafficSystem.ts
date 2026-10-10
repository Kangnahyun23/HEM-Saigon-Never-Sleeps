import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import type { CityLayout } from '@/world/city/layout';
import { TrafficSim, type Focus, type Obstacle, type TrafficOptions } from './traffic';
import { buildTrafficNetwork } from './trafficNetwork';
import { TrafficView } from './trafficView';

const BODY_HALF = { x: 0.32, y: 0.6, z: 0.95 } as const;

/**
 * Giao thông NPC gắn vào game: mô phỏng (logic) + thân va chạm kinematic trong Rapier + hình instanced.
 * Thân kinematic để xe người chơi đâm vào là té, và Tín đi bộ không xuyên qua xe.
 */
export class TrafficSystem {
  readonly sim: TrafficSim;
  readonly view: TrafficView;
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly generations: number[] = [];
  /** Vector / quaternion tạm dùng lại mỗi bước (Rapier chỉ đọc giá trị). */
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };

  constructor(scene: THREE.Scene, private readonly physics: PhysicsWorld, layout: CityLayout, focus: Focus, options: Partial<TrafficOptions> = {}) {
    this.sim = new TrafficSim(buildTrafficNetwork(layout), focus, options);
    this.view = new TrafficView(this.sim.agents.length);
    scene.add(this.view.root);

    const { RAPIER, world } = physics;
    for (const a of this.sim.agents) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(a.x, BODY_HALF.y, a.z));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(BODY_HALF.x, BODY_HALF.y, BODY_HALF.z).setCollisionGroups(interaction(GROUP.VEHICLE, GROUP.ALL)),
        body,
      );
      this.bodies.push(body);
      this.generations.push(a.generation);
    }
  }

  /** Một bước cố định, gọi TRƯỚC `physics.step()`. */
  step(dt: number, focus: Focus, obstacles: readonly Obstacle[]): void {
    this.sim.step(dt, focus, obstacles);
    const pos = this.pos;
    const rot = this.rot;
    this.sim.agents.forEach((a, i) => {
      const body = this.bodies[i] as RAPIER.RigidBody;
      pos.x = a.x;
      pos.y = BODY_HALF.y;
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
    });
  }

  /** Cập nhật hình mỗi khung hình. */
  render(alpha: number): void {
    this.view.update(this.sim.agents, alpha);
  }

  dispose(): void {
    for (const b of this.bodies) this.physics.world.removeRigidBody(b);
    this.view.root.removeFromParent();
  }
}
