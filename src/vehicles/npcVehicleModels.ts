import { createRng, pick } from '@/core/random';
import { CAR_BODY_COLORS, CAR_ROLE_COLORS, carParts, TAXI_COLORS, type CarKind } from './carModel';

/**
 * Mẫu xe NPC ngoài xe máy (hư cấu, tự dựng từ hộp và trụ): ô tô (lấy lại carModel), xe buýt, ba gác máy, xích lô,
 * xe đẩy bán hàng rong. Thuần dữ liệu — lớp hình (ai/trafficFleetView.ts) gom mọi khối vào vài InstancedMesh.
 * Toạ độ cục bộ: đầu xe hướng +Z, Y hướng lên, gốc ở mặt đất giữa xe; bên trái của xe là +X. Đơn vị mét.
 */

export type NpcVehicleKind = CarKind | 'bus' | 'baGac' | 'xichLo' | 'cart';

/** Màu lấy theo "diện mạo" từng xe (lớp hình chọn có seed): sơn thân, màu phụ, áo quần người lái, hàng chở, khách. */
export type NpcLook = 'body' | 'trim' | 'shirt' | 'pants' | 'skin' | 'hat' | 'cargo' | 'guest';

export interface NpcPart {
  shape: 'box' | 'cyl';
  /** box: [sx, sy, sz]; cyl: [bán kính, chiều dài, 0] — trụ nằm theo trục X (như bánh xe). */
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  /** Góc nghiêng quanh trục X (rad), dương = đỉnh ngả về trước. */
  tilt?: number;
  /** Màu cố định (#rrggbb) hoặc vai trò lấy theo diện mạo. */
  color: string;
  /** Đèn pha / đèn hậu / hộp đèn: tự phát sáng, rực hơn khi tối. */
  lamp?: boolean;
  /** Chỉ có ở một số xe (hàng trên thùng ba gác, khách ngồi xích lô). */
  optional?: boolean;
  /** Chân người đi bộ đẩy xe: đung đưa quanh hông theo nhịp bước (+1 / −1 = hai chân ngược pha). */
  swing?: 1 | -1;
}

/** Độ cao hông của người đẩy xe (tâm quay của chân). */
export const WALKER_HIP = 0.82;

const TIRE = '#141414';
const RIM = '#b9bcc0';
const DARK = '#23262a';
const METAL = '#9aa0a6';
const GLASS = CAR_ROLE_COLORS.glass;
const HEADLIGHT = CAR_ROLE_COLORS.light;
const TAILLIGHT = CAR_ROLE_COLORS.tail;
const SHOE = '#24211e';

function wheel(x: number, z: number, radius: number, width: number): NpcPart[] {
  return [
    { shape: 'cyl', size: [radius, width, 0], pos: [x, radius, z], color: TIRE },
    { shape: 'cyl', size: [radius * 0.6, width + 0.015, 0], pos: [x, radius, z], color: RIM },
  ];
}

function car(kind: CarKind): NpcPart[] {
  return carParts(kind).map((p) => ({
    shape: p.shape,
    size: p.size,
    pos: p.pos,
    color: p.role === 'body' || p.role === 'trim' ? p.role : CAR_ROLE_COLORS[p.role],
    ...(p.role === 'light' || p.role === 'tail' || p.role === 'sign' ? { lamp: true } : {}),
  }));
}

