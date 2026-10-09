import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './physics';
import { GROUP, interaction } from './groups';

/**
 * Gom mọi vật cản tĩnh (nhà, vỉa hè, cột điện, cây…) vào MỘT thân cố định với nhiều collider.
 */
export class StaticWorld {
  readonly body: RAPIER.RigidBody;
  colliders = 0;

  constructor(private readonly physics: PhysicsWorld) {
    const { RAPIER, world } = physics;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  /** Hộp: tâm (cx, cy, cz), kích thước đầy đủ (sx, sy, sz), xoay quanh Y. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, group: number = GROUP.WORLD): void {
    const { RAPIER, world } = this.physics;
    const desc = RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2)
      .setTranslation(cx, cy, cz)
      .setFriction(0.9)
      .setCollisionGroups(interaction(group, GROUP.ALL));
    if (yaw !== 0) desc.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    world.createCollider(desc, this.body);
    this.colliders++;
  }

  /** Trụ đứng: tâm đáy (x, y0, z). */
  cylinder(x: number, y0: number, z: number, radius: number, height: number, group: number = GROUP.WORLD): void {
    const { RAPIER, world } = this.physics;
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(height / 2, radius)
        .setTranslation(x, y0 + height / 2, z)
        .setFriction(0.8)
        .setCollisionGroups(interaction(group, GROUP.ALL)),
      this.body,
    );
    this.colliders++;
  }
}
