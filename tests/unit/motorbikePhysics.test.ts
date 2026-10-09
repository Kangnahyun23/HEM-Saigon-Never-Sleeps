import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { BIKE_TUNING, MotorbikePhysics, type BikeControls } from '@/vehicles/motorbikePhysics';

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0), ground);
  return { world, ground };
}

function drive(world: RAPIER.World, bike: MotorbikePhysics, seconds: number, c: BikeControls) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    bike.update(dt, c);
    world.step();
  }
}

const idle = { throttle: 0, steer: 0, handbrake: false };

describe('MotorbikePhysics', () => {
  it('đứng yên trên giảm xóc, không lật, không trôi', () => {
    const { world } = makeWorld();
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 2, idle);
    const t = bike.body.translation();
    expect(bike.grounded()).toBe(true);
    expect(Math.abs(t.x) + Math.abs(t.z)).toBeLessThan(0.05);
    expect(t.y).toBeGreaterThan(0.2);
    expect(t.y).toBeLessThan(0.5);
  });

  it('tăng tốc lên trên 50 km/h trong 6 giây, không vượt tốc độ tối đa', () => {
    const { world } = makeWorld();
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 6, { throttle: 1, steer: 0, handbrake: false });
    expect(bike.speed * 3.6).toBeGreaterThan(50);
    drive(world, bike, 10, { throttle: 1, steer: 0, handbrake: false });
    expect(bike.speed).toBeLessThan(BIKE_TUNING.maxSpeed + 0.5);
    // Đi thẳng theo hướng đầu xe (+Z).
    const t = bike.body.translation();
    expect(t.z).toBeGreaterThan(100);
    expect(Math.abs(t.x)).toBeLessThan(2);
  });

  it('bẻ lái trái thì quay đầu sang trái (+X) và nghiêng vào cua', () => {
    const { world } = makeWorld();
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 3, { throttle: 1, steer: 0, handbrake: false });
    drive(world, bike, 1.5, { throttle: 0.6, steer: 1, handbrake: false });
    expect(bike.heading()).toBeGreaterThan(0.5);
    expect(bike.lean).toBeGreaterThan(0.1);
    expect(bike.body.translation().x).toBeGreaterThan(1);
  });

  it('phanh từ 50 km/h dừng hẳn trong dưới 25 m', () => {
    const { world } = makeWorld();
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 6, { throttle: 1, steer: 0, handbrake: false });
    const z0 = bike.body.translation().z;
    drive(world, bike, 5, { throttle: -1, steer: 0, handbrake: false });
    expect(Math.abs(bike.speed)).toBeLessThan(2.5);
    expect(bike.body.translation().z - z0).toBeLessThan(25);
  });

  it('chạy qua bó vỉa 15 cm mà không kẹt', () => {
    const { world, ground } = makeWorld();
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.075, 20).setTranslation(0, 0.075, 30), ground);
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 5, { throttle: 0.5, steer: 0, handbrake: false });
    const t = bike.body.translation();
    expect(t.z).toBeGreaterThan(14);
    expect(t.y).toBeGreaterThan(0.3);
  });

  it('lùi chậm khi giữ phanh lúc đã dừng', () => {
    const { world } = makeWorld();
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 3, { throttle: -1, steer: 0, handbrake: false });
    expect(bike.speed).toBeLessThan(-0.5);
    expect(bike.speed).toBeGreaterThan(-BIKE_TUNING.reverseSpeed - 0.5);
  });

  it('dựng lại xe (R) khi đang chạy không bị tính là đâm xe', () => {
    const { world } = makeWorld();
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, bike, 4, { throttle: 1, steer: 0, handbrake: false });
    expect(bike.speed).toBeGreaterThan(10);
    const t = bike.body.translation();
    bike.reset(t.x, 0, t.z, bike.heading());
    for (let i = 0; i < 5; i++) {
      bike.update(1 / 60, idle);
      world.step();
      expect(bike.impact).toBeLessThan(7);
    }
  });

  it('đâm tường ở tốc độ cao thì báo va chạm mạnh', () => {
    const { world, ground } = makeWorld();
    world.createCollider(RAPIER.ColliderDesc.cuboid(10, 3, 0.5).setTranslation(0, 3, 40), ground);
    const bike = new MotorbikePhysics(RAPIER, world, 0, 0, 0, 0);
    let maxImpact = 0;
    for (let i = 0; i < 6 * 60; i++) {
      bike.update(1 / 60, { throttle: 1, steer: 0, handbrake: false });
      world.step();
      maxImpact = Math.max(maxImpact, bike.impact);
    }
    expect(maxImpact).toBeGreaterThan(7);
    expect(bike.body.translation().z).toBeLessThan(40);
  });
});
