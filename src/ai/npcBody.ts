import * as THREE from 'three/webgpu';
import { attachToBone, createCharacter, getNpcClip, hasCharacter } from '@/assets/characters';
import { CHARACTERS, type AnimationName, type CharacterId } from '@/assets/manifest';
import { KeyedPool } from '@/core/keyedPool';
import { CIVILIANS } from './civilians';

export { CIVILIANS } from './civilians';

export function civiliansAvailable(): boolean {
  return CIVILIANS.every((c) => hasCharacter(c.id));
}

/**
 * Mọi động tác một NPC có xương có thể cần — người đi bộ, người ngồi quán, người bán hàng… — chung MỘT bảng chỉ số:
 * nhờ vậy mọi hệ thống dùng chung một kho hình theo mẫu người (NpcPool). Action trọng số 0 không tốn nội suy.
 */
export const NPC_CLIPS = [
  'idle',
  'phone',
  'talk',
  'foldArms',
  'walk',
  'walkFemale',
  'jog',
  'runFemale',
  'dodge',
  'hitChest',
  'knockback',
  'deathA',
  'deathB',
  'angry',
  'interact',
  'fightIdle',
  'jab',
  'sit',
  'sitTalk',
] as const satisfies readonly AnimationName[];
export type NpcClip = (typeof NPC_CLIPS)[number];

/** Chỉ số action của từng động tác trong mọi NpcBody. */
export const NPC_ACTION = Object.fromEntries(NPC_CLIPS.map((name, i) => [name, i])) as Readonly<Record<NpcClip, number>>;

/** Động tác chỉ phát một lần rồi giữ tư thế cuối (trúng đòn, ngã, gục, cú đấm). */
const ONCE: readonly NpcClip[] = ['hitChest', 'knockback', 'deathA', 'deathB', 'jab'];
/** Cú đấm của NPC dài 0,5 s; động tác gục tua nhanh cho ngã trong ~1,9 s (deathA dài 4,5 s, deathB 1,9 s). */
const PUNCH_SECONDS = 0.5;
const DEATH_SECONDS = 1.9;

/** Một NPC có xương: hình nhân bản + bộ trộn động tác (mỗi động tác trong NPC_CLIPS một action, trọng số tự điều khiển). */
export interface NpcBody {
  readonly id: CharacterId;
  readonly body: THREE.Object3D;
  /** Tỉ lệ co giãn ứng với 1 m chiều cao (để đổi chiều cao khi dùng lại cho người khác). */
  readonly perMeter: number;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: THREE.AnimationAction[];
  readonly weights: number[];
  /** Tốc độ phát gốc của từng action (trả về khi hình được dùng lại). */
  readonly timeScales: number[];
  /** Xương hông (vị trí thân người khi nằm — đặt vũng máu); null nếu mẫu không có. */
  readonly pelvis: THREE.Object3D | null;
  /** Điện thoại trong tay phải (ẩn; hiện khi gọi báo / quay video). */
  readonly handset: THREE.Object3D;
}

const PHONE_GEO = new THREE.BoxGeometry(0.07, 0.14, 0.01);
const PHONE_MAT = new THREE.MeshStandardNodeMaterial({ color: '#15171c', roughness: 0.3 });

