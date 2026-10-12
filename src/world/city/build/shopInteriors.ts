import * as THREE from 'three/webgpu';
import { float, floor, mix, mod, positionWorld, select, vec3 } from 'three/tsl';
import { createRng, type Rng } from '@/core/random';
import { GROUP } from '@/physics/groups';
import { InstanceBatch } from '@/render/instancing';
import { nightUniform } from '../../nightGlow';
import { SHOP_TYPES, type ShopKind } from '../shops';
import { addMesh, GEO, localToWorld, type BuildContext } from './context';

/** Ánh đèn tuýp trong tiệm lúc tối: cộng nhẹ vào mọi bề mặt trong phòng (khỏi thêm đèn thật — đèn thật tốn cả cảnh). */
const nightFill = (strength: number) => vec3(0.95, 0.96, 0.9).mul(nightUniform.mul(strength));

function interiorMaterial(roughness: number): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness });
  m.emissiveNode = nightFill(0.07);
  return m;
}

/** Sàn gạch men caro 50 cm (kem / xám) theo toạ độ thế giới. */
function tileMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.35 });
  const q = mod(floor(positionWorld.x.mul(2)).add(floor(positionWorld.z.mul(2))), float(2));
  m.colorNode = select(q.lessThan(0.5), vec3(0.86, 0.83, 0.76), vec3(0.62, 0.6, 0.57));
  m.emissiveNode = nightFill(0.06);
  return m;
}

/** Hàng hoá đủ màu trên kệ. */
const GOODS = ['#d8342c', '#f0b429', '#2f8f4e', '#2b6cb0', '#f2f2f2', '#e86a1c', '#7b3fa0', '#1f9bb0'];
const PILLS = ['#f2f2f2', '#e3f1e6', '#d7e8f5', '#2f8f4e', '#f6e7c8'];
const GADGETS = ['#1d1f24', '#3a3d44', '#6b6f78', '#c9ccd2', '#8a6a3a'];
const CLOTHES = ['#d8342c', '#2b6cb0', '#f0b429', '#1d1f24', '#f2f2f2', '#b0306f', '#2f8f4e', '#e8c4a8'];

/**
 * Nội thất cửa hàng vào được: mỗi tiệm một phòng thật ở tầng trệt (khối nhà phía trên / phía sau dựng ở buildings.ts).
 * Gộp theo vật liệu ⇒ vài lệnh vẽ cho mọi tiệm. Tường, quầy, kệ lớn có va chạm; chủ tiệm đứng sau quầy (người bán
 * vẽ bằng SeatedPeopleView như người bán xe đẩy).
 */
