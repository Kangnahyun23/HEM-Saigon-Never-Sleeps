import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '@/physics/physics';
import { GROUP, interaction } from '@/physics/groups';
import { BIKE } from './bikeModel';

/** Thông số lái kiểu arcade cho xe số ~110 cc chở một người. */
export const BIKE_TUNING = {
  mass: 175, // xe + người
  maxSpeed: 21, // m/s ≈ 75 km/h
  reverseSpeed: 2.2, // "đẩy lùi" bằng chân
  engineForce: 1150,
  brakeForce: 9,
  handbrakeForce: 8,
  rollingBrake: 0.6, // nhả ga thì xe tự chậm dần
  steerMaxLow: 0.62,
  steerMaxHigh: 0.045,
  steerRate: 3.2, // rad/s
  steerReturn: 5,
  suspensionRest: 0.22,
  connectionY: 0.15,
  stiffness: 58,
  compression: 3.2,
  relaxation: 4.2,
  maxTravel: 0.22,
  frictionSlip: 3.2,
  sideStiffness: 1.25,
} as const;

export interface BikeControls {
  /** -1..1: ga (+) / phanh–lùi (−). */
  throttle: number;
  /** -1..1: trái (+) / phải (−). */
  steer: number;
  handbrake: boolean;
}

export const NO_CONTROL: BikeControls = { throttle: 0, steer: 0, handbrake: false };

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/**
 * Vật lý xe máy: thân Rapier động khoá nghiêng (chỉ xoay quanh trục đứng) + DynamicRayCastVehicleController
 * với 2 bánh (giảm xóc thật, bám đường, lái bánh trước, kéo bánh sau). Nghiêng xe khi cua chỉ là hiệu ứng hình.
 */
