import { createRng, range } from '@/core/random';
import { centerX, centerZ, depth, inset, rect, width, type Rect } from '@/core/rect';

/**
 * Bộ sinh BỐ CỤC khu phố (thuần dữ liệu, không đụng tới three/Rapier để unit test được).
 *
 * Mô hình: lưới đường lớn chia khu thành các "block". Mỗi block có vỉa hè quanh viền, một hẻm chính chạy dọc
 * cạnh dài, các "siệc" (hẻm nhánh) cắt ngang ra đường, và các dãy nhà ống: dãy mặt tiền nhìn ra đường, dãy trong
 * nhìn ra hẻm. Một block làm chợ (mốc), một block làm công viên. Phía +Z là bờ sông.
 */

export type Dir = '+x' | '-x' | '+z' | '-z';
export type RoadKind = 'avenue' | 'street' | 'edge';
export type Frontage = RoadKind | 'hem';

export interface Road {
  id: number;
  /** 'x' = chạy dọc trục X (z cố định); 'z' = chạy dọc trục Z (x cố định). */
  axis: 'x' | 'z';
  pos: number;
  width: number;
  kind: RoadKind;
  name: string;
  rect: Rect;
}

export interface BlockSides<T> {
  minX: T;
  maxX: T;
  minZ: T;
  maxZ: T;
}

export interface Block {
  id: number;
  kind: 'houses' | 'market' | 'park';
  /** Toàn bộ block, gồm vỉa hè (mặt nền cao 15 cm). */
  rect: Rect;
  /** Phần đất xây dựng bên trong vỉa hè. */
  inner: Rect;
  roads: BlockSides<RoadKind>;
  sidewalk: BlockSides<number>;
}

export interface Hem {
  id: number;
  blockId: number;
  kind: 'main' | 'branch';
  axis: 'x' | 'z';
  width: number;
  /** Hẻm cụt: không thông ra đường lớn. */
  deadEnd: boolean;
  rect: Rect;
}

export interface Lot {
  id: number;
  /** -1 cho dãy nhà viền ngoài khu. */
  blockId: number;
  rect: Rect;
  floors: number;
  height: number;
  front: Dir;
  frontage: Frontage;
  /** Dãy mặt tiền (nhìn ra đường) hay dãy trong (nhìn ra hẻm). */
  row: 'front' | 'back' | 'outer';
  kind: 'house' | 'shophouse' | 'tower';
  colorIndex: number;
  seed: number;
}

export interface Pole {
  x: number;
  z: number;
  height: number;
  /** Hướng tuyến dây chạy qua cột (xà ngang đặt vuông góc). */
  axis: 'x' | 'z';
  /** Cột trên đại lộ có cần đèn đường. */
  lamp: boolean;
}

export interface Wire {
  a: readonly [number, number, number];
  b: readonly [number, number, number];
  /** Độ võng giữa nhịp (m). */
  sag: number;
}

export interface Tree {
  x: number;
  z: number;
  height: number;
  canopy: number;
  kind: 'street' | 'tall' | 'park';
}

export interface ParkedBike {
  x: number;
  z: number;
  yaw: number;
  colorIndex: number;
}

export interface Market {
  blockId: number;
  rect: Rect;
  hall: Rect;
  tower: Rect;
  front: Dir;
}

export interface Park {
  blockId: number;
  rect: Rect;
  fountain: { x: number; z: number; radius: number };
}

export interface River {
  /** Mép bờ kè (z), nước bắt đầu từ đây về phía +Z. */
  shoreZ: number;
  promenade: Rect;
}

export interface CityLayout {
  seed: number;
  /** Ranh giới tính theo tim đường viền. */
  bounds: Rect;
  /** Ranh giới đi lại được (tường vô hình). */
  playArea: Rect;
  roads: Road[];
  blocks: Block[];
  hems: Hem[];
  lots: Lot[];
  poles: Pole[];
  wires: Wire[];
  trees: Tree[];
  bikes: ParkedBike[];
  market: Market;
  park: Park;
  river: River;
  spawn: { x: number; z: number; yaw: number };
}

