import * as THREE from 'three/webgpu';
import { range } from '@/core/random';
import { rect, type Rect } from '@/core/rect';
import { InstanceBatch } from '@/render/instancing';
import type { Road } from '../layout';
import { createAsphaltMaterial, createConcreteMaterial, createPavementMaterial } from '../materials';
import { CITY_COLORS } from '../palette';
import { addMesh, GEO, type BuildContext } from './context';

/** Trừ các khoảng `cuts` khỏi [a, b], trả về các đoạn còn lại. */
export function subtractIntervals(a: number, b: number, cuts: Array<[number, number]>): Array<[number, number]> {
  let parts: Array<[number, number]> = [[a, b]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [p0, p1] of parts) {
      if (c1 <= p0 || c0 >= p1) {
        next.push([p0, p1]);
        continue;
      }
      if (c0 > p0) next.push([p0, c0]);
      if (c1 < p1) next.push([c1, p1]);
    }
    parts = next;
  }
  return parts.filter(([p0, p1]) => p1 - p0 > 0.05);
}

/** Các đoạn của một con đường nằm giữa các giao lộ. `endsAtCrossing` cho biết đầu đoạn có giáp giao lộ không. */
export function roadSegments(road: Road, roads: Road[]): Array<{ a: number; b: number; aCross: boolean; bCross: boolean }> {
  const along0 = road.axis === 'x' ? road.rect.x0 : road.rect.z0;
  const along1 = road.axis === 'x' ? road.rect.x1 : road.rect.z1;
  const cuts: Array<[number, number]> = roads
    .filter((r) => r.axis !== road.axis)
    .filter((r) => (road.axis === 'x' ? r.rect.z0 <= road.pos && r.rect.z1 >= road.pos : r.rect.x0 <= road.pos && r.rect.x1 >= road.pos))
    .map((r) => [r.pos - r.width / 2, r.pos + r.width / 2]);
  return subtractIntervals(along0, along1, cuts).map(([a, b]) => ({
    a,
    b,
    aCross: cuts.some(([, c1]) => Math.abs(c1 - a) < 0.01),
    bCross: cuts.some(([c0]) => Math.abs(c0 - b) < 0.01),
  }));
}

