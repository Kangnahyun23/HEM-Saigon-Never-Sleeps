import * as THREE from 'three/webgpu';
import { PAD_HEIGHT } from '@/world/city/layout';
import type { Officer } from './footPolice';
import { pickRider, POLICE_RIDERS } from './nearRiders';
import { NPC_ACTION as A, NPC_CLIPS, stepNpc, type NpcBody, type NpcSource } from './npcBody';
import { bikeLook } from './trafficView';

type State = 'calm' | 'hurt' | 'down' | 'dead';

interface Slot {
  /** Id công an đang vẽ (−1 = trống). */
  officer: number;
  npc: NpcBody | null;
  /** Trạng thái lần trước (đổi ⇒ phát động tác trúng đòn / ngã / gục một lần từ đầu). */
  state: State;
  /** Lần trước đang vung dùi cui (cú mới ⇒ phát lại từ đầu). */
  striking: boolean;
  /** Chỉ số action chạy (nam / nữ) và gục. */
  run: number;
  death: number;
  /** Vừa lấy hình: vào ngay tư thế đích (không trộn dần từ tư thế gốc chữ T). */
  fresh: boolean;
}

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Công an đi bộ (FootPoliceSim) vẽ bằng nhân vật có xương từ kho NPC chung: đúng mẫu người + chiều cao như lúc ngồi trên
 * xe (pickRider theo `generation`), xuống từ xe máy thì vẫn đội mũ bảo hiểm, tay cầm dùi cui. Động tác: chạy, đứng thủ
 * thế (khi đã có người đánh công an), nắm tay Tín (còng), vung dùi cui, trúng đòn, ngã, gục.
 */
export class FootPoliceView {
  private readonly slots: Slot[] = [];
  private readonly targets = new Array<number>(NPC_CLIPS.length).fill(0);

  constructor(
    capacity: number,
    private readonly pool: NpcSource,
    /** Cao độ mặt đất tại (x, z): lòng đường 0, vỉa hè / trong hẻm PAD_HEIGHT (công an không có thân vật lý). */
    private readonly ground: (x: number, z: number) => number = () => PAD_HEIGHT,
  ) {
    for (let k = 0; k < capacity; k++) this.slots.push({ officer: -1, npc: null, state: 'calm', striking: false, run: A.jog, death: A.deathA, fresh: false });
  }

  /** Số công an đang vẽ (debug / test). */
  get active(): number {
    let n = 0;
    for (const s of this.slots) if (s.npc) n++;
    return n;
  }

  private release(slot: Slot): void {
    if (slot.npc) this.pool.give(slot.npc);
    slot.npc = null;
    slot.officer = -1;
  }

  private assign(slot: Slot, o: Officer): void {
    this.release(slot);
    slot.officer = o.id;
    slot.state = 'calm';
    slot.striking = false;
    slot.fresh = true;
    const { look, height } = pickRider(POLICE_RIDERS, 0, o.generation);
    slot.run = look.female ? A.runFemale : A.jog;
    slot.death = o.id % 2 ? A.deathA : A.deathB;
    const npc = this.pool.take(look.id);
    slot.npc = npc;
    if (!npc) return;
    npc.body.scale.setScalar(npc.perMeter * height);
    npc.baton.visible = true;
    npc.helmet.visible = o.kind === 'bike';
    if (o.kind === 'bike') npc.helmet.material.color.set(bikeLook(0, o.generation, 'police').colors.helmet);
  }

  /**
   * Vị trí hông (thế giới) của công an `id` đang vẽ — đặt vũng máu đúng chỗ thân người nằm. Trả false nếu không có.
   */
  pelvisOf(id: number, out: THREE.Vector3): boolean {
    for (const slot of this.slots) {
      if (slot.officer !== id || !slot.npc?.pelvis) continue;
      slot.npc.pelvis.getWorldPosition(out);
      return true;
    }
    return false;
  }

  /** Mỗi khung hình: `hostile` = công an đang đánh lại (đứng thủ thế). Không tạo đối tượng mới. */
  update(officers: readonly Officer[], hostile: boolean, alpha: number, dt: number): void {
    // Trả ô của người đã đi (lên xe / dọn xác).
    for (const slot of this.slots) {
      if (slot.officer < 0) continue;
      let here = false;
      for (let i = 0; i < officers.length && !here; i++) here = officers[i]!.id === slot.officer;
      if (!here) this.release(slot);
    }
    const t = this.targets;
    for (let i = 0; i < officers.length; i++) {
      const o = officers[i]!;
      let slot: Slot | null = null;
      for (const s of this.slots) if (s.officer === o.id) slot = s;
      if (!slot) {
        for (const s of this.slots) if (!slot && s.officer < 0) slot = s;
        if (!slot) continue;
        this.assign(slot, o);
      }
      const npc = slot.npc;
      if (!npc) continue;
      const dyaw = Math.atan2(Math.sin(o.yaw - o.prevYaw), Math.cos(o.yaw - o.prevYaw));
      const x = o.prevX + (o.x - o.prevX) * alpha;
      const z = o.prevZ + (o.z - o.prevZ) * alpha;
      npc.body.position.set(x, this.ground(x, z), z);
      npc.body.quaternion.copy(_q.setFromAxisAngle(_up, o.prevYaw + dyaw * alpha));
      const state: State = o.dead ? 'dead' : o.down > 0 ? 'down' : o.hurt > 0 ? 'hurt' : 'calm';
      if (state !== slot.state) {
        const idx = state === 'dead' ? slot.death : state === 'down' ? A.knockback : state === 'hurt' ? A.hitChest : -1;
        if (idx >= 0) npc.actions[idx]!.reset().play();
        slot.state = state;
      }
      if (o.strike > 0 && !slot.striking) npc.actions[A.slashA]!.reset().play();
      slot.striking = o.strike > 0;
      t.fill(0);
      if (state === 'dead') t[slot.death] = 1;
      else if (state === 'down') t[A.knockback] = 1;
      else if (state === 'hurt') t[A.hitChest] = 1;
      else if (o.strike > 0) t[A.slashA] = 1;
      else if (o.grab > 0) t[A.interact] = 1;
      else if (o.speed > 0.3) t[slot.run] = 1;
      else t[hostile ? A.fightIdle : A.idle] = 1;
      // Nhịp chạy theo tốc độ (clip chạy khớp ~3,6 m/s).
      npc.actions[slot.run]!.timeScale = Math.min(1.6, Math.max(0.8, o.speed / 3.6));
      if (slot.fresh) {
        slot.fresh = false;
        for (let k = 0; k < t.length; k++) npc.weights[k] = t[k]!;
      }
      stepNpc(npc, t, state === 'calm' ? 10 : 18, dt);
    }
  }
}
