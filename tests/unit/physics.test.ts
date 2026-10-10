import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { stepWorld } from '@/physics/physics';

beforeAll(async () => {
  await RAPIER.init();
});

/** Mặt đất + nhiều vật cản tĩnh (như khu phố) + một quả bóng rơi lăn trên dốc. */
function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0), ground);
  for (let i = 0; i < 400; i++) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 2, 1).setTranslation(20 + (i % 20) * 4, 2, 20 + Math.floor(i / 20) * 4), ground);
  }
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 5, 0).setLinvel(3, 0, 1));
  world.createCollider(RAPIER.ColliderDesc.ball(0.5), ball);
  return { world, ball };
}

describe('stepWorld', () => {
  it('cho kết quả y hệt World.step()', () => {
    const a = makeWorld();
    const b = makeWorld();
    for (let i = 0; i < 240; i++) {
      a.world.step();
      stepWorld(b.world);
    }
    expect(b.ball.translation()).toEqual(a.ball.translation());
    expect(b.ball.linvel()).toEqual(a.ball.linvel());
  });

  it('tạo / xoá thân và collider giữa chừng vẫn tra cứu được đúng', () => {
    const { world, ball } = makeWorld();
    for (let i = 0; i < 30; i++) stepWorld(world);
    const box = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(5, 3, 5));
    const boxCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), box);
    for (let i = 0; i < 30; i++) stepWorld(world);
    expect(world.getRigidBody(box.handle)).toBe(box);
    expect(world.getCollider(boxCollider.handle)).toBe(boxCollider);
    // Tia bắn xuống trúng hộp vừa tạo.
    const hit = world.castRay(new RAPIER.Ray({ x: 5, y: 10, z: 5 }, { x: 0, y: -1, z: 0 }), 20, true);
    expect(hit?.collider).toBe(boxCollider);

    world.removeRigidBody(box);
    for (let i = 0; i < 10; i++) stepWorld(world);
    expect(world.getRigidBody(box.handle)).toBeNull();
    expect(world.getCollider(boxCollider.handle)).toBeNull();
    expect(world.getRigidBody(ball.handle)).toBe(ball);
  });
});
