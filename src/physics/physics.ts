import RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';

export type Rapier = typeof RAPIER;

export interface PhysicsWorld {
  RAPIER: Rapier;
  world: RAPIER.World;
  /** Cặp thân vật lý ↔ mesh cần đồng bộ sau mỗi bước. */
  links: Array<{ body: RAPIER.RigidBody; mesh: THREE.Object3D }>;
  step(): void;
  syncMeshes(): void;
}

/**
 * Một bước mô phỏng KHÔNG kèm đồng bộ lại bảng ánh xạ handle → đối tượng JS.
 * `World.step()` của Rapier 0.21 sau mỗi bước duyệt lại TOÀN BỘ collider (hơn 3000 vật cản tĩnh của khu phố) qua callback
 * wasm → JS và tạo ~300 KB rác mỗi bước ⇒ trình duyệt dọn rác liên tục, game khựng. Bảng ánh xạ vốn đã được cập nhật
 * ngay khi tạo/xoá thân hay collider từ JS (createRigidBody, removeCollider…), nên ở đây gọi thẳng pipeline.
 */
export function stepWorld(world: RAPIER.World): void {
  world.physicsPipeline.step(
    world.gravity,
    world.integrationParameters,
    world.islands,
    world.broadPhase,
    world.narrowPhase,
    world.bodies,
    world.colliders,
    world.softBodies,
    world.impulseJoints,
    world.multibodyJoints,
    world.ccdSolver,
  );
}

export async function createPhysics(gravityY = -9.81): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  const links: PhysicsWorld['links'] = [];

  return {
    RAPIER,
    world,
    links,
    step() {
      stepWorld(world);
    },
    syncMeshes() {
      for (const { body, mesh } of links) {
        const t = body.translation();
        const r = body.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(r.x, r.y, r.z, r.w);
      }
    },
  };
}