/** Xe buýt nội thành: thân sơn màu, băng kính tối chạy suốt, nóc trắng có cục máy lạnh, hai cửa bên phải. */
function bus(): NpcPart[] {
  const W = 2.4;
  const L = 8.4;
  const nose = L / 2;
  const parts: NpcPart[] = [
    ...wheel(1.05, 2.6, 0.46, 0.3),
    ...wheel(-1.05, 2.6, 0.46, 0.3),
    ...wheel(1.05, -2.3, 0.46, 0.3),
    ...wheel(-1.05, -2.3, 0.46, 0.3),
    { shape: 'box', size: [W, 0.95, L], pos: [0, 0.82, 0], color: 'body' },
    { shape: 'box', size: [W + 0.02, 0.13, L + 0.02], pos: [0, 1.2, 0], color: 'trim' },
    { shape: 'box', size: [W - 0.06, 0.9, L - 0.1], pos: [0, 1.74, 0], color: GLASS },
    { shape: 'box', size: [W, 0.46, L], pos: [0, 2.42, 0], color: 'trim' },
    { shape: 'box', size: [1.4, 0.22, 2.2], pos: [0, 2.76, -0.6], color: '#d6d9d6' },
    // Bảng tuyến phía trước, cản, đèn.
    { shape: 'box', size: [1.3, 0.2, 0.06], pos: [0, 2.3, nose + 0.01], color: CAR_ROLE_COLORS.sign, lamp: true },
    { shape: 'box', size: [W, 0.26, 0.14], pos: [0, 0.46, nose - 0.02], color: DARK },
    { shape: 'box', size: [W, 0.26, 0.14], pos: [0, 0.46, -nose + 0.02], color: DARK },
    { shape: 'box', size: [0.4, 0.18, 0.06], pos: [0.85, 0.82, nose + 0.01], color: HEADLIGHT, lamp: true },
    { shape: 'box', size: [0.4, 0.18, 0.06], pos: [-0.85, 0.82, nose + 0.01], color: HEADLIGHT, lamp: true },
    { shape: 'box', size: [0.3, 0.3, 0.06], pos: [0.95, 1.0, -nose - 0.01], color: TAILLIGHT, lamp: true },
    { shape: 'box', size: [0.3, 0.3, 0.06], pos: [-0.95, 1.0, -nose - 0.01], color: TAILLIGHT, lamp: true },
    // Hai cửa lên xuống bên phải (phía lề).
    { shape: 'box', size: [0.05, 1.75, 0.95], pos: [-W / 2, 1.22, 3.1], color: DARK },
    { shape: 'box', size: [0.05, 1.75, 1.1], pos: [-W / 2, 1.22, -0.4], color: DARK },
    // Gương hai bên.
    { shape: 'box', size: [0.16, 0.3, 0.1], pos: [W / 2 + 0.12, 1.9, nose - 0.25], color: DARK },
    { shape: 'box', size: [0.16, 0.3, 0.1], pos: [-W / 2 - 0.12, 1.9, nose - 0.25], color: DARK },
  ];
  // Cột giữa các ô kính.
  for (let z = -nose + 0.05; z <= nose; z += 1.38) parts.push({ shape: 'box', size: [W, 0.92, 0.12], pos: [0, 1.74, Math.min(z, nose - 0.06)], color: 'body' });
  return parts;
}

/** Người ngồi lái (mông ở `seatY`, `z`): quần, chân, áo, tay vươn tới tay lái, đầu + mũ; `feet` = có vẽ bàn chân đặt trên gác chân. */
function seatedRider(seatY: number, z: number, feet = true): NpcPart[] {
  const shoes: NpcPart[] = [
    { shape: 'box', size: [0.11, 0.08, 0.24], pos: [0.17, seatY - 0.44, z + 0.47], color: SHOE },
    { shape: 'box', size: [0.11, 0.08, 0.24], pos: [-0.17, seatY - 0.44, z + 0.47], color: SHOE },
  ];
  return [
    ...(feet ? shoes : []),
    { shape: 'box', size: [0.34, 0.18, 0.3], pos: [0, seatY + 0.09, z], color: 'pants' },
    { shape: 'box', size: [0.14, 0.14, 0.46], pos: [0.12, seatY + 0.1, z + 0.24], tilt: 0.15, color: 'pants' },
    { shape: 'box', size: [0.14, 0.14, 0.46], pos: [-0.12, seatY + 0.1, z + 0.24], tilt: 0.15, color: 'pants' },
    { shape: 'box', size: [0.12, 0.46, 0.13], pos: [0.16, seatY - 0.18, z + 0.46], tilt: 0.15, color: 'pants' },
    { shape: 'box', size: [0.12, 0.46, 0.13], pos: [-0.16, seatY - 0.18, z + 0.46], tilt: 0.15, color: 'pants' },
    { shape: 'box', size: [0.38, 0.55, 0.24], pos: [0, seatY + 0.45, z + 0.06], tilt: 0.18, color: 'shirt' },
    { shape: 'box', size: [0.09, 0.09, 0.56], pos: [0.24, seatY + 0.42, z + 0.38], tilt: 0.55, color: 'shirt' },
    { shape: 'box', size: [0.09, 0.09, 0.56], pos: [-0.24, seatY + 0.42, z + 0.38], tilt: 0.55, color: 'shirt' },
    { shape: 'box', size: [0.21, 0.23, 0.22], pos: [0, seatY + 0.84, z + 0.15], color: 'skin' },
    { shape: 'box', size: [0.27, 0.17, 0.3], pos: [0, seatY + 0.93, z + 0.14], color: 'hat' },
  ];
}

