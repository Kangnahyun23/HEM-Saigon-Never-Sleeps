import * as THREE from 'three/webgpu';
import { cameraPosition, float, mix, positionWorld, smoothstep, vec3 } from 'three/tsl';
import { range } from '@/core/random';
import { euler, InstanceBatch } from '@/render/instancing';
import { GROUP } from '@/physics/groups';
import { BIKE_BODY_COLORS, BIKE_PARTS, BIKE_ROLE_COLORS, type BikePart } from '@/vehicles/bikeModel';
import { nightUniform } from '../../nightGlow';
import { CITY_COLORS } from '../palette';
import { addMesh, GEO, type BuildContext } from './context';

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
  const transformers = new InstanceBatch(GEO.cyl, new THREE.MeshStandardNodeMaterial({ color: '#7d8287', roughness: 0.5, metalness: 0.5 }), {
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

  // Dây điện: parabol võng giữa hai điểm treo.
  const segs = 10;
  const pos = new Float32Array(layout.wires.length * segs * 2 * 3);
  let o = 0;
  for (const w of layout.wires) {
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

  for (const t of layout.trees) {
    const trunkH = t.kind === 'tall' ? t.height * 0.62 : t.height * 0.48;
    const r = t.kind === 'tall' ? 0.32 : 0.17;
    const lean = range(rng, -0.05, 0.05);
    trunks.add(t.x, pad, t.z, r, trunkH + t.canopy * 0.4, r, euler(lean, rng() * 6.28, lean));
    statics.cylinder(t.x, pad, t.z, r + 0.05, 3);
    if (t.kind !== 'park') grates.add(t.x, pad + 0.004, t.z, 1.1, 0.008, 1.1);
    const blobs = t.kind === 'tall' ? 4 : 2 + Math.floor(rng() * 2);
    const baseY = pad + trunkH + t.canopy * 0.55;
    for (let k = 0; k < blobs; k++) {
      const s = t.canopy * range(rng, 0.65, 1.0);
      const g = CITY_COLORS.leaf[Math.floor(rng() * CITY_COLORS.leaf.length)] as string;
      canopies.add(
        t.x + range(rng, -0.5, 0.5) * t.canopy,
        baseY + range(rng, -0.2, 0.5) * t.canopy + (t.kind === 'tall' ? k * 0.9 : 0),
        t.z + range(rng, -0.5, 0.5) * t.canopy,
        s,
        s * range(rng, 0.65, 0.85),
        s,
        rng() * 6.28,
        g,
      );
    }
  }
  for (const b of [trunks, canopies, grates]) addMesh(ctx, b.build());
}

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
  }
  for (const { batch } of parts.values()) addMesh(ctx, batch.build());
}

export function buildStreetProps(ctx: BuildContext): void {
  buildPoles(ctx);
  buildTrees(ctx);
  buildParkedBikes(ctx);
}