export function buildShopInteriors(ctx: BuildContext): void {
  if (ctx.shops.length === 0) return;
  const { statics, pad } = ctx;
  const floors = new InstanceBatch(GEO.box, tileMaterial(), { castShadow: false, name: 'interior-floors' });
  const walls = new InstanceBatch(GEO.box, interiorMaterial(0.85), { colors: true, name: 'interior-walls' });
  // Trần nhìn từ dưới lên không nhận nắng / ánh trời ⇒ tự sáng nhẹ như được đèn tuýp hắt lên.
  const ceilingMat = new THREE.MeshStandardNodeMaterial({ color: '#f4f2ec', roughness: 0.9 });
  ceilingMat.emissiveNode = vec3(0.3, 0.3, 0.28).add(nightFill(0.12));
  const ceilings = new InstanceBatch(GEO.box, ceilingMat, { castShadow: false, name: 'interior-ceilings' });
  const props = new InstanceBatch(GEO.box, interiorMaterial(0.6), { colors: true, name: 'shop-props' });
  const tubeMat = new THREE.MeshBasicNodeMaterial();
  tubeMat.colorNode = vec3(1, 1, 0.94).mul(mix(float(1.3), float(4), nightUniform));
  const tubes = new InstanceBatch(GEO.box, tubeMat, { colors: true, castShadow: false, receiveShadow: false, name: 'interior-tubes' });

  for (const shop of ctx.shops) {
    const t = SHOP_TYPES[shop.kind];
    const rng = createRng(shop.lotId * 131 + 7);
    const { width: w, depth: D, height: H, yaw } = shop;
    const W = w - 0.24; // bề ngang trong lòng phòng
    /** Đặt một khối theo toạ độ phòng (x dọc mặt tiền, z ra đường, y từ sàn). */
    const box = (batch: InstanceBatch, lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c?: THREE.ColorRepresentation, solid = false): void => {
      const [wx, wz] = localToWorld(shop.ox, shop.oz, yaw, lx, lz);
      batch.add(wx, pad + y, wz, sx, sy, sz, yaw, c);
      if (solid) statics.box(wx, pad + y, wz, sx, sy, sz, yaw, GROUP.PROP);
    };

    // Vỏ phòng: sàn, hai tường bên, tường sau, trần; dầm + hộp cửa cuốn trên cửa.
    box(floors, 0, 0.012, -D / 2, w, 0.024, D);
    for (const side of [-1, 1]) box(walls, side * (w / 2 - 0.06), H / 2, -D / 2, 0.12, H, D, t.wall, true);
    box(walls, 0, H / 2, -D + 0.03, w, H, 0.06, t.wall);
    box(ceilings, 0, H - 0.04, -D / 2, w, 0.08, D);
    box(walls, 0, H - 0.225, -0.12, w, 0.45, 0.24, '#8f8a82');
    box(props, 0, H - 0.56, -0.16, W, 0.22, 0.22, '#9aa0a6');
    // Chân tường ốp gạch (vạch tối dưới chân).
    for (const side of [-1, 1]) box(walls, side * (w / 2 - 0.125), 0.08, -D / 2, 0.01, 0.16, D, '#6d665c');
    // Đèn tuýp trên trần.
    for (const f of [0.32, 0.7]) box(tubes, 0, H - 0.11, -D * f, Math.min(1.2, W * 0.5), 0.04, 0.06, '#ffffff');

    // Quầy sát tường phải, chủ tiệm đứng giữa quầy và tường, nhìn vào lòng tiệm.
    const counterX = W / 2 - 1.0;
    const counterZ = -D * 0.42;
    const counterLen = Math.min(1.9, D * 0.4);
    box(props, counterX, 0.48, counterZ, 0.7, 0.96, counterLen, shade(t.color, 0.75), true);
    box(props, counterX, 0.98, counterZ, 0.8, 0.04, counterLen + 0.08, '#d9d2c4');
    const [kx, kz] = localToWorld(shop.ox, shop.oz, yaw, W / 2 - 0.33, counterZ);
    // Hướng −x của phòng trong hệ thế giới = −(cos yaw, −sin yaw).
    ctx.seats.push({ id: ctx.seats.length, x: kx, y: pad, z: kz, yaw: Math.atan2(-Math.cos(yaw), Math.sin(yaw)), kind: 'keeper' });

    // Bảng tên tiệm nhỏ phát sáng trên tường sau.
    box(tubes, 0, H - 0.75, -D + 0.07, Math.min(2.2, W * 0.6), 0.36, 0.02, t.color);
    furnish(shop.kind, (lx, y, lz, sx, sy, sz, c, solid) => box(props, lx, y, lz, sx, sy, sz, c, solid), rng, W, D, counterX);
  }
  for (const b of [floors, walls, ceilings, props, tubes]) addMesh(ctx, b.build());
}

/** Đặt một món đồ (lô "shop-props") theo toạ độ phòng; `solid` = có va chạm. */
type PutFn = (lx: number, y: number, lz: number, sx: number, sy: number, sz: number, c: THREE.ColorRepresentation, solid?: boolean) => void;

const shade = (hex: string, k: number): string => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