export interface CityOptions {
  seed: number;
  /** Kích thước khu theo trục X và Z (tim đường viền tới tim đường viền). */
  sizeX: number;
  sizeZ: number;
  facadeColors: number;
  bikeColors: number;
}

export const DEFAULT_CITY: CityOptions = { seed: 2026, sizeX: 520, sizeZ: 440, facadeColors: 12, bikeColors: 8 };

export const FLOOR_HEIGHT = 3.2;
export const PARAPET = 0.7;
export const PAD_HEIGHT = 0.15;

const ROAD_WIDTH: Record<RoadKind, number> = { avenue: 20, street: 11, edge: 11 };
const SIDEWALK_WIDTH: Record<RoadKind, number> = { avenue: 5, street: 3.5, edge: 3.5 };
const MAIN_HEM_WIDTH = 3.4;
const BRANCH_HEM_WIDTH = 2.4;
const ROAD_OVERHANG = 60; // đường kéo dài ra ngoài khu để không bị "cụt" giữa trời
const OUTER_ROW_DEPTH = 16;
const PROMENADE_WIDTH = 12;

const AVENUE_NAMES = ['Đại lộ Hoa Sứ', 'Đại lộ Sao Đen'];
const STREET_NAMES = [
  'Đường Me Xanh', 'Đường Bàng Lăng', 'Đường Phượng Vĩ', 'Đường Hoa Giấy', 'Đường Điệp Vàng', 'Đường Lộc Vừng',
  'Đường Cẩm Tú', 'Đường Ngọc Lan', 'Đường Hoa Sữa', 'Đường Bông Gòn', 'Đường Hoàng Yến', 'Đường Mai Chiếu Thủy',
];

/** Chia đoạn [a, b] thành n khoảng gần đều, có rung lắc nhẹ (trừ hai đầu). */
function splitLine(rng: () => number, a: number, b: number, n: number, jitter: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = a + ((b - a) * i) / n;
    out.push(i === 0 || i === n ? t : t + range(rng, -jitter, jitter));
  }
  return out;
}

function floorsFor(rng: () => number, frontage: Frontage): { floors: number; kind: Lot['kind'] } {
  const r = rng();
  switch (frontage) {
    case 'avenue':
      if (r < 0.07) return { floors: 10 + Math.floor(rng() * 9), kind: 'tower' };
      return { floors: 3 + Math.floor(rng() * 5), kind: r < 0.25 ? 'shophouse' : 'house' };
    case 'street':
    case 'edge':
      return { floors: 2 + Math.floor(rng() * 4), kind: r < 0.15 ? 'shophouse' : 'house' };
    case 'hem':
      return { floors: 1 + Math.floor(rng() * 4), kind: 'house' };
  }
}

/** Hướng mặt tiền tính từ cạnh của block mà dãy nhà quay ra. */
function dirOf(axis: 'x' | 'z', side: 'min' | 'max'): Dir {
  if (axis === 'x') return side === 'min' ? '-x' : '+x';
  return side === 'min' ? '-z' : '+z';
}

/**
 * Xếp một dãy lô dọc trục `along` trong khoảng [start, end], bỏ qua các khoảng `gaps` (siệc hẻm).
 * `cross0..cross1` là bề sâu dãy theo trục còn lại.
 */
