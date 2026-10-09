import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier } from '@/physics/physics';
import { GROUP, interaction } from '@/physics/groups';

/** Thông số di chuyển nhân vật (m, m/s, m/s²). */
export const CHARACTER = {
  radius: 0.28,
  halfHeight: 0.58, // tổng chiều cao ≈ 2 × (0.58 + 0.28) = 1.72 m
  walkSpeed: 2.3,
  runSpeed: 6.4,
  accelGround: 16,
  accelAir: 3.5,
  gravity: 24,
  jumpSpeed: 7.2,
  stepHeight: 0.42,
  turnRate: 12,
} as const;

export interface MoveIntent {
  /** Hướng muốn đi trên mặt phẳng XZ (độ dài 0..1). */
  x: number;
  z: number;
  run: boolean;
  jump: boolean;
}

const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Thân vật lý của nhân vật đi bộ: capsule kinematic + Rapier KinematicCharacterController.
 * Tự leo bậc ≤ 42 cm (bó vỉa, bậc thềm), bám mặt đất khi xuống dốc, trượt dọc tường.
 * Không phụ thuộc three.js để unit test được.
 */
export class CharacterBody {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  /** Vận tốc hiện tại (m/s). */
  vx = 0;
  vy = 0;
  vz = 0;
  /** Hướng mặt (rad, 0 = +Z). */
  yaw = 0;
  grounded = false;
  /** Tốc độ ngang thực tế ở bước gần nhất (m/s). */
  actualSpeed = 0;
  /** Thời điểm rời đất gần nhất — cho phép nhảy trễ một chút ("coyote time"). */
  private airTime = 0;
  private enabled = true;

  constructor(
    private readonly RAPIER: Rapier,
    private readonly world: RAPIER.World,
    x: number,
    y: number,
    z: number,
  ) {
    const { radius, halfHeight } = CHARACTER;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + halfHeight + radius, z));
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(interaction(GROUP.PLAYER, GROUP.ALL)),
      this.body,
    );
    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(CHARACTER.stepHeight, 0.15, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(70);
    this.snapshot();
    this.snapshot();
  }

  /** Vị trí bàn chân (mặt đất dưới nhân vật). */
  feet(): { x: number; y: number; z: number } {
    const t = this.body.translation();
    return { x: t.x, y: t.y - CHARACTER.halfHeight - CHARACTER.radius, z: t.z };
  }

  horizontalSpeed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  teleport(x: number, y: number, z: number, yaw = this.yaw): void {
    this.body.setTranslation({ x, y: y + CHARACTER.halfHeight + CHARACTER.radius, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + CHARACTER.halfHeight + CHARACTER.radius, z });
    this.vx = this.vy = this.vz = 0;
    this.yaw = yaw;
    // Đưa collider tới chỗ mới ngay, nếu không bước kế tiếp sẽ quét va chạm ở vị trí cũ.
    this.world.propagateModifiedBodyPositionsToColliders();
    this.snapshot();
    this.snapshot();
  }

  /** Vị trí chân ở hai bước vật lý gần nhất (để nội suy hình ảnh). */
  readonly prev = { x: 0, y: 0, z: 0 };
  readonly curr = { x: 0, y: 0, z: 0 };

  /** Lưu vị trí sau bước vật lý (gọi SAU world.step()). */
  snapshot(): void {
    Object.assign(this.prev, this.curr);
    Object.assign(this.curr, this.feet());
  }

  /** Bật/tắt va chạm (tắt khi đang ngồi trên xe). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    this.collider.setEnabled(on);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Một bước vật lý cố định. Gọi TRƯỚC world.step(). */
  update(dt: number, intent: MoveIntent): void {
    if (!this.enabled) return;
    const len = Math.min(1, Math.hypot(intent.x, intent.z));
    const target = intent.run ? CHARACTER.runSpeed : CHARACTER.walkSpeed;
    const dirX = len > 1e-3 ? intent.x / Math.hypot(intent.x, intent.z) : 0;
    const dirZ = len > 1e-3 ? intent.z / Math.hypot(intent.x, intent.z) : 0;
    const wantX = dirX * target * len;
    const wantZ = dirZ * target * len;

    // Tăng/giảm tốc mượt về vận tốc mong muốn.
    const accel = this.grounded ? CHARACTER.accelGround : CHARACTER.accelAir;
    const dx = wantX - this.vx;
    const dz = wantZ - this.vz;
    const dl = Math.hypot(dx, dz);
    const maxDelta = accel * dt * (this.grounded && len < 1e-3 ? 1.6 : 1);
    if (dl <= maxDelta) {
      this.vx = wantX;
      this.vz = wantZ;
    } else {
      this.vx += (dx / dl) * maxDelta;
      this.vz += (dz / dl) * maxDelta;
    }

    // Trọng lực + nhảy.
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (intent.jump && this.airTime < 0.12 && this.vy <= 0.01) {
      this.vy = CHARACTER.jumpSpeed;
      this.airTime = 1;
    }
    this.vy -= CHARACTER.gravity * dt;

    const desired = { x: this.vx * dt, y: this.vy * dt, z: this.vz * dt };
    this.controller.computeColliderMovement(this.collider, desired, this.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, interaction(GROUP.PLAYER, GROUP.WORLD | GROUP.PROP | GROUP.VEHICLE));
    const moved = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
    // Đụng trần thì rơi xuống.
    if (this.vy > 0 && moved.y < desired.y * 0.5) this.vy = 0;
    // Tốc độ thực tế (sau va chạm) — dùng cho hoạt hoạ; vận tốc mong muốn giữ nguyên để còn leo bậc được.
    if (dt > 0) this.actualSpeed = Math.hypot(moved.x, moved.z) / dt;

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z });

    // Quay mặt theo hướng di chuyển.
    if (len > 0.05) {
      const goal = Math.atan2(dirX, dirZ);
      const diff = wrapAngle(goal - this.yaw);
      this.yaw = wrapAngle(this.yaw + diff * Math.min(1, CHARACTER.turnRate * dt));
    }
  }
}