export function buildGround(ctx: BuildContext): void {
  const { layout, statics, rng, pad } = ctx;
  const shore = layout.river.shoreZ;

  // Mặt đất (nhựa đường) — chừa phần sông.
  const asphalt = createAsphaltMaterial(CITY_COLORS.asphalt);
  const groundRect = rect(-1100, -1100, 1100, shore);
  const ground = new THREE.Mesh(GEO.box, asphalt);
  ground.scale.set(groundRect.x1 - groundRect.x0, 1, groundRect.z1 - groundRect.z0);
  ground.position.set((groundRect.x0 + groundRect.x1) / 2, -0.5, (groundRect.z0 + groundRect.z1) / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  addMesh(ctx, ground);
  statics.box(ground.position.x, -0.5, ground.position.z, ground.scale.x, 1, ground.scale.z);

  // ---- Nền block (vỉa hè + đất trong block), cao `pad` ---------------------------------------------------
  const pavement = createPavementMaterial(CITY_COLORS.sidewalk);
  const pads = new InstanceBatch(GEO.box, pavement, { castShadow: false, name: 'pads' });
  const addPad = (r: Rect): void => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    if (w <= 0.05 || d <= 0.05) return;
    pads.add((r.x0 + r.x1) / 2, pad / 2, (r.z0 + r.z1) / 2, w, pad, d);
    statics.box((r.x0 + r.x1) / 2, pad / 2, (r.z0 + r.z1) / 2, w, pad, d);
  };
  for (const b of layout.blocks) addPad(b.rect);

  // Nền ngoài viền khu (vỉa hè + sân sau dãy nhà viền) — tránh đè lên đường.
  const roadsZ = layout.roads.filter((r) => r.axis === 'z');
  const roadsX = layout.roads.filter((r) => r.axis === 'x');
  const edgeB = roadsX[0] as Road;
  const edgeT = roadsX[roadsX.length - 1] as Road;
  const edgeL = roadsZ[0] as Road;
  const edgeR = roadsZ[roadsZ.length - 1] as Road;
  const outerDepth = 70;
  const cutsX: Array<[number, number]> = roadsZ.map((r) => [r.rect.x0, r.rect.x1]);
  for (const [a, b] of subtractIntervals(-1000, 1000, cutsX)) addPad(rect(a, edgeB.rect.z0 - outerDepth, b, edgeB.rect.z0));
  addPad(rect(edgeL.rect.x0 - outerDepth, edgeB.rect.z1, edgeL.rect.x0, edgeT.rect.z0));
  addPad(rect(edgeR.rect.x1, edgeB.rect.z1, edgeR.rect.x1 + outerDepth, edgeT.rect.z0));
  // Bờ kè đi dạo ven sông.
  addPad(layout.river.promenade);
  addMesh(ctx, pads.build());

  // ---- Bó vỉa (đá viền) — chừa miệng hẻm ----------------------------------------------------------------
  const curbMat = new THREE.MeshStandardNodeMaterial({ color: CITY_COLORS.curb, roughness: 0.85 });
  const curbs = new InstanceBatch(GEO.box, curbMat, { castShadow: false, name: 'curbs' });
  const cw = 0.28;
  const ch = pad + 0.02;
  for (const b of layout.blocks) {
    const r = b.rect;
    const hems = layout.hems.filter((h) => h.blockId === b.id);
    const edges: Array<{ axis: 'x' | 'z'; line: number; a: number; b: number; inward: number }> = [
      { axis: 'x', line: r.z0, a: r.x0, b: r.x1, inward: 1 },
      { axis: 'x', line: r.z1, a: r.x0, b: r.x1, inward: -1 },
      { axis: 'z', line: r.x0, a: r.z0, b: r.z1, inward: 1 },
      { axis: 'z', line: r.x1, a: r.z0, b: r.z1, inward: -1 },
    ];
    for (const e of edges) {
      const cuts: Array<[number, number]> = hems
        .filter((h) => (e.axis === 'x' ? h.rect.z0 <= e.line + 0.01 && h.rect.z1 >= e.line - 0.01 : h.rect.x0 <= e.line + 0.01 && h.rect.x1 >= e.line - 0.01))
        .map((h) => (e.axis === 'x' ? [h.rect.x0, h.rect.x1] : [h.rect.z0, h.rect.z1]));
      for (const [s0, s1] of subtractIntervals(e.a, e.b, cuts)) {
        const mid = (s0 + s1) / 2;
        const off = e.line + (e.inward * cw) / 2;
        if (e.axis === 'x') curbs.add(mid, ch / 2, off, s1 - s0, ch, cw);
        else curbs.add(off, ch / 2, mid, cw, ch, s1 - s0);
      }
    }
  }
  addMesh(ctx, curbs.build());

  // ---- Mặt hẻm (bê tông, sẫm và loang hơn vỉa hè) ---------------------------------------------------------
  const hemMat = createConcreteMaterial(CITY_COLORS.hem);
  const hemBranchMat = createConcreteMaterial(CITY_COLORS.hemBranch);
  const hemMain = new InstanceBatch(GEO.box, hemMat, { castShadow: false, name: 'hem-main' });
  const hemBranch = new InstanceBatch(GEO.box, hemBranchMat, { castShadow: false, name: 'hem-branch' });
  for (const h of layout.hems) {
    const batch = h.kind === 'main' ? hemMain : hemBranch;
    const t = h.kind === 'main' ? 0.012 : 0.008; // hẻm nhánh thấp hơn chút để không giành mặt với hẻm chính
    batch.add((h.rect.x0 + h.rect.x1) / 2, pad + t / 2, (h.rect.z0 + h.rect.z1) / 2, h.rect.x1 - h.rect.x0, t, h.rect.z1 - h.rect.z0);
  }
  addMesh(ctx, hemMain.build());
  addMesh(ctx, hemBranch.build());

  // ---- Vạch sơn, vạch qua đường, dải phân cách đại lộ -------------------------------------------------------
  const paint = new THREE.MeshStandardNodeMaterial({ roughness: 0.55 });
  const marks = new InstanceBatch(GEO.box, paint, { castShadow: false, colors: true, name: 'road-marks' });
  const medianMat = new THREE.MeshStandardNodeMaterial({ color: CITY_COLORS.curb, roughness: 0.85 });
  const medians = new InstanceBatch(GEO.box, medianMat, { name: 'medians' });
  const grassMat = new THREE.MeshStandardNodeMaterial({ color: CITY_COLORS.grass, roughness: 1 });
  const medianGrass = new InstanceBatch(GEO.box, grassMat, { castShadow: false, name: 'median-grass' });
  const shrubMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, flatShading: true });
  const shrubs = new InstanceBatch(GEO.blob, shrubMat, { colors: true, name: 'shrubs' });

  const paintY = 0.006;
  const white = CITY_COLORS.paintWhite;
  const yellow = CITY_COLORS.paintYellow;
  const put = (road: Road, along: number, across: number, lenAlong: number, lenAcross: number, color: string, h = 0.012, y = paintY): void => {
    if (road.axis === 'x') marks.add(along, y, road.pos + across, lenAlong, h, lenAcross, 0, color);
    else marks.add(road.pos + across, y, along, lenAcross, h, lenAlong, 0, color);
  };

  for (const road of layout.roads) {
    for (const seg of roadSegments(road, layout.roads)) {
      const hw = road.width / 2;
      const inset = 6;
      const a = seg.a + (seg.aCross ? inset : 0);
      const b = seg.b - (seg.bCross ? inset : 0);
      if (b - a < 2) continue;

      if (road.kind === 'avenue') {
        // Dải phân cách giữa: bó vỉa + cỏ + bụi cây.
        const mw = 1.8;
        const mid = (a + b) / 2;
        const len = b - a;
        if (road.axis === 'x') {
          medians.add(mid, 0.11, road.pos, len, 0.22, mw);
          medianGrass.add(mid, 0.225, road.pos, len - 0.3, 0.01, mw - 0.3);
        } else {
          medians.add(road.pos, 0.11, mid, mw, 0.22, len);
          medianGrass.add(road.pos, 0.225, mid, mw - 0.3, 0.01, len - 0.3);
        }
        statics.box(road.axis === 'x' ? mid : road.pos, 0.11, road.axis === 'x' ? road.pos : mid, road.axis === 'x' ? len : mw, 0.22, road.axis === 'x' ? mw : len);
        for (let t = a + 1.5; t < b - 1.5; t += range(rng, 2.2, 3.2)) {
          const s = range(rng, 0.35, 0.6);
          const g = ['#3f7a35', '#4d8a3a', '#356b2e', '#5a9440'][Math.floor(rng() * 4)] as string;
          if (road.axis === 'x') shrubs.add(t, 0.25 + s * 0.6, road.pos + range(rng, -0.3, 0.3), s, s * 0.8, s, rng() * 6, g);
          else shrubs.add(road.pos + range(rng, -0.3, 0.3), 0.25 + s * 0.6, t, s, s * 0.8, s, rng() * 6, g);
        }
        // Vạch phân làn nét đứt mỗi chiều.
        const laneOff = 0.9 + (hw - 0.9) / 2;
        for (const side of [-1, 1]) {
          for (let t = a; t < b - 3; t += 9) put(road, t + 1.5, side * laneOff, 3, 0.15, white);
          put(road, (a + b) / 2, side * (hw - 0.45), b - a, 0.12, white); // vạch mép
        }
      } else {
        // Tim đường nét đứt (vàng ở đường thường, trắng ở đường viền).
        const c = road.kind === 'street' ? yellow : white;
        for (let t = a; t < b - 3; t += 7) put(road, t + 1.5, 0, 3, 0.14, c);
      }

      // Vạch người đi bộ + vạch dừng ở hai đầu giáp giao lộ.
      for (const [end, dir] of [
        [seg.aCross ? seg.a : NaN, 1],
        [seg.bCross ? seg.b : NaN, -1],
      ] as const) {
        if (Number.isNaN(end)) continue;
        const z0 = end + dir * 1.2;
        const zc = z0 + dir * 1.6;
        for (let across = -hw + 0.9; across < hw - 0.6; across += 1.0) put(road, zc, across + 0.25, 3, 0.5, white);
        // Vạch dừng cho làn xe đi vào giao lộ (đi bên phải: hướng +x ở phía +z, hướng +z ở phía -x).
        put(road, z0 + dir * 4.0, ((-dir * hw) / 2) * (road.axis === 'x' ? 1 : -1), 0.35, hw - 0.4, white);
      }
    }
  }
  addMesh(ctx, marks.build());
  addMesh(ctx, medians.build());
  addMesh(ctx, medianGrass.build());
  addMesh(ctx, shrubs.build());
}
