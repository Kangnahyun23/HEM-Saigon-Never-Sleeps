import type { CityLayout, Hem } from './layout';

/**
 * Chi tiết hẻm (thuần logic, có unit test): miệng hẻm để gắn biển số "HẺM 84", số hẻm, vị trí cửa nhà trong hẻm.
 * Dùng chung cho shader mặt tiền (ô cửa) và phần dựng hình (bàn thờ, chậu kiểng cạnh cửa).
 */

export interface HemMouth {
  hemId: number;
  /** Điểm giữa miệng hẻm, trên đường mặt tiền nhà (m). */
  x: number;
  z: number;
  /** Hướng nhìn ra đường (yaw: (sin, cos) là hướng ra ngoài). */
  yaw: number;
  /** Trục hẻm và nửa bề rộng. */
  axis: 'x' | 'z';
  halfWidth: number;
  label: string;
}

/** Số hẻm chẵn, cố định theo hẻm chính (ví dụ 84); hẻm nhánh: "84/12". */
export function hemNumber(layout: CityLayout, hem: Hem): string {
  const main = hem.kind === 'main' ? hem : layout.hems.find((h) => h.blockId === hem.blockId && h.kind === 'main');
  const base = 2 * (12 + (((main ?? hem).id * 37) % 240));
  if (hem.kind === 'main') return `${base}`;
  const sub = 2 * (3 + ((hem.id * 13) % 40));
  return `${base}/${sub}`;
}

/** Mọi miệng hẻm thông ra đường (hẻm chính hai đầu, hẻm nhánh thông một đầu; hẻm cụt không có). */
export function hemMouths(layout: CityLayout): HemMouth[] {
  const out: HemMouth[] = [];
  for (const h of layout.hems) {
    const block = layout.blocks.find((b) => b.id === h.blockId);
    if (!block || h.deadEnd) continue;
    const label = hemNumber(layout, h);
    const halfWidth = h.width / 2;
    const cx = (h.rect.x0 + h.rect.x1) / 2;
    const cz = (h.rect.z0 + h.rect.z1) / 2;
    const ends: Array<{ at: number; out: 1 | -1 }> = [];
    if (h.axis === 'x') {
      if (Math.abs(h.rect.x0 - block.rect.x0) < 0.5) ends.push({ at: block.inner.x0, out: -1 });
      if (Math.abs(h.rect.x1 - block.rect.x1) < 0.5) ends.push({ at: block.inner.x1, out: 1 });
      for (const e of ends) out.push({ hemId: h.id, x: e.at, z: cz, yaw: (e.out * Math.PI) / 2, axis: 'x', halfWidth, label });
    } else {
      if (Math.abs(h.rect.z0 - block.rect.z0) < 0.5) ends.push({ at: block.inner.z0, out: -1 });
      if (Math.abs(h.rect.z1 - block.rect.z1) < 0.5) ends.push({ at: block.inner.z1, out: 1 });
      for (const e of ends) out.push({ hemId: h.id, x: cx, z: e.at, yaw: e.out > 0 ? 0 : Math.PI, axis: 'z', halfWidth, label });
    }
  }
  return out;
}

/** Nhà trong hẻm mở cửa bên phải (nhìn từ hẻm) hay bên trái — cố định theo seed của lô. */
export function hemDoorRight(seed: number): boolean {
  return ((Math.imul(seed | 0, 2654435761) >>> 0) & 1024) !== 0;
}

/** Ô cửa nhà trong hẻm: [mép trái, bề rộng] theo toạ độ dọc mặt tiền (m, tính từ góc nhỏ nhất của mặt). */
export function hemDoorSpan(faceW: number, right: boolean): [number, number] {
  const w = Math.min(2.4, faceW * 0.5);
  return [right ? faceW - 0.15 - w : 0.15, w];
}

/** Trụ sắt chắn ô tô ở miệng hẻm (thứ rất quen ở Sài Gòn): xe máy, người đi bộ lách qua khe; ô tô thì không. */
export const BOLLARD = {
  radius: 0.07,
  height: 0.95,
  /** Khe rộng nhất cho phép giữa hai trụ / giữa trụ và tường — phải hẹp hơn bề ngang ô tô (CAR.width = 1,8 m). */
  maxGap: 1.5,
  /** Lùi vào trong hẻm tính từ đường mặt tiền nhà (m). */
  inset: 0.6,
} as const;

export interface Bollard {
  x: number;
  z: number;
  hemId: number;
}

/**
 * Vị trí các trụ chắn: mỗi miệng hẻm một hàng trụ chia đều bề ngang, ít trụ nhất sao cho mọi khe ≤ `maxGap`
 * (hẻm chính 3,4 m: 2 trụ, khe ~1,13 m; hẻm nhánh 2,4 m: 1 trụ, khe 1,2 m).
 */
export function hemBollards(layout: CityLayout): Bollard[] {
  const out: Bollard[] = [];
  for (const m of hemMouths(layout)) {
    const width = m.halfWidth * 2;
    const n = Math.max(1, Math.ceil(width / BOLLARD.maxGap) - 1);
    const c = Math.cos(m.yaw);
    const s = Math.sin(m.yaw);
    for (let i = 0; i < n; i++) {
      // Toạ độ cục bộ của miệng hẻm: lx dọc bề ngang, lz hướng ra đường (âm = vào trong hẻm).
      const lx = -m.halfWidth + (width * (i + 1)) / (n + 1);
      const lz = -BOLLARD.inset;
      out.push({ x: m.x + lx * c + lz * s, z: m.z - lx * s + lz * c, hemId: m.hemId });
    }
  }
  return out;
}
