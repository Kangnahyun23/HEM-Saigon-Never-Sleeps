import * as THREE from 'three/webgpu';
import type { CharacterId } from '@/assets/manifest';
import { createRng, pick } from '@/core/random';
import { reachArm } from '@/player/armIk';
import { RIDER_POSE } from '@/vehicles/bikeModel';
import { castAvailable, CIVILIANS, hipIn, NPC_ACTION, NPC_CLIPS, stepNpc, type ArmChain, type NpcBody, type NpcSource } from './npcBody';
import { PedestrianLod } from './pedestrianLod';
import { bikeLook, type BikePose, type RiderSet, type RiderStyle } from './trafficView';

/** Bán kính (m) quanh camera vẽ người lái xe máy bằng nhân vật có xương (xa hơn: khối hộp trong TrafficView). */
const NEAR_RADIUS = 35;
/** Ngả người về trước quanh hông (RIDER_POSE.leanForward). */
const LEAN_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), RIDER_POSE.leanForward);

/** Mẫu người có thể ngồi xe: id + khoảng chiều cao (m). CIVILIANS thoả kiểu này. */
export interface RiderCast {
  readonly id: CharacterId;
  readonly height: readonly [number, number];
}

/** Công an lái xe: nam / nữ (quân phục ô-liu nướng vào ảnh màu lúc tải — assets/outfits.ts). */
export const POLICE_RIDERS: readonly RiderCast[] = [
  { id: 'police-m', height: [1.66, 1.76] },
  { id: 'police-f', height: [1.58, 1.68] },
];

/**
 * Đàn em của Phát: thanh niên mặc đồ đen (kho hình riêng mặc GANG_CLOTHES). Không dùng mẫu áo thun đỏ / quần kaki:
 * màu đó gần màu da nên không nhuộm đen được.
 */
export const GANG_RIDERS: readonly RiderCast[] = [
  { id: 'man-shirt', height: [1.64, 1.76] },
  { id: 'man-polo', height: [1.64, 1.76] },
];

export interface RiderOptions {
  /** Phe của đàn xe (màu mũ theo `bikeLook`). Mặc định 'civilian'. */
  readonly style?: RiderStyle;
  /** Mẫu người ngồi xe. Mặc định CIVILIANS. */
  readonly cast?: readonly RiderCast[];
  /**
   * Id xe không bền (xe truy đuổi đánh số theo chỗ trong mảng, đổi khi có xe biến mất) ⇒ chọn người lái chỉ theo
   * `generation` (duy nhất mỗi xe), để người lái không đổi mặt giữa chừng.
   */
  readonly byGeneration?: boolean;
}

interface Slot {
  /** Id xe đang chở (−1 = trống) và lượt thả của xe đó (xe được thả lại ⇒ người lái khác). */
  pose: number;
  generation: number;
  npc: NpcBody | null;
  /** Hông so với gốc nhân vật trong tư thế lái (toạ độ của hình, đã nhân co giãn): cao, dọc. */
  hipY: number;
  hipZ: number;
}

/** Hông trong tư thế lái xe (toạ độ của hình, trên 1 đơn vị co giãn) — đo một lần mỗi mẫu người. */
const driveHip = new Map<CharacterId, THREE.Vector3>();

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _frame = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _target = new THREE.Vector3();
const _pole = new THREE.Vector3();

/** IK một tay lên tay nắm: `side` = 1 tay trái (+X), −1 tay phải; khung xe = quaternion `q` + gốc (ox, 0, oz). */
function gripBar(chain: ArmChain, side: number, q: THREE.Quaternion, ox: number, oz: number): void {
  const wrist = RIDER_POSE.wrist;
  const elbow = RIDER_POSE.elbowPole;
  _target.set(wrist[0] * side, wrist[1], wrist[2]).applyQuaternion(q);
  _target.x += ox;
  _target.z += oz;
  _pole.set(elbow[0] * side, elbow[1], elbow[2]).applyQuaternion(q);
  _pole.x += ox;
  _pole.z += oz;
  reachArm(chain[0], chain[1], chain[2], _target, _pole);
}

/** Hạt giống chọn người lái cho xe `id` ở lượt thả `generation` (chuỗi riêng, không đụng chuỗi màu xe của bikeLook). */
const riderSeed = (id: number, generation: number): number => id * 6151 + generation * 92821 + 17;

/**
 * Người lái xe máy gần camera: tối đa `capacity` xe gần nhất có người lái vẽ bằng nhân vật có xương (mẫu người theo
 * phe — dân thường, công an, đàn em; động tác lái xe, mũ bảo hiểm cùng màu mũ khối hộp lúc ở xa); TrafficView bỏ khối
 * người lái của đúng các xe này (`has`). Hình lấy từ kho NPC, người lái nghiêng theo xe khi cua.
 */
export class NearRiderView implements RiderSet {
  readonly lod: PedestrianLod;
  private readonly slots: Slot[] = [];
  private readonly targets = new Array<number>(NPC_CLIPS.length).fill(0);
  private readonly style: RiderStyle;
  private readonly cast: readonly RiderCast[];
  private readonly byGeneration: boolean;

