import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '@/physics/physics';
import { GROUP, interaction } from '@/physics/groups';
import { CAR, CAR_WHEELS } from './carModel';
import type { BikeControls } from './motorbikePhysics';

/** Thông số lái kiểu arcade cho ô tô 4 chỗ (dẫn động cầu sau). */
export const CAR_TUNING = {
  mass: 1250,
  maxSpeed: 28, // m/s ≈ 100 km/h
  reverseSpeed: 6,
  /** Lực kéo mỗi bánh sau (N). */
  engineForce: 3300,
  /** Phanh mỗi bánh (xung lực tối đa mỗi bước). */
  brakeForce: 42,
  handbrakeForce: 60,
  rollingBrake: 2.2, // nhả ga thì xe tự chậm dần
  steerMaxLow: 0.6,
  steerMaxHigh: 0.07,
  steerRate: 2.6, // rad/s
  steerReturn: 4.5,
  suspensionRest: 0.3,
  connectionY: 0.12,
  stiffness: 42,
  compression: 3.4,
  relaxation: 4.4,
  maxTravel: 0.24,
  frictionSlip: 2.6,
  sideStiffness: 1.1,
} as const;

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/**
 * Vật lý ô tô: như xe máy (motorbikePhysics.ts) nhưng bốn bánh — thân Rapier động khoá nghiêng (chỉ xoay quanh trục
 * đứng) + DynamicRayCastVehicleController, lái hai bánh trước, kéo hai bánh sau. Chúi đầu / nghiêng thân khi phanh,
 * cua là hiệu ứng hình tính từ độ nén giảm xóc (carView.ts). Thân xe thuộc thêm nhóm CAR để trụ chắn miệng hẻm cản lại.
 */
export class CarPhysics {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  steer = 0;
  /** Tốc độ dọc thân xe (m/s, âm = lùi). */
  speed = 0;
  /** Góc chúi đầu (+ = chúi xuống khi phanh) và nghiêng thân (+ = nghiêng sang phải khi cua trái) cho hình ảnh (rad). */
  pitch = 0;
  roll = 0;
  readonly wheelSpin = [0, 0, 0, 0];
  /** Biến thiên tốc độ lớn nhất trong bước gần nhất (để phát hiện đâm xe). */
  impact = 0;
  lastSpeed = 0;
  /** Số bước bỏ qua phát hiện va chạm (sau khi đặt lại xe). */
  private impactGrace = 0;
  /** Trạng thái hai bước vật lý gần nhất (để nội suy hình ảnh giữa các bước). */
  readonly prev = { x: 0, y: 0, z: 0, yaw: 0 };
  readonly curr = { x: 0, y: 0, z: 0, yaw: 0 };

