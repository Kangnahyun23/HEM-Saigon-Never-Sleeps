import { describe, expect, it } from 'vitest';
import { detailDistance } from '@/world/city/detailDistance';

describe('tầm vẽ chi tiết nhỏ', () => {
  it('nội thất tiệm chỉ vẽ khi lại gần; bảng hiệu tiệm, vũng đèn tiệm (cùng đầu "shop-") luôn vẽ', () => {
    expect(detailDistance('shop-props')).toBe(130);
    expect(detailDistance('shop-signs')).toBeUndefined();
    expect(detailDistance('shop-spill')).toBeUndefined();
  });

  it('khớp theo tiền tố; lô lớn (mặt tiền, đường) không có trong bảng thì luôn vẽ', () => {
    expect(detailDistance('parked-bike-red')).toBe(110);
    expect(detailDistance('sidewalk-tables')).toBe(110);
    expect(detailDistance('railings-cage')).toBe(160);
    for (const name of ['facades', 'pads', 'curbs', 'hem-main', 'medians', 'light-pools']) expect(detailDistance(name)).toBeUndefined();
  });
});
