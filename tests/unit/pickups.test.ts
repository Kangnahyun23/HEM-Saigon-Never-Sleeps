import { describe, expect, it } from 'vitest';
import { PICKUP_RANGE, Pickups, type PickupSpot } from '@/systems/pickups';

const SPOTS: PickupSpot[] = [
  { x: 0, y: 0.3, z: 0, yaw: 0, item: 'gheNhua', restock: 0 },
  { x: 5, y: 0.9, z: 0, yaw: 0, item: 'muBaoHiem', restock: 6 },
];

describe('đồ nhặt ngoài phố', () => {
  it('chỉ nhặt được khi đứng gần; chọn vật gần nhất', () => {
    const p = new Pickups(SPOTS);
    expect(p.nearest(0.5, 0.5, 0)).toBe(0);
    expect(p.nearest(4.2, 0, 0)).toBe(1);
    expect(p.nearest(2.5, 0, 0)).toBe(-1);
    expect(p.nearest(0, PICKUP_RANGE + 0.1, 0)).toBe(-1);
  });

  it('chồng ghế lấy mãi không hết; mũ bảo hiểm lấy rồi vài giờ game mới có lại', () => {
    const p = new Pickups(SPOTS);
    expect(p.take(0, 1)).toBe('gheNhua');
    expect(p.take(0, 1)).toBe('gheNhua');
    expect(p.version).toBe(0);
    expect(p.take(1, 10)).toBe('muBaoHiem');
    expect(p.version).toBe(1);
    expect(p.take(1, 11)).toBeNull();
    expect(p.nearest(5, 0, 12)).toBe(-1);
    p.refresh(15);
    expect(p.version).toBe(1);
    p.refresh(16);
    expect(p.version).toBe(2);
    expect(p.available(1, 16)).toBe(true);
    expect(p.nearest(5, 0, 16)).toBe(1);
  });
});
