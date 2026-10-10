import * as THREE from 'three/webgpu';
import { createCharacter, getClip, hasCharacter } from '@/assets/characters';
import type { AnimationName, CharacterId } from '@/assets/manifest';
import { createRng, pick } from '@/core/random';
import { PAD_HEIGHT } from '@/world/city/layout';
import { PedestrianLod } from './pedestrianLod';
import type { Walker } from './pedestrians';

/** Mẫu người đi đường (CC0, xem CREDITS.md) — nữ dùng dáng đi nữ. */
const CIVILIANS: ReadonlyArray<{ id: CharacterId; female: boolean; height: [number, number] }> = [
  { id: 'man-shirt', female: false, height: [1.62, 1.74] },
  { id: 'man-tee', female: false, height: [1.62, 1.74] },
  { id: 'man-polo', female: false, height: [1.62, 1.74] },
  { id: 'old-man', female: false, height: [1.58, 1.68] },
  { id: 'woman-young', female: true, height: [1.52, 1.64] },
  { id: 'woman-style', female: true, height: [1.52, 1.64] },
  { id: 'old-woman', female: true, height: [1.48, 1.58] },
];
/** Lúc đứng lại: gọi điện, nói chuyện, khoanh tay, đứng thường. */
const IDLES: readonly AnimationName[] = ['phone', 'talk', 'foldArms', 'idle', 'idle'];
/** Bán kính (m) quanh camera vẽ người bằng nhân vật có xương. */
const NEAR_RADIUS = 32;

/** Thứ tự động tác trong một nhân vật: 0 đứng (kiểu riêng), 1 đi, 2 né xe. */
const IDLE = 0;
const WALK = 1;
const DODGE = 2;

interface Npc {
  readonly body: THREE.Object3D;
  /** Tỉ lệ co giãn ứng với 1 m chiều cao (để đổi chiều cao khi dùng lại cho người khác). */
  readonly perMeter: number;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: THREE.AnimationAction[];
  readonly weights: number[];
}

interface Slot {
  walker: number;
  generation: number;
  npc: Npc | null;
  /** Mỗi chỗ giữ sẵn hình của từng mẫu đã dùng (đổi người khỏi phải nhân bản lại). */
  readonly cache: Map<string, Npc>;
}

const damp = (current: number, target: number, rate: number, dt: number): number => current + (target - current) * (1 - Math.exp(-rate * dt));
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
  private readonly targets = [0, 0, 0];

  constructor(capacity: number) {
    this.lod = new PedestrianLod(capacity, NEAR_RADIUS);
    for (let k = 0; k < capacity; k++) this.slots.push({ walker: -1, generation: -1, npc: null, cache: new Map() });
    this.root.name = 'near-pedestrians';
  }

  /** Có đủ mẫu người đi đường + động tác để dùng không (thiếu thì chỉ dùng khối hộp). */
  static available(): boolean {
    return CIVILIANS.every((c) => hasCharacter(c.id));
  }

  private build(look: (typeof CIVILIANS)[number], height: number, idle: AnimationName): Npc | null {
    const body = createCharacter(look.id, height);
    if (!body) return null;
    const perMeter = body.scale.y / height;
    const mixer = new THREE.AnimationMixer(body);
    const names: AnimationName[] = [idle, look.female ? 'walkFemale' : 'walk', 'dodge'];
    const actions = names.map((n) => mixer.clipAction(getClip(n) ?? new THREE.AnimationClip(n, 1, [])));
    for (const a of actions) a.setEffectiveWeight(0).play();
    this.root.add(body);
    return { body, perMeter, mixer, actions, weights: [0, 0, 0] };
  }

  private assign(slot: Slot, w: Walker): void {
    if (slot.npc) slot.npc.body.visible = false;
    slot.walker = w.id;
    slot.generation = w.generation;
    const rng = createRng(w.id * 4099 + w.generation * 7919 + 101);
    const look = pick(rng, CIVILIANS);
    const height = look.height[0] + rng() * (look.height[1] - look.height[0]);
    const idle = pick(rng, IDLES);
    const key = `${look.id}:${idle}`;
    let npc = slot.cache.get(key) ?? null;
    if (!npc) {
      npc = this.build(look, height, idle);
      if (npc) slot.cache.set(key, npc);
    }
    slot.npc = npc;
    if (npc) {
      npc.body.scale.setScalar(npc.perMeter * height);
      npc.body.visible = true;
      npc.weights.fill(0);
      // Lệch pha (có seed) để những người cạnh nhau không bước đều như duyệt binh.
      npc.mixer.setTime(rng() * 3);
    }
  }

  update(walkers: readonly Walker[], alpha: number, dt: number, camX: number, camZ: number): void {
    this.lod.update(walkers, camX, camZ);
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k]!;
      const id = this.lod.slots[k]!;
      if (id < 0) {
        if (slot.npc) slot.npc.body.visible = false;
        slot.walker = -1;
        continue;
      }
      const w = walkers[id]!;
      if (slot.walker !== id || slot.generation !== w.generation) this.assign(slot, w);
      const npc = slot.npc;
      if (!npc) continue;
      const dyaw = Math.atan2(Math.sin(w.yaw - w.prevYaw), Math.cos(w.yaw - w.prevYaw));
      npc.body.position.set(w.prevX + (w.x - w.prevX) * alpha, PAD_HEIGHT, w.prevZ + (w.z - w.prevZ) * alpha);
      npc.body.quaternion.copy(_q.setFromAxisAngle(_up, w.prevYaw + dyaw * alpha));
      const t = this.targets;
      t[IDLE] = t[WALK] = t[DODGE] = 0;
      if (w.dodge > 0) t[DODGE] = 1;
      else if (w.speed > 0.15) t[WALK] = 1;
      else t[IDLE] = 1;
      // Nhịp bước theo tốc độ đi (clip đi khớp ~1,6 m/s).
      npc.actions[WALK]!.timeScale = Math.min(1.4, Math.max(0.6, w.speed / 1.6));
      for (let i = 0; i < 3; i++) {
        const v = damp(npc.weights[i]!, t[i]!, 8, dt);
        npc.weights[i] = v < 0.002 ? 0 : v;
        npc.actions[i]!.setEffectiveWeight(npc.weights[i]!);
      }
      npc.mixer.update(dt);
    }
  }
}
