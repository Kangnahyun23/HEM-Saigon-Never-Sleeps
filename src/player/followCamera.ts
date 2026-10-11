import * as THREE from 'three/webgpu';
import type { PhysicsWorld } from '@/physics/physics';
import { GROUP, interaction } from '@/physics/groups';

export interface CameraRig {
  /** Điểm nhìn (thường là ngang vai nhân vật). */
  target: THREE.Vector3;
  /** Khoảng cách mong muốn tới điểm nhìn. */
  distance: number;
  /** Hướng phía sau mà camera nên tự xoay về (rad) khi người chơi không rê chuột; null = không tự xoay. */
  followYaw: number | null;
  /** Tốc độ tự xoay về sau lưng (1/s). */
  followRate: number;
  /** Góc nhìn rộng thêm khi chạy nhanh (độ). */
  fovBoost: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Camera góc nhìn thứ 3: xoay bằng chuột, tự về sau lưng khi lái xe, zoom bằng con lăn,
 * không xuyên tường (bắn tia từ điểm nhìn ra vị trí camera, gặp vật cản thì kéo camera lại gần).
 */
export class FollowCamera {
  yaw = Math.PI;
  pitch = 0.32;
  zoom = 1;
  private currentDist = 4;
  private readonly smoothTarget = new THREE.Vector3();
  private initialized = false;
  private readonly baseFov: number;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly physics: PhysicsWorld,
  ) {
    this.baseFov = camera.fov;
  }

  /** Hướng nhìn ngang hiện tại (dùng để quy đổi WASD sang hướng đi trong thế giới). */
  forward(): { x: number; z: number } {
    return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
  }

  /** Hệ số độ nhạy chuột (cài đặt). */
  sensitivity = 1;
  /** Đảo trục dọc (cài đặt). */
  invertY = false;

  look(dx: number, dy: number): void {
    const k = this.sensitivity;
    this.yaw = wrap(this.yaw - dx * 0.0032 * k);
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0026 * k * (this.invertY ? -1 : 1), -0.3, 1.25);
  }

  /** Rung camera (đòn đánh trúng, va chạm) — biên độ m, tắt dần nhanh. */
  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }
  private shakeAmp = 0;
  private shakeTime = 0;

  addZoom(steps: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom + steps * 0.12, 0.55, 2.2);
  }

  update(dt: number, rig: CameraRig, userIsLooking: boolean): void {
    if (!this.initialized) {
      this.smoothTarget.copy(rig.target);
      this.currentDist = rig.distance;
      this.initialized = true;
    }
    // Điểm nhìn bám theo mượt (bám nhanh theo trục đứng để không giật khi lên vỉa hè).
    const k = 1 - Math.exp(-14 * dt);
    this.smoothTarget.x += (rig.target.x - this.smoothTarget.x) * k;
    this.smoothTarget.z += (rig.target.z - this.smoothTarget.z) * k;
    this.smoothTarget.y += (rig.target.y - this.smoothTarget.y) * (1 - Math.exp(-8 * dt));

    // Tự xoay về sau lưng.
    if (rig.followYaw !== null && !userIsLooking) {
      const diff = wrap(rig.followYaw - this.yaw);
      this.yaw = wrap(this.yaw + diff * (1 - Math.exp(-rig.followRate * dt)));
      this.pitch += (0.28 - this.pitch) * (1 - Math.exp(-1.2 * dt));
    }

    const want = rig.distance * this.zoom;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));

    // Chống xuyên tường: tia từ điểm nhìn ra phía camera, chỉ xét nhà/cột/vật tĩnh.
    const { RAPIER, world } = this.physics;
    const ray = new RAPIER.Ray(this.smoothTarget, dir);
    const hit = world.castRay(ray, want + 0.3, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC, interaction(GROUP.ALL, GROUP.WORLD));
    const allowed = hit ? Math.max(0.6, hit.timeOfImpact - 0.3) : want;
    // Thu vào ngay lập tức, nới ra từ từ.
    this.currentDist = allowed < this.currentDist ? allowed : this.currentDist + (allowed - this.currentDist) * (1 - Math.exp(-3 * dt));

    this.camera.position.copy(this.smoothTarget).addScaledVector(dir, this.currentDist);
    // Không để camera chui xuống đất.
    this.camera.position.y = Math.max(this.camera.position.y, 0.4);
    this.camera.lookAt(this.smoothTarget);
    if (this.shakeAmp > 0.001) {
      // Rung theo hàm sin lệch tần số (tất định, không cần số ngẫu nhiên), tắt dần.
      this.shakeTime += dt;
      const t = this.shakeTime;
      this.camera.position.x += Math.sin(t * 53) * this.shakeAmp;
      this.camera.position.y += Math.sin(t * 71 + 1.3) * this.shakeAmp * 0.6;
      this.camera.position.z += Math.sin(t * 61 + 2.1) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-14 * dt);
    }

    const fov = this.baseFov + rig.fovBoost;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-4 * dt));
      this.camera.updateProjectionMatrix();
    }
  }
}
