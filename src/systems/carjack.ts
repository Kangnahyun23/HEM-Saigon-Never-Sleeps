import type { TrafficKind } from '@/ai/trafficKinds';
import { VEHICLE_SPECS } from '@/ai/trafficKinds';
import type { CarKind } from '@/vehicles/carModel';

/**
 * Cướp xe (thuần logic, có unit test): Tín đi bộ tới sát một ô tô NPC đang đứng / bò chậm thì kéo tài xế ra và lái đi.
 * Xe chạy nhanh thì không với tới tay nắm cửa — chặn đầu xe cho nó dừng (ô tô chờ người đi bộ vài giây rồi mới lách),
 * hoặc đợi lúc nó chờ lượt ở ngã tư.
 */

export const CARJACK = {
  /**
   * Đứng cách thân xe trong khoảng này (m) thì cướp được. Xe bị chặn đầu trườn chậm dần tới cách người ~1,5 m:
   * tầm 2 m cho gợi ý hiện sau chừng 2 giây, còn ~4 giây trước khi tài xế hết kiên nhẫn lách đi (PERSON_PATIENCE).
   */
  reach: 2,
  /** Xe chạy nhanh hơn mức này (m/s, ~12 km/h) thì không cướp được. */
  maxSpeed: 3.4,
  /** Tài xế bị kéo ra đứng cách hông trái xe chừng này (m). */
  doorOut: 0.7,
  /** Sau khi cướp xe bấy nhiêu giây, cuộc gọi báo công an vẫn được tính là báo vụ cướp xe. */
  crimeMemory: 30,
} as const;

/** Xe NPC nào cướp được: chỉ ô tô con (có mẫu xe lái được tương ứng); buýt, ba gác, xích lô, xe đẩy thì không. */
export function jackableKind(kind: TrafficKind): CarKind | null {
  return kind === 'sedan' || kind === 'taxi' || kind === 'pickup' ? kind : null;
}

/** Phần của xe NPC mà việc chọn mục tiêu cần biết. */
export interface JackAgent {
  kind: TrafficKind;
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

/** Khoảng cách từ điểm (px, pz) tới thân xe (hình chữ nhật theo hướng xe); 0 nếu điểm nằm trong thân. */
export function distanceToBody(agent: JackAgent, px: number, pz: number): number {
  const spec = VEHICLE_SPECS[agent.kind];
  const dx = px - agent.x;
  const dz = pz - agent.z;
  const sin = Math.sin(agent.yaw);
  const cos = Math.cos(agent.yaw);
  // Bên trái của xe là (cos yaw, −sin yaw), phía trước là (sin yaw, cos yaw).
  const side = Math.abs(dx * cos - dz * sin) - spec.halfWidth;
  const along = Math.abs(dx * sin + dz * cos) - spec.length / 2;
  return Math.hypot(Math.max(0, side), Math.max(0, along));
}

/**
 * Xe cướp được gần Tín nhất trong `agents[first…]` (xe máy NPC nằm trước `first`): ô tô con, đang chạy chậm, trong tầm tay.
 * Trả chỉ số trong `agents`, −1 nếu không có.
 */
export function jackTarget(agents: readonly JackAgent[], first: number, px: number, pz: number): number {
  let best = -1;
  let bestD: number = CARJACK.reach;
  for (let i = first; i < agents.length; i++) {
    const a = agents[i] as JackAgent;
    if (!jackableKind(a.kind) || a.speed > CARJACK.maxSpeed) continue;
    // Lọc nhanh trước khi tính khoảng cách tới thân xe.
    if (Math.abs(a.x - px) > 5 || Math.abs(a.z - pz) > 5) continue;
    const d = distanceToBody(a, px, pz);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Chỗ tài xế bị kéo ra: ngay ngoài cửa trái (ghế lái bên trái). */
export function driverDoor(agent: JackAgent, out = { x: 0, z: 0 }): { x: number; z: number } {
  const d = VEHICLE_SPECS[agent.kind].halfWidth + CARJACK.doorOut;
  out.x = agent.x + Math.cos(agent.yaw) * d;
  out.z = agent.z - Math.sin(agent.yaw) * d;
  return out;
}
