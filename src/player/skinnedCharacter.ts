import * as THREE from 'three/webgpu';
import { createCharacter, getClip, hasCharacter } from '@/assets/characters';
import type { AnimationName, CharacterId } from '@/assets/manifest';
import { CharacterModel, TIN_COLORS, type AnimState } from './characterModel';
import { clipTimeScale, locomotionWeights } from './locomotion';

/** Điều khiển chung cho nhân vật người chơi: mẫu có xương (Mesh2Motion) hoặc mẫu khối hộp dự phòng. */
export interface CharacterView {
  readonly root: THREE.Object3D;
  update(dt: number, s: AnimState): void;
  setHelmet(on: boolean): void;
}

/** Thứ tự cố định: 0..3 khớp locomotionWeights (đứng, đi, chạy nhẹ, chạy nhanh). */
const ACTIONS: readonly AnimationName[] = ['idle', 'walk', 'jog', 'sprint', 'jumpAir', 'drive'];
/** Hông nhân vật khối hộp cũ cao 0,95 m so với gốc khi ngồi xe — yên xe được canh theo mốc đó. */
const RIDE_HIP_HEIGHT = 0.95;

const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));

/**
 * Gắn một vật vào xương sao cho trong tư thế gốc nó nằm đúng chỗ `offset` (m, hệ toạ độ nhân vật: +Y lên, +Z trước mặt),
 * thẳng đứng và đúng cỡ — bù hướng + tỉ lệ của xương.
 */
function attachToBone(model: THREE.Object3D, bone: THREE.Object3D, object: THREE.Object3D, offset: THREE.Vector3): void {
  model.updateMatrixWorld(true);
  const boneWorld = bone.matrixWorld.clone();
  const modelWorld = model.parent ? model.parent.matrixWorld.clone() : new THREE.Matrix4();
  const anchor = new THREE.Vector3().setFromMatrixPosition(boneWorld).applyMatrix4(modelWorld.clone().invert()).add(offset);
  const desired = modelWorld.clone().multiply(new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
  const local = boneWorld.invert().multiply(desired);
  local.decompose(object.position, object.quaternion, object.scale);
  bone.add(object);
}

/**
 * Nhân vật có xương: trộn động tác đứng / đi / chạy theo tốc độ thật (chỉnh nhịp clip để chân ít trượt),
 * tư thế trên không khi nhảy / rơi, ngồi xe khi lái. Mũ bảo hiểm + thùng giao hàng gắn vào xương đầu / lưng.
 */
export class SkinnedCharacter implements CharacterView {
  readonly root = new THREE.Group();
  private readonly body: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: THREE.AnimationAction[] = [];
  private readonly weights: number[] = [];
  private readonly targets: number[] = [];
  private readonly loco = [0, 0, 0, 0];
  private readonly helmet = new THREE.Group();
  /** Độ cao đặt mẫu khi ngồi xe để hông ở đúng mốc yên xe. */
  private readonly rideOffset: number;

  constructor(body: THREE.Object3D) {
    this.body = body;
    this.root.name = 'tin';
    this.root.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    for (const name of ACTIONS) {
      const clip = getClip(name);
      const action = this.mixer.clipAction(clip ?? new THREE.AnimationClip(name, 1, []));
      action.setEffectiveWeight(0).play();
      this.actions.push(action);
      this.weights.push(0);
      this.targets.push(0);
    }

    // Đo độ cao hông trong tư thế ngồi xe (để canh lên yên), rồi trả mọi xương về tư thế gốc trước khi gắn phụ kiện.
    // Không dùng skeleton.pose(): lưới đã lượng tử hoá (meshopt) có phép giải lượng tử nằm trong ma trận bind nghịch đảo
    // ⇒ pose() dựng lại xương gốc lệch chỗ. Lưu / khôi phục biến đổi cục bộ của từng xương thay vào đó.
    const saved: Array<[THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3]> = [];
    body.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
    const pelvis = body.getObjectByName('pelvis');
    const drive = this.actions[ACTIONS.indexOf('drive')]!;
    drive.setEffectiveWeight(1);
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    const hip = pelvis ? new THREE.Vector3().setFromMatrixPosition(pelvis.matrixWorld).y : RIDE_HIP_HEIGHT;
    this.rideOffset = RIDE_HIP_HEIGHT - hip;
    drive.setEffectiveWeight(0);
    for (const [o, p, q, s] of saved) {
      o.position.copy(p);
      o.quaternion.copy(q);
      o.scale.copy(s);
    }

    const head = body.getObjectByName('head');
    if (head) {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        new THREE.MeshStandardNodeMaterial({ color: TIN_COLORS.helmet, roughness: 0.35 }),
      );
      shell.scale.set(1, 1.02, 1.12);
      shell.castShadow = true;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.03), new THREE.MeshStandardNodeMaterial({ color: TIN_COLORS.visor, roughness: 0.2 }));
      visor.position.set(0, 0.03, 0.16);
      this.helmet.add(shell, visor);
      this.helmet.visible = false;
      attachToBone(this.root, head, this.helmet, new THREE.Vector3(0, 0.07, 0.01));
    }
    const back = body.getObjectByName('spine_03');
    if (back) {
      // Thùng giao hàng sau lưng (áo khoác + thùng cam của tài xế xe ôm công nghệ).
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.2), new THREE.MeshStandardNodeMaterial({ color: TIN_COLORS.bag, roughness: 0.6 }));
      bag.castShadow = true;
      attachToBone(this.root, back, bag, new THREE.Vector3(0, -0.02, -0.17));
    }
  }

  setHelmet(on: boolean): void {
    this.helmet.visible = on;
  }

  update(dt: number, s: AnimState): void {
    const t = this.targets;
    t.fill(0);
    let rate = 9;
    if (s.mode === 'ride') {
      t[ACTIONS.indexOf('drive')] = 1;
      this.body.position.y = this.rideOffset;
      rate = 14;
    } else {
      this.body.position.y = 0;
      if (!s.grounded) {
        t[ACTIONS.indexOf('jumpAir')] = 1;
        rate = 12;
      } else {
        locomotionWeights(s.speed, this.loco);
        for (let k = 0; k < 4; k++) t[k] = this.loco[k]!;
        // Nhịp bước theo tốc độ thật (đỡ trượt chân).
        for (let k = 0; k < 3; k++) this.actions[k + 1]!.timeScale = clipTimeScale(k, s.speed);
      }
    }
    for (let i = 0; i < this.actions.length; i++) {
      const w = damp(this.weights[i]!, t[i]!, rate, dt);
      this.weights[i] = w < 0.002 ? 0 : w;
      this.actions[i]!.setEffectiveWeight(this.weights[i]!);
    }
    this.mixer.update(dt);
  }
}

/** Nhân vật người chơi: mẫu có xương nếu đã tải được, không thì mẫu khối hộp cũ (vẫn chơi được khi mất mạng / lỗi tải). */
export function createPlayerView(id: CharacterId = 'tin', height = 1.7): CharacterView {
  if (hasCharacter(id)) {
    const body = createCharacter(id, height);
    if (body) return new SkinnedCharacter(body);
  }
  return new CharacterModel();
}