  constructor(
    private readonly RAPIER: Rapier,
    private readonly world: RAPIER.World,
    x: number,
    y: number,
    z: number,
    yaw: number,
  ) {
    const T = CAR_TUNING;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y + restHeight(), z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .enabledRotations(false, true, false)
        .setLinearDamping(0.06)
        .setAngularDamping(2.2)
        .setCcdEnabled(true),
    );
    // Hộp va chạm thân xe, gầm cách đất ~0,25 m để bó vỉa chỉ chạm tia giảm xóc.
    const hx = CAR.width / 2;
    const hy = 0.42;
    const hz = CAR.length / 2;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(0, 0.33, 0)
        .setDensity(T.mass / (8 * hx * hy * hz))
        .setFriction(0.3)
        .setRestitution(0.05)
        .setCollisionGroups(interaction(GROUP.VEHICLE | GROUP.CAR, GROUP.ALL))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      this.body,
    );

    this.snapshot();
    this.snapshot();
    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    CAR_WHEELS.forEach(([wx, wz], i) => {
      this.vehicle.addWheel({ x: wx, y: T.connectionY, z: wz }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, T.suspensionRest, CAR.wheelRadius);
      this.vehicle.setWheelSuspensionStiffness(i, T.stiffness);
      this.vehicle.setWheelSuspensionCompression(i, T.compression);
      this.vehicle.setWheelSuspensionRelaxation(i, T.relaxation);
      this.vehicle.setWheelMaxSuspensionTravel(i, T.maxTravel);
      this.vehicle.setWheelFrictionSlip(i, T.frictionSlip);
      this.vehicle.setWheelSideFrictionStiffness(i, T.sideStiffness);
    });
  }

  /** Hướng đầu xe (rad, 0 = +Z). */
  heading(): number {
    const q = this.body.rotation();
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  /** Chiều dài giảm xóc hiện tại của bánh i (m). */
  suspension(i: number): number {
    return this.vehicle.wheelSuspensionLength(i) ?? CAR_TUNING.suspensionRest;
  }

  grounded(): boolean {
    for (let i = 0; i < 4; i++) if (this.vehicle.wheelIsInContact(i)) return true;
    return false;
  }

  /** Tốc độ dọc thân xe tính trực tiếp từ vận tốc thân. */
  forwardSpeed(): number {
    const h = this.heading();
    const lv = this.body.linvel();
    return lv.x * Math.sin(h) + lv.z * Math.cos(h);
  }

  /** Lưu vị trí sau bước vật lý (gọi SAU world.step()). */
  snapshot(): void {
    Object.assign(this.prev, this.curr);
    const t = this.body.translation();
    this.curr.x = t.x;
    this.curr.y = t.y;
    this.curr.z = t.z;
    this.curr.yaw = this.heading();
  }

  /** Một bước vật lý cố định (gọi TRƯỚC world.step()). */
  update(dt: number, c: BikeControls): void {
    const T = CAR_TUNING;
    const v = this.forwardSpeed();
    this.speed = v;
    const speedAbs = Math.abs(v);

    // Lái: góc tối đa giảm theo tốc độ, bẻ lái mượt, tự trả lái khi buông.
    const steerMax = T.steerMaxLow + (T.steerMaxHigh - T.steerMaxLow) * Math.pow(clamp(speedAbs / 24, 0, 1), 0.7);
    const goal = c.steer * steerMax;
    const rate = c.steer === 0 ? T.steerReturn : T.steerRate;
    this.steer += clamp(goal - this.steer, -rate * dt, rate * dt);
    this.vehicle.setWheelSteering(0, this.steer);
    this.vehicle.setWheelSteering(1, this.steer);

    // Ga / phanh / lùi.
    let engine = 0;
    let brake = 0;
    if (c.throttle > 0) {
      if (v < -0.4) brake = T.brakeForce;
      else engine = T.engineForce * c.throttle * Math.pow(clamp(1 - v / T.maxSpeed, 0, 1), 0.6);
    } else if (c.throttle < 0) {
      if (v > 0.4) brake = T.brakeForce * -c.throttle;
      else engine = v > -T.reverseSpeed ? T.engineForce * 0.5 * c.throttle : 0;
    } else {
      brake = T.rollingBrake;
    }
    const rearSide = c.handbrake ? T.sideStiffness * 0.4 : T.sideStiffness;
    for (let i = 0; i < 4; i++) {
      const rear = i >= 2;
      this.vehicle.setWheelEngineForce(i, rear ? engine : 0);
      this.vehicle.setWheelBrake(i, brake + (rear && c.handbrake ? T.handbrakeForce : 0));
      if (rear) this.vehicle.setWheelSideFrictionStiffness(i, rearSide);
    }

    this.vehicle.updateVehicle(dt, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, interaction(GROUP.VEHICLE, GROUP.WORLD | GROUP.PROP), (col) => col.handle !== this.collider.handle);

    // Chúi đầu theo gia tốc dọc, nghiêng thân theo gia tốc ngang (v · tốc độ quay đầu) — chỉ là hiệu ứng hình.
    const blend = 1 - Math.exp(-7 * dt);
    const pitchGoal = this.grounded() ? clamp(((this.lastSpeed - v) / dt) * 0.006, -0.045, 0.07) : 0;
    const rollGoal = clamp(v * this.body.angvel().y * 0.007, -0.075, 0.075);
    this.pitch += (pitchGoal - this.pitch) * blend;
    this.roll += (rollGoal - this.roll) * blend;

    for (let i = 0; i < 4; i++) this.wheelSpin[i] = (this.wheelSpin[i] as number) + (v * dt) / CAR.wheelRadius;

    this.impact = this.impactGrace > 0 ? 0 : Math.abs(v - this.lastSpeed);
    if (this.impactGrace > 0) this.impactGrace--;
    this.lastSpeed = v;
  }

  /** Đặt xe đứng yên tại chỗ (khi kẹt, hoặc đưa xe tới chỗ mới). */
  reset(x: number, y: number, z: number, yaw: number): void {
    this.body.setTranslation({ x, y: y + restHeight() + 0.05, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.lastSpeed = 0;
    this.impact = 0;
    this.impactGrace = 3;
    this.world.propagateModifiedBodyPositionsToColliders();
    this.snapshot();
    this.snapshot();
  }
}

/** Độ cao gốc thân xe so với mặt đất khi giảm xóc duỗi hết. */
function restHeight(): number {
  return CAR_TUNING.suspensionRest + CAR.wheelRadius - CAR_TUNING.connectionY;
}

/** Độ cao gốc thân xe khi xe đứng yên trên đường phẳng (bốn giảm xóc lún đều vì sức nặng của xe). */
export function rideHeight(): number {
  return restHeight() - 9.81 / (4 * CAR_TUNING.stiffness);
}
