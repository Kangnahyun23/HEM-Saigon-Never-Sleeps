/**
 * Các loại xe NPC trên phố (thuần dữ liệu): kích thước, sức máy, chỗ chạy trong lòng đường.
 * Mô phỏng (traffic.ts), thân va chạm (trafficSystem.ts) và hình (trafficFleetView.ts) đều đọc bảng này.
 */

export type TrafficKind = 'bike' | 'sedan' | 'taxi' | 'pickup' | 'bus' | 'baGac' | 'xichLo' | 'cart';

export interface VehicleSpec {
  /** Chiều dài, nửa bề ngang (tính cả khoảng hở khi xét va chạm), chiều cao (m). */
  length: number;
  halfWidth: number;
  height: number;
  accel: number;
  brake: number;
  /** Nhân với tốc độ làn; `maxSpeed` là trần tuyệt đối (m/s). */
  speedScale: number;
  maxSpeed: number;
  /** Tốc độ dạt ngang tối đa (m/s). */
  lateralSpeed: number;
  /** Nhân với tốc độ vào cua (xe dài cua chậm). */
  turnScale: number;
  /**
   * Chỗ chạy trong nửa đường: 'spread' dàn ngang khắp nơi (xe máy), 'inner' sát tim đường (ô tô, buýt),
   * 'curb' sát lề (xe thô sơ chạy chậm).
   */
  position: 'spread' | 'inner' | 'curb';
  /** Chỉ chạy đại lộ khi còn đường đại lộ để đi tiếp (xe buýt). */
  avenueOnly: boolean;
  /** Nghiêng vào cua như xe hai bánh. */
  leans: boolean;
  /** Có còi (xe đạp, xe đẩy thì không). */
  horn: boolean;
  /** Xe lớn: qua giao lộ lần lượt từng chiếc (traffic.ts), xe nhỏ phải nhường. */
  big: boolean;
}

const CAR: VehicleSpec = {
  length: 4.3,
  halfWidth: 0.95,
  height: 1.45,
  accel: 2.2,
  brake: 6.5,
  speedScale: 1.05,
  maxSpeed: Infinity,
  lateralSpeed: 0.7,
  turnScale: 0.85,
  position: 'inner',
  avenueOnly: false,
  leans: false,
  horn: true,
  big: true,
};

export const VEHICLE_SPECS: Record<TrafficKind, VehicleSpec> = {
  bike: {
    length: 1.9,
    halfWidth: 0.5,
    height: 1.2,
    accel: 2.6,
    brake: 7,
    speedScale: 1,
    maxSpeed: Infinity,
    lateralSpeed: 0.9,
    turnScale: 1,
    position: 'spread',
    avenueOnly: false,
    leans: true,
    horn: true,
    big: false,
  },
  sedan: CAR,
  taxi: CAR,
  pickup: { ...CAR, height: 1.55, accel: 2 },
  bus: { ...CAR, length: 8.6, halfWidth: 1.25, height: 2.9, accel: 1.2, brake: 5, speedScale: 0.85, lateralSpeed: 0.45, turnScale: 0.6, avenueOnly: true },
  // Ba gác máy: đầu xe máy kéo thùng hàng hai bánh.
  baGac: { ...CAR, length: 3.2, halfWidth: 0.7, height: 1.9, accel: 1.6, brake: 5.5, speedScale: 0.6, maxSpeed: 7, lateralSpeed: 0.6, turnScale: 0.8, position: 'curb' },
  // Xích lô: khách ngồi trước, người đạp ngồi sau.
  xichLo: { ...CAR, length: 2.6, halfWidth: 0.6, height: 2.2, accel: 0.8, brake: 3.5, speedScale: 0.4, maxSpeed: 3.4, lateralSpeed: 0.5, turnScale: 0.7, position: 'curb', horn: false, big: false },
  // Xe đẩy bán hàng rong: người bán đi bộ đẩy xe.
  cart: { ...CAR, length: 2.3, halfWidth: 0.5, height: 1.95, accel: 0.6, brake: 2.5, speedScale: 0.2, maxSpeed: 1.25, lateralSpeed: 0.4, turnScale: 0.5, position: 'curb', horn: false, big: false },
};

/** Nửa kích thước thân va chạm của xe máy NPC (hẹp hơn bề ngang "chiếm chỗ" trong mô phỏng: người lái lách qua nhau được). */
const BIKE_BODY = { x: 0.32, y: 0.6, z: 0.95 } as const;

/** Nửa kích thước thân va chạm (hộp) của một xe NPC loại `kind`. */
export function bodyHalfExtents(kind: TrafficKind): { x: number; y: number; z: number } {
  if (kind === 'bike') return BIKE_BODY;
  const spec = VEHICLE_SPECS[kind];
  return { x: spec.halfWidth - 0.05, y: spec.height / 2, z: spec.length / 2 };
}

/** Thứ tự loại xe khi chia `cars` ô tô: lần lượt theo vòng này (3 xe trở lên là có một xe buýt). */
export const CAR_MIX: readonly TrafficKind[] = ['sedan', 'taxi', 'bus', 'sedan', 'pickup', 'taxi', 'sedan'];
/** Thứ tự loại xe thô sơ. */
export const SLOW_MIX: readonly TrafficKind[] = ['baGac', 'xichLo', 'cart'];

/** Danh sách loại xe cho cả đàn: xe máy trước, rồi ô tô, rồi xe thô sơ (thứ tự cố định để lớp hình chia chỗ một lần). */
export function fleetKinds(bikes: number, cars: number, slow: number): TrafficKind[] {
  const out: TrafficKind[] = [];
  for (let i = 0; i < bikes; i++) out.push('bike');
  for (let i = 0; i < cars; i++) out.push(CAR_MIX[i % CAR_MIX.length] as TrafficKind);
  for (let i = 0; i < slow; i++) out.push(SLOW_MIX[i % SLOW_MIX.length] as TrafficKind);
  return out;
}
