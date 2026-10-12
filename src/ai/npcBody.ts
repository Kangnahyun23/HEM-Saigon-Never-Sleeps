import * as THREE from 'three/webgpu';
import { attachToBone, createCharacter, getClip, hasCharacter } from '@/assets/characters';
import type { AnimationName, CharacterId } from '@/assets/manifest';
import { CIVILIANS } from './civilians';

export { CIVILIANS } from './civilians';

export function civiliansAvailable(): boolean {
  return CIVILIANS.every((c) => hasCharacter(c.id));
}

/** Một NPC có xương: hình nhân bản + bộ trộn động tác (mỗi clip một action, trọng số tự điều khiển). */
export interface NpcBody {
  readonly body: THREE.Object3D;
  /** Tỉ lệ co giãn ứng với 1 m chiều cao (để đổi chiều cao khi dùng lại cho người khác). */
  readonly perMeter: number;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: THREE.AnimationAction[];
  readonly weights: number[];
  /** Xương hông (vị trí thân người khi nằm — đặt vũng máu); null nếu mẫu không có. */
  readonly pelvis: THREE.Object3D | null;
  /** Điện thoại trong tay phải (ẩn; hiện khi gọi báo / quay video). */
  readonly handset: THREE.Object3D;
}

const PHONE_GEO = new THREE.BoxGeometry(0.07, 0.14, 0.01);
const PHONE_MAT = new THREE.MeshStandardNodeMaterial({ color: '#15171c', roughness: 0.3 });

export function buildNpc(parent: THREE.Object3D, id: CharacterId, height: number, clips: readonly AnimationName[]): NpcBody | null {
  const body = createCharacter(id, height);
  if (!body) return null;
  const mixer = new THREE.AnimationMixer(body);
  // Cùng một clip xuất hiện hai lần (ví dụ "phone" vừa là kiểu đứng vừa là gọi báo) ⇒ nhân bản để mỗi chỗ có action
  // riêng (bộ trộn gộp action theo clip, trọng số hai chỗ sẽ ghi đè nhau).
  const used = new Set<AnimationName>();
  const actions = clips.map((n) => {
    const clip = getClip(n) ?? new THREE.AnimationClip(n, 1, []);
    const action = mixer.clipAction(used.has(n) ? clip.clone() : clip);
    used.add(n);
    return action;
  });
  for (const a of actions) a.setEffectiveWeight(0).play();
  parent.add(body);
  const handset = new THREE.Mesh(PHONE_GEO, PHONE_MAT);
  handset.visible = false;
  const hand = body.getObjectByName('hand_r');
  // Trong lòng bàn tay phải (tư thế gốc chữ T: tay phải duỗi về phía −X), như điện thoại của Tín.
  if (hand) attachToBone(body, hand, handset, new THREE.Vector3(-0.08, -0.02, 0.03));
  return { body, perMeter: body.scale.y / height, mixer, actions, weights: clips.map(() => 0), pelvis: body.getObjectByName('pelvis') ?? null, handset };
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

/** Trộn trọng số các action về `targets` (cùng thứ tự) rồi chạy bộ trộn. Không tạo đối tượng mới. */
export function stepNpc(npc: NpcBody, targets: readonly number[], rate: number, dt: number): void {
  for (let i = 0; i < npc.actions.length; i++) {
    const v = damp(npc.weights[i]!, targets[i] ?? 0, rate, dt);
    npc.weights[i] = v < 0.002 ? 0 : v;
    npc.actions[i]!.setEffectiveWeight(npc.weights[i]!);
  }
  npc.mixer.update(dt);
}
