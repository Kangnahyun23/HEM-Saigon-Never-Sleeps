/**
 * Tầm nhìn tối đa (m) của các lô chi tiết nhỏ: xa hơn thì chỉ còn vài điểm ảnh (và đã chìm trong sương) nên không vẽ.
 * Khớp theo tiền tố tên lô (InstanceBatch `name`). Lô không có trong bảng (mặt tiền, đường, vỉa hè…) luôn vẽ.
 * Thuần dữ liệu (có unit test) — tiền tố mới đừng khớp nhầm lô khác (vd. bảng hiệu tiệm phải luôn vẽ).
 */
const DETAIL_DISTANCE: Readonly<Record<string, number>> = {
  'balcony-plants': 120,
  // Nội thất cửa hàng vào được: chỉ vẽ khi lại gần (ghi đủ tên — 'shop-signs', 'shop-spill' phải luôn vẽ).
  'shop-props': 130,
  stools: 90,
  'ac-units': 120,
  'roof-stuff': 120,
  'cable-coils': 120,
  'pole-hardware': 120,
  'tree-grates': 90,
  'parked-bike-': 110,
  benches: 120,
  railings: 160,
  laundry: 110,
  'sidewalk-': 110,
  'hem-meters': 90,
  'hem-pots': 90,
  'hem-plants': 90,
  'hem-altars': 110,
  'hem-bollards': 120,
  'hem-tarps': 140,
  'led-signs': 150,
  'tree-limewash': 120,
  'water-tanks': 180,
  'roof-sheets': 160,
  shrubs: 170,
  umbrellas: 170,
  'umbrella-poles': 140,
  stalls: 170,
  'river-railing': 160,
  canopies: 230,
  'road-marks': 200,
};

/** Tầm vẽ của lô tên `name` (m); undefined = luôn vẽ. */
export function detailDistance(name: string): number | undefined {
  for (const prefix in DETAIL_DISTANCE) if (name.startsWith(prefix)) return DETAIL_DISTANCE[prefix];
  return undefined;
}
