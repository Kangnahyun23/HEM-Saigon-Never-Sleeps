/**
 * Mô hình ô tô hư cấu (không theo thương hiệu nào), dựng từ hộp và trụ như xe máy (bikeModel.ts).
 * Toạ độ cục bộ: đầu xe hướng +Z, Y hướng lên, gốc ở mặt đất giữa bốn bánh. Đơn vị mét.
 * Ba kiểu: sedan, taxi (sedan hai màu + hộp đèn trên nóc), bán tải (cabin ngắn + thùng sau).
 */

export type CarKind = 'sedan' | 'taxi' | 'pickup';

export type CarRole = 'body' | 'trim' | 'glass' | 'tire' | 'rim' | 'dark' | 'metal' | 'light' | 'tail' | 'sign';

export interface CarPart {
  shape: 'box' | 'cyl';
  /** box: [sx, sy, sz]; cyl: [bán kính, chiều dài, 0] — trụ nằm theo trục X (như bánh xe). */
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  role: CarRole;
  /** Bánh xe số mấy (0 trước-trái, 1 trước-phải, 2 sau-trái, 3 sau-phải): quay theo tốc độ, bánh trước xoay theo lái. */
  wheel?: 0 | 1 | 2 | 3;
}

export const CAR = {
  length: 4.3,
  /** Bề ngang thân xe — rộng hơn khe giữa các trụ chắn ở miệng hẻm (hemBollards) nên ô tô không vào được hẻm. */
  width: 1.8,
  height: 1.46,
  wheelBase: 2.6,
  /** Khoảng cách tâm hai bánh cùng trục. */
  track: 1.52,
  wheelRadius: 0.32,
  /** Chỗ ngồi người lái (bên trái): mông ở độ cao này. */
  seat: [0.38, 0.42, -0.05] as const,
} as const;

/** Vị trí tâm bốn bánh (x, z) theo thứ tự trước-trái, trước-phải, sau-trái, sau-phải. Bên trái của xe là +X. */
export const CAR_WHEELS: ReadonlyArray<readonly [number, number]> = [
  [CAR.track / 2, CAR.wheelBase / 2],
  [-CAR.track / 2, CAR.wheelBase / 2],
  [CAR.track / 2, -CAR.wheelBase / 2],
  [-CAR.track / 2, -CAR.wheelBase / 2],
];

export const CAR_ROLE_COLORS: Record<Exclude<CarRole, 'body' | 'trim'>, string> = {
  glass: '#1c2a33',
  tire: '#141414',
  rim: '#b9bcc0',
  dark: '#23262a',
  metal: '#9aa0a6',
  light: '#fff6dc',
  tail: '#b01818',
  sign: '#ffe97a',
};

/** Màu sơn sedan / bán tải (hư cấu, tông xe phổ thông). */
export const CAR_BODY_COLORS = ['#d8d8d4', '#1f2428', '#7a1c20', '#2b4a78', '#8c8f93', '#3d5a3a'] as const;
/** Taxi hư cấu "Me Xanh": thân xanh lá, nóc + hông dưới trắng. */
export const TAXI_COLORS = { body: '#1f8a4c', trim: '#f2f2ec' } as const;

const R = CAR.wheelRadius;
const W = CAR.width;

function wheels(): CarPart[] {
  const out: CarPart[] = [];
  CAR_WHEELS.forEach(([x, z], i) => {
    const wheel = i as 0 | 1 | 2 | 3;
    out.push({ shape: 'cyl', size: [R, 0.22, 0], pos: [x, R, z], role: 'tire', wheel });
    out.push({ shape: 'cyl', size: [R * 0.6, 0.235, 0], pos: [x, R, z], role: 'rim', wheel });
  });
  return out;
}

/** Đèn pha, đèn hậu, cản, biển số — chung cho mọi kiểu. `nose` / `tail`: z của mặt trước / sau; `y`: độ cao đèn. */
function lightsAndBumpers(nose: number, tail: number, y: number): CarPart[] {
  return [
    { shape: 'box', size: [0.36, 0.14, 0.06], pos: [W / 2 - 0.3, y, nose], role: 'light' },
    { shape: 'box', size: [0.36, 0.14, 0.06], pos: [-W / 2 + 0.3, y, nose], role: 'light' },
    { shape: 'box', size: [0.34, 0.13, 0.06], pos: [W / 2 - 0.29, y + 0.04, tail], role: 'tail' },
    { shape: 'box', size: [0.34, 0.13, 0.06], pos: [-W / 2 + 0.29, y + 0.04, tail], role: 'tail' },
    { shape: 'box', size: [W - 0.04, 0.2, 0.12], pos: [0, 0.36, nose - 0.02], role: 'dark' },
    { shape: 'box', size: [W - 0.04, 0.2, 0.12], pos: [0, 0.36, tail + 0.02], role: 'dark' },
    { shape: 'box', size: [0.7, 0.16, 0.05], pos: [0, y - 0.02, nose + 0.01], role: 'dark' },
    { shape: 'box', size: [0.46, 0.12, 0.03], pos: [0, 0.46, tail - 0.045], role: 'metal' },
  ];
}

