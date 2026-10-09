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

export async function createPhysics(gravityY = -9.81): Promise<PhysicsWorld> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  const links: PhysicsWorld['links'] = [];

  return {
    RAPIER,
    world,
    links,
    step() {
      world.step();
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
