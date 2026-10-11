import * as THREE from 'three/webgpu';
import { cameraPosition, float, mix, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { range } from '@/core/random';
import { euler, InstanceBatch } from '@/render/instancing';
import { GROUP } from '@/physics/groups';
import { BIKE_BODY_COLORS, BIKE_PARTS, BIKE_ROLE_COLORS, type BikePart } from '@/vehicles/bikeModel';
import { nightUniform } from '../../nightGlow';
import type { Lot } from '../layout';
import { CITY_COLORS } from '../palette';
import { addMesh, GEO, type BuildContext } from './context';
import { reflective } from '../../reflections';

/** Điểm trên chân mặt tiền một lô, `t` 0..1 dọc mặt tiền → [x, z]. */
function facadePoint(l: Lot, t: number): [number, number] {
  const r = l.rect;
  switch (l.front) {
    case '+z':
      return [r.x0 + (r.x1 - r.x0) * t, r.z1];
    case '-z':
      return [r.x0 + (r.x1 - r.x0) * t, r.z0];
    case '+x':
      return [r.x1, r.z0 + (r.z1 - r.z0) * t];
    default:
      return [r.x0, r.z0 + (r.z1 - r.z0) * t];
  }
}

/** Cột điện bê tông + xà ngang + cuộn cáp + bình biến áp + đèn đường; dây điện võng giữa các cột. */
function buildPoles(ctx: BuildContext): void {
  const { layout, statics, rng, pad } = ctx;
  const concrete = new THREE.MeshStandardNodeMaterial({ color: CITY_COLORS.pole, roughness: 0.9 });
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.17, 1, 6).translate(0, 0.5, 0);
  const poles = new InstanceBatch(poleGeo, concrete, { name: 'poles' });
  const dark = new THREE.MeshStandardNodeMaterial({ roughness: 0.7 });
  const hardware = new InstanceBatch(GEO.box, dark, { colors: true, castShadow: false, name: 'pole-hardware' });
  const coilGeo = new THREE.TorusGeometry(0.32, 0.07, 5, 10);
  const coils = new InstanceBatch(coilGeo, dark, { colors: true, castShadow: false, name: 'cable-coils' });
  const transformers = new InstanceBatch(GEO.cyl, reflective(new THREE.MeshStandardNodeMaterial({ color: '#7d8287', roughness: 0.5, metalness: 0.5 })), {
    name: 'transformers',
  });
  const lampMat = new THREE.MeshStandardNodeMaterial({ color: '#fff4d6', roughness: 0.4 });
  // Bóng đèn natri vàng cam: hơi sáng ban ngày, rực lên khi tối.
  lampMat.emissiveNode = vec3(1.0, 0.8, 0.5).mul(mix(float(0.15), float(9), nightUniform));
  const lampHeads = new InstanceBatch(GEO.box, lampMat, { name: 'lamp-heads', castShadow: false });

  const inRoad = (x: number, z: number): boolean => layout.roads.some((r) => x > r.rect.x0 && x < r.rect.x1 && z > r.rect.z0 && z < r.rect.z1);

  for (const p of layout.poles) {
    const y0 = pad;
    poles.add(p.x, y0, p.z, 1, p.height, 1);
    statics.cylinder(p.x, y0, p.z, 0.17, p.height, GROUP.WORLD);
    // Xà ngang vuông góc với tuyến dây.
    const armYaw = p.axis === 'x' ? Math.PI / 2 : 0;
    hardware.add(p.x, y0 + p.height - 0.45, p.z, 1.5, 0.09, 0.09, armYaw, '#6b6e72');
    if (rng() < 0.6) hardware.add(p.x, y0 + p.height - 1.5, p.z, 1.1, 0.08, 0.08, armYaw, '#6b6e72');
    // Cuộn cáp viễn thông treo lủng lẳng — "đặc sản" cột điện Sài Gòn.
    const nCoils = rng() < 0.55 ? 1 + Math.floor(rng() * 3) : 0;
    for (let k = 0; k < nCoils; k++) {
      coils.add(p.x + range(rng, -0.25, 0.25), y0 + p.height - 2.2 - k * 0.5 - rng() * 0.6, p.z + range(rng, -0.25, 0.25), 1, 1, 1, euler(range(rng, 1.2, 1.9), rng() * Math.PI, range(rng, -0.3, 0.3)), '#1b1b1b');
    }
    // Hộp cáp gắn cột.
    if (rng() < 0.4) hardware.add(p.x + 0.2, y0 + 2.6 + rng(), p.z + 0.2, 0.3, 0.45, 0.18, rng() * Math.PI, '#9aa0a5');
    if (rng() < 0.12) transformers.add(p.x + 0.42, y0 + p.height - 2.6, p.z, 0.32, 1.0, 0.32);

    // Đèn đường: cần vươn ra phía lòng đường.
    if (p.lamp) {
      const dirs: Array<[number, number]> = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const dir = dirs.find(([dx, dz]) => inRoad(p.x + dx * 2.5, p.z + dz * 2.5)) ?? (p.axis === 'x' ? [0, 1] : [1, 0]);
      const [dx, dz] = dir;
      const armLen = 1.9;
      const ay = y0 + p.height - 0.9;
      const yaw = dx !== 0 ? 0 : Math.PI / 2;
      hardware.add(p.x + (dx * armLen) / 2, ay, p.z + (dz * armLen) / 2, armLen, 0.07, 0.07, yaw, '#5e6166');
      const hx = p.x + dx * armLen;
      const hz = p.z + dz * armLen;
      lampHeads.add(hx, ay - 0.08, hz, 0.55, 0.12, 0.26, yaw);
      ctx.lamps.push(new THREE.Vector3(hx, ay - 0.2, hz));
    }
  }
  for (const b of [poles, hardware, coils, transformers, lampHeads]) addMesh(ctx, b.build());

  // Dây rẽ vào nhà: từ cột kéo vào mặt tiền các nhà gần đó (1–3 sợi mỗi cột) — "mạng nhện" dây điện Sài Gòn.
  const drops: { a: [number, number, number]; b: [number, number, number]; sag: number }[] = [];
  for (const p of layout.poles) {
    const near = layout.lots
      .filter((l) => l.row === 'front' && l.kind !== 'tower')
      .map((l) => ({ l, f: facadePoint(l, 0.5) }))
      .map((e) => ({ ...e, d: Math.hypot(e.f[0] - p.x, e.f[1] - p.z) }))
      .filter((e) => e.d < 13)
      .sort((a, b) => a.d - b.d);
    const n = Math.min(near.length, 1 + Math.floor(rng() * 3));
    for (let k = 0; k < n; k++) {
      const { l } = near[k]!;
      const [fx, fz] = facadePoint(l, range(rng, 0.2, 0.8));
      const fy = Math.min(l.height - 0.8, range(rng, 3.6, 6.2));
      drops.push({ a: [p.x, p.height - 1.6 - rng() * 0.9, p.z], b: [fx, fy, fz], sag: range(rng, 0.25, 0.7) });
    }
  }
  const allWires = [...layout.wires, ...drops];

  // Dây điện: parabol võng giữa hai điểm treo.
  const segs = 10;
  const pos = new Float32Array(allWires.length * segs * 2 * 3);
  let o = 0;
  for (const w of allWires) {
    const [ax, ay, az] = w.a;
    const [bx, by, bz] = w.b;
    for (let i = 0; i < segs; i++) {
      for (const t of [i / segs, (i + 1) / segs]) {
        pos[o++] = ax + (bx - ax) * t;
        pos[o++] = pad + ay + (by - ay) * t - w.sag * 4 * t * (1 - t);
        pos[o++] = az + (bz - az) * t;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // Dây điện mờ dần theo khoảng cách: ở xa các nét 1px chồng lên nhau trông như vạch đen.
  const wireMat = new THREE.LineBasicNodeMaterial({ color: CITY_COLORS.wire, transparent: true });
  wireMat.opacityNode = float(1).sub(smoothstep(70, 170, positionWorld.distance(cameraPosition)));
  const lines = new THREE.LineSegments(geo, wireMat);
  lines.name = 'wires';
  lines.frustumCulled = false;
  addMesh(ctx, lines);
}

/** Cây: thân + 2–4 tán khối (low-poly), có ô gốc cây trên vỉa hè. */
function buildTrees(ctx: BuildContext): void {
  const { layout, statics, rng, pad } = ctx;
  const bark = new THREE.MeshStandardNodeMaterial({ color: CITY_COLORS.trunk, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.6, 1, 1, 7).translate(0, 0.5, 0);
  const trunks = new InstanceBatch(trunkGeo, bark, { name: 'trunks' });
  const leafMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, flatShading: true });
  const canopies = new InstanceBatch(GEO.blob, leafMat, { colors: true, name: 'canopies' });
  const grates = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ color: '#4a4540', roughness: 0.9 }), { castShadow: false, name: 'tree-grates' });
  // Gốc cây quét vôi trắng (chống sâu, dễ thấy ban đêm) — rất đặc trưng đường phố Sài Gòn.
  const limewash = new InstanceBatch(GEO.cylBase, new THREE.MeshStandardNodeMaterial({ color: '#efede6', roughness: 0.95 }), { castShadow: false, name: 'tree-limewash' });

  for (const t of layout.trees) {
    const trunkH = t.kind === 'tall' ? t.height * 0.62 : t.height * 0.48;
    const r = t.kind === 'tall' ? 0.32 : 0.17;
    const lean = range(rng, -0.05, 0.05);
    trunks.add(t.x, pad, t.z, r, trunkH + t.canopy * 0.4, r, euler(lean, rng() * 6.28, lean));
    statics.cylinder(t.x, pad, t.z, r + 0.05, 3);
    if (t.kind !== 'park') {
      grates.add(t.x, pad + 0.004, t.z, 1.1, 0.008, 1.1);
      limewash.add(t.x, pad, t.z, r * 0.92 + 0.03, 1.15, r * 0.92 + 0.03);
    }
    // Cây me ven đường: tán xoè rộng, dẹt; cây sao / dầu (tall): tán cao, gọn.
    const tamarind = t.kind === 'street';
    const blobs = t.kind === 'tall' ? 4 : tamarind ? 3 : 2 + Math.floor(rng() * 2);
    const baseY = pad + trunkH + t.canopy * 0.55;
    for (let k = 0; k < blobs; k++) {
      const s = t.canopy * range(rng, 0.65, 1.0);
      const g = CITY_COLORS.leaf[Math.floor(rng() * CITY_COLORS.leaf.length)] as string;
      const spread = tamarind ? 0.75 : 0.5;
      canopies.add(
        t.x + range(rng, -spread, spread) * t.canopy,
        baseY + range(rng, -0.2, tamarind ? 0.25 : 0.5) * t.canopy + (t.kind === 'tall' ? k * 0.9 : 0),
        t.z + range(rng, -spread, spread) * t.canopy,
        s * (tamarind ? 1.15 : 1),
        s * (tamarind ? range(rng, 0.45, 0.6) : range(rng, 0.65, 0.85)),
        s * (tamarind ? 1.15 : 1),
        rng() * 6.28,
        g,
      );
    }
  }
  for (const b of [trunks, canopies, grates, limewash]) addMesh(ctx, b.build());
}