/** Bày biện theo loại tiệm: kệ hàng sát tường trái (chừa lối đi giữa), đồ đặc trưng của từng nghề. */
function furnish(kind: ShopKind, put: PutFn, rng: Rng, W: number, D: number, counterX: number): void {
  const left = -W / 2;
  /** Kệ dài sát tường trái từ z0 tới z1, `levels` tầng, hàng hoá màu từ `palette`. */
  const shelf = (z0: number, z1: number, levels: number, palette: readonly string[], frame = '#cfc9bd', tall = 2): void => {
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;
    put(left + 0.22, tall / 2, zc, 0.42, tall, len, frame, true);
    for (let lv = 0; lv < levels; lv++) {
      const y = 0.35 + (lv * (tall - 0.4)) / Math.max(1, levels - 1);
      let z = z0 + 0.1;
      while (z < z1 - 0.15) {
        const gw = 0.14 + rng() * 0.18;
        const gh = 0.12 + rng() * 0.2;
        put(left + 0.47, y + gh / 2, z + gw / 2, 0.08 + rng() * 0.1, gh, gw, palette[Math.floor(rng() * palette.length)]!);
        z += gw + 0.03;
      }
    }
  };
  switch (kind) {
    case 'tapHoa':
      shelf(-D + 0.4, -0.6, 4, GOODS);
      // Tủ lạnh nước ngọt cửa kính ở góc sau.
      put(counterX - 0.3, 0.95, -D + 0.5, 0.9, 1.9, 0.7, '#f4f6f8', true);
      put(counterX - 0.3, 1.0, -D + 0.86, 0.7, 1.5, 0.02, '#7fb6d9');
      // Thùng nước suối, két bia xếp chồng ở góc trước bên phải (chừa lối đi giữa).
      for (let k = 0; k < 3; k++) put(W / 2 - 0.4, 0.15 + k * 0.3, -0.7, 0.5, 0.28, 0.35, k % 2 ? '#2b6cb0' : '#d8342c', true);
      break;
    case 'comTam': {
      // Tủ kính sườn nướng gần cửa, bàn nhựa thấp + ghế đẩu.
      put(left + 0.55, 0.55, -0.9, 1.0, 1.1, 0.6, '#c0392b', true);
      put(left + 0.55, 1.3, -0.9, 0.95, 0.4, 0.55, '#dfe8ea');
      for (let k = 0; k < 2; k++) {
        const z = -D * (0.45 + k * 0.3);
        put(-0.4, 0.22, z, 0.75, 0.44, 0.75, k ? '#2e7dd1' : '#d84a3a', true);
        for (const [dx, dz] of [[-0.55, 0], [0.55, 0], [0, 0.55]] as const) put(-0.4 + dx, 0.14, z + dz, 0.3, 0.28, 0.3, '#d8342c');
      }
      break;
    }
    case 'nhaThuoc':
      shelf(-D + 0.4, -0.6, 5, PILLS, '#f4f6f8');
      // Chữ thập xanh phát sáng trên tường sau.
      put(counterX, 1.95, -D + 0.1, 0.5, 0.14, 0.03, '#2f8f4e');
      put(counterX, 1.95, -D + 0.1, 0.14, 0.5, 0.03, '#2f8f4e');
      break;
    case 'camDo':
      shelf(-D + 0.4, -0.6, 4, GADGETS, '#6b5b45');
      // Xe máy cầm cố đậu trong tiệm.
      put(-0.3, 0.55, -D + 1.3, 0.35, 0.8, 1.7, '#a8323a', true);
      put(-0.3, 0.9, -D + 1.1, 0.3, 0.12, 0.7, '#1d1f24');
      break;
    case 'quanAo': {
      // Hai giá treo đồ: thanh ngang + áo treo đủ màu; gương đứng.
      for (let k = 0; k < 2; k++) {
        const z = -D * (0.3 + k * 0.35);
        put(-0.6, 1.45, z, 0.03, 0.03, 1.3, '#9aa0a6');
        put(-0.6, 0.72, z - 0.6, 0.04, 1.45, 0.04, '#9aa0a6', true);
        put(-0.6, 0.72, z + 0.6, 0.04, 1.45, 0.04, '#9aa0a6');
        for (let i = 0; i < 9; i++) put(-0.6, 1.05, z - 0.55 + i * 0.137, 0.42, 0.75, 0.04, CLOTHES[Math.floor(rng() * CLOTHES.length)]!);
      }
      put(left + 0.05, 1.0, -D * 0.5, 0.04, 1.7, 0.6, '#cfe2ec');
      // Kệ mũ bảo hiểm sát tường trái phía cửa.
      shelf(-1.6, -0.5, 3, ['#e7c22d', '#d8342c', '#f2f2f2', '#2b2b2f', '#3f7fd1'], '#cfc9bd', 1.4);
      break;
    }
    case 'dienThoai':
      // Tủ kính trưng điện thoại sát tường trái + áp phích phát sáng.
      put(left + 0.4, 0.5, -D * 0.5, 0.6, 1.0, D * 0.6, '#cfd8e0', true);
      for (let i = 0; i < 10; i++) put(left + 0.4, 1.02, -D * 0.2 - i * ((D * 0.55) / 10), 0.07, 0.01, 0.14, '#111317');
      put(0, 1.7, -D + 0.08, Math.min(1.6, W * 0.4), 0.9, 0.02, '#2d3f8a');
      break;
  }
}
