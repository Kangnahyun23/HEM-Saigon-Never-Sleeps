import { createRng, pick } from '@/core/random';
import type { Seat } from '@/world/city/build/context';
import { eateryOccupancy } from '@/world/timeOfDay';
import { CIVILIANS, civiliansAvailable, hipHeightIn, NPC_ACTION, NPC_CLIPS, stepNpc, type NpcBody, type NpcClip, type NpcPool } from './npcBody';
import { PedestrianLod, type LodPoint } from './pedestrianLod';

/** Bán kính (m) quanh camera có người ngồi quán / người bán hàng (xa hơn thì bàn ghế trống — khó thấy). */
const RADIUS = 30;
/** Mông cao hơn mặt ghế đẩu chút (m). Ghế đẩu nhựa thấp hơn ghế trong clip ⇒ hạ người, nhưng chân lún tối đa 8 cm. */
const SEAT_CLEARANCE = 0.1;
const MAX_SINK = 0.08;
const VENDOR_IDLES: readonly NpcClip[] = ['idle', 'talk', 'foldArms'];
const SITTING: readonly NpcClip[] = ['sit', 'sitTalk'];
/** Giờ xe đẩy có người bán. */
const VENDOR_HOURS: readonly [number, number] = [6, 22.5];

interface Slot {
  seat: number;
  npc: NpcBody | null;
  /** Chỉ số action đang phát (ngồi / ngồi nói chuyện / đứng bán hàng). */
  action: number;
}

/** Hông cao bao nhiêu khi ngồi, tính trên 1 đơn vị co giãn của hình — đo một lần cho mỗi mẫu người + động tác. */
const sitHip = new Map<string, number>();

/**
 * Hoạt cảnh vỉa hè quanh camera: người ngồi ghế đẩu quán cóc (ngồi, ngồi nói chuyện) và người bán đứng cạnh xe đẩy.
 * Số ghế có người theo giờ (eateryOccupancy). Chỉ vẽ tối đa `capacity` người gần camera nhất.
 */
export class SeatedPeopleView {
  private readonly lod: PedestrianLod;
  private readonly slots: Slot[] = [];
  /** Trọng số đích: chỉ động tác của ô đang xét bằng 1 (đặt rồi trả về 0 ngay sau khi dùng). */
  private readonly targets = new Array<number>(NPC_CLIPS.length).fill(0);
  /** Ghế đang có người (dựng lại khi giờ đổi đủ nhiều). */
  private occupied: LodPoint[] = [];
  private occupancyHour = -1;

  /** `pool`: kho hình NPC dùng chung (NpcPool). */
  constructor(
    private readonly seats: readonly Seat[],
    capacity: number,
    private readonly pool: NpcPool,
  ) {
    this.lod = new PedestrianLod(capacity, RADIUS);
    for (let k = 0; k < capacity; k++) this.slots.push({ seat: -1, npc: null, action: 0 });
  }

  static available(): boolean {
    return civiliansAvailable();
  }

  /** Ghế nào có người lúc `hour`: cố định theo ghế (băm id), tỉ lệ theo giờ. Gọi lại khi giờ đổi ≥ 15 phút. */
  private refreshOccupancy(hour: number): void {
    const bucket = Math.floor(hour * 4) / 4;
    if (bucket === this.occupancyHour) return;
    this.occupancyHour = bucket;
    const share = eateryOccupancy(bucket);
    const vendorsOut = bucket >= VENDOR_HOURS[0] && bucket <= VENDOR_HOURS[1];
    this.occupied = this.seats.filter((s) => {
      if (s.kind === 'keeper') return true;
      if (s.kind === 'vendor') return vendorsOut;
      return createRng(s.id * 7349 + 3)() < share;
    });
  }

  /** Trả hình của ô về kho (ẩn, thôi cập nhật xương). */
  private release(slot: Slot): void {
    if (!slot.npc) return;
    this.pool.give(slot.npc);
    slot.npc = null;
  }

  private assign(slot: Slot, seat: Seat): void {
    this.release(slot);
    slot.seat = seat.id;
    const rng = createRng(seat.id * 2731 + 59);
    const look = pick(rng, CIVILIANS);
    const height = look.height[0] + rng() * (look.height[1] - look.height[0]);
    const clip = pick(rng, seat.kind === 'stool' ? SITTING : VENDOR_IDLES);
    const npc = this.pool.take(look.id);
    slot.npc = npc;
    slot.action = NPC_ACTION[clip];
    if (!npc) return;
    const scale = npc.perMeter * height;
    npc.body.scale.setScalar(scale);
    let y = seat.y;
    if (seat.kind === 'stool') {
      const key = `${look.id}:${clip}`;
      let hip = sitHip.get(key);
      if (hip === undefined) {
        hip = hipHeightIn(npc, slot.action) / scale;
        sitHip.set(key, hip);
      }
      // Gốc nhân vật (chân) đặt sao cho hông ngay trên mặt ghế; ghế thấp ⇒ chân lún nhẹ, có giới hạn.
      const groundY = seat.y - 0.28;
      y = Math.max(groundY - MAX_SINK, seat.y + SEAT_CLEARANCE - hip * scale);
    }
    npc.body.position.set(seat.x, y, seat.z);
    npc.body.rotation.set(0, seat.yaw, 0);
    // Vào ngay tư thế (không trộn dần từ tư thế gốc).
    npc.weights[slot.action] = 1;
    npc.actions[slot.action]!.setEffectiveWeight(1);
    npc.mixer.setTime(rng() * 4);
  }

  update(dt: number, hour: number, camX: number, camZ: number): void {
    this.refreshOccupancy(hour);
    this.lod.update(this.occupied, camX, camZ);
    for (let k = 0; k < this.slots.length; k++) {
      const slot = this.slots[k]!;
      const id = this.lod.slots[k]!;
      if (id < 0) {
        this.release(slot);
        slot.seat = -1;
        continue;
      }
      if (slot.seat !== id) this.assign(slot, this.seats[id]!);
      if (!slot.npc) continue;
      this.targets[slot.action] = 1;
      stepNpc(slot.npc, this.targets, 8, dt);
      this.targets[slot.action] = 0;
    }
  }
}
