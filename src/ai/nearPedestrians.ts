import * as THREE from 'three/webgpu';
import { createRng, pick } from '@/core/random';
import { lookSeed } from './civilians';
import { PAD_HEIGHT } from '@/world/city/layout';
import { CIVILIANS, civiliansAvailable, NPC_ACTION as A, NPC_CLIPS, stepNpc, type NpcBody, type NpcClip, type NpcPool } from './npcBody';
import { PedestrianLod } from './pedestrianLod';
import type { Walker } from './pedestrians';

/** Lúc đứng lại: gọi điện, nói chuyện, khoanh tay, đứng thường. */
const IDLES: readonly NpcClip[] = ['phone', 'talk', 'foldArms', 'idle', 'idle'];
/** Bán kính (m) quanh camera vẽ người bằng nhân vật có xương. */
const NEAR_RADIUS = 32;
type PedState = 'calm' | 'hurt' | 'down' | 'dead';

interface Slot {
  walker: number;
  generation: number;
  /** Trạng thái lần trước (đổi trạng thái ⇒ phát lại động tác một lần từ đầu). */
  state: PedState;
  npc: NpcBody | null;
  /** Chiều cao người đang vẽ (đặt biểu tượng gọi điện trên đầu). */
  height: number;
  /** Lần trước đang vung tay đấm (bắt đầu cú mới ⇒ phát lại động tác đấm). */
  punching: boolean;
  /** Chỉ số action đứng (kiểu riêng từng người), đi, chạy (nam / nữ), gục (theo mẫu người). */
  idle: number;
  walk: number;
  run: number;
  death: number;
  /** Biểu tượng điện thoại nhấp nháy trên đầu người đang gọi báo công an. */
  readonly callIcon: THREE.Sprite;
}

