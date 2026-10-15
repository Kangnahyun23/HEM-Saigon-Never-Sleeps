import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { attachToBone, createCharacter, getNpcClip, hasCharacter } from '@/assets/characters';
import { CHARACTERS, type AnimationName, type CharacterId } from '@/assets/manifest';
import type { Outfit } from '@/assets/outfits';
import { KeyedPool } from '@/core/keyedPool';
import { CIVILIANS } from './civilians';
import { FOOT_POLICE } from './footPolice';

export { CIVILIANS } from './civilians';

/** Mọi mẫu người trong `cast` đã tải được (thiếu thì nơi dùng lùi về khối hộp). */
export function castAvailable(cast: readonly { readonly id: CharacterId }[]): boolean {
  return cast.every((c) => hasCharacter(c.id));
}

export function civiliansAvailable(): boolean {
  return castAvailable(CIVILIANS);
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
  'drive',
  // Công an vung dùi cui (động tác chém kiếm một tay).
  'slashA',
] as const satisfies readonly AnimationName[];
export type NpcClip = (typeof NPC_CLIPS)[number];

/** Chỉ số action của từng động tác trong mọi NpcBody. */
export const NPC_ACTION = Object.fromEntries(NPC_CLIPS.map((name, i) => [name, i])) as Readonly<Record<NpcClip, number>>;

/** Động tác chỉ phát một lần rồi giữ tư thế cuối (trúng đòn, ngã, gục, cú đấm, vung dùi cui). */
const ONCE: readonly NpcClip[] = ['hitChest', 'knockback', 'deathA', 'deathB', 'jab', 'slashA'];
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
  /** Dùi cui trong tay phải (ẩn; hiện khi là công an đi bộ). */
  readonly baton: THREE.Object3D;
  /** Mũ bảo hiểm trên đầu (ẩn; hiện khi lái xe). Vật liệu riêng từng hình: màu mũ đặt qua `material.color`. */
  readonly helmet: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardNodeMaterial>;
  /** Xương tay trái / phải (cánh tay trên, cẳng tay, cổ tay) cho IK đặt tay lên ghi-đông; null nếu mẫu thiếu xương. */
  readonly arms: { readonly left: ArmChain; readonly right: ArmChain } | null;
}

/** Ba xương một cánh tay: cánh tay trên, cẳng tay, cổ tay. */
export type ArmChain = readonly [upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D];

function armChain(body: THREE.Object3D, side: 'l' | 'r'): ArmChain | null {
  const upper = body.getObjectByName(`upperarm_${side}`);
  const lower = body.getObjectByName(`lowerarm_${side}`);
  const hand = body.getObjectByName(`hand_${side}`);
  return upper && lower && hand ? [upper, lower, hand] : null;
}

/** Nguồn hình NPC (NpcPool; unit test thay bằng kho giả). */
export interface NpcSource {
  take(id: CharacterId): NpcBody | null;
  give(npc: NpcBody): void;
}

const PHONE_GEO = new THREE.BoxGeometry(0.07, 0.14, 0.01);
const PHONE_MAT = new THREE.MeshStandardNodeMaterial({ color: '#15171c', roughness: 0.3 });
/** Dùi cui cao su đen dài ~0,55 m, trục dọc +Z cục bộ (cầm như vũ khí của Tín), cán ở gốc. */
const BATON_GEO = new THREE.CylinderGeometry(0.017, 0.02, 0.55, 8).rotateX(Math.PI / 2).translate(0, 0, 0.2);
const BATON_MAT = new THREE.MeshStandardNodeMaterial({ color: '#16171a', roughness: 0.55 });

/** Mũ bảo hiểm (cỡ như mũ của Tín): vỏ nửa cầu trắng (nhân màu vật liệu) + kính tối, gộp một khối — một lệnh vẽ. */
function helmetGeometry(): THREE.BufferGeometry {
  const shell = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(1, 1.02, 1.12);
  const visor = new THREE.BoxGeometry(0.2, 0.06, 0.03).translate(0, 0.03, 0.16);
  const paint = (g: THREE.BufferGeometry, shade: number): THREE.BufferGeometry => {
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array<number>(g.getAttribute('position').count * 3).fill(shade), 3));
    return g;
  };
  return mergeGeometries([paint(shell, 1), paint(visor, 0.12)], false);
}
const HELMET_GEO = helmetGeometry();

