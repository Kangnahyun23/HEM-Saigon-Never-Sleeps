import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import type { SightGrid } from '@/systems/heat';
import { ChaseSim, CHASERS_PER_LEVEL, type ChasePlayer } from './chase';
import type { TrafficNetwork } from './trafficNetwork';
import { TrafficView } from './trafficView';

const MAX = CHASERS_PER_LEVEL[3] + 3;
const PARK_Y = -60;

/** Xe truy đuổi trong game: mô phỏng + thân Rapier kinematic (đâm vào là té) + hình (dùng chung lớp vẽ xe NPC). */
export class ChaseSystem {
  readonly sim: ChaseSim;
  private readonly view = new TrafficView(MAX, 'gang');
  private readonly bodies: RAPIER.RigidBody[] = [];
  private readonly owner = new Map<number, RAPIER.RigidBody>();

  constructor(scene: THREE.Scene, private readonly physics: PhysicsWorld, network: TrafficNetwork, sight: SightGrid, seed: number) {
    this.sim = new ChaseSim(network, sight, seed);
    scene.add(this.view.root);
    const { RAPIER, world } = physics;
    for (let i = 0; i < MAX; i++) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PARK_Y - i * 3, 0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.32, 0.6, 0.95).setCollisionGroups(interaction(GROUP.VEHICLE, GROUP.ALL)), body);
      this.bodies.push(body);
    }
  }

  /** Một bước cố định (trước physics.step). Trả về true nếu Tín vừa bị chặn đầu. */
  step(dt: number, player: ChasePlayer, level: number): boolean {
    const caught = this.sim.update(dt, player, level);
    // Gán thân vật lý cho từng xe đang có; thân thừa cất xuống dưới đất.
    const free = this.bodies.filter((b) => ![...this.owner.values()].includes(b));
    for (const id of [...this.owner.keys()]) {
      if (!this.sim.chasers.some((c) => c.id === id)) {
        const b = this.owner.get(id) as RAPIER.RigidBody;
        this.owner.delete(id);
        b.setTranslation({ x: 0, y: PARK_Y, z: 0 }, false);
        free.push(b);
      }
    }
    for (const c of this.sim.chasers) {
      let body = this.owner.get(c.id);
      const pos = { x: c.x, y: 0.6, z: c.z };
      const rot = { x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) };
      if (!body) {
        body = free.pop();
        if (!body) continue;
        this.owner.set(c.id, body);
        body.setTranslation(pos, true);
        body.setRotation(rot, true);
      } else {
        body.setNextKinematicTranslation(pos);
        body.setNextKinematicRotation(rot);
      }
    }
    return caught;
  }

  render(alpha: number): void {
    // Lớp vẽ đánh số theo vị trí trong mảng: dùng id xe làm "generation" để mỗi xe giữ diện mạo riêng.
    this.view.update(
      this.sim.chasers.map((c, i) => ({ ...c, id: i, generation: c.id + 1 })),
      alpha,
    );
  }

  get positions(): Array<{ x: number; z: number }> {
    return this.sim.chasers.filter((c) => !c.leaving).map((c) => ({ x: c.x, z: c.z }));
  }

  /** Không dùng vật lý nữa (dọn dẹp khi huỷ game). */
  dispose(): void {
    for (const b of this.bodies) this.physics.world.removeRigidBody(b);
  }
}