/** Ba gác máy: đầu xe máy phía trước, thùng hàng hai bánh phía sau. */
function baGac(): NpcPart[] {
  return [
    // Đầu xe: bánh trước, phuộc, thân máy, yên, tay lái, đèn.
    ...wheel(0, 1.25, 0.29, 0.1),
    { shape: 'box', size: [0.08, 0.7, 0.08], pos: [0, 0.62, 1.12], tilt: -0.38, color: METAL },
    { shape: 'box', size: [0.3, 0.46, 1.0], pos: [0, 0.62, 0.62], color: 'body' },
    { shape: 'box', size: [0.34, 0.1, 0.62], pos: [0, 0.88, 0.32], color: DARK },
    { shape: 'box', size: [0.62, 0.05, 0.05], pos: [0, 1.08, 0.95], color: DARK },
    { shape: 'box', size: [0.2, 0.16, 0.08], pos: [0, 0.98, 1.08], color: HEADLIGHT, lamp: true },
    // Thùng: sàn, bốn vách thấp, khung gầm, hai bánh sau.
    ...wheel(0.62, -0.85, 0.29, 0.11),
    ...wheel(-0.62, -0.85, 0.29, 0.11),
    { shape: 'box', size: [1.1, 0.08, 0.08], pos: [0, 0.29, -0.85], color: METAL },
    { shape: 'box', size: [1.3, 0.07, 1.7], pos: [0, 0.6, -0.72], color: 'body' },
    { shape: 'box', size: [0.05, 0.3, 1.7], pos: [0.625, 0.78, -0.72], color: 'body' },
    { shape: 'box', size: [0.05, 0.3, 1.7], pos: [-0.625, 0.78, -0.72], color: 'body' },
    { shape: 'box', size: [1.3, 0.46, 0.05], pos: [0, 0.86, 0.11], color: 'body' },
    { shape: 'box', size: [1.3, 0.3, 0.05], pos: [0, 0.78, -1.55], color: 'body' },
    { shape: 'box', size: [0.16, 0.1, 0.04], pos: [0.5, 0.6, -1.59], color: TAILLIGHT, lamp: true },
    { shape: 'box', size: [0.16, 0.1, 0.04], pos: [-0.5, 0.6, -1.59], color: TAILLIGHT, lamp: true },
    // Hàng chở (không phải xe nào cũng có).
    { shape: 'box', size: [1.0, 0.55, 0.8], pos: [0, 0.91, -0.45], color: 'cargo', optional: true },
    { shape: 'box', size: [0.7, 0.4, 0.55], pos: [-0.1, 0.84, -1.18], color: 'cargo', optional: true },
    { shape: 'box', size: [0.6, 0.3, 0.5], pos: [0.12, 1.33, -0.5], color: 'guest', optional: true },
    ...seatedRider(0.9, 0.3),
  ];
}