/** Biểu tượng "đang gọi công an": điện thoại trắng trên nền tròn đỏ (vẽ một lần bằng canvas). */
function callIconMaterial(): THREE.SpriteNodeMaterial {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#e2412f';
    g.beginPath();
    g.arc(32, 32, 30, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(22, 13, 20, 38, 4);
    g.fill();
    g.fillStyle = '#e2412f';
    g.fillRect(25, 18, 14, 24);
    g.beginPath();
    g.arc(32, 46, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteNodeMaterial({ map: tex, transparent: true, depthWrite: false });
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Người đi bộ gần camera: tối đa `capacity` người (theo sức máy) vẽ bằng nhân vật có xương với động tác đi / đứng
 * gọi điện / né xe; người ở xa vẫn là khối hộp instanced (PedestrianView bỏ qua người đang vẽ ở đây).
 */
export class NearPedestrianView {
  readonly root = new THREE.Group();
  readonly lod: PedestrianLod;
  private readonly slots: Slot[] = [];
  private readonly targets = new Array<number>(NPC_CLIPS.length).fill(0);
  private time = 0;

  /** `pool`: kho hình NPC dùng chung (đổi người khỏi phải nhân bản lại; số hình chỉ bằng số người hiện cùng lúc). */
  constructor(
    capacity: number,
    private readonly pool: NpcPool,
  ) {
    this.lod = new PedestrianLod(capacity, NEAR_RADIUS);
    const iconMat = callIconMaterial();
    for (let k = 0; k < capacity; k++) {
      const callIcon = new THREE.Sprite(iconMat);
      callIcon.visible = false;
      callIcon.scale.setScalar(0.4);
      this.root.add(callIcon);
      this.slots.push({ walker: -1, generation: -1, state: 'calm', npc: null, height: 1.65, punching: false, idle: A.idle, walk: A.walk, run: A.jog, death: A.deathA, callIcon });
    }
    this.root.name = 'near-pedestrians';
  }

  /** Có đủ mẫu người đi đường + động tác để dùng không (thiếu thì chỉ dùng khối hộp). */
  static available(): boolean {
    return civiliansAvailable();
  }

  /** Trả hình của ô về kho (ẩn, thôi cập nhật xương). */
  private release(slot: Slot): void {
    if (!slot.npc) return;
    this.pool.give(slot.npc);
    slot.npc = null;
  }

  private assign(slot: Slot, w: Walker): void {
    this.release(slot);
    slot.walker = w.id;
    slot.generation = w.generation;
    const rng = createRng(lookSeed(w.id, w.generation));
    // Mẫu người do mô phỏng chọn (lượt rút đầu của chuỗi này — xem civilians.lookOf); bỏ qua lượt đó cho khớp chuỗi.
    const look = CIVILIANS[w.look]!;
    rng();
    const height = look.height[0] + rng() * (look.height[1] - look.height[0]);
    slot.idle = A[pick(rng, IDLES)];
    slot.walk = look.female ? A.walkFemale : A.walk;
    slot.run = look.female ? A.runFemale : A.jog;
    // Kiểu ngã theo mẫu người.
    slot.death = w.look % 2 ? A.deathA : A.deathB;
    const npc = this.pool.take(look.id);
    slot.state = 'calm';
    slot.npc = npc;
    slot.height = height;
    slot.punching = false;
    if (npc) {
      npc.body.scale.setScalar(npc.perMeter * height);
      // Lệch pha (có seed) để những người cạnh nhau không bước đều như duyệt binh.
      npc.mixer.setTime(rng() * 3);
    }
  }

  /**
   * Vị trí hông (thế giới) của người đi bộ `walkerId` nếu người đó đang được vẽ bằng nhân vật có xương — dùng đặt vũng
   * máu đúng chỗ thân người nằm. Trả false nếu không có.
   */
  pelvisOf(walkerId: number, out: THREE.Vector3): boolean {
    for (const slot of this.slots) {
      if (slot.walker !== walkerId || !slot.npc?.pelvis || !slot.npc.body.visible) continue;
      slot.npc.pelvis.getWorldPosition(out);
      return true;
    }
    return false;
  }

  update(walkers: readonly Walker[], alpha: number, dt: number, camX: number, camZ: number): void {
    this.time += dt;
    this.lod.update(walkers, camX, camZ);
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k]!;
      const id = this.lod.slots[k]!;
      if (id < 0) {
        this.release(slot);
        slot.callIcon.visible = false;
        slot.walker = -1;
        continue;
      }
      const w = walkers[id]!;
      if (slot.walker !== id || slot.generation !== w.generation) this.assign(slot, w);
      const npc = slot.npc;
      slot.callIcon.visible = false;
      if (!npc) continue;
      const dyaw = Math.atan2(Math.sin(w.yaw - w.prevYaw), Math.cos(w.yaw - w.prevYaw));
      npc.body.position.set(w.prevX + (w.x - w.prevX) * alpha, PAD_HEIGHT, w.prevZ + (w.z - w.prevZ) * alpha);
      npc.body.quaternion.copy(_q.setFromAxisAngle(_up, w.prevYaw + dyaw * alpha));
      const t = this.targets;
      t.fill(0);
      const state: PedState = w.dead ? 'dead' : w.down > 0 ? 'down' : w.hurt > 0 ? 'hurt' : 'calm';
      if (state !== slot.state) {
        // Vào trạng thái mới: phát động tác một lần từ đầu (trúng đòn, ngã, gục).
        const idx = state === 'dead' ? slot.death : state === 'down' ? A.knockback : state === 'hurt' ? A.hitChest : -1;
        if (idx >= 0) npc.actions[idx]!.reset().play();
        slot.state = state;
      }
      // Cú đấm mới (người đánh trả) ⇒ phát lại động tác đấm từ đầu.
      if (w.punch > 0 && !slot.punching) npc.actions[A.jab]!.reset().play();
      slot.punching = w.punch > 0;
      // Tài xế vừa bị kéo khỏi xe còn đang chạy lên vỉa hè: chưa rút điện thoại.
      const reacting = state === 'calm' && w.enter <= 0 ? w.react : 'none';
      npc.handset.visible = reacting === 'call' || reacting === 'film';
      if (reacting === 'call') {
        // Biểu tượng gọi điện nhấp nháy trên đầu (người chơi chạy tới kịp thì ngăn được cuộc gọi).
        const icon = slot.callIcon;
        icon.visible = true;
        icon.position.set(npc.body.position.x, PAD_HEIGHT + slot.height + 0.42, npc.body.position.z);
        icon.scale.setScalar(0.36 + 0.05 * Math.sin(this.time * 9));
      }
      if (state === 'dead') t[slot.death] = 1;
      else if (state === 'down') t[A.knockback] = 1;
      else if (state === 'hurt') t[A.hitChest] = 1;
      else if (reacting === 'fight') t[w.punch > 0 ? A.jab : w.speed > 0.15 ? slot.run : A.fightIdle] = 1;
      else if (reacting === 'call') t[A.phone] = 1;
      else if (reacting === 'film') t[A.interact] = 1;
      else if (reacting === 'shout') t[A.angry] = 1;
      else if (w.dodge > 0) t[A.dodge] = 1;
      else if ((w.flee > 0 || w.enter > 0) && w.speed > 0.15) t[slot.run] = 1;
      else if (w.speed > 0.15) t[slot.walk] = 1;
      else t[slot.idle] = 1;
      // Nhịp bước theo tốc độ (clip đi khớp ~1,6 m/s, chạy ~3,6 m/s).
      npc.actions[slot.walk]!.timeScale = Math.min(1.4, Math.max(0.6, w.speed / 1.6));
      npc.actions[slot.run]!.timeScale = Math.min(1.4, Math.max(0.7, w.speed / 3.6));
      stepNpc(npc, t, state === 'calm' ? 8 : 18, dt);
    }
  }
}