export class MotorbikePhysics {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly vehicle: RAPIER.DynamicRayCastVehicleController;
  steer = 0;
  /** Tốc độ dọc thân xe (m/s, âm = lùi). */
  speed = 0;
  /** Góc nghiêng hình ảnh mong muốn (rad, + = nghiêng trái). */
  lean = 0;
  wheelSpin = [0, 0];
  /** Biến thiên tốc độ lớn nhất trong bước gần nhất (để phát hiện đâm xe). */
  impact = 0;
  /** Tốc độ trước bước gần nhất (để tính quán tính khi văng khỏi xe). */
  lastSpeed = 0;
  /** Số bước bỏ qua phát hiện va chạm (sau khi dựng lại xe). */
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
    const T = BIKE_TUNING;
    const restHeight = T.suspensionRest + BIKE.wheelRadius - T.connectionY;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y + restHeight, z)
        .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
        .enabledRotations(false, true, false)
        .setLinearDamping(0.08)
        .setAngularDamping(2.5)
        .setCcdEnabled(true),
    );
    // Hộp va chạm thân xe, nhấc khỏi đất ~0.25 m để bó vỉa chỉ chạm tia giảm xóc.
    const hx = 0.2;
    const hy = 0.36;
    const hz = 0.9;
    const volume = 8 * hx * hy * hz;
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(0, 0.4, 0)
        .setDensity(T.mass / volume)
        .setFriction(0.3)
        .setRestitution(0.05)
        .setCollisionGroups(interaction(GROUP.VEHICLE, GROUP.ALL))
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      this.body,
    );

    this.snapshot();
    this.snapshot();
    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    this.vehicle.setIndexForwardAxis = 2;
    const half = BIKE.wheelBase / 2;
    for (const zc of [half, -half]) {
      this.vehicle.addWheel({ x: 0, y: T.connectionY, z: zc }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, T.suspensionRest, BIKE.wheelRadius);
    }
    for (let i = 0; i < 2; i++) {
      this.vehicle.setWheelSuspensionStiffness(i, T.stiffness);
      this.vehicle.setWheelSuspensionCompression(i, T.compression);
      this.vehicle.setWheelSuspensionRelaxation(i, T.relaxation);
      this.vehicle.setWheelMaxSuspensionTravel(i, T.maxTravel);
      this.vehicle.setWheelFrictionSlip(i, T.frictionSlip);
      this.vehicle.setWheelSideFrictionStiffness(i, T.sideStiffness);
    }
  }

  /** Hướng đầu xe (rad, 0 = +Z). */
  heading(): number {
    const q = this.body.rotation();
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  /** Chiều dài giảm xóc hiện tại của bánh i (m). */
  suspension(i: number): number {
    return this.vehicle.wheelSuspensionLength(i) ?? BIKE_TUNING.suspensionRest;
  }

  grounded(): boolean {
    return this.vehicle.wheelIsInContact(0) || this.vehicle.wheelIsInContact(1);
  }

  /** Tốc độ dọc thân xe tính trực tiếp từ vận tốc thân (không trễ một bước như currentVehicleSpeed). */
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
    const T = BIKE_TUNING;
    const v = this.forwardSpeed();
    this.speed = v;
    const speedAbs = Math.abs(v);

    // Lái: góc tối đa giảm theo tốc độ, bẻ lái mượt, tự trả lái khi buông.
    const steerMax = T.steerMaxLow + (T.steerMaxHigh - T.steerMaxLow) * Math.pow(clamp(speedAbs / 18, 0, 1), 0.7);
    const goal = c.steer * steerMax;
    const rate = c.steer === 0 ? T.steerReturn : T.steerRate;
    this.steer += clamp(goal - this.steer, -rate * dt, rate * dt);
    this.vehicle.setWheelSteering(0, this.steer);

    // Ga / phanh / lùi.
    let engine = 0;
    let brake = 0;
    if (c.throttle > 0) {
      if (v < -0.4) brake = T.brakeForce;
      else engine = T.engineForce * c.throttle * Math.pow(clamp(1 - v / T.maxSpeed, 0, 1), 0.55);
    } else if (c.throttle < 0) {
      if (v > 0.4) brake = T.brakeForce * -c.throttle;
      else engine = v > -T.reverseSpeed ? T.engineForce * 0.35 * c.throttle : 0;
    } else {
      brake = T.rollingBrake;
    }
    this.vehicle.setWheelEngineForce(1, engine);
    this.vehicle.setWheelBrake(0, brake);
    this.vehicle.setWheelBrake(1, brake + (c.handbrake ? T.handbrakeForce : 0));
    if (c.handbrake) this.vehicle.setWheelSideFrictionStiffness(1, T.sideStiffness * 0.35);
    else this.vehicle.setWheelSideFrictionStiffness(1, T.sideStiffness);

    this.vehicle.updateVehicle(dt, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, interaction(GROUP.VEHICLE, GROUP.WORLD | GROUP.PROP), (col) => col.handle !== this.collider.handle);

    // Nghiêng khi cua: tan(nghiêng) = v² · tan(lái) / (L · g).
    const leanGoal = clamp(Math.atan((v * v * Math.tan(this.steer)) / (BIKE.wheelBase * 9.81)), -0.62, 0.62);
    this.lean += (leanGoal - this.lean) * (1 - Math.exp(-6 * dt));

    for (let i = 0; i < 2; i++) this.wheelSpin[i] = (this.wheelSpin[i] as number) + (v * dt) / BIKE.wheelRadius;

    this.impact = this.impactGrace > 0 ? 0 : Math.abs(v - this.lastSpeed);
    if (this.impactGrace > 0) this.impactGrace--;
    this.lastSpeed = v;
  }

  /** Dựng xe đứng yên tại chỗ (khi lật/kẹt). */
  reset(x: number, y: number, z: number, yaw: number): void {
    const T = BIKE_TUNING;
    this.body.setTranslation({ x, y: y + T.suspensionRest + BIKE.wheelRadius - T.connectionY + 0.05, z }, true);
    this.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.lean = 0;
    this.speed = 0;
    this.lastSpeed = 0;
    this.impact = 0;
    this.impactGrace = 3;
    this.world.propagateModifiedBodyPositionsToColliders();
    this.snapshot();
    this.snapshot();
  }
}