  constructor(
    capacity: number,
    private readonly pool: NpcSource,
    options: RiderOptions = {},
  ) {
    this.style = options.style ?? 'civilian';
    this.cast = options.cast ?? CIVILIANS;
    this.byGeneration = options.byGeneration ?? false;
    this.lod = new PedestrianLod(capacity, NEAR_RADIUS);
    for (let k = 0; k < capacity; k++) this.slots.push({ pose: -1, generation: -1, npc: null, hipY: 0, hipZ: 0 });
  }

  /** Có đủ mẫu người (`cast`) + động tác để dùng không (thiếu thì người lái vẫn là khối hộp). */
  static available(cast: readonly RiderCast[] = CIVILIANS): boolean {
    return castAvailable(cast);
  }

  /** Hình người lái của xe `id`, hoặc null nếu xe đó đang dùng khối hộp. */
  riderOf(id: number): NpcBody | null {
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k]!;
      if (slot.pose === id) return slot.npc;
    }
    return null;
  }

  /** Xe `id` đang có người lái vẽ bằng nhân vật có xương. */
  has(id: number): boolean {
    return this.riderOf(id) !== null;
  }

  /** Số người lái đang vẽ bằng nhân vật có xương (debug / test). */
  get active(): number {
    let n = 0;
    for (let k = 0; k < this.slots.length; k++) if (this.slots[k]!.npc) n++;
    return n;
  }

  /** Trả hình của ô về kho (ẩn, thôi cập nhật xương). */
  private release(slot: Slot): void {
    if (slot.npc) this.pool.give(slot.npc);
    slot.npc = null;
  }

  private assign(slot: Slot, pose: BikePose): void {
    this.release(slot);
    slot.pose = pose.id;
    slot.generation = pose.generation;
    const rng = createRng(riderSeed(this.byGeneration ? 0 : pose.id, pose.generation));
    const look = pick(rng, this.cast);
    const height = look.height[0] + rng() * (look.height[1] - look.height[0]);
    const npc = this.pool.take(look.id);
    slot.npc = npc;
    if (!npc) return;
    const scale = npc.perMeter * height;
    npc.body.scale.setScalar(scale);
    let hip = driveHip.get(look.id);
    if (!hip) {
      hip = hipIn(npc, NPC_ACTION.drive);
      driveHip.set(look.id, hip);
    }
    slot.hipY = hip.y * scale;
    slot.hipZ = hip.z * scale;
    npc.helmet.visible = true;
    npc.helmet.material.color.set(bikeLook(pose.id, pose.generation, this.style).colors.helmet);
    // Vào ngay tư thế lái (không trộn dần từ tư thế gốc); lệch pha để các người lái không cử động đều nhau.
    npc.weights[NPC_ACTION.drive] = 1;
    npc.actions[NPC_ACTION.drive]!.setEffectiveWeight(1);
    npc.mixer.setTime(rng() * 2);
  }

  /**
   * Chọn các xe gần camera (cx, cz) rồi đặt người lái lên yên theo vị trí / hướng / độ nghiêng nội suy của xe.
   * `count`: chỉ xét `count` xe đầu của `poses` (xe máy). Gọi TRƯỚC TrafficView.update. Không tạo đối tượng mỗi khung hình.
   */
  update(poses: readonly BikePose[], count: number, alpha: number, dt: number, cx: number, cz: number): void {
    this.lod.update(poses, cx, cz, count);
    const t = this.targets;
    t[NPC_ACTION.drive] = 1;
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k]!;
      const id = this.lod.slots[k]!;
      if (id < 0) {
        this.release(slot);
        slot.pose = -1;
        continue;
      }
      const p = poses[id]!;
      if (slot.pose !== id || slot.generation !== p.generation) this.assign(slot, p);
      const npc = slot.npc;
      if (!npc) continue;
      const dyaw = Math.atan2(Math.sin(p.yaw - p.prevYaw), Math.cos(p.yaw - p.prevYaw));
      // Khung xe như TrafficView: Euler 'YXZ' (0, hướng, −nghiêng); người lái là một khối cứng trên khung đó, ngả về
      // trước quanh hông; gốc nhân vật đặt sao cho hông nằm đúng chỗ ngồi (RIDER_POSE.hip) — trong động tác lái gốc
      // hông lùi sau gốc nhân vật ~0,35 m.
      _e.set(0, p.prevYaw + dyaw * alpha, -(p.prevLean + (p.lean - p.prevLean) * alpha));
      _frame.setFromEuler(_e);
      const body = npc.body;
      const ox = p.prevX + (p.x - p.prevX) * alpha;
      const oz = p.prevZ + (p.z - p.prevZ) * alpha;
      body.quaternion.copy(_frame).multiply(LEAN_FORWARD);
      const hip = RIDER_POSE.hip;
      _v.set(hip[0], hip[1], hip[2]).applyQuaternion(_frame);
      _w.set(0, slot.hipY, slot.hipZ).applyQuaternion(body.quaternion);
      body.position.set(ox + _v.x - _w.x, _v.y - _w.y, oz + _v.z - _w.z);
      stepNpc(npc, t, 10, dt);
      // Tay nắm ghi-đông (sau bộ trộn: IK ghi đè góc hai đoạn tay).
      const arms = npc.arms;
      if (arms) {
        gripBar(arms.left, 1, _frame, ox, oz);
        gripBar(arms.right, -1, _frame, ox, oz);
      }
    }
    t[NPC_ACTION.drive] = 0;
  }
}