/** Xích lô: ghế khách phía trước giữa hai bánh, mui che, người đạp ngồi cao phía sau. */
function xichLo(): NpcPart[] {
  return [
    ...wheel(0.52, 0.6, 0.34, 0.05),
    ...wheel(-0.52, 0.6, 0.34, 0.05),
    ...wheel(0, -0.92, 0.34, 0.05),
    // Ghế khách: đệm, lưng tựa, hai tay vịn, chỗ để chân.
    { shape: 'box', size: [0.82, 0.14, 0.62], pos: [0, 0.52, 0.62], color: 'body' },
    { shape: 'box', size: [0.82, 0.56, 0.1], pos: [0, 0.84, 0.28], tilt: -0.16, color: 'body' },
    { shape: 'box', size: [0.06, 0.24, 0.62], pos: [0.44, 0.68, 0.62], color: METAL },
    { shape: 'box', size: [0.06, 0.24, 0.62], pos: [-0.44, 0.68, 0.62], color: METAL },
    { shape: 'box', size: [0.74, 0.05, 0.4], pos: [0, 0.3, 1.08], color: METAL },
    // Mui che nắng trên bốn cọc mảnh.
    { shape: 'box', size: [0.94, 0.05, 0.84], pos: [0, 1.6, 0.52], color: 'trim' },
    { shape: 'box', size: [0.03, 1.0, 0.03], pos: [0.44, 1.1, 0.2], color: METAL },
    { shape: 'box', size: [0.03, 1.0, 0.03], pos: [-0.44, 1.1, 0.2], color: METAL },
    { shape: 'box', size: [0.03, 0.86, 0.03], pos: [0.44, 1.16, 0.9], tilt: 0.2, color: METAL },
    { shape: 'box', size: [0.03, 0.86, 0.03], pos: [-0.44, 1.16, 0.9], tilt: 0.2, color: METAL },
    // Khung sườn nối ra bánh sau, cọc yên, yên, tay lái (ngay sau lưng ghế khách).
    { shape: 'box', size: [0.07, 0.07, 1.3], pos: [0, 0.6, -0.35], tilt: -0.12, color: METAL },
    { shape: 'box', size: [0.06, 0.6, 0.06], pos: [0, 0.82, -0.62], color: METAL },
    { shape: 'box', size: [0.26, 0.08, 0.3], pos: [0, 1.14, -0.62], color: DARK },
    { shape: 'box', size: [0.7, 0.04, 0.04], pos: [0, 1.22, 0.1], color: DARK },
    // Khách ngồi (có xe có, xe không).
    { shape: 'box', size: [0.36, 0.16, 0.42], pos: [0, 0.67, 0.66], color: 'pants', optional: true },
    { shape: 'box', size: [0.32, 0.38, 0.13], pos: [0, 0.46, 0.92], color: 'pants', optional: true },
    { shape: 'box', size: [0.38, 0.5, 0.22], pos: [0, 0.98, 0.42], tilt: -0.12, color: 'guest', optional: true },
    { shape: 'box', size: [0.2, 0.22, 0.2], pos: [0, 1.36, 0.4], color: 'skin', optional: true },
    // Người đạp: ngồi cao, hơi chồm tới; hai bàn chân trên bàn đạp (một cao một thấp).
    ...seatedRider(1.16, -0.64, false),
    { shape: 'box', size: [0.11, 0.08, 0.24], pos: [0.17, 0.62, -0.2], color: SHOE },
    { shape: 'box', size: [0.11, 0.08, 0.24], pos: [-0.17, 0.82, -0.14], color: SHOE },
  ];
}

