import * as THREE from 'three/webgpu';
import { abs, attribute, float, fract, positionWorld, select, vec3 } from 'three/tsl';
import { createRng, range } from '@/core/random';
import { centerX, centerZ, depth, overlaps, rect, width } from '@/core/rect';
import { euler, InstanceBatch } from '@/render/instancing';
import { FLOOR_HEIGHT, type Lot } from '../layout';
import { createFacadeMaterial, createPavementMaterial, createSignMaterial } from '../materials';
import { CITY_COLORS, FACADE_COLORS } from '../palette';
import { createSignAtlas, SHOP_SIGNS, SIGN_COLS, SIGN_ROWS, signOffset } from '../signs';
import { addMesh, GEO, localToWorld, yawFor, type BuildContext } from './context';

const FRONT_CODE: Record<Lot['front'], number> = { '+x': 0, '-x': 1, '+z': 2, '-z': 3 };
const KIND_CODE: Record<Lot['kind'], number> = { house: 0, shophouse: 1, tower: 2 };

/** Lan can ban công: song sắt dọc vẽ bằng shader (cắt bỏ phần trống bằng alphaTest). */
function createRailingMaterial(): THREE.MeshStandardNodeMaterial {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
  const p = attribute<'vec3'>('position', 'vec3');
  const along = positionWorld.x.add(positionWorld.z);
  const bar = fract(along.mul(7)).lessThan(0.22);
  const rail = abs(p.y).greaterThan(0.42);
  const mid = abs(p.y).lessThan(0.03);
  mat.opacityNode = select(bar.or(rail).or(mid), float(1), float(0));
  mat.alphaTest = 0.5;
  mat.colorNode = vec3(1, 1, 1);
  return mat;
}