function sedan(roofRole: CarRole): CarPart[] {
  const nose = CAR.length / 2;
  return [
    ...wheels(),
    // Thân dưới (gầm cao 0,24 m) — phần hông dưới của taxi sơn màu phụ.
    { shape: 'box', size: [W, 0.22, CAR.length - 0.1], pos: [0, 0.35, 0], role: roofRole },
    { shape: 'box', size: [W, 0.36, CAR.length - 0.1], pos: [0, 0.64, 0], role: 'body' },
    // Nắp máy và cốp thấp hơn khoang giữa một chút.
    { shape: 'box', size: [W - 0.08, 0.1, 1.15], pos: [0, 0.86, nose - 0.68], role: 'body' },
    { shape: 'box', size: [W - 0.08, 0.12, 0.85], pos: [0, 0.87, -nose + 0.52], role: 'body' },
    // Khoang lái: vòng kính tối + nóc.
    { shape: 'box', size: [W - 0.16, 0.44, 2.15], pos: [0, 1.04, -0.2], role: 'glass' },
    { shape: 'box', size: [W - 0.12, 0.1, 1.75], pos: [0, 1.31, -0.25], role: roofRole },
    // Trụ A / B / C (cột giữa các kính).
    { shape: 'box', size: [W - 0.13, 0.46, 0.09], pos: [0, 1.04, 0.86], role: 'body' },
    { shape: 'box', size: [W - 0.13, 0.46, 0.1], pos: [0, 1.04, -0.2], role: 'body' },
    { shape: 'box', size: [W - 0.13, 0.46, 0.09], pos: [0, 1.04, -1.26], role: 'body' },
    // Gương chiếu hậu.
    { shape: 'box', size: [0.14, 0.1, 0.08], pos: [W / 2 + 0.06, 0.95, 0.8], role: 'dark' },
    { shape: 'box', size: [0.14, 0.1, 0.08], pos: [-W / 2 - 0.06, 0.95, 0.8], role: 'dark' },
    ...lightsAndBumpers(nose, -nose, 0.7),
  ];
}

function pickup(): CarPart[] {
  const nose = CAR.length / 2;
  return [
    ...wheels(),
    { shape: 'box', size: [W, 0.24, CAR.length - 0.1], pos: [0, 0.4, 0], role: 'dark' },
    { shape: 'box', size: [W, 0.4, CAR.length - 0.1], pos: [0, 0.72, 0], role: 'body' },
    { shape: 'box', size: [W - 0.08, 0.1, 1.2], pos: [0, 0.96, nose - 0.7], role: 'body' },
    // Cabin đơn.
    { shape: 'box', size: [W - 0.16, 0.48, 1.3], pos: [0, 1.15, 0.2], role: 'glass' },
    { shape: 'box', size: [W - 0.12, 0.1, 1.2], pos: [0, 1.44, 0.15], role: 'body' },
    { shape: 'box', size: [W - 0.13, 0.5, 0.1], pos: [0, 1.15, 0.82], role: 'body' },
    { shape: 'box', size: [W - 0.13, 0.5, 0.12], pos: [0, 1.15, -0.42], role: 'body' },
    // Thùng sau: sàn + ba vách.
    { shape: 'box', size: [W - 0.14, 0.04, 1.6], pos: [0, 0.93, -1.28], role: 'dark' },
    { shape: 'box', size: [0.07, 0.3, 1.62], pos: [W / 2 - 0.035, 1.05, -1.28], role: 'body' },
    { shape: 'box', size: [0.07, 0.3, 1.62], pos: [-W / 2 + 0.035, 1.05, -1.28], role: 'body' },
    { shape: 'box', size: [W, 0.3, 0.07], pos: [0, 1.05, -nose + 0.085], role: 'body' },
    { shape: 'box', size: [0.14, 0.1, 0.08], pos: [W / 2 + 0.06, 1.05, 0.78], role: 'dark' },
    { shape: 'box', size: [0.14, 0.1, 0.08], pos: [-W / 2 - 0.06, 1.05, 0.78], role: 'dark' },
    ...lightsAndBumpers(nose, -nose, 0.78),
  ];
}

/** Các khối dựng nên một chiếc xe kiểu `kind`. */
export function carParts(kind: CarKind): CarPart[] {
  if (kind === 'pickup') return pickup();
  if (kind === 'taxi') return [...sedan('trim'), { shape: 'box', size: [0.5, 0.14, 0.2], pos: [0, 1.43, -0.1], role: 'sign' }];
  return sedan('body');
}