/** Xe đẩy bán hàng rong: thùng xe có tủ kính, mái che, người bán đội nón lá đi bộ đẩy phía sau. */
function cart(): NpcPart[] {
  const cz = 0.45;
  const wz = -0.72;
  return [
    ...wheel(0.44, cz + 0.1, 0.3, 0.05),
    ...wheel(-0.44, cz + 0.1, 0.3, 0.05),
    { shape: 'box', size: [0.06, 0.5, 0.06], pos: [0, 0.25, cz - 0.5], color: METAL },
    { shape: 'box', size: [0.8, 0.5, 1.15], pos: [0, 0.76, cz], color: 'body' },
    { shape: 'box', size: [0.86, 0.04, 1.21], pos: [0, 1.03, cz], color: METAL },
    { shape: 'box', size: [0.7, 0.42, 0.62], pos: [0, 1.26, cz + 0.2], color: '#a9c6cc' },
    { shape: 'box', size: [0.5, 0.2, 0.34], pos: [0, 1.15, cz - 0.36], color: 'cargo' },
    // Mái che + bốn cọc + bóng đèn dưới mái.
    { shape: 'box', size: [0.96, 0.05, 1.32], pos: [0, 1.88, cz], color: 'trim' },
    { shape: 'box', size: [0.03, 0.84, 0.03], pos: [0.4, 1.45, cz + 0.55], color: METAL },
    { shape: 'box', size: [0.03, 0.84, 0.03], pos: [-0.4, 1.45, cz + 0.55], color: METAL },
    { shape: 'box', size: [0.03, 0.84, 0.03], pos: [0.4, 1.45, cz - 0.55], color: METAL },
    { shape: 'box', size: [0.03, 0.84, 0.03], pos: [-0.4, 1.45, cz - 0.55], color: METAL },
    { shape: 'box', size: [0.09, 0.09, 0.09], pos: [0, 1.78, cz], color: '#fff2c0', lamp: true },
    // Tay đẩy.
    { shape: 'box', size: [0.7, 0.04, 0.04], pos: [0, 1.02, cz - 0.72], color: DARK },
    { shape: 'box', size: [0.04, 0.04, 0.2], pos: [0.3, 1.02, cz - 0.64], color: DARK },
    { shape: 'box', size: [0.04, 0.04, 0.2], pos: [-0.3, 1.02, cz - 0.64], color: DARK },
    // Người bán: hai chân bước, thân, tay vươn tới tay đẩy, đầu, nón lá.
    { shape: 'box', size: [0.13, WALKER_HIP, 0.15], pos: [0.1, WALKER_HIP / 2, wz], color: 'pants', swing: 1 },
    { shape: 'box', size: [0.13, WALKER_HIP, 0.15], pos: [-0.1, WALKER_HIP / 2, wz], color: 'pants', swing: -1 },
    { shape: 'box', size: [0.36, 0.56, 0.2], pos: [0, 1.1, wz + 0.02], tilt: 0.1, color: 'shirt' },
    { shape: 'box', size: [0.08, 0.08, 0.46], pos: [0.22, 1.14, wz + 0.25], tilt: 0.25, color: 'shirt' },
    { shape: 'box', size: [0.08, 0.08, 0.46], pos: [-0.22, 1.14, wz + 0.25], tilt: 0.25, color: 'shirt' },
    { shape: 'box', size: [0.2, 0.22, 0.2], pos: [0, 1.5, wz + 0.05], color: 'skin' },
    { shape: 'box', size: [0.52, 0.07, 0.52], pos: [0, 1.64, wz + 0.05], color: 'hat' },
    { shape: 'box', size: [0.26, 0.08, 0.26], pos: [0, 1.71, wz + 0.05], color: 'hat' },
  ];
}

/** Các khối dựng nên một chiếc xe NPC kiểu `kind`. */
export function npcVehicleParts(kind: NpcVehicleKind): NpcPart[] {
  switch (kind) {
    case 'bus':
      return bus();
    case 'baGac':
      return baGac();
    case 'xichLo':
      return xichLo();
    case 'cart':
      return cart();
    default:
      return car(kind);
  }
}

/** Bảng màu cho từng loại (lớp hình chọn có seed). */
/**
 * Màu sơn (thân, phụ) của một ô tô NPC theo số thứ tự + lượt thả. Lớp hình và game cùng gọi hàm này: xe bị cướp
 * (thành ô tô lái được) phải giữ đúng màu chiếc NPC vừa đứng đó.
 */
export function npcCarPaint(kind: CarKind, id: number, generation: number): { body: string; trim: string } {
  if (kind === 'taxi') return TAXI_COLORS;
  const body = pick(createRng(id * 7919 + generation * 104729 + 29), CAR_BODY_COLORS);
  return { body, trim: body };
}

export const NPC_PAINT: Record<'bus' | 'baGac' | 'xichLo' | 'cart', { body: readonly string[]; trim: readonly string[] }> = {
  bus: { body: ['#2f9c95', '#3a6fb5', '#d9862b'], trim: ['#f2f2ec'] },
  baGac: { body: ['#2f5f9e', '#a03a2e', '#3d7a4a', '#7d848c'], trim: ['#7d848c'] },
  xichLo: { body: ['#b3242b', '#1f6f8a', '#2e7d4f'], trim: ['#e9dfc6', '#c9302c', '#2f5f9e'] },
  cart: { body: ['#2f6fb5', '#c8402e', '#d9d4c5', '#3b8a52'], trim: ['#d83a3a', '#2f8f4e', '#e8b23a', '#3a78c2'] },
};
