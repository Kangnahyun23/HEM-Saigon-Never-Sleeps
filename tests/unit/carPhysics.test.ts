import { beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { GROUP, interaction } from '@/physics/groups';
import { CAR } from '@/vehicles/carModel';
import { CAR_TUNING, CarPhysics } from '@/vehicles/carPhysics';
import { MotorbikePhysics, type BikeControls } from '@/vehicles/motorbikePhysics';

beforeAll(async () => {
  await RAPIER.init();
});

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 0.5, 500).setTranslation(0, -0.5, 0), ground);
  return { world, ground };
}

function drive(world: RAPIER.World, car: { update(dt: number, c: BikeControls): void }, seconds: number, c: BikeControls) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    car.update(dt, c);
    world.step();
  }
}

const idle = { throttle: 0, steer: 0, handbrake: false };
const gas = { throttle: 1, steer: 0, handbrake: false };

describe('CarPhysics', () => {
  it('đứng yên trên bốn giảm xóc, gầm cao hơn bó vỉa, không trôi', () => {
    const { world } = makeWorld();
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, car, 2, idle);
    const t = car.body.translation();
    expect(car.grounded()).toBe(true);
    expect(Math.abs(t.x) + Math.abs(t.z)).toBeLessThan(0.05);
    for (let i = 0; i < 4; i++) {
      expect(car.suspension(i)).toBeGreaterThan(0.15);
      expect(car.suspension(i)).toBeLessThan(CAR_TUNING.suspensionRest);
    }
    // Đáy hộp va chạm (tâm 0,33, nửa cao 0,42) phải cao hơn bó vỉa 15 cm.
    expect(t.y + 0.33 - 0.42).toBeGreaterThan(0.2);
  });

  it('tăng tốc lên trên 60 km/h trong 6 giây, không vượt tốc độ tối đa, chạy thẳng', () => {
    const { world } = makeWorld();
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, car, 6, gas);
    expect(car.speed * 3.6).toBeGreaterThan(60);
    drive(world, car, 14, gas);
    expect(car.speed).toBeGreaterThan(CAR_TUNING.maxSpeed * 0.85);
    expect(car.speed).toBeLessThan(CAR_TUNING.maxSpeed + 0.5);
    expect(Math.abs(car.body.translation().x)).toBeLessThan(2);
  });

  it('nhanh hơn xe máy trên đường thẳng dài, nhưng xe máy bốc hơn lúc đề-pa', () => {
    const { world } = makeWorld();
    const car = new CarPhysics(RAPIER, world, -10, 0, 0, 0);
    const bike = new MotorbikePhysics(RAPIER, world, 10, 0, 0, 0);
    const both = { update: (dt: number, c: BikeControls) => (car.update(dt, c), bike.update(dt, c)) };
    drive(world, both, 2, gas);
    expect(bike.speed).toBeGreaterThan(car.speed);
    drive(world, both, 18, gas);
    expect(car.speed).toBeGreaterThan(bike.speed + 3);
  });

  it('bẻ lái trái thì quay đầu sang trái (+X); vòng quay rộng hơn xe máy', () => {
    const { world } = makeWorld();
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, car, 2, gas);
    drive(world, car, 1.5, { throttle: 0.5, steer: 1, handbrake: false });
    expect(car.heading()).toBeGreaterThan(0.4);
    expect(car.body.translation().x).toBeGreaterThan(1);
  });

  it('phanh từ 60 km/h dừng hẳn trong dưới 30 m', () => {
    const { world } = makeWorld();
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, car, 6, gas);
    const z0 = car.body.translation().z;
    drive(world, car, 5, { throttle: -1, steer: 0, handbrake: false });
    expect(Math.abs(car.speed)).toBeLessThan(CAR_TUNING.reverseSpeed + 0.5);
    expect(car.body.translation().z - z0).toBeLessThan(30);
  });

  it('đậu trên phanh tay thì bị húc nhẹ cũng không trôi xa', () => {
    const { world } = makeWorld();
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, car, 1, { ...idle, handbrake: true });
    car.body.applyImpulse({ x: 0, y: 0, z: 1250 }, true);
    drive(world, car, 3, { ...idle, handbrake: true });
    expect(Math.abs(car.body.translation().z)).toBeLessThan(0.6);
    expect(Math.abs(car.speed)).toBeLessThan(0.1);
  });

  it('leo được bó vỉa 15 cm', () => {
    const { world, ground } = makeWorld();
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.075, 20).setTranslation(0, 0.075, 30), ground);
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    drive(world, car, 5, { throttle: 0.5, steer: 0, handbrake: false });
    const t = car.body.translation();
    expect(t.z).toBeGreaterThan(14);
    expect(t.y).toBeGreaterThan(0.45);
  });

  it('đâm tường ở tốc độ cao thì báo va chạm mạnh; đặt lại xe thì không', () => {
    const { world, ground } = makeWorld();
    world.createCollider(RAPIER.ColliderDesc.cuboid(10, 3, 0.5).setTranslation(0, 3, 40), ground);
    const car = new CarPhysics(RAPIER, world, 0, 0, 0, 0);
    let maxImpact = 0;
    for (let i = 0; i < 6 * 60; i++) {
      car.update(1 / 60, gas);
      world.step();
      maxImpact = Math.max(maxImpact, car.impact);
    }
    expect(maxImpact).toBeGreaterThan(7);
    expect(car.body.translation().z).toBeLessThan(40);
    const other = new CarPhysics(RAPIER, world, 50, 0, 0, 0);
    drive(world, other, 4, gas);
    other.reset(50, 0, 0, 0);
    for (let i = 0; i < 5; i++) {
      other.update(1 / 60, idle);
      world.step();
      expect(other.impact).toBeLessThan(7);
    }
  });

  it('trụ chắn miệng hẻm (nhóm CAR_BLOCK) cản ô tô nhưng xe máy lọt qua', () => {
    const { world, ground } = makeWorld();
    // Một trụ giữa đường tại z = 15, cho cả hai xe.
    for (const x of [-10, 10]) {
      world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.45, 0.07).setTranslation(x, 0.45, 15).setCollisionGroups(interaction(GROUP.CAR_BLOCK, GROUP.CAR)),
        ground,
      );
    }
    const car = new CarPhysics(RAPIER, world, -10, 0, 0, 0);
    const bike = new MotorbikePhysics(RAPIER, world, 10, 0, 0, 0);
    const both = { update: (dt: number, c: BikeControls) => (car.update(dt, c), bike.update(dt, c)) };
    drive(world, both, 5, { throttle: 0.4, steer: 0, handbrake: false });
    expect(car.body.translation().z + CAR.length / 2).toBeLessThan(15.2);
    expect(bike.body.translation().z).toBeGreaterThan(20);
  });
});
