/**
 * Mô hình xe số kiểu "xe máy quốc dân" (hư cấu, không theo thương hiệu nào), dựng từ hộp và trụ.
 * Toạ độ cục bộ: đầu xe hướng +Z, Y hướng lên, gốc ở mặt đất giữa hai bánh. Đơn vị mét.
 * Dùng chung cho xe người chơi (Group thật, có lái/quay bánh) và xe đậu ven đường (instanced).
 */

export type BikeRole = 'body' | 'tire' | 'rim' | 'seat' | 'dark' | 'metal' | 'light' | 'tail';

export interface BikePart {
  shape: 'box' | 'cyl';
  /** box: [sx, sy, sz]; cyl: [bán kính, chiều dài, 0] — trụ nằm theo trục X (như bánh xe). */
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  /** Góc nghiêng quanh trục X (rad), dương = ngả về sau. */
  tilt?: number;
  role: BikeRole;
  /** Thuộc cụm tay lái (xoay khi bẻ lái). */
  steer?: boolean;
  /** Bánh xe (quay theo tốc độ). */
  wheel?: 'front' | 'rear';
}

export const BIKE = {
  length: 1.9,
  wheelBase: 1.24,
  wheelRadius: 0.29,
  seatHeight: 0.8,
  /** Trục lái (điểm xoay cụm tay lái), nằm trên đường cổ phuộc. */
  steerPivot: [0, 0.95, 0.5] as const,
};

const F = BIKE.wheelBase / 2;
const R = BIKE.wheelRadius;

export const BIKE_PARTS: readonly BikePart[] = [
  // Bánh + vành
  { shape: 'cyl', size: [R, 0.1, 0], pos: [0, R, F], role: 'tire', steer: true, wheel: 'front' },
  { shape: 'cyl', size: [R * 0.62, 0.112, 0], pos: [0, R, F], role: 'rim', steer: true, wheel: 'front' },
  { shape: 'cyl', size: [R, 0.11, 0], pos: [0, R, -F], role: 'tire', wheel: 'rear' },
  { shape: 'cyl', size: [R * 0.62, 0.122, 0], pos: [0, R, -F], role: 'rim', wheel: 'rear' },
  // Thân
  { shape: 'box', size: [0.28, 0.3, 0.86], pos: [0, 0.56, -0.2], role: 'body' },
  { shape: 'box', size: [0.25, 0.12, 0.5], pos: [0, 0.74, -0.66], tilt: -0.12, role: 'body' },
  { shape: 'box', size: [0.31, 0.1, 0.74], pos: [0, 0.83, -0.26], role: 'seat' },
  { shape: 'box', size: [0.36, 0.56, 0.1], pos: [0, 0.64, 0.36], tilt: -0.32, role: 'body' },
  { shape: 'box', size: [0.3, 0.05, 0.36], pos: [0, 0.37, 0.13], role: 'dark' },
  { shape: 'box', size: [0.22, 0.22, 0.36], pos: [0, 0.37, -0.12], role: 'dark' },
  { shape: 'box', size: [0.08, 0.08, 0.62], pos: [0.15, 0.3, -0.46], tilt: -0.08, role: 'metal' },
  { shape: 'box', size: [0.13, 0.05, 0.42], pos: [0, 0.6, -0.62], tilt: 0.1, role: 'dark' },
  { shape: 'box', size: [0.14, 0.06, 0.04], pos: [0, 0.78, -0.93], role: 'tail' },
  // Cụm tay lái
  { shape: 'box', size: [0.035, 0.62, 0.035], pos: [0.075, 0.6, 0.56], tilt: -0.32, role: 'metal', steer: true },
  { shape: 'box', size: [0.035, 0.62, 0.035], pos: [-0.075, 0.6, 0.56], tilt: -0.32, role: 'metal', steer: true },
  { shape: 'box', size: [0.12, 0.04, 0.42], pos: [0, 0.63, F], role: 'body', steer: true },
  { shape: 'box', size: [0.36, 0.16, 0.22], pos: [0, 1.0, 0.49], tilt: -0.2, role: 'body', steer: true },
  { shape: 'box', size: [0.7, 0.035, 0.035], pos: [0, 1.04, 0.44], role: 'dark', steer: true },
  { shape: 'box', size: [0.16, 0.1, 0.05], pos: [0, 0.98, 0.61], tilt: -0.2, role: 'light', steer: true },
  { shape: 'box', size: [0.015, 0.2, 0.015], pos: [0.24, 1.14, 0.45], role: 'metal', steer: true },
  { shape: 'box', size: [0.015, 0.2, 0.015], pos: [-0.24, 1.14, 0.45], role: 'metal', steer: true },
  { shape: 'box', size: [0.07, 0.09, 0.02], pos: [0.25, 1.26, 0.45], role: 'dark', steer: true },
  { shape: 'box', size: [0.07, 0.09, 0.02], pos: [-0.25, 1.26, 0.45], role: 'dark', steer: true },
];

/** Màu thân xe phổ biến ngoài đường: đỏ, đen, xanh, trắng, bạc, hồng, xanh lá, nâu. */
export const BIKE_BODY_COLORS = ['#b3242b', '#1d1e22', '#1f4e9a', '#e8e6e1', '#9ea3a8', '#d97a9b', '#2f7d4f', '#6b4a33'] as const;

export const BIKE_ROLE_COLORS: Record<Exclude<BikeRole, 'body'>, string> = {
  tire: '#141414',
  rim: '#b9bcc0',
  seat: '#1a1a1a',
  dark: '#2e3033',
  metal: '#aeb3b8',
  light: '#fff6d8',
  tail: '#d01e1e',
};
