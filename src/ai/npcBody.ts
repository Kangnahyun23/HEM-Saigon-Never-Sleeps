import * as THREE from 'three/webgpu';
import { createCharacter, getClip, hasCharacter } from '@/assets/characters';
import type { AnimationName, CharacterId } from '@/assets/manifest';

/** Mẫu người đi đường (CC0, xem CREDITS.md) — nữ dùng dáng đi nữ. */
export const CIVILIANS: ReadonlyArray<{ id: CharacterId; female: boolean; height: readonly [number, number] }> = [
  { id: 'man-shirt', female: false, height: [1.62, 1.74] },
  { id: 'man-tee', female: false, height: [1.62, 1.74] },
  { id: 'man-polo', female: false, height: [1.62, 1.74] },
  { id: 'old-man', female: false, height: [1.58, 1.68] },
  { id: 'woman-young', female: true, height: [1.52, 1.64] },
  { id: 'woman-style', female: true, height: [1.52, 1.64] },
  { id: 'old-woman', female: true, height: [1.48, 1.58] },
];

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
}

export function buildNpc(parent: THREE.Object3D, id: CharacterId, height: number, clips: readonly AnimationName[]): NpcBody | null {
  const body = createCharacter(id, height);
  if (!body) return null;
  const mixer = new THREE.AnimationMixer(body);
  const actions = clips.map((n) => mixer.clipAction(getClip(n) ?? new THREE.AnimationClip(n, 1, [])));
  for (const a of actions) a.setEffectiveWeight(0).play();
  parent.add(body);
  return { body, perMeter: body.scale.y / height, mixer, actions, weights: clips.map(() => 0), pelvis: body.getObjectByName('pelvis') ?? null };
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