/** Dựng một NPC mẫu `id` (chiều cao gốc của mẫu) với đủ action trong NPC_CLIPS. Trả null nếu mẫu chưa tải được. */
export function buildNpc(parent: THREE.Object3D, id: CharacterId): NpcBody | null {
  const height = CHARACTERS[id].height;
  const body = createCharacter(id, height);
  if (!body) return null;
  const mixer = new THREE.AnimationMixer(body);
  const actions = NPC_CLIPS.map((n) => mixer.clipAction(getNpcClip(n) ?? new THREE.AnimationClip(n, 1, [])));
  for (const name of ONCE) {
    const action = actions[NPC_ACTION[name]]!;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  const punch = actions[NPC_ACTION.jab]!;
  punch.timeScale = punch.getClip().duration / PUNCH_SECONDS;
  for (const name of ['deathA', 'deathB'] as const) {
    const fall = actions[NPC_ACTION[name]]!;
    fall.timeScale = Math.max(1, fall.getClip().duration / DEATH_SECONDS);
  }
  for (const a of actions) a.setEffectiveWeight(0).play();
  parent.add(body);
  const handset = new THREE.Mesh(PHONE_GEO, PHONE_MAT);
  handset.visible = false;
  const hand = body.getObjectByName('hand_r');
  // Trong lòng bàn tay phải (tư thế gốc chữ T: tay phải duỗi về phía −X), như điện thoại của Tín.
  if (hand) attachToBone(body, hand, handset, new THREE.Vector3(-0.08, -0.02, 0.03));
  return {
    id,
    body,
    perMeter: body.scale.y / height,
    mixer,
    actions,
    weights: actions.map(() => 0),
    timeScales: actions.map((a) => a.timeScale),
    pelvis: body.getObjectByName('pelvis') ?? null,
    handset,
  };
}

/** Đưa hình về trạng thái mới tinh trước khi dùng lại: mọi động tác tắt, tốc độ phát gốc, cất điện thoại. */
function resetNpc(npc: NpcBody): void {
  npc.weights.fill(0);
  for (let i = 0; i < npc.actions.length; i++) {
    const a = npc.actions[i]!;
    a.setEffectiveWeight(0);
    a.timeScale = npc.timeScales[i]!;
  }
  npc.handset.visible = false;
  npc.body.rotation.set(0, 0, 0);
}

/**
 * Hiện / ẩn NPC. Ẩn thì tắt luôn cập nhật ma trận cả cây xương: three.js vẫn tính ma trận cho vật đang ẩn, mà kho hình
 * giữ sẵn nhiều hình ẩn ⇒ hàng trăm xương bị tính vô ích mỗi khung hình.
 */
export function showNpc(npc: NpcBody, on: boolean): void {
  npc.body.visible = on;
  npc.body.matrixWorldAutoUpdate = on;
}

/**
 * Kho hình NPC có xương dùng chung cho mọi hệ thống, theo mẫu người: lấy ra thì hiện, trả lại thì ẩn (KeyedPool).
 * Dựng sẵn vài hình mỗi mẫu lúc tải (`prebuild`) — nhân bản một nhân vật giữa lúc chơi tốn ~10 ms (khựng).
 * Hình ẩn trong cảnh cũng được làm nóng pipeline lúc tải (render/warmup.ts tạm hiện mọi vật).
 */
export class NpcPool {
  readonly root = new THREE.Group();
  private readonly pool = new KeyedPool<NpcBody>(
    (npc) => showNpc(npc, true),
    (npc) => showNpc(npc, false),
  );

  constructor() {
    this.root.name = 'npc-pool';
  }

  /** Lấy một hình mẫu `id` (đã hiện, mọi động tác tắt); null nếu mẫu chưa tải được. */
  take(id: CharacterId): NpcBody | null {
    const npc = this.pool.take(id, () => buildNpc(this.root, id));
    if (npc) resetNpc(npc);
    return npc;
  }

  give(npc: NpcBody): void {
    this.pool.give(npc);
  }

  /** Dựng sẵn (ẩn) `count` hình cho mỗi mẫu trong `ids`. */
  prebuild(ids: readonly CharacterId[], count: number): void {
    const made: NpcBody[] = [];
    for (const id of ids) {
      for (let i = 0; i < count; i++) {
        const npc = this.take(id);
        if (npc) made.push(npc);
      }
    }
    for (const npc of made) this.give(npc);
  }

  /** Tổng số hình đã dựng (debug / test). */
  get created(): number {
    return this.pool.created;
  }
}

/**
 * Độ cao hông (m, so với gốc nhân vật) trong tư thế đầu của action thứ `index` — rồi trả mọi xương về như cũ.
 * Không dùng skeleton.pose() (lưới lượng tử hoá ⇒ xương gốc lệch chỗ).
 */
export function hipHeightIn(npc: NpcBody, index: number): number {
  const saved: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion]> = [];
  npc.body.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone()]));
  const before = npc.actions.map((a) => a.getEffectiveWeight());
  npc.actions.forEach((a, i) => a.setEffectiveWeight(i === index ? 1 : 0));
  npc.mixer.update(0);
  npc.body.updateMatrixWorld(true);
  const pelvis = npc.body.getObjectByName('pelvis');
  const base = new THREE.Vector3().setFromMatrixPosition(npc.body.matrixWorld).y;
  const hip = pelvis ? new THREE.Vector3().setFromMatrixPosition(pelvis.matrixWorld).y - base : 0.9;
  for (const [o, p, q] of saved) {
    o.position.copy(p);
    o.quaternion.copy(q);
  }
  npc.actions.forEach((a, i) => a.setEffectiveWeight(before[i]!));
  return hip;
}

const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));

/** Trộn trọng số các action về `targets` (cùng thứ tự NPC_CLIPS) rồi chạy bộ trộn. Không tạo đối tượng mới. */
export function stepNpc(npc: NpcBody, targets: readonly number[], rate: number, dt: number): void {
  for (let i = 0; i < npc.actions.length; i++) {
    const v = damp(npc.weights[i]!, targets[i] ?? 0, rate, dt);
    npc.weights[i] = v < 0.002 ? 0 : v;
    npc.actions[i]!.setEffectiveWeight(npc.weights[i]!);
  }
  npc.mixer.update(dt);
}