/**
 * Dựng một NPC mẫu `id` (chiều cao gốc của mẫu) với đủ action trong NPC_CLIPS; `outfit`: trang phục riêng (đàn em).
 * Trả null nếu mẫu chưa tải được.
 */
export function buildNpc(parent: THREE.Object3D, id: CharacterId, outfit: Outfit | null = null): NpcBody | null {
  const height = CHARACTERS[id].height;
  const body = createCharacter(id, height, outfit);
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
  const strike = actions[NPC_ACTION.slashA]!;
  strike.timeScale = strike.getClip().duration / FOOT_POLICE.strikeTime;
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
  const baton = new THREE.Mesh(BATON_GEO, BATON_MAT);
  baton.name = 'npc-baton';
  baton.visible = false;
  baton.castShadow = false;
  // Chỗ cầm như vũ khí của Tín (skinnedCharacter: grip).
  if (hand) attachToBone(body, hand, baton, new THREE.Vector3(-0.09, -0.02, 0));
  const helmet = new THREE.Mesh(HELMET_GEO, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.35 }));
  helmet.name = 'npc-helmet';
  helmet.visible = false;
  // Mũ nhỏ nằm trên đầu: bóng của đầu đã đủ, khỏi tốn thêm lệnh vẽ ở lượt bóng.
  helmet.castShadow = false;
  const head = body.getObjectByName('head');
  if (head) attachToBone(body, head, helmet, new THREE.Vector3(0, 0.07, 0.01));
  const left = armChain(body, 'l');
  const right = armChain(body, 'r');
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
    baton,
    helmet,
    arms: left && right ? { left, right } : null,
  };
}

/** Đưa hình về trạng thái mới tinh trước khi dùng lại: mọi động tác tắt, tốc độ phát gốc, cất điện thoại, dùi cui, mũ. */
function resetNpc(npc: NpcBody): void {
  npc.weights.fill(0);
  for (let i = 0; i < npc.actions.length; i++) {
    const a = npc.actions[i]!;
    a.setEffectiveWeight(0);
    a.timeScale = npc.timeScales[i]!;
  }
  npc.handset.visible = false;
  npc.baton.visible = false;
  npc.helmet.visible = false;
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
 * `outfit`: mọi hình trong kho mặc trang phục này (kho riêng của đàn em — người đi đường giữ quần áo của mẫu).
 */
export class NpcPool implements NpcSource {
  readonly root = new THREE.Group();
  private readonly pool = new KeyedPool<NpcBody>(
    (npc) => showNpc(npc, true),
    (npc) => showNpc(npc, false),
  );

  constructor(private readonly outfit: Outfit | null = null) {
    this.root.name = outfit ? `npc-pool-${outfit.name}` : 'npc-pool';
  }

  /** Lấy một hình mẫu `id` (đã hiện, mọi động tác tắt); null nếu mẫu chưa tải được. */
  take(id: CharacterId): NpcBody | null {
    const npc = this.pool.take(id, () => buildNpc(this.root, id, this.outfit));
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
 * Vị trí hông trong tư thế đầu của action thứ `index`, theo toạ độ của hình (trên 1 đơn vị co giãn: nhân `body.scale`
 * ra mét) — rồi trả trọng số cũ và để bộ trộn tự đặt lại xương. KHÔNG ghi tay vị trí / góc xương để khôi phục:
 * PropertyMixer chỉ ghi xương khi kết quả trộn khác khung trước ⇒ rãnh không đổi theo thời gian (chân trong động tác lái
 * xe, ngồi) sẽ không được ghi lại, xương kẹt ở giá trị ghi tay (người lái "đứng" trên yên). Không dùng skeleton.pose()
 * (lưới lượng tử hoá ⇒ xương gốc lệch chỗ). Mẫu thiếu xương hông: coi hông cao 0,9 m.
 */
export function hipIn(npc: NpcBody, index: number, out = new THREE.Vector3()): THREE.Vector3 {
  const before = npc.actions.map((a) => a.getEffectiveWeight());
  npc.actions.forEach((a, i) => a.setEffectiveWeight(i === index ? 1 : 0));
  npc.mixer.update(0);
  npc.body.updateMatrixWorld(true);
  const pelvis = npc.body.getObjectByName('pelvis');
  if (pelvis) npc.body.worldToLocal(out.setFromMatrixPosition(pelvis.matrixWorld));
  else out.set(0, 0.9 / npc.body.scale.y, 0);
  npc.actions.forEach((a, i) => a.setEffectiveWeight(before[i]!));
  npc.mixer.update(0);
  return out;
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
