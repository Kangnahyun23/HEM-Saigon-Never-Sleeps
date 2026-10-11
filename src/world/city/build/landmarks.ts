import * as THREE from 'three/webgpu';
import { signFont } from '@/ui/fonts';
import { float, hash, floor, mix, positionWorld, sin, time, vec3 } from 'three/tsl';
import { range } from '@/core/random';
import { centerX, centerZ, depth, width, type Rect } from '@/core/rect';
import { InstanceBatch } from '@/render/instancing';
import { nightUniform } from '../../nightGlow';
import { createFacadeMaterial, createPavementMaterial } from '../materials';
import { CITY_COLORS } from '../palette';
import { addMesh, GEO, localToWorld, yawFor, type BuildContext } from './context';
import { reflective } from '../../reflections';

const CREAM = '#efe1bd';
const CREAM_DARK = '#d8c69a';
const ROOF_RED = '#9a4b32';

/** Bảng tên vẽ bằng canvas. */
function textPlate(text: string, bg: string, fg: string, w = 1024, h = 160): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = signFont('tall', Math.round(h * 0.6));
  g.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Chợ Trung Tâm: nhà lồng chợ mái ngói đỏ, tháp đồng hồ ở cổng chính, quầy dù quanh quảng trường. */
function buildMarket(ctx: BuildContext): void {
  const { layout, statics, rng, pad } = ctx;
  const m = layout.market;
  const hall = m.hall;
  const hw = width(hall);
  const hd = depth(hall);
  const hcx = centerX(hall);
  const hcz = centerZ(hall);
  const wallH = 8;

  const wallMat = new THREE.MeshStandardNodeMaterial({ color: CREAM, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardNodeMaterial({ color: CREAM_DARK, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardNodeMaterial({ color: ROOF_RED, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardNodeMaterial({ color: '#2b2420', roughness: 0.9 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addMesh(ctx, mesh);
    return mesh;
  };

  // Thân nhà lồng + diềm mái + tầng mái cao (cửa thông gió) + mái ngói.
  add(GEO.box, wallMat, hcx, pad + wallH / 2, hcz, hw, wallH, hd);
  add(GEO.box, trimMat, hcx, pad + wallH + 0.25, hcz, hw + 0.8, 0.5, hd + 0.8);
  add(GEO.cone4, roofMat, hcx, pad + wallH + 0.5, hcz, hw + 1.6, 4.5, hd + 1.6);
  add(GEO.box, wallMat, hcx, pad + wallH + 4.2, hcz, hw * 0.45, 3, hd * 0.45);
  add(GEO.cone4, roofMat, hcx, pad + wallH + 5.7, hcz, hw * 0.45 + 1.4, 3.2, hd * 0.45 + 1.4);
  statics.box(hcx, pad + wallH / 2, hcz, hw, wallH, hd);

  // Cửa vòm tối dọc bốn mặt tường (hộp mỏng sẫm màu).
  const arches = new InstanceBatch(GEO.box, darkMat, { name: 'market-arches' });
  const pilasters = new InstanceBatch(GEO.box, trimMat, { name: 'market-pilasters' });
  const sides: Array<{ yaw: number; ox: number; oz: number; len: number }> = [
    { yaw: 0, ox: hcx, oz: hall.z1, len: hw },
    { yaw: Math.PI, ox: hcx, oz: hall.z0, len: hw },
    { yaw: Math.PI / 2, ox: hall.x1, oz: hcz, len: hd },
    { yaw: -Math.PI / 2, ox: hall.x0, oz: hcz, len: hd },
  ];
  for (const s of sides) {
    const n = Math.floor(s.len / 4.5);
    for (let i = 0; i < n; i++) {
      const lx = -s.len / 2 + (i + 0.5) * (s.len / n);
      const [x, z] = localToWorld(s.ox, s.oz, s.yaw, lx, 0.02);
      arches.add(x, pad + 2.4, z, 2.2, 3.6, 0.06, s.yaw);
      const [px, pz] = localToWorld(s.ox, s.oz, s.yaw, lx + s.len / n / 2, 0.15);
      if (i < n - 1) pilasters.add(px, pad + wallH / 2, pz, 0.5, wallH, 0.3, s.yaw);
      const [wx, wz] = localToWorld(s.ox, s.oz, s.yaw, lx, 0.03);
      arches.add(wx, pad + 6.2, wz, 1.6, 1.2, 0.06, s.yaw);
    }
  }
  addMesh(ctx, arches.build());
  addMesh(ctx, pilasters.build());

  // Tháp đồng hồ ở cổng chính.
  const t = m.tower;
  const tcx = centerX(t);
  const tcz = centerZ(t);
  const tw = width(t);
  const towerH = 22;
  add(GEO.box, wallMat, tcx, pad + towerH / 2, tcz, tw, towerH, tw);
  add(GEO.box, trimMat, tcx, pad + towerH + 0.3, tcz, tw + 1, 0.6, tw + 1);
  add(GEO.box, trimMat, tcx, pad + 9, tcz, tw + 0.6, 0.5, tw + 0.6);
  add(GEO.cone4, roofMat, tcx, pad + towerH + 0.6, tcz, tw + 1.2, 5, tw + 1.2);
  add(GEO.box, darkMat, tcx, pad + towerH + 8, tcz, 0.08, 5, 0.08);
  statics.box(tcx, pad + towerH / 2, tcz, tw, towerH, tw);

  const faceMat = new THREE.MeshStandardNodeMaterial({ color: '#f7f3e8', roughness: 0.4 });
  const rimMat = new THREE.MeshStandardNodeMaterial({ color: '#3a2f25', roughness: 0.5 });
  const clockGeo = new THREE.CylinderGeometry(1, 1, 1, 32).rotateX(Math.PI / 2);
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const [x, z] = localToWorld(tcx, tcz, yaw, 0, tw / 2 + 0.05);
    add(clockGeo, rimMat, x, pad + 17, z, 1.9, 1.9, 0.14, yaw);
    const [fx, fz] = localToWorld(tcx, tcz, yaw, 0, tw / 2 + 0.13);
    add(clockGeo, faceMat, fx, pad + 17, fz, 1.7, 1.7, 0.04, yaw);
    // Kim giờ + kim phút (4 giờ kém 10 — giờ quen thuộc trên ảnh quảng cáo đồng hồ).
    const [kx, kz] = localToWorld(tcx, tcz, yaw, 0, tw / 2 + 0.17);
    const hour = new THREE.Mesh(GEO.box, rimMat);
    hour.scale.set(0.12, 0.95, 0.03);
    hour.position.set(kx, pad + 17, kz);
    hour.rotation.set(0, yaw, -Math.PI * 0.62, 'YXZ');
    hour.translateY(0.42);
    addMesh(ctx, hour);
    const minute = new THREE.Mesh(GEO.box, rimMat);
    minute.scale.set(0.08, 1.4, 0.03);
    minute.position.set(kx, pad + 17, kz);
    minute.rotation.set(0, yaw, Math.PI * 0.33, 'YXZ');
    minute.translateY(0.65);
    addMesh(ctx, minute);
  }

  // Cổng chính tối dưới chân tháp + bảng tên.
  const front = yawFor(m.front);
  const [gx, gz] = localToWorld(tcx, tcz, front, 0, tw / 2 + 0.03);
  add(GEO.box, darkMat, gx, pad + 2.6, gz, 3.6, 5.2, 0.06, front);
  const plateMat = new THREE.MeshStandardNodeMaterial({ map: textPlate('CHỢ TRUNG TÂM', '#f3e7c4', '#9a2b1d'), roughness: 0.6 });
  const [px, pz] = localToWorld(tcx, tcz, front, 0, tw / 2 + 0.1);
  add(GEO.plane, plateMat, px, pad + 11.2, pz, tw + 2.5, (tw + 2.5) * 0.16, 1, front).castShadow = false;

  // Quầy dù quanh quảng trường.
  const poleMat = reflective(new THREE.MeshStandardNodeMaterial({ color: '#c8c8c8', roughness: 0.4, metalness: 0.6 }));
  const umbMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, side: THREE.DoubleSide });
  const umbGeo = new THREE.ConeGeometry(1, 0.6, 10, 1, true).translate(0, 0.3, 0);
  const umbrellas = new InstanceBatch(umbGeo, umbMat, { colors: true, name: 'umbrellas' });
  const umbPoles = new InstanceBatch(GEO.cylBase, poleMat, { name: 'umbrella-poles' });
  const stalls = new InstanceBatch(GEO.box, new THREE.MeshStandardNodeMaterial({ roughness: 0.8 }), { colors: true, name: 'stalls' });
  const plaza = m.rect;
  const ring: Array<[number, number]> = [];
  for (let x = plaza.x0 + 4; x < plaza.x1 - 4; x += 7) ring.push([x, plaza.z0 + 3], [x, plaza.z1 - 3]);
  for (let z = plaza.z0 + 10; z < plaza.z1 - 10; z += 7) ring.push([plaza.x0 + 3, z], [plaza.x1 - 3, z]);
  for (const [x, z] of ring) {
    if (Math.abs(x - tcx) < 9 && Math.abs(z - tcz) < 9) continue; // chừa lối vào cổng chính
    if (rng() < 0.3) continue;
    const c = ['#d32f2f', '#1565c0', '#f9a825', '#2e7d32', '#ef6c00', '#6a1b9a'][Math.floor(rng() * 6)] as string;
    umbPoles.add(x, pad, z, 0.04, 2.3, 0.04);
    umbrellas.add(x, pad + 2.1, z, 1.5, 1, 1.5, rng() * 6, c);
    stalls.add(x, pad + 0.4, z, 1.6, 0.8, 0.9, rng() < 0.5 ? 0 : Math.PI / 2, ['#b98a5a', '#8d6e63', '#cfd8dc'][Math.floor(rng() * 3)] as string);
    ctx.statics.box(x, pad + 0.4, z, 1.6, 0.8, 1.6);
  }
  for (const b of [umbrellas, umbPoles, stalls]) addMesh(ctx, b.build());
}

/** Công viên: bãi cỏ, lối đi chữ thập, đài phun nước, ghế đá. */
function buildPark(ctx: BuildContext): void {
  const { layout, statics, pad } = ctx;
  const p = layout.park;
  const r = p.rect;
  const grass = new THREE.MeshStandardNodeMaterial({ roughness: 1 });
  const g0 = new THREE.Color(CITY_COLORS.grass);
  const n = hash(floor(positionWorld.x.mul(1.5)).add(floor(positionWorld.z.mul(1.5)).mul(91)));
  grass.colorNode = vec3(g0.r, g0.g, g0.b).mul(float(0.85).add(n.mul(0.25)));
  const lawn = new THREE.Mesh(GEO.box, grass);
  lawn.scale.set(width(r), 0.02, depth(r));
  lawn.position.set(centerX(r), pad + 0.01, centerZ(r));
  lawn.receiveShadow = true;
  addMesh(ctx, lawn);

  const gravel = createPavementMaterial('#c9b99a');
  const paths = new InstanceBatch(GEO.box, gravel, { castShadow: false, name: 'park-paths' });
  paths.add(centerX(r), pad + 0.025, centerZ(r), width(r), 0.02, 3.2);
  paths.add(centerX(r), pad + 0.026, centerZ(r), 3.2, 0.02, depth(r));
  addMesh(ctx, paths.build());

  // Đài phun nước.
  const { x, z, radius } = p.fountain;
  const stone = new THREE.MeshStandardNodeMaterial({ color: '#cfc6b6', roughness: 0.8 });
  const basin = new THREE.Mesh(GEO.cylBase, stone);
  basin.scale.set(radius, 0.6, radius);
  basin.position.set(x, pad, z);
  basin.castShadow = basin.receiveShadow = true;
  addMesh(ctx, basin);
  statics.cylinder(x, pad, z, radius, 0.6);
  const water = reflective(new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.2 }));
  water.colorNode = mix(vec3(0.18, 0.42, 0.5), vec3(0.35, 0.6, 0.66), sin(positionWorld.x.mul(3).add(time.mul(2))).mul(0.5).add(0.5));
  const pool = new THREE.Mesh(GEO.cylBase, water);
  pool.scale.set(radius - 0.35, 0.02, radius - 0.35);
  pool.position.set(x, pad + 0.5, z);
  addMesh(ctx, pool);
  const column = new THREE.Mesh(GEO.cylBase, stone);
  column.scale.set(0.45, 2.4, 0.45);
  column.position.set(x, pad + 0.5, z);
  column.castShadow = true;
  addMesh(ctx, column);
  const bowl = new THREE.Mesh(GEO.cylBase, stone);
  bowl.scale.set(1.3, 0.3, 1.3);
  bowl.position.set(x, pad + 2.6, z);
  bowl.castShadow = true;
  addMesh(ctx, bowl);

  // Ghế đá dọc lối đi.
  const benches = new InstanceBatch(GEO.box, stone, { name: 'benches' });
  const spots: Array<[number, number, number]> = [];
  for (let t = r.x0 + 6; t < r.x1 - 6; t += 9) {
    if (Math.abs(t - x) < radius + 3) continue;
    spots.push([t, centerZ(r) + 2.4, 0], [t, centerZ(r) - 2.4, 0]);
  }
  for (let t = r.z0 + 6; t < r.z1 - 6; t += 9) {
    if (Math.abs(t - z) < radius + 3) continue;
    spots.push([centerX(r) + 2.4, t, Math.PI / 2], [centerX(r) - 2.4, t, Math.PI / 2]);
  }
  for (const [bx, bz, yaw] of spots) {
    benches.add(bx, pad + 0.42, bz, 1.8, 0.1, 0.5, yaw);
    benches.add(bx, pad + 0.2, bz, 0.25, 0.4, 0.4, yaw);
    statics.box(bx, pad + 0.25, bz, yaw === 0 ? 1.8 : 0.5, 0.5, yaw === 0 ? 0.5 : 1.8);
  }
  addMesh(ctx, benches.build());
}

/** Sông: bờ kè đá, lan can, mặt nước gợn, bờ bên kia có hàng cao ốc mờ trong sương, vài chiếc ghe. */
function buildRiver(ctx: BuildContext): void {
  const { layout, statics, rng, pad } = ctx;
  const shore = layout.river.shoreZ;
  const waterY = -1.6;

  const embank = new THREE.Mesh(GEO.box, new THREE.MeshStandardNodeMaterial({ color: '#8f8a80', roughness: 0.95 }));
  embank.scale.set(2200, pad - waterY + 1, 1.2);
  embank.position.set(0, (pad + waterY - 1) / 2, shore + 0.6);
  embank.receiveShadow = true;
  addMesh(ctx, embank);

  const water = reflective(new THREE.MeshStandardNodeMaterial({ roughness: 0.18, metalness: 0.1 }));
  const c0 = new THREE.Color(CITY_COLORS.water);
  const ripple = sin(positionWorld.x.mul(0.35).add(positionWorld.z.mul(0.6)).add(time.mul(0.9)))
    .mul(sin(positionWorld.x.mul(0.9).sub(time.mul(0.6))))
    .mul(0.5)
    .add(0.5);
  water.colorNode = mix(vec3(c0.r, c0.g, c0.b), vec3(c0.r * 1.5, c0.g * 1.45, c0.b * 1.4), ripple.mul(0.6));
  const river = new THREE.Mesh(GEO.box, water);
  river.scale.set(2400, 0.2, 900);
  river.position.set(0, waterY - 0.1, shore + 450);
  river.receiveShadow = true;
  river.name = 'river';
  addMesh(ctx, river);
  // Đáy sông + lan can là vật cản: không cho rơi xuống nước. Va chạm lan can cao 2,5 m (vô hình phía trên lan can
  // 1,1 m): nhảy (cao ~1,1 m) + tự bước lên bậc của bộ điều khiển nhân vật từng đưa được người qua lan can xuống sông.
  statics.box(0, waterY - 2, shore + 450, 2400, 1, 900);
  statics.box(0, pad + 1.25, shore - 0.2, 2400, 2.5, 0.4);

  // Lan can bờ kè.
  const railMat = reflective(new THREE.MeshStandardNodeMaterial({ color: '#2d4d3a', roughness: 0.5, metalness: 0.4 }));
  const rails = new InstanceBatch(GEO.box, railMat, { name: 'river-railing' });
  const span = layout.river.promenade;
  for (let x = span.x0; x <= span.x1; x += 2.4) rails.add(x, pad + 0.55, shore - 0.15, 0.08, 1.1, 0.08);
  rails.add(0, pad + 1.08, shore - 0.15, span.x1 - span.x0, 0.07, 0.1);
  rails.add(0, pad + 0.6, shore - 0.15, span.x1 - span.x0, 0.04, 0.05);
  addMesh(ctx, rails.build());

  // Đèn đôi ven sông.
  const lampPost = new InstanceBatch(GEO.cylBase, railMat, { name: 'river-lamps' });
  const globeMat = new THREE.MeshStandardNodeMaterial({ color: '#fff7e0' });
  globeMat.emissiveNode = vec3(1.0, 0.9, 0.7).mul(mix(float(0.2), float(7), nightUniform));
  const lampGlobe = new InstanceBatch(GEO.blob, globeMat, {
    name: 'river-lamp-globes',
    castShadow: false,
  });
  for (let x = span.x0 + 6; x < span.x1; x += 18) {
    lampPost.add(x, pad, shore - 1.2, 0.07, 4.2, 0.07);
    lampGlobe.add(x - 0.45, pad + 4.1, shore - 1.2, 0.22, 0.22, 0.22);
    lampGlobe.add(x + 0.45, pad + 4.1, shore - 1.2, 0.22, 0.22, 0.22);
    ctx.lamps.push(new THREE.Vector3(x, pad + 4.1, shore - 1.2));
    statics.cylinder(x, pad, shore - 1.2, 0.1, 4.2);
  }
  addMesh(ctx, lampPost.build());
  addMesh(ctx, lampGlobe.build());

  // Bờ bên kia: dải đất + đường chân trời cao ốc.
  const farZ = shore + 380;
  const land = new THREE.Mesh(GEO.box, new THREE.MeshStandardNodeMaterial({ color: '#6f7d62', roughness: 1 }));
  land.scale.set(2400, 3, 300);
  land.position.set(0, waterY + 1, farZ + 150);
  addMesh(ctx, land);
  const skyline = new InstanceBatch(GEO.box, createFacadeMaterial(), {
    castShadow: false,
    name: 'skyline',
    attributes: { aSize: 3, aColor: 3, aInfo: 4, aBase: 1 },
  });
  const tint = new THREE.Color();
  for (let x = -900; x < 900; x += range(rng, 14, 40)) {
    const tall = Math.abs(x) < 300 && rng() < 0.5;
    const h = tall ? range(rng, 45, 120) : range(rng, 12, 40);
    const w = range(rng, 12, 30);
    const d = range(rng, 12, 28);
    tint.set(['#8fa3b5', '#a9b6c2', '#7d90a3', '#c2c8cd', '#93a8a0', '#d8cdb8'][Math.floor(rng() * 6)] as string);
    skyline.add(x, waterY + 2.5 + h / 2, farZ + range(rng, 10, 120), w, h, d, 0, undefined, {
      aSize: [w, h, d],
      aColor: [tint.r, tint.g, tint.b],
      aInfo: [3, rng(), 2, 2],
    });
  }
  addMesh(ctx, skyline.build());

  // Vài chiếc ghe neo giữa sông.
  const hullMat = new THREE.MeshStandardNodeMaterial({ color: '#5a3e2b', roughness: 0.8 });
  const cabinMat = new THREE.MeshStandardNodeMaterial({ color: '#2f6d8c', roughness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const bx = range(rng, -250, 250);
    const bz = shore + range(rng, 30, 160);
    const yaw = range(rng, -0.4, 0.4) + Math.PI / 2;
    const hull = new THREE.Mesh(GEO.box, hullMat);
    hull.scale.set(3.2, 1.1, 11);
    hull.position.set(bx, waterY + 0.3, bz);
    hull.rotation.y = yaw;
    hull.castShadow = true;
    addMesh(ctx, hull);
    const cabin = new THREE.Mesh(GEO.box, cabinMat);
    cabin.scale.set(2.6, 1.6, 4);
    cabin.position.set(bx, waterY + 1.6, bz);
    cabin.rotation.y = yaw;
    cabin.translateZ(-1.5);
    cabin.castShadow = true;
    addMesh(ctx, cabin);
  }
}

/** Tường vô hình quanh vùng chơi. */
function buildBounds(ctx: BuildContext): void {
  const a: Rect = ctx.layout.playArea;
  const h = 6;
  const t = 2;
  ctx.statics.box((a.x0 + a.x1) / 2, h / 2, a.z0 - t / 2, a.x1 - a.x0 + 2 * t, h, t);
  ctx.statics.box(a.x0 - t / 2, h / 2, (a.z0 + a.z1) / 2, t, h, a.z1 - a.z0 + 2 * t);
  ctx.statics.box(a.x1 + t / 2, h / 2, (a.z0 + a.z1) / 2, t, h, a.z1 - a.z0 + 2 * t);
}

export function buildLandmarks(ctx: BuildContext): void {
  buildMarket(ctx);
  buildPark(ctx);
  buildRiver(ctx);
  buildBounds(ctx);
}
