import * as THREE from 'three/webgpu';
import type { AnimationName } from '@/assets/manifest';
import { createRng, pick } from '@/core/random';
import { lookSeed } from './civilians';
import { PAD_HEIGHT } from '@/world/city/layout';
import { buildNpc, CIVILIANS, civiliansAvailable, stepNpc, type NpcBody } from './npcBody';
import { PedestrianLod } from './pedestrianLod';
import type { Walker } from './pedestrians';

/** Lúc đứng lại: gọi điện, nói chuyện, khoanh tay, đứng thường. */
const IDLES: readonly AnimationName[] = ['phone', 'talk', 'foldArms', 'idle', 'idle'];
/** Bán kính (m) quanh camera vẽ người bằng nhân vật có xương. */
const NEAR_RADIUS = 32;

/** Thứ tự động tác trong một NPC đi bộ: đứng (kiểu riêng), đi, né xe, trúng đòn, bị đánh ngã, gục, chạy trốn. */
const IDLE = 0;
const WALK = 1;
const DODGE = 2;
const HIT = 3;
const KNOCK = 4;
const DEATH = 5;
const RUN = 6;
/** Phản ứng khi thấy đánh nhau: la lên, gọi báo (điện thoại áp tai), quay video, thủ thế, đấm. */
const SHOUT = 7;
const CALL = 8;
const FILM = 9;
const FIGHT = 10;
const PUNCH = 11;
const ACTION_COUNT = 12;
/** Thời gian (s) động tác gục — clip dài hơn thì tua nhanh. */
const DEATH_SECONDS = 1.9;
type PedState = 'calm' | 'hurt' | 'down' | 'dead';

interface Slot {
  walker: number;
  generation: number;
  /** Trạng thái lần trước (đổi trạng thái ⇒ phát lại động tác một lần từ đầu). */
  state: PedState;
  npc: NpcBody | null;
  /** Mỗi chỗ giữ sẵn hình của từng mẫu đã dùng (đổi người khỏi phải nhân bản lại). */
  readonly cache: Map<string, NpcBody>;
  /** Chiều cao người đang vẽ (đặt biểu tượng gọi điện trên đầu). */
  height: number;
  /** Lần trước đang vung tay đấm (bắt đầu cú mới ⇒ phát lại động tác đấm). */
  punching: boolean;
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
  private readonly targets = new Array<number>(ACTION_COUNT).fill(0);
  private time = 0;

  constructor(capacity: number) {
    this.lod = new PedestrianLod(capacity, NEAR_RADIUS);
    const iconMat = callIconMaterial();
    for (let k = 0; k < capacity; k++) {
      const callIcon = new THREE.Sprite(iconMat);
      callIcon.visible = false;
      callIcon.scale.setScalar(0.4);
      this.root.add(callIcon);
      this.slots.push({ walker: -1, generation: -1, state: 'calm', npc: null, cache: new Map(), height: 1.65, punching: false, callIcon });
    }
    this.root.name = 'near-pedestrians';
  }

  /** Có đủ mẫu người đi đường + động tác để dùng không (thiếu thì chỉ dùng khối hộp). */
  static available(): boolean {
    return civiliansAvailable();
  }

  private assign(slot: Slot, w: Walker): void {
    if (slot.npc) slot.npc.body.visible = false;
    slot.walker = w.id;
    slot.generation = w.generation;
    const rng = createRng(lookSeed(w.id, w.generation));
    // Mẫu người do mô phỏng chọn (lượt rút đầu của chuỗi này — xem civilians.lookOf); bỏ qua lượt đó cho khớp chuỗi.
    const look = CIVILIANS[w.look]!;
    rng();
    const height = look.height[0] + rng() * (look.height[1] - look.height[0]);
    const idle = pick(rng, IDLES);
    const key = `${look.id}:${idle}`;
    let npc = slot.cache.get(key) ?? null;
    if (!npc) {
      npc = buildNpc(this.root, look.id, height, [
        ...[idle, look.female ? 'walkFemale' : 'walk', 'dodge', 'hitChest', 'knockback', w.id % 2 ? 'deathA' : 'deathB', look.female ? 'runFemale' : 'jog'],
        ...['angry', 'phone', 'interact', 'fightIdle', 'jab'],
      ] as AnimationName[]);
      if (npc) {
        // Trúng đòn / ngã / gục / cú đấm chỉ phát một lần rồi giữ tư thế cuối.
        const punch = npc.actions[PUNCH]!;
        punch.timeScale = punch.getClip().duration / 0.5;
        for (const i of [HIT, KNOCK, DEATH, PUNCH]) {
          npc.actions[i]!.setLoop(THREE.LoopOnce, 1);
          npc.actions[i]!.clampWhenFinished = true;
        }
        // Clip gục dài khác nhau (deathA 4,5 s, deathB 1,9 s) — chỉnh cho cùng ngã trong ~1,9 s.
        const death = npc.actions[DEATH]!;
        death.timeScale = Math.max(1, death.getClip().duration / DEATH_SECONDS);
        slot.cache.set(key, npc);
      }
    }
    slot.state = 'calm';
    slot.npc = npc;
    slot.height = height;
    slot.punching = false;
    if (npc) {
      npc.body.scale.setScalar(npc.perMeter * height);
      npc.body.visible = true;
      npc.weights.fill(0);
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
        if (slot.npc) slot.npc.body.visible = false;
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
        const idx = state === 'dead' ? DEATH : state === 'down' ? KNOCK : state === 'hurt' ? HIT : -1;
        if (idx >= 0) npc.actions[idx]!.reset().play();
        slot.state = state;
      }
      // Cú đấm mới (người đánh trả) ⇒ phát lại động tác đấm từ đầu.
      if (w.punch > 0 && !slot.punching) npc.actions[PUNCH]!.reset().play();
      slot.punching = w.punch > 0;
      const reacting = state === 'calm' ? w.react : 'none';
      npc.handset.visible = reacting === 'call' || reacting === 'film';
      if (reacting === 'call') {
        // Biểu tượng gọi điện nhấp nháy trên đầu (người chơi chạy tới kịp thì ngăn được cuộc gọi).
        const icon = slot.callIcon;
        icon.visible = true;
        icon.position.set(npc.body.position.x, PAD_HEIGHT + slot.height + 0.42, npc.body.position.z);
        icon.scale.setScalar(0.36 + 0.05 * Math.sin(this.time * 9));
      }
      if (state === 'dead') t[DEATH] = 1;
      else if (state === 'down') t[KNOCK] = 1;
      else if (state === 'hurt') t[HIT] = 1;
      else if (reacting === 'fight') t[w.punch > 0 ? PUNCH : w.speed > 0.15 ? RUN : FIGHT] = 1;
      else if (reacting === 'call') t[CALL] = 1;
      else if (reacting === 'film') t[FILM] = 1;
      else if (reacting === 'shout') t[SHOUT] = 1;
      else if (w.dodge > 0) t[DODGE] = 1;
      else if (w.flee > 0 && w.speed > 0.15) t[RUN] = 1;
      else if (w.speed > 0.15) t[WALK] = 1;
      else t[IDLE] = 1;
      // Nhịp bước theo tốc độ (clip đi khớp ~1,6 m/s, chạy ~3,6 m/s).
      npc.actions[WALK]!.timeScale = Math.min(1.4, Math.max(0.6, w.speed / 1.6));
      npc.actions[RUN]!.timeScale = Math.min(1.4, Math.max(0.7, w.speed / 3.6));
      stepNpc(npc, t, state === 'calm' ? 8 : 18, dt);
    }
  }
}