/** Tỉ lệ xe đậu có mũ bảo hiểm trên yên; vị trí mũ (mặt yên, hơi lùi về sau) trong hệ toạ độ xe. */
const HELMET_SHARE = 0.25;
const HELMET_SEAT = [0, 0.885, -0.42] as const;
/** Số giả ngẫu nhiên 0..1 cố định theo toạ độ. */
const hash01 = (x: number, z: number): number => {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

/** Xe máy đậu trên vỉa hè: mỗi bộ phận của mẫu xe là một InstancedMesh. */
function buildParkedBikes(ctx: BuildContext): void {
  const { layout, statics, pad } = ctx;
  const parts = new Map<string, { part: BikePart; batch: InstanceBatch }>();
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.15 });
  const keyOf = (p: BikePart): string => `${p.shape}`;
  const m = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  for (const p of BIKE_PARTS) {
    const key = keyOf(p);
    if (!parts.has(key)) {
      parts.set(key, { part: p, batch: new InstanceBatch(p.shape === 'box' ? GEO.box : GEO.cylX, mat, { colors: true, name: `parked-bike-${key}` }) });
    }
  }

  for (const b of layout.bikes) {
    const body = BIKE_BODY_COLORS[b.colorIndex % BIKE_BODY_COLORS.length] as string;
    // Chân chống nghiêng: xe đậu nghiêng nhẹ sang trái.
    const lean = 0.09;
    m.makeRotationFromEuler(e.set(0, b.yaw, lean, 'YXZ')).setPosition(b.x, pad, b.z);
    for (const p of BIKE_PARTS) {
      const batch = (parts.get(keyOf(p)) as { batch: InstanceBatch }).batch;
      v.set(p.pos[0], p.pos[1], p.pos[2]);
      q.setFromEuler(e.set(p.tilt ?? 0, 0, 0));
      if (p.shape === 'box') s.set(p.size[0], p.size[1], p.size[2]);
      else s.set(p.size[1], p.size[0], p.size[0]);
      local.compose(v, q, s);
      const color = p.role === 'body' ? body : BIKE_ROLE_COLORS[p.role];
      batch.addMatrix(new THREE.Matrix4().multiplyMatrices(m, local), color);
    }
    statics.box(b.x, pad + 0.55, b.z, 0.5, 1.1, 1.85, b.yaw, GROUP.PROP);
    // Khoảng 1/4 số xe để mũ bảo hiểm trên yên (theo băm vị trí — không đụng chuỗi ngẫu nhiên của phố).
    if (hash01(b.x, b.z) < HELMET_SHARE) {
      v.set(0, HELMET_SEAT[1], HELMET_SEAT[2]).applyMatrix4(m);
      ctx.pickups.push({ x: v.x, y: v.y, z: v.z, yaw: b.yaw, item: 'muBaoHiem', restock: 6 });
    }
  }
  for (const { batch } of parts.values()) addMesh(ctx, batch.build());
}