function layRow(
  rng: () => number,
  along: 'x' | 'z',
  start: number,
  end: number,
  cross0: number,
  cross1: number,
  gaps: Array<[number, number]>,
  frontage: Frontage,
  front: Dir,
  row: Lot['row'],
  blockId: number,
  facadeColors: number,
  out: Lot[],
): void {
  const segments: Array<[number, number]> = [];
  let cursor = start;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > cursor) segments.push([cursor, Math.min(g0, end)]);
    cursor = Math.max(cursor, g1);
  }
  if (cursor < end) segments.push([cursor, end]);

  for (const [s0, s1] of segments) {
    let a = s0;
    while (s1 - a > 0.5) {
      const remaining = s1 - a;
      let w = frontage === 'avenue' && rng() < 0.15 ? range(rng, 8, 12) : range(rng, 3.8, 6.2);
      // Lô cuối: gộp phần dư cho khỏi sinh nhà quá hẹp.
      if (remaining - w < 3.2) w = remaining;
      if (w < 2.4) break;
      const b = a + w;
      const r = along === 'x' ? rect(a, cross0, b, cross1) : rect(cross0, a, cross1, b);
      const { floors, kind } = floorsFor(rng, frontage);
      const tower = kind === 'tower';
      out.push({
        id: out.length,
        blockId,
        rect: r,
        floors,
        height: floors * FLOOR_HEIGHT + (tower ? 1.2 : PARAPET),
        front,
        frontage,
        row,
        kind,
        colorIndex: Math.floor(rng() * facadeColors),
        seed: Math.floor(rng() * 1e9),
      });
      a = b;
    }
  }
}

