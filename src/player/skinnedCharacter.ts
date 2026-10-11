import * as THREE from 'three/webgpu';
import { createCharacter, getClip, hasCharacter } from '@/assets/characters';
import type { AnimationName, CharacterId } from '@/assets/manifest';
import type { ItemId } from '@/systems/inventory';
import { CharacterModel, TIN_COLORS, type AnimState } from './characterModel';
import { clipTimeScale, locomotionWeights } from './locomotion';

/** Điều khiển chung cho nhân vật người chơi: mẫu có xương (Mesh2Motion) hoặc mẫu khối hộp dự phòng. */
export interface CharacterView {
  readonly root: THREE.Object3D;
  update(dt: number, s: AnimState): void;
  setHelmet(on: boolean): void;
  /** Vũ khí cầm tay phải (null = tay không). Mẫu khối hộp dự phòng bỏ qua. */
  setWeapon?(id: ItemId | null): void;
  /** Ra đòn: phát động tác `clip` một lần, dài `duration` giây (đè lên động tác di chuyển). */
  attack?(clip: AnimationName, duration: number): void;
}

/** Hình vũ khí dựng từ khối (lưỡi + cán), trục dài theo +Z cục bộ, cán ở gốc. */
function weaponMesh(id: ItemId): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardNodeMaterial({ color: '#c9ced3', roughness: 0.3, metalness: 0.6 });
  const wood = new THREE.MeshStandardNodeMaterial({ color: '#5a3a22', roughness: 0.8 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: '#2b2b2f', roughness: 0.6, metalness: 0.3 });
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, z: number, y = 0): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(0, y, z);
    m.castShadow = true;
    g.add(m);
  };
  switch (id) {
    case 'maTau':
      part(new THREE.BoxGeometry(0.035, 0.035, 0.15), wood, 0.02);
      part(new THREE.BoxGeometry(0.012, 0.07, 0.56), steel, 0.38, 0.012);
      break;
    case 'gaySat':
      part(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8).rotateX(Math.PI / 2), dark, 0.3);
      break;
    case 'daoBam':
      part(new THREE.BoxGeometry(0.03, 0.025, 0.11), dark, 0.02);
      part(new THREE.BoxGeometry(0.008, 0.022, 0.1), steel, 0.12);
      break;
    case 'conNhiKhuc':
      part(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8).rotateX(Math.PI / 2), wood, 0.1);
      part(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 8).rotateX(Math.PI / 2), wood, 0.36, -0.12);
      break;
    default:
      break;
  }
  return g;
}

/** Thứ tự cố định: 0..3 khớp locomotionWeights (đứng, đi, chạy nhẹ, chạy nhanh). */
const ACTIONS: readonly AnimationName[] = ['idle', 'walk', 'jog', 'sprint', 'jumpAir', 'drive', 'phone', 'swordIdle'];
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
  /** Điện thoại cầm tay phải (hiện khi mở điện thoại lúc đi bộ). */
  private readonly handset = new THREE.Group();
  /** Chỗ cầm vũ khí ở tay phải + hình từng loại đã dựng. */
  private readonly grip = new THREE.Group();
  private readonly weapons = new Map<ItemId, THREE.Group>();
  private weapon: ItemId | null = null;
  /** Đòn đang ra: action phát một lần + thời gian còn lại. */
  private readonly attacks = new Map<AnimationName, THREE.AnimationAction>();
  private attackAction: THREE.AnimationAction | null = null;
  private attackLeft = 0;
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
    const hand = body.getObjectByName('hand_r');
    if (hand) {
      const phone = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.01), new THREE.MeshStandardNodeMaterial({ color: '#15171c', roughness: 0.3 }));
      this.handset.add(phone);
      this.handset.visible = false;
      // Trong lòng bàn tay phải (tư thế gốc chữ T: tay phải duỗi về phía −X).
      attachToBone(this.root, hand, this.handset, new THREE.Vector3(-0.08, -0.02, 0.03));
      // Chỗ nắm cán vũ khí (lòng bàn tay phải); lưỡi chĩa về phía trước theo tư thế gốc.
      attachToBone(this.root, hand, this.grip, new THREE.Vector3(-0.09, -0.02, 0.0));
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

  attack(clip: AnimationName, duration: number): void {
    let action = this.attacks.get(clip);
    if (!action) {
      const c = getClip(clip);
      if (!c) return;
      action = this.mixer.clipAction(c);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      this.attacks.set(clip, action);
    }
    if (this.attackAction && this.attackAction !== action) this.attackAction.setEffectiveWeight(0);
    // Co giãn clip cho khớp thời gian đòn (vũ khí nặng chậm hơn).
    action.timeScale = action.getClip().duration / Math.max(0.1, duration);
    action.reset().setEffectiveWeight(1).play();
    this.attackAction = action;
    this.attackLeft = duration;
  }

  setWeapon(id: ItemId | null): void {
    if (id === this.weapon) return;
    this.weapon = id;
    for (const g of this.weapons.values()) g.visible = false;
    if (!id) return;
    let g = this.weapons.get(id);
    if (!g) {
      g = weaponMesh(id);
      this.grip.add(g);
      this.weapons.set(id, g);
    }
    g.visible = true;
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
        // Mở điện thoại lúc đứng: áp máy lên tai; cầm vũ khí lúc đứng: tư thế thủ (thay cho động tác đứng).
        if (s.phone && s.speed < 0.4) {
          t[ACTIONS.indexOf('phone')] = t[0]!;
          t[0] = 0;
        } else if (this.weapon) {
          t[ACTIONS.indexOf('swordIdle')] = t[0]!;
          t[0] = 0;
        }
        // Nhịp bước theo tốc độ thật (đỡ trượt chân).
        for (let k = 0; k < 3; k++) this.actions[k + 1]!.timeScale = clipTimeScale(k, s.speed);
      }
    }
    // Đang ra đòn: động tác đòn chiếm trọn thân (các động tác khác lùi về 0).
    if (this.attackAction) {
      this.attackLeft -= dt;
      if (this.attackLeft > 0 && s.mode === 'foot') {
        t.fill(0);
        rate = 22;
      } else {
        this.attackAction.fadeOut(0.12);
        this.attackAction = null;
      }
    }
    this.handset.visible = s.mode === 'foot' && s.phone === true;
    // Lên xe thì cất vũ khí (giắt sau lưng — không hiện).
    this.grip.visible = s.mode === 'foot' && !s.phone;
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