/** Ghế đẩu cao 0,28 m; chồng 5 cái, mỗi cái cao thêm 6,5 cm. */
const STOOL_H = 0.28;
const STACK = 5;
const STACK_STEP = 0.065;

/**
 * Đời sống vỉa hè: quán cóc (bàn nhựa thấp + ghế đẩu) và xe đẩy bán đồ ăn có dù trước một số nhà mặt đường.
 * Chỉ để nhìn (xe đẩy có va chạm); đặt cách mặt tiền 1,6–2,6 m, ngoài hàng xe máy đậu sát nhà.
 */
function buildSidewalkLife(ctx: BuildContext): void {
  const { layout, statics, rng, pad } = ctx;
  const plastic = new THREE.MeshStandardNodeMaterial({ roughness: 0.5 });
  const stools = new InstanceBatch(GEO.box, plastic, { colors: true, castShadow: false, name: 'sidewalk-stools' });
  const tables = new InstanceBatch(GEO.box, plastic, { colors: true, castShadow: false, name: 'sidewalk-tables' });
  const carts = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.2 }), { colors: true, name: 'sidewalk-carts' });
  const wheels = new InstanceBatch(GEO.cylX, new THREE.MeshStandardNodeMaterial({ color: '#1d1d1d', roughness: 0.8 }), { castShadow: false, name: 'sidewalk-cart-wheels' });
  const umbrellas = new InstanceBatch(GEO.cone4, new THREE.MeshStandardNodeMaterial({ roughness: 0.7, side: THREE.DoubleSide }), { colors: true, name: 'sidewalk-umbrellas' });
  const yawOf = (l: Lot): number => (l.front === '+z' ? 0 : l.front === '-z' ? Math.PI : l.front === '+x' ? Math.PI / 2 : -Math.PI / 2);

  for (const l of layout.lots) {
    if (l.row !== 'front' || l.frontage === 'hem' || l.kind === 'tower') continue;
    const r = rng();
    if (r > 0.13) continue;
    const yaw = yawOf(l);
    // Hướng ra đường (pháp tuyến mặt tiền) và dọc mặt tiền.
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const tx = Math.cos(yaw);
    const tz = -Math.sin(yaw);
    const [fx, fz] = facadePoint(l, 0.5);
    const at = (along: number, out: number): [number, number] => [fx + tx * along + nx * out, fz + tz * along + nz * out];
    if (r < 0.08) {
      // Quán cóc: 1–2 bàn thấp, mỗi bàn 3–4 ghế đẩu.
      const sc = CITY_COLORS.stool[Math.floor(rng() * CITY_COLORS.stool.length)] as string;
      const nT = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < nT; k++) {
        const along = (k - (nT - 1) / 2) * 1.5 + range(rng, -0.2, 0.2);
        const out = range(rng, 1.8, 2.3);
        const [x, z] = at(along, out);
        tables.add(x, pad + 0.22, z, 0.6, 0.44, 0.6, yaw + range(rng, -0.2, 0.2), rng() < 0.5 ? '#2e7dd1' : '#d84a3a');
        const nS = 3 + Math.floor(rng() * 2);
        for (let j = 0; j < nS; j++) {
          const a = (j / nS) * Math.PI * 2 + rng();
          const sx = x + Math.cos(a) * 0.55;
          const sz = z + Math.sin(a) * 0.55;
          stools.add(sx, pad + 0.14, sz, 0.3, 0.28, 0.3, rng() * 3, sc);
          // Người ngồi ghế quay mặt vào bàn.
          ctx.seats.push({ id: ctx.seats.length, x: sx, y: pad + 0.28, z: sz, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)), kind: 'stool' });
        }
      }
      // Chồng ghế đẩu dự phòng cạnh quán (5 cái lồng vào nhau: thân + vành từng ghế) — nhặt được làm vũ khí.
      const [cx, cz] = at(((nT - 1) / 2) * 1.5 + 1.05, 2.55);
      const top = STOOL_H + (STACK - 1) * STACK_STEP;
      stools.add(cx, pad + top / 2, cz, 0.26, top, 0.26, yaw, sc);
      for (let k = 0; k < STACK; k++) stools.add(cx, pad + STOOL_H + k * STACK_STEP - 0.018, cz, 0.32, 0.036, 0.32, yaw, sc);
      ctx.pickups.push({ x: cx, y: pad + top, z: cz, yaw, item: 'gheNhua', restock: 0 });
    } else {
      // Xe đẩy bánh mì / hủ tiếu: tủ kính trên thùng gỗ sơn, hai bánh, dù che.
      const [x, z] = at(range(rng, -0.6, 0.6), range(rng, 2.0, 2.4));
      const body = rng() < 0.5 ? '#c0392b' : '#1f6fb2';
      carts.add(x, pad + 0.55, z, 1.25, 0.5, 0.62, yaw + Math.PI / 2, body);
      carts.add(x, pad + 1.02, z, 1.1, 0.44, 0.55, yaw + Math.PI / 2, '#dfe8ea');
      for (const side of [-1, 1]) wheels.add(x + nx * side * 0.33, pad + 0.22, z + nz * side * 0.33, 0.06, 0.22, 0.22, yaw + Math.PI / 2);
      umbrellas.add(x, pad + 2.15, z, 2.2, 0.45, 2.2, yaw + Math.PI / 4, CITY_COLORS.awning[Math.floor(rng() * CITY_COLORS.awning.length)] as string);
      statics.box(x, pad + 0.6, z, 1.25, 1.2, 0.62, yaw + Math.PI / 2, GROUP.PROP);
      // Người bán đứng phía trong (sát nhà), nhìn ra đường.
      ctx.seats.push({ id: ctx.seats.length, x: x - nx * 0.7, y: pad, z: z - nz * 0.7, yaw, kind: 'vendor' });
    }
  }
  for (const b of [stools, tables, carts, wheels, umbrellas]) addMesh(ctx, b.build());
}

export function buildStreetProps(ctx: BuildContext): void {
  buildPoles(ctx);
  buildTrees(ctx);
  buildParkedBikes(ctx);
  buildSidewalkLife(ctx);
}