export function generateCity(options: Partial<CityOptions> = {}): CityLayout {
  const opt: CityOptions = { ...DEFAULT_CITY, ...options };
  const rng = createRng(opt.seed);
  const hx = opt.sizeX / 2;
  const hz = opt.sizeZ / 2;
  const bounds = rect(-hx, -hz, hx, hz);

  // ---- Đường ----------------------------------------------------------------------------------------------
  const nx = Math.max(2, Math.round(opt.sizeX / 105));
  const nz = Math.max(2, Math.round(opt.sizeZ / 95));
  const xs = splitLine(rng, -hx, hx, nx, 8); // tim các đường chạy dọc Z
  const zs = splitLine(rng, -hz, hz, nz, 7); // tim các đường chạy dọc X
  // Đại lộ: đường gần tâm nhất của mỗi hướng.
  const avenueXi = xs.slice(1, -1).reduce((best, v, i) => (Math.abs(v) < Math.abs(xs[best + 1] ?? Infinity) ? i : best), 0) + 1;
  const avenueZi = zs.slice(1, -1).reduce((best, v, i) => (Math.abs(v) < Math.abs(zs[best + 1] ?? Infinity) ? i : best), 0) + 1;

  const roads: Road[] = [];
  const streetNames = [...STREET_NAMES];
  const roadKind = (i: number, n: number, avenueI: number): RoadKind => (i === 0 || i === n ? 'edge' : i === avenueI ? 'avenue' : 'street');
  const nameFor = (kind: RoadKind, idx: number): string =>
    kind === 'avenue' ? (AVENUE_NAMES[idx % AVENUE_NAMES.length] as string) : (streetNames.shift() ?? `Đường số ${idx + 1}`);

  const roadsZ: Road[] = xs.map((x, i) => {
    const kind = roadKind(i, nx, avenueXi);
    const w = ROAD_WIDTH[kind];
    return { id: 0, axis: 'z', pos: x, width: w, kind, name: nameFor(kind, 0), rect: rect(x - w / 2, -hz - ROAD_OVERHANG, x + w / 2, hz + w / 2) };
  });
  const roadsX: Road[] = zs.map((z, i) => {
    const kind = roadKind(i, nz, avenueZi);
    const w = ROAD_WIDTH[kind];
    return { id: 0, axis: 'x', pos: z, width: w, kind, name: nameFor(kind, 1), rect: rect(-hx - ROAD_OVERHANG, z - w / 2, hx + ROAD_OVERHANG, z + w / 2) };
  });
  for (const r of [...roadsZ, ...roadsX]) roads.push({ ...r, id: roads.length });

  // ---- Block ----------------------------------------------------------------------------------------------
  const blocks: Block[] = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const L = roadsZ[i] as Road;
      const R = roadsZ[i + 1] as Road;
      const B = roadsX[j] as Road;
      const T = roadsX[j + 1] as Road;
      const full = rect(L.pos + L.width / 2, B.pos + B.width / 2, R.pos - R.width / 2, T.pos - T.width / 2);
      const sidewalk = { minX: SIDEWALK_WIDTH[L.kind], maxX: SIDEWALK_WIDTH[R.kind], minZ: SIDEWALK_WIDTH[B.kind], maxZ: SIDEWALK_WIDTH[T.kind] };
      blocks.push({
        id: blocks.length,
        kind: 'houses',
        rect: full,
        inner: rect(full.x0 + sidewalk.minX, full.z0 + sidewalk.minZ, full.x1 - sidewalk.maxX, full.z1 - sidewalk.maxZ),
        roads: { minX: L.kind, maxX: R.kind, minZ: B.kind, maxZ: T.kind },
        sidewalk,
      });
    }
  }

  // Chợ: block có đại lộ và gần tâm nhất. Công viên: block gần tâm nhất còn lại không kề chợ theo đường chéo.
  const dist = (b: Block): number => Math.hypot(centerX(b.rect), centerZ(b.rect));
  const byCenter = [...blocks].sort((a, b) => dist(a) - dist(b));
  const marketBlock = byCenter.find((b) => Object.values(b.roads).includes('avenue')) ?? (byCenter[0] as Block);
  marketBlock.kind = 'market';
  const parkBlock =
    byCenter.find((b) => b !== marketBlock && Math.abs(centerX(b.rect) - centerX(marketBlock.rect)) > 1 && Math.abs(centerZ(b.rect) - centerZ(marketBlock.rect)) > 1) ??
    (byCenter[1] as Block);
  parkBlock.kind = 'park';

  // ---- Hẻm + nhà ------------------------------------------------------------------------------------------
  const hems: Hem[] = [];
  const lots: Lot[] = [];

  for (const block of blocks) {
    if (block.kind !== 'houses') continue;
    const inner = block.inner;
    const long: 'x' | 'z' = width(inner) >= depth(inner) ? 'x' : 'z';
    const cross: 'x' | 'z' = long === 'x' ? 'z' : 'x';
    const c0 = cross === 'z' ? inner.z0 : inner.x0;
    const c1 = cross === 'z' ? inner.z1 : inner.x1;
    const l0 = long === 'x' ? inner.x0 : inner.z0;
    const l1 = long === 'x' ? inner.x1 : inner.z1;
    const fullL0 = long === 'x' ? block.rect.x0 : block.rect.z0;
    const fullL1 = long === 'x' ? block.rect.x1 : block.rect.z1;
    const fullC0 = cross === 'z' ? block.rect.z0 : block.rect.x0;
    const fullC1 = cross === 'z' ? block.rect.z1 : block.rect.x1;

    // Hẻm chính dọc cạnh dài, cắt xuyên vỉa hè ra hai đường hai đầu.
    const mid = (c0 + c1) / 2 + range(rng, -0.12, 0.12) * (c1 - c0);
    const m0 = mid - MAIN_HEM_WIDTH / 2;
    const m1 = mid + MAIN_HEM_WIDTH / 2;
    const mainRect = long === 'x' ? rect(fullL0, m0, fullL1, m1) : rect(m0, fullL0, m1, fullL1);
    hems.push({ id: hems.length, blockId: block.id, kind: 'main', axis: long, width: MAIN_HEM_WIDTH, deadEnd: false, rect: mainRect });

    const halves: Array<{ side: 'min' | 'max'; edge: number; hemEdge: number; fullEdge: number }> = [
      { side: 'min', edge: c0, hemEdge: m0, fullEdge: fullC0 },
      { side: 'max', edge: c1, hemEdge: m1, fullEdge: fullC1 },
    ];

    for (const half of halves) {
      const H = Math.abs(half.hemEdge - half.edge);
      const sign = half.side === 'min' ? 1 : -1; // hướng từ mép đường vào trong
      const roadSide: RoadKind = (block.roads as unknown as Record<string, RoadKind>)[`${half.side}${cross.toUpperCase()}`] ?? 'street';
      const twoRows = H >= 24;
      const frontDepth = twoRows ? Math.min(range(rng, 12, 16), H - 10) : H;
      const gap = twoRows ? range(rng, 0.8, 2.5) : 0;

      // Siệc hẻm: 1–2 nhánh mỗi nửa, cách hai đầu ít nhất 12 m.
      const gaps: Array<[number, number]> = [];
      const throughGaps: Array<[number, number]> = [];
      const nBranch = (l1 - l0) > 60 ? 1 + Math.floor(rng() * 2) : 1;
      for (let k = 0; k < nBranch; k++) {
        const t = (k + 1) / (nBranch + 1);
        const at = l0 + t * (l1 - l0) + range(rng, -6, 6);
        const g0 = at - BRANCH_HEM_WIDTH / 2;
        const g1 = at + BRANCH_HEM_WIDTH / 2;
        if (g0 < l0 + 12 || g1 > l1 - 12) continue;
        const deadEnd = twoRows && rng() < 0.3;
        // Thông ra đường: kéo tới mép block (xuyên vỉa hè). Cụt: dừng ở lưng dãy mặt tiền.
        const outer = deadEnd ? half.edge + sign * frontDepth : half.fullEdge;
        const cA = Math.min(outer, half.hemEdge);
        const cB = Math.max(outer, half.hemEdge);
        const r = long === 'x' ? rect(g0, cA, g1, cB) : rect(cA, g0, cB, g1);
        hems.push({ id: hems.length, blockId: block.id, kind: 'branch', axis: cross, width: BRANCH_HEM_WIDTH, deadEnd, rect: r });
        gaps.push([g0 - 0.05, g1 + 0.05]);
        if (!deadEnd) throughGaps.push([g0 - 0.05, g1 + 0.05]);
      }

      // Dãy mặt tiền nhìn ra đường.
      const fA = half.edge;
      const fB = half.edge + sign * frontDepth;
      layRow(rng, long, l0, l1, Math.min(fA, fB), Math.max(fA, fB), throughGaps, roadSide, dirOf(cross, half.side), 'front', block.id, opt.facadeColors, lots);

      // Dãy trong nhìn ra hẻm chính.
      if (twoRows) {
        const bA = fB + sign * gap;
        const bB = half.hemEdge;
        const facing: Dir = dirOf(cross, half.side === 'min' ? 'max' : 'min');
        layRow(rng, long, l0, l1, Math.min(bA, bB), Math.max(bA, bB), gaps, 'hem', facing, 'back', block.id, opt.facadeColors, lots);
      }
    }
  }

  // ---- Dãy nhà viền ngoài (3 phía; phía +Z là sông) -----------------------------------------------------
  const edgeL = roadsZ[0] as Road;
  const edgeR = roadsZ[nx] as Road;
  const edgeB = roadsX[0] as Road;
  const edgeT = roadsX[nz] as Road;
  const sw = SIDEWALK_WIDTH.edge;
  {
    const z1 = edgeB.pos - edgeB.width / 2 - sw;
    layRow(rng, 'x', -hx - 40, hx + 40, z1 - OUTER_ROW_DEPTH, z1, [], 'edge', '+z', 'outer', -1, opt.facadeColors, lots);
    const x1 = edgeL.pos - edgeL.width / 2 - sw;
    layRow(rng, 'z', -hz + 2, hz, x1 - OUTER_ROW_DEPTH, x1, [], 'edge', '+x', 'outer', -1, opt.facadeColors, lots);
    const x0 = edgeR.pos + edgeR.width / 2 + sw;
    layRow(rng, 'z', -hz + 2, hz, x0, x0 + OUTER_ROW_DEPTH, [], 'edge', '-x', 'outer', -1, opt.facadeColors, lots);
  }
  // Dãy viền bị kéo dài qua đường viền ngoài: bỏ các lô đè lên đường.
  const roadRects = roads.map((r) => r.rect);
  for (let i = lots.length - 1; i >= 0; i--) {
    const lot = lots[i] as Lot;
    if (lot.row === 'outer' && roadRects.some((rr) => rr.x0 < lot.rect.x1 && lot.rect.x0 < rr.x1 && rr.z0 < lot.rect.z1 && lot.rect.z0 < rr.z1)) {
      lots.splice(i, 1);
    }
  }
  lots.forEach((l, i) => (l.id = i));

  // ---- Chợ + công viên ------------------------------------------------------------------------------------
  const mInner = marketBlock.inner;
  const plaza = 7;
  const hall = inset(mInner, plaza);
  // Mặt tiền chợ quay ra đại lộ.
  const avenueSide = (Object.entries(marketBlock.roads).find(([, k]) => k === 'avenue')?.[0] ?? 'minZ') as keyof BlockSides<RoadKind>;
  const marketFront: Dir = avenueSide === 'minX' ? '-x' : avenueSide === 'maxX' ? '+x' : avenueSide === 'minZ' ? '-z' : '+z';
  const towerSize = 6;
  const tcx = marketFront.endsWith('x') ? (marketFront === '-x' ? hall.x0 : hall.x1) : centerX(hall);
  const tcz = marketFront.endsWith('z') ? (marketFront === '-z' ? hall.z0 : hall.z1) : centerZ(hall);
  const market: Market = {
    blockId: marketBlock.id,
    rect: mInner,
    hall,
    tower: rect(tcx - towerSize / 2, tcz - towerSize / 2, tcx + towerSize / 2, tcz + towerSize / 2),
    front: marketFront,
  };

  const park: Park = {
    blockId: parkBlock.id,
    rect: parkBlock.inner,
    fountain: { x: centerX(parkBlock.inner), z: centerZ(parkBlock.inner), radius: 5 },
  };

  // ---- Bờ sông --------------------------------------------------------------------------------------------
  const promenadeZ0 = edgeT.pos + edgeT.width / 2;
  const river: River = {
    shoreZ: promenadeZ0 + PROMENADE_WIDTH,
    promenade: rect(-hx - ROAD_OVERHANG, promenadeZ0, hx + ROAD_OVERHANG, promenadeZ0 + PROMENADE_WIDTH),
  };

  // ---- Cột điện, dây điện, cây, xe đậu --------------------------------------------------------------------
  const poles: Pole[] = [];
  const wires: Wire[] = [];
  const trees: Tree[] = [];
  const bikes: ParkedBike[] = [];
  const hemMouths = hems.map((h) => h.rect);
  const nearHem = (x: number, z: number, m: number): boolean =>
    hemMouths.some((r) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m);

  const addSpan = (p: Pole, q: Pole, count: number): void => {
    for (let k = 0; k < count; k++) {
      const y0 = p.height - 0.6 - k * 0.28 - range(rng, 0, 0.15);
      const y1 = q.height - 0.6 - k * 0.28 - range(rng, 0, 0.15);
      wires.push({ a: [p.x, y0, p.z], b: [q.x, y1, q.z], sag: range(rng, 0.35, 1.1) + Math.hypot(p.x - q.x, p.z - q.z) * 0.012 });
    }
  };

  // Một "cạnh vỉa hè": đoạn thẳng song song mép đường, đi từ a tới b.
  interface Curb {
    axis: 'x' | 'z';
    line: number;
    inward: 1 | -1;
    a: number;
    b: number;
    road: RoadKind;
    sidewalk: number;
  }
  const curbs: Curb[] = [];
  for (const b of blocks) {
    const r = b.rect;
    curbs.push({ axis: 'x', line: r.z0, inward: 1, a: r.x0, b: r.x1, road: b.roads.minZ, sidewalk: b.sidewalk.minZ });
    curbs.push({ axis: 'x', line: r.z1, inward: -1, a: r.x0, b: r.x1, road: b.roads.maxZ, sidewalk: b.sidewalk.maxZ });
    curbs.push({ axis: 'z', line: r.x0, inward: 1, a: r.z0, b: r.z1, road: b.roads.minX, sidewalk: b.sidewalk.minX });
    curbs.push({ axis: 'z', line: r.x1, inward: -1, a: r.z0, b: r.z1, road: b.roads.maxX, sidewalk: b.sidewalk.maxX });
  }

  const curbPoles = new Map<Curb, Pole[]>();
  for (const c of curbs) {
    const list: Pole[] = [];
    const off = c.line + c.inward * 0.55;
    for (let t = c.a + range(rng, 3, 9); t < c.b - 3; t += range(rng, 24, 32)) {
      const x = c.axis === 'x' ? t : off;
      const z = c.axis === 'x' ? off : t;
      if (nearHem(x, z, 1.2)) continue;
      const p: Pole = { x, z, height: range(rng, 8.2, 9.6), axis: c.axis, lamp: c.road === 'avenue' || rng() < 0.25 };
      poles.push(p);
      list.push(p);
    }
    for (let k = 1; k < list.length; k++) addSpan(list[k - 1] as Pole, list[k] as Pole, 3 + Math.floor(rng() * 4));
    curbPoles.set(c, list);

    // Cây ven đường, tránh cột điện và miệng hẻm.
    const treeOff = c.line + c.inward * Math.min(1.3, c.sidewalk * 0.35);
    for (let t = c.a + range(rng, 4, 8); t < c.b - 4; t += range(rng, 11, 16)) {
      const x = c.axis === 'x' ? t : treeOff;
      const z = c.axis === 'x' ? treeOff : t;
      if (nearHem(x, z, 1.5)) continue;
      if (list.some((p) => Math.hypot(p.x - x, p.z - z) < 2.5)) continue;
      const tall = c.road === 'avenue' && rng() < 0.6;
      trees.push({ x, z, height: tall ? range(rng, 14, 20) : range(rng, 5, 8), canopy: tall ? range(rng, 3.5, 5) : range(rng, 2, 3), kind: tall ? 'tall' : 'street' });
    }
  }

  // Dây điện băng qua đường: nối cột của hai vỉa hè đối diện.
  for (const c of curbs) {
    const mine = curbPoles.get(c) ?? [];
    for (const p of mine) {
      if (rng() > 0.18) continue;
      let best: Pole | undefined;
      let bestD = Infinity;
      for (const [other, list] of curbPoles) {
        if (other === c || other.axis !== c.axis) continue;
        const gapAcross = Math.abs(other.line - c.line);
        if (gapAcross < 5 || gapAcross > 26) continue;
        for (const q of list) {
          const d = Math.hypot(q.x - p.x, q.z - p.z);
          if (d < bestD && d < 30) {
            bestD = d;
            best = q;
          }
        }
      }
      if (best) addSpan(p, best, 2 + Math.floor(rng() * 3));
    }
  }

  // Cột điện trong hẻm chính, so le hai bên, dây chằng chịt.
  for (const h of hems) {
    if (h.kind !== 'main') continue;
    const list: Pole[] = [];
    const along0 = h.axis === 'x' ? h.rect.x0 : h.rect.z0;
    const along1 = h.axis === 'x' ? h.rect.x1 : h.rect.z1;
    const side0 = h.axis === 'x' ? h.rect.z0 : h.rect.x0;
    const side1 = h.axis === 'x' ? h.rect.z1 : h.rect.x1;
    let flip = false;
    for (let t = along0 + 8; t < along1 - 6; t += range(rng, 18, 24)) {
      const s = flip ? side1 - 0.25 : side0 + 0.25;
      flip = !flip;
      const height = range(rng, 7, 8);
      const p: Pole = h.axis === 'x' ? { x: t, z: s, height, axis: 'x', lamp: rng() < 0.5 } : { x: s, z: t, height, axis: 'z', lamp: rng() < 0.5 };
      poles.push(p);
      list.push(p);
    }
    for (let k = 1; k < list.length; k++) addSpan(list[k - 1] as Pole, list[k] as Pole, 4 + Math.floor(rng() * 5));
  }

  // Xe máy đậu trước nhà mặt tiền (đỗ vuông góc, đầu xe quay vào nhà).
  for (const lot of lots) {
    if (lot.row !== 'front' || rng() > 0.45) continue;
    const n = 1 + Math.floor(rng() * 5);
    const along: 'x' | 'z' = lot.front.endsWith('z') ? 'x' : 'z';
    const s = lot.front.startsWith('+') ? 1 : -1;
    const faceLine = along === 'x' ? (s > 0 ? lot.rect.z1 : lot.rect.z0) : s > 0 ? lot.rect.x1 : lot.rect.x0;
    const a0 = along === 'x' ? lot.rect.x0 : lot.rect.z0;
    const a1 = along === 'x' ? lot.rect.x1 : lot.rect.z1;
    const spacing = 0.85;
    const start = (a0 + a1) / 2 - ((n - 1) * spacing) / 2;
    for (let k = 0; k < n; k++) {
      const t = start + k * spacing + range(rng, -0.08, 0.08);
      if (t < a0 + 0.4 || t > a1 - 0.4) continue;
      const off = faceLine + s * range(rng, 1.15, 1.35);
      const x = along === 'x' ? t : off;
      const z = along === 'x' ? off : t;
      if (nearHem(x, z, 0.6)) continue;
      // yaw = 0 ↔ đầu xe hướng +Z. Đầu xe quay vào nhà ⇒ ngược hướng mặt tiền.
      const yawToFront = lot.front === '+z' ? 0 : lot.front === '-z' ? Math.PI : lot.front === '+x' ? Math.PI / 2 : -Math.PI / 2;
      bikes.push({ x, z, yaw: yawToFront + Math.PI + range(rng, -0.12, 0.12), colorIndex: Math.floor(rng() * opt.bikeColors) });
    }
  }

  // Cây công viên (lưới so le, chừa lối đi chữ thập và đài phun nước).
  {
    const r = park.rect;
    for (let x = r.x0 + 5; x < r.x1 - 3; x += 8) {
      for (let z = r.z0 + 5; z < r.z1 - 3; z += 8) {
        const px = x + range(rng, -2, 2);
        const pz = z + range(rng, -2, 2);
        if (Math.abs(px - park.fountain.x) < 4 || Math.abs(pz - park.fountain.z) < 4) continue;
        if (Math.hypot(px - park.fountain.x, pz - park.fountain.z) < park.fountain.radius + 6) continue;
        trees.push({ x: px, z: pz, height: range(rng, 6, 12), canopy: range(rng, 2.5, 4.2), kind: 'park' });
      }
    }
  }

  // ---- Điểm xuất phát: vỉa hè trước chợ, nhìn về phía chợ -------------------------------------------------
  const spawnOff = 3;
  const spawn = (() => {
    switch (market.front) {
      case '-z': return { x: centerX(mInner) + 8, z: marketBlock.rect.z0 + spawnOff, yaw: 0 };
      case '+z': return { x: centerX(mInner) + 8, z: marketBlock.rect.z1 - spawnOff, yaw: Math.PI };
      case '-x': return { x: marketBlock.rect.x0 + spawnOff, z: centerZ(mInner) + 8, yaw: Math.PI / 2 };
      case '+x': return { x: marketBlock.rect.x1 - spawnOff, z: centerZ(mInner) + 8, yaw: -Math.PI / 2 };
    }
  })();

  const playArea = rect(-hx - 18, -hz - 18, hx + 18, river.shoreZ);

  // Dọn cây/xe/cột lỡ rơi vào nhà (phòng hờ khi tham số thay đổi).
  const solid = lots.map((l) => l.rect);
  const inSolid = (x: number, z: number): boolean => solid.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

  return {
    seed: opt.seed,
    bounds,
    playArea,
    roads,
    blocks,
    hems,
    lots,
    poles: poles.filter((p) => !inSolid(p.x, p.z)),
    wires,
    trees: trees.filter((t) => !inSolid(t.x, t.z)),
    bikes: bikes.filter((b) => !inSolid(b.x, b.z)),
    market,
    park,
    river,
    spawn,
  };
}