export function buildBuildings(ctx: BuildContext): void {
  const { layout, statics, pad } = ctx;

  const facades = new InstanceBatch(GEO.box, createFacadeMaterial(), {
    name: 'facades',
    attributes: { aSize: 3, aColor: 3, aInfo: 4 },
  });

  const concrete = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  const slabs = new InstanceBatch(GEO.box, concrete, { colors: true, name: 'balcony-slabs' });
  const railings = new InstanceBatch(GEO.box, createRailingMaterial(), { colors: true, name: 'railings' });
  const painted = new THREE.MeshStandardNodeMaterial({ roughness: 0.75 });
  const awnings = new InstanceBatch(GEO.box, painted, { colors: true, name: 'awnings' });
  const plantMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true });
  const plants = new InstanceBatch(GEO.blob, plantMat, { colors: true, name: 'balcony-plants' });
  const steel = new THREE.MeshStandardNodeMaterial({ roughness: 0.28, metalness: 0.85 });
  const tanks = new InstanceBatch(GEO.cyl, steel, { colors: true, name: 'water-tanks' });
  const tanksLying = new InstanceBatch(GEO.cylX, steel, { colors: true, name: 'water-tanks-lying' });
  const plain = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  const roofStuff = new InstanceBatch(GEO.box, plain, { colors: true, name: 'roof-stuff' });
  const sheets = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.4 }), { colors: true, name: 'roof-sheets' });
  const acUnits = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.6 }), { colors: true, castShadow: false, name: 'ac-units' });
  const stools = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.5 }), { colors: true, castShadow: false, name: 'stools' });
  const atlas = createSignAtlas();
  const signs = new InstanceBatch(GEO.plane, createSignMaterial(atlas, SIGN_COLS, SIGN_ROWS), {
    name: 'shop-signs',
    castShadow: false,
    attributes: { aSign: 2 },
  });

  const color = new THREE.Color();

  for (const lot of layout.lots) {
    const r = lot.rect;
    const w = width(r);
    const d = depth(r);
    const cx = centerX(r);
    const cz = centerZ(r);
    const h = lot.height;
    color.set(FACADE_COLORS[lot.colorIndex % FACADE_COLORS.length] as string);
    // Nhà cao tầng dùng màu sáng, ít bão hoà hơn.
    if (lot.kind === 'tower') color.lerp(new THREE.Color('#d9dde2'), 0.55);

    facades.add(cx, pad + h / 2, cz, w, h, d, 0, undefined, {
      aSize: [w, h, d],
      aColor: [color.r, color.g, color.b],
      aInfo: [FRONT_CODE[lot.front], (lot.seed % 10007) / 10007, KIND_CODE[lot.kind], lot.frontage === 'hem' ? 1 : 0],
    });
    statics.box(cx, pad + h / 2, cz, w, h, d);

    // Hệ toạ độ mặt tiền: gốc ở giữa chân mặt tiền, x dọc mặt tiền, z hướng ra đường.
    const yaw = yawFor(lot.front);
    const frontAlongX = lot.front.endsWith('z');
    const faceW = frontAlongX ? w : d;
    const bodyD = frontAlongX ? d : w;
    const sign = lot.front.startsWith('+') ? 1 : -1;
    const ox = frontAlongX ? cx : sign > 0 ? r.x1 : r.x0;
    const oz = frontAlongX ? (sign > 0 ? r.z1 : r.z0) : cz;
    const place = (batch: InstanceBatch, lx: number, y: number, lz: number, sx: number, sy: number, sz: number, tilt: number, c: THREE.ColorRepresentation, extraYaw = 0): void => {
      const [wx, wz] = localToWorld(ox, oz, yaw, lx, lz);
      batch.add(wx, pad + y, wz, sx, sy, sz, tilt === 0 && extraYaw === 0 ? yaw : euler(tilt, yaw + extraYaw, 0), c);
    };

    if (lot.kind === 'tower') {
      // Phòng máy + ăng-ten trên mái cao ốc.
      place(roofStuff, 0, h + 1.6, -bodyD * 0.45, faceW * 0.45, 3.2, bodyD * 0.3, 0, '#c9cdd2');
      place(roofStuff, faceW * 0.15, h + 3.2 + 3, -bodyD * 0.45, 0.12, 6, 0.12, 0, '#9aa0a6');
      continue;
    }

    const isFrontRow = lot.row !== 'back';
    const lotRng = (salt: number): number => {
      const x = Math.sin(lot.seed * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    // ---- Ban công từng tầng -----------------------------------------------------------------------------
    const hasBalcony = lot.floors >= 2 && lotRng(1) < (isFrontRow ? 0.8 : 0.55);
    if (hasBalcony) {
      const railColor = CITY_COLORS.railing[Math.floor(lotRng(2) * CITY_COLORS.railing.length)] as string;
      const bw = Math.min(faceW * 0.86, faceW - 0.3);
      const bd = isFrontRow ? 0.95 : 0.7;
      for (let f = 1; f < lot.floors; f++) {
        const y = f * FLOOR_HEIGHT;
        place(slabs, 0, y + 0.08, bd / 2, bw, 0.16, bd, 0, '#bdb7ad');
        place(railings, 0, y + 0.16 + 0.5, bd - 0.03, bw, 1.0, 0.04, 0, railColor);
        place(railings, -bw / 2 + 0.02, y + 0.66, bd / 2, 0.04, 1.0, bd, 0, railColor);
        place(railings, bw / 2 - 0.02, y + 0.66, bd / 2, 0.04, 1.0, bd, 0, railColor);
        // Chậu cây, hoa giấy trên lan can.
        if (lotRng(10 + f) < 0.5) {
          const n = 1 + Math.floor(lotRng(20 + f) * 3);
          for (let k = 0; k < n; k++) {
            const s = 0.22 + lotRng(30 + f * 7 + k) * 0.25;
            const pc = CITY_COLORS.plant[Math.floor(lotRng(40 + f * 5 + k) * CITY_COLORS.plant.length)] as string;
            place(plants, (lotRng(50 + f * 3 + k) - 0.5) * (bw - 0.6), y + 0.16 + 0.85 + s * 0.4, bd - 0.25, s * 1.3, s, s, 0, pc);
          }
        }
      }
    }

    // ---- Mái hiên + bảng hiệu tầng trệt -----------------------------------------------------------------------
    if (lotRng(3) < (isFrontRow ? 0.55 : 0.18)) {
      const ac = CITY_COLORS.awning[Math.floor(lotRng(4) * CITY_COLORS.awning.length)] as string;
      place(awnings, 0, 2.5, 0.72, faceW * 0.92, 0.05, 1.5, 0.28, ac);
    }
    if (isFrontRow && lot.row === 'front' && lotRng(5) < 0.7) {
      const idx = Math.floor(lotRng(6) * SHOP_SIGNS.length);
      const sw = Math.min(faceW * 0.88, 4.6);
      const [wx, wz] = localToWorld(ox, oz, yaw, 0, 0.035);
      signs.add(wx, pad + 2.97, wz, sw, 0.5, 1, yaw, undefined, { aSign: signOffset(idx) });
    }

    // ---- Ghế nhựa quán cóc trên vỉa hè (một số nhà mặt tiền) ---------------------------------------------------
    if (lot.row === 'front' && lotRng(7) < 0.16) {
      const n = 3 + Math.floor(lotRng(8) * 4);
      const sc = CITY_COLORS.stool[Math.floor(lotRng(9) * CITY_COLORS.stool.length)] as string;
      for (let k = 0; k < n; k++) {
        const lx = (lotRng(60 + k) - 0.5) * (faceW - 0.8);
        const lz = 0.6 + lotRng(70 + k) * 1.2;
        place(stools, lx, 0.15, lz, 0.32, 0.3, 0.32, 0, sc);
      }
    }

    // ---- Mái: bồn nước, tum cầu thang, mái tôn, ăng-ten -------------------------------------------------------
    if (lotRng(11) < 0.68) {
      const blue = lotRng(12) < 0.25;
      const lx = (lotRng(13) - 0.5) * Math.max(0, faceW - 1.6);
      const lz = -bodyD * (0.55 + lotRng(14) * 0.3);
      place(roofStuff, lx, h + 0.3, lz, 1.2, 0.6, 1.2, 0, '#55585c');
      const [wx, wz] = localToWorld(ox, oz, yaw, lx, lz);
      if (lotRng(15) < 0.6) {
        tanks.add(wx, pad + h + 0.6 + 0.7, wz, 0.55, 1.4, 0.55, 0, blue ? CITY_COLORS.tankBlue : CITY_COLORS.tankSteel);
      } else {
        tanksLying.add(wx, pad + h + 0.6 + 0.5, wz, 1.5, 0.5, 0.5, yaw, blue ? CITY_COLORS.tankBlue : CITY_COLORS.tankSteel);
      }
    }
    if (lot.floors >= 2 && lotRng(16) < 0.45) {
      const tw = Math.min(faceW * 0.55, 3);
      const td = Math.min(3, bodyD * 0.3);
      const lx = (lotRng(17) - 0.5) * (faceW - tw);
      const lz = -bodyD * 0.3;
      place(roofStuff, lx, h + 1.3, lz, tw, 2.6, td, 0, color.clone().multiplyScalar(0.92));
      const sc = CITY_COLORS.roofSheet[Math.floor(lotRng(18) * CITY_COLORS.roofSheet.length)] as string;
      place(sheets, lx, h + 2.72, lz + 0.1, tw + 0.5, 0.05, td + 0.9, -0.12, sc);
    } else if (lotRng(19) < 0.3) {
      // Mái tôn che sân thượng (dốc nhẹ ra sau).
      const sc = CITY_COLORS.roofSheet[Math.floor(lotRng(20) * CITY_COLORS.roofSheet.length)] as string;
      const sd = bodyD * 0.4;
      place(sheets, 0, h + 1.9, -sd / 2 - 0.4, faceW - 0.3, 0.05, sd, -0.1, sc);
      place(roofStuff, -faceW / 2 + 0.2, h + 0.95, -sd / 2 - 0.4, 0.08, 1.9, 0.08, 0, '#55585c');
      place(roofStuff, faceW / 2 - 0.2, h + 0.95, -sd / 2 - 0.4, 0.08, 1.9, 0.08, 0, '#55585c');
    }
    if (lotRng(21) < 0.3) place(roofStuff, faceW * 0.3, h + 1.5, -0.6, 0.05, 3, 0.05, 0, '#8a8f94');

    // ---- Máy lạnh treo tường mặt sau / mặt tiền --------------------------------------------------------------
    for (let f = 1; f < lot.floors; f++) {
      if (lotRng(80 + f) < 0.35) {
        const back = lotRng(90 + f) < 0.6;
        const lx = (lotRng(100 + f) - 0.5) * (faceW - 1.2);
        const lz = back ? -bodyD - 0.18 : 0.18;
        const y = f * FLOOR_HEIGHT + (back ? 1.4 : 2.55);
        place(acUnits, lx, y, lz, 0.8, 0.55, 0.32, 0, '#eceae4');
      }
    }
  }

  // ---- Phông nền: thành phố kéo dài ra ngoài vùng chơi (chỉ để nhìn, không va chạm) ----------------------
  const backdropPads = new InstanceBatch(GEO.box, createPavementMaterial(CITY_COLORS.sidewalk), { castShadow: false, name: 'backdrop-pads' });
  const brng = createRng(layout.seed + 77);
  const bounds = layout.bounds;
  const core = rect(bounds.x0 - 84, bounds.z0 - 84, bounds.x1 + 84, layout.river.promenade.z0);
  const reach = 330;
  const cellX = 88;
  const cellZ = 78;
  const street = 12;
  const tmp = new THREE.Color();
  const backdropHouse = (x0: number, z0: number, x1: number, z1: number, front: Lot['front']): void => {
    const tower = brng() < 0.06;
    const floors = tower ? 10 + Math.floor(brng() * 12) : 2 + Math.floor(brng() * 6);
    const h = floors * FLOOR_HEIGHT + 0.7;
    const w = x1 - x0;
    const d = z1 - z0;
    tmp.set(FACADE_COLORS[Math.floor(brng() * FACADE_COLORS.length)] as string);
    if (tower) tmp.lerp(new THREE.Color('#d9dde2'), 0.55);
    facades.add((x0 + x1) / 2, pad + h / 2, (z0 + z1) / 2, w, h, d, 0, undefined, {
      aSize: [w, h, d],
      aColor: [tmp.r, tmp.g, tmp.b],
      aInfo: [FRONT_CODE[front], brng(), tower ? 2 : 0, 2],
    });
  };
  const backdropRow = (along: 'x' | 'z', a0: number, a1: number, c0: number, c1: number, front: Lot['front']): void => {
    for (let a = a0; a1 - a > 2; ) {
      let wdt = range(brng, 5, 10);
      if (a1 - a - wdt < 4) wdt = a1 - a;
      if (along === 'x') backdropHouse(a, c0, a + wdt, c1, front);
      else backdropHouse(c0, a, c1, a + wdt, front);
      a += wdt;
    }
  };
  for (let x = core.x0 - reach; x < core.x1 + reach; x += cellX) {
    for (let z = core.z0 - reach; z < core.z1; z += cellZ) {
      const r = rect(x + street / 2, z + street / 2, x + cellX - street / 2, z + cellZ - street / 2);
      if (overlaps(r, core) || r.z1 > layout.river.promenade.z0 - 2) continue;
      backdropPads.add(centerX(r), pad / 2, centerZ(r), width(r), pad, depth(r));
      const rd = 14;
      backdropRow('x', r.x0, r.x1, r.z0, r.z0 + rd, '-z');
      backdropRow('x', r.x0, r.x1, r.z1 - rd, r.z1, '+z');
      backdropRow('z', r.z0 + rd, r.z1 - rd, r.x0, r.x0 + rd, '-x');
      backdropRow('z', r.z0 + rd, r.z1 - rd, r.x1 - rd, r.x1, '+x');
    }
  }
  addMesh(ctx, backdropPads.build());

  for (const b of [facades, slabs, railings, awnings, plants, tanks, tanksLying, roofStuff, sheets, acUnits, stools, signs]) addMesh(ctx, b.build());
}
