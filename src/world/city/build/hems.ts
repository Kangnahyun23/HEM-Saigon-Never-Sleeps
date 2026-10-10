import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { range } from '@/core/random';
import { InstanceBatch } from '@/render/instancing';
import { signFont } from '@/ui/fonts';
import { nightUniform } from '../../nightGlow';
import { hemDoorRight, hemDoorSpan, hemMouths } from '../hemDetails';
import type { Lot } from '../layout';
import { createSignMaterial } from '../materials';
import { CITY_COLORS } from '../palette';
import { addMesh, GEO, localToWorld, yawFor, type BuildContext } from './context';

/** Atlas biển số hẻm 1024²: 8 × 16 ô 128 × 64 px — biển xanh chữ trắng "HẺM 84/12", dòng nhỏ "KHU PHỐ 3". */
const PLATE_COLS = 8;
const PLATE_ROWS = 16;
const PLATE_W = 128;
const PLATE_H = 64;

function createPlateAtlas(labels: readonly string[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PLATE_COLS * PLATE_W;
  canvas.height = PLATE_ROWS * PLATE_H;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  labels.forEach((label, i) => {
    const x = (i % PLATE_COLS) * PLATE_W;
    const y = Math.floor(i / PLATE_COLS) * PLATE_H;
    g.fillStyle = '#1d4f9c';
    g.fillRect(x, y, PLATE_W, PLATE_H);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeRect(x + 5, y + 5, PLATE_W - 10, PLATE_H - 10);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    let size = 26;
    const text = `HẺM ${label}`;
    do {
      g.font = signFont('narrow', size--);
    } while (g.measureText(text).width > PLATE_W - 20 && size > 10);
    g.fillText(text, x + PLATE_W / 2, y + 36);
    g.font = signFont('narrow', 13);
    g.fillText(`KHU PHỐ ${1 + (i % 7)}`, x + PLATE_W / 2, y + 53);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Điểm gốc mặt tiền (giữa chân mặt tiền) của một lô + yaw (trục +Z cục bộ trỏ ra ngoài). */
function facadeOrigin(lot: Lot): { ox: number; oz: number; yaw: number; faceW: number } {
  const r = lot.rect;
  const yaw = yawFor(lot.front);
  const alongX = lot.front.endsWith('z');
  const s = lot.front.startsWith('+') ? 1 : -1;
  return {
    ox: alongX ? (r.x0 + r.x1) / 2 : s > 0 ? r.x1 : r.x0,
    oz: alongX ? (s > 0 ? r.z1 : r.z0) : (r.z0 + r.z1) / 2,
    yaw,
    faceW: alongX ? r.x1 - r.x0 : r.z1 - r.z0,
  };
}

/**
 * Toạ độ dọc mặt tiền trong shader (u, tính từ góc nhỏ nhất) → toạ độ cục bộ lx của hệ localToWorld
 * (mặt +z / −x: lx = u − W/2; mặt −z / +x: lx = W/2 − u).
 */
function uToLocal(lot: Lot, u: number, faceW: number): number {
  return lot.front === '+z' || lot.front === '-x' ? u - faceW / 2 : faceW / 2 - u;
}

/**
 * Đời sống trong hẻm: biển số hẻm ở miệng hẻm, cụm đồng hồ điện, mái bạt giăng ngang hẻm chính,
 * bàn thờ thiên đỏ (ban đêm có đèn) và chậu kiểng cạnh cửa từng nhà.
 */
export function buildHemLife(ctx: BuildContext): void {
  const { layout, rng, pad } = ctx;
  const mouths = hemMouths(layout);
  const labels = [...new Set(mouths.map((m) => m.label))].slice(0, PLATE_COLS * PLATE_ROWS);
  const atlas = createPlateAtlas(labels);
  const plates = new InstanceBatch(GEO.plane, createSignMaterial(atlas), { castShadow: false, name: 'hem-plates', attributes: { aSign: 4, aGlow: 1 } });
  const meters = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.6 }), { colors: true, castShadow: false, name: 'hem-meters' });
  const tarps = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.8, side: THREE.DoubleSide }), { colors: true, name: 'hem-tarps' });
  const altarMat = new THREE.MeshStandardNodeMaterial({ color: '#b3120f', roughness: 0.5 });
  // Bàn thờ thiên: đèn đỏ ban đêm.
  altarMat.emissiveNode = vec3(1, 0.16, 0.1).mul(nightUniform.mul(0.9));
  const altars = new InstanceBatch(GEO.box, altarMat, { castShadow: false, name: 'hem-altars' });
  const pots = new InstanceBatch(GEO.cylBase, new THREE.MeshStandardNodeMaterial({ color: '#a4532e', roughness: 0.9 }), { castShadow: false, name: 'hem-pots' });
  const leaves = new InstanceBatch(GEO.blob, new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true }), { colors: true, castShadow: false, name: 'hem-plants' });

  // ---- Miệng hẻm: biển số trên tường nhà góc, cụm đồng hồ điện trên tường hông trong hẻm ----------------------
  for (const m of mouths) {
    const idx = Math.max(0, labels.indexOf(m.label));
    const u0 = (idx % PLATE_COLS) / PLATE_COLS;
    const v0 = 1 - (Math.floor(idx / PLATE_COLS) + 1) / PLATE_ROWS;
    const cell = { aSign: [u0 + 2 / 1024, v0 + 2 / 1024, 1 / PLATE_COLS - 4 / 1024, 1 / PLATE_ROWS - 4 / 1024], aGlow: 0.18 };
    // Biển trên mặt tiền nhà góc, sát mép hẻm, nhìn ra đường.
    const [px, pz] = localToWorld(m.x, m.z, m.yaw, -(m.halfWidth + 0.45), 0.03);
    plates.add(px, pad + 2.7, pz, 0.62, 0.31, 1, m.yaw, undefined, cell);
    // Đồng hồ điện: lưới 3 × 2 hộp trên tường hông nhà góc, cách miệng hẻm ~1,3 m, nhìn vào hẻm.
    const inYaw = m.yaw - Math.PI / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        const [bx, bz] = localToWorld(m.x, m.z, m.yaw, -m.halfWidth + 0.07, -1.0 - c * 0.28);
        meters.add(bx, pad + 1.9 + r * 0.34, bz, 0.22, 0.3, 0.12, inYaw, '#9aa1a6');
      }
    }
  }

  // ---- Mái bạt giăng ngang hẻm chính (che nắng mưa cho quán trong hẻm) ------------------------------------------
  for (const h of layout.hems) {
    if (h.kind !== 'main') continue;
    const len = h.axis === 'x' ? h.rect.x1 - h.rect.x0 : h.rect.z1 - h.rect.z0;
    for (let a = 10; a < len - 10; a += 9) {
      if (rng() > 0.3) continue;
      const along = (h.axis === 'x' ? h.rect.x0 : h.rect.z0) + a;
      const cross = h.axis === 'x' ? (h.rect.z0 + h.rect.z1) / 2 : (h.rect.x0 + h.rect.x1) / 2;
      const l = range(rng, 2, 3.4);
      const color = CITY_COLORS.awning[Math.floor(rng() * CITY_COLORS.awning.length)] as string;
      const [x, z] = h.axis === 'x' ? [along, cross] : [cross, along];
      const sx = h.axis === 'x' ? l : h.width + 0.2;
      const sz = h.axis === 'x' ? h.width + 0.2 : l;
      tarps.add(x, pad + range(rng, 3.0, 3.4), z, sx, 0.03, sz, 0, color);
    }
  }

  // ---- Nhà trong hẻm: bàn thờ thiên cạnh cửa, chậu kiểng dưới chân tường -------------------------------------
  for (const lot of layout.lots) {
    if (lot.frontage !== 'hem' || lot.kind === 'tower') continue;
    const { ox, oz, yaw, faceW } = facadeOrigin(lot);
    const right = hemDoorRight(lot.seed);
    const [doorA, doorW] = hemDoorSpan(faceW, right);
    // Bàn thờ thiên phía ngoài cửa (bên không có cửa sổ), cao ~1,7 m.
    const altarU = right ? doorA - 0.3 : doorA + doorW + 0.3;
    if (altarU > 0.2 && altarU < faceW - 0.2 && rng() < 0.55) {
      const [ax, az] = localToWorld(ox, oz, yaw, uToLocal(lot, altarU, faceW), 0.14);
      altars.add(ax, pad + 1.72, az, 0.34, 0.26, 0.26, yaw);
    }
    // 1–3 chậu kiểng sát tường, phía cửa sổ.
    const nPots = rng() < 0.65 ? 1 + Math.floor(rng() * 3) : 0;
    for (let k = 0; k < nPots; k++) {
      const u = right ? range(rng, 0.3, Math.max(0.35, doorA - 0.2)) : range(rng, Math.min(faceW - 0.35, doorA + doorW + 0.2), faceW - 0.3);
      const [px, pz] = localToWorld(ox, oz, yaw, uToLocal(lot, u, faceW), 0.28);
      const s = range(rng, 0.16, 0.24);
      pots.add(px, pad, pz, s, s * 1.6, s);
      leaves.add(px, pad + s * 1.6 + s * 0.9, pz, s * 1.7, s * 1.5, s * 1.7, rng() * 6, CITY_COLORS.plant[Math.floor(rng() * CITY_COLORS.plant.length)] as string);
    }
  }

  for (const b of [plates, meters, tarps, altars, pots, leaves]) addMesh(ctx, b.build());
}
