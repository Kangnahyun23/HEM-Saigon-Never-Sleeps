import type { SightGrid } from '@/systems/heat';
import type { TrafficKind } from './trafficKinds';

/**
 * Xe công an đi tuần (thuần logic, có unit test): ô tô công an chạy lẫn trong dòng xe NPC (loại 'police' trong
 * trafficKinds). Tín gây án (đánh người, cướp xe) ngay trước mặt một xe tuần tra thì khỏi chờ dân gọi báo — lên sao
 * liền và chính chiếc xe đó quay sang truy đuổi.
 */

export const PATROL = {
  /** Xe tuần tra thấy được trong tầm này (m), nếu không bị nhà cửa che. */
  sight: 45,
} as const;

/** Phần của xe NPC mà việc tìm "nhân chứng" cần biết. */
export interface PatrolAgent {
  kind: TrafficKind;
  x: number;
  z: number;
}

/** Xe tuần tra gần nhất nhìn thấy chỗ (x, z) trong `agents[first…]`; −1 nếu không có xe nào thấy. */
export function patrolWitness(agents: readonly PatrolAgent[], first: number, x: number, z: number, sight: SightGrid): number {
  let best = -1;
  let bestD: number = PATROL.sight;
  for (let i = first; i < agents.length; i++) {
    const a = agents[i] as PatrolAgent;
    if (a.kind !== 'police') continue;
    const d = Math.hypot(a.x - x, a.z - z);
    if (d < bestD && sight.clear(a.x, a.z, x, z)) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
