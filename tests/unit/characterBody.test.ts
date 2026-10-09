import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { CharacterBody, CHARACTER } from '@/player/characterBody';

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(50, 0.5, 50).setTranslation(0, -0.5, 0), ground);
  return { world, ground };
}

function run(world: RAPIER.World, c: CharacterBody, seconds: number, intent: Parameters<CharacterBody['update']>[1]) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    c.update(dt, intent);
    world.step();
  }
}

const idle = { x: 0, z: 0, run: false, jump: false };

describe('CharacterBody', () => {
  it('đứng yên trên mặt đất, chân chạm y≈0', () => {
    const { world } = makeWorld();
    const c = new CharacterBody(RAPIER, world, 0, 0.3, 0);
    run(world, c, 1, idle);
    expect(c.grounded).toBe(true);
    expect(c.feet().y).toBeCloseTo(0, 1);
  });

  it('đi bộ và chạy đạt đúng tốc độ, quay mặt theo hướng đi', () => {
    const { world } = makeWorld();
    const c = new CharacterBody(RAPIER, world, 0, 0, 0);
    run(world, c, 2, { x: 1, z: 0, run: false, jump: false });
    expect(c.actualSpeed).toBeCloseTo(CHARACTER.walkSpeed, 1);
    expect(c.yaw).toBeCloseTo(Math.PI / 2, 1);
    run(world, c, 2, { x: 1, z: 0, run: true, jump: false });
    expect(c.actualSpeed).toBeCloseTo(CHARACTER.runSpeed, 1);
    expect(c.feet().x).toBeGreaterThan(10);
  });

  it('bị tường chặn lại', () => {
    const { world, ground } = makeWorld();
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 3, 5).setTranslation(5, 3, 0), ground);
    const c = new CharacterBody(RAPIER, world, 0, 0, 0);
    run(world, c, 4, { x: 1, z: 0, run: true, jump: false });
    expect(c.feet().x).toBeLessThan(4.5 - CHARACTER.radius + 0.05);
    expect(c.feet().x).toBeGreaterThan(3.9);
  });

  it('bước lên bó vỉa 15 cm nhưng không leo được bệ 1 m', () => {
    const { world, ground } = makeWorld();
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.075, 5).setTranslation(8, 0.075, 0), ground); // vỉa hè
    world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.5, 5).setTranslation(8, 0.5, 20), ground); // bệ cao
    const c = new CharacterBody(RAPIER, world, 0, 0, 0);
    run(world, c, 3, { x: 1, z: 0, run: false, jump: false });
    expect(c.feet().x).toBeGreaterThan(4);
    expect(c.feet().y).toBeCloseTo(0.15, 1);

    const d = new CharacterBody(RAPIER, world, 0, 0, 20);
    run(world, d, 3, { x: 1, z: 0, run: false, jump: false });
    expect(d.feet().x).toBeLessThan(3.1);
    expect(d.feet().y).toBeLessThan(0.1);
  });

  it('nhảy lên rồi rơi xuống đất', () => {
    const { world } = makeWorld();
    const c = new CharacterBody(RAPIER, world, 0, 0, 0);
    run(world, c, 0.5, idle);
    let peak = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 90; i++) {
      c.update(dt, { ...idle, jump: i === 0 });
      world.step();
      peak = Math.max(peak, c.feet().y);
    }
    expect(peak).toBeGreaterThan(0.65);
    expect(peak).toBeLessThan(1.5);
    expect(c.grounded).toBe(true);
    expect(c.feet().y).toBeCloseTo(0, 1);
  });
});
