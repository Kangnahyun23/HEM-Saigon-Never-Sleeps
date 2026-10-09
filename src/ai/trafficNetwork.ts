import type { CityLayout, Road } from '@/world/city/layout';

/**
 * Mạng làn xe cho giao thông NPC (thuần dữ liệu, không đụng three/Rapier).
 *
 * Đường lớn tạo thành lưới; mỗi giao lộ là một nút, mỗi đoạn đường giữa hai giao lộ kề nhau cho hai làn ngược chiều.
 * Việt Nam đi bên phải: bên phải của hướng (dx, dz) là (−dz, dx). Xe máy không chạy thành hàng một mà dàn ngang cả
 * nửa đường, nên mỗi làn có một DẢI độ lệch [minOffset, maxOffset] tính từ tim đường sang phải.
 */

export interface TrafficNode {
  id: number;
  x: number;
  z: number;
  /** Các làn rời khỏi nút này. */
  out: number[];
}

export interface TrafficLane {
  id: number;
  from: number;
  to: number;
  road: Road;
  /** Hướng chạy (vector đơn vị trên mặt XZ). */
  dx: number;
  dz: number;
  /** Bên phải của hướng chạy. */
  rx: number;
  rz: number;
  /** Điểm tim đường nơi xe bắt đầu / kết thúc phần thẳng (đã chừa lòng giao lộ). */
  x0: number;
  z0: number;
  length: number;
  /** Dải độ lệch ngang hợp lệ (m, dương = sang phải tim đường). */
  minOffset: number;
  maxOffset: number;
  /** Tốc độ chạy thoải mái (m/s). */
  speedLimit: number;
}

export interface TrafficNetwork {
  nodes: TrafficNode[];
  lanes: TrafficLane[];
}

/** Khoảng cách giữ với bó vỉa và dải phân cách. */
const CURB_MARGIN = 0.8;
const AVENUE_MEDIAN_HALF = 0.9;
/** Phần lòng giao lộ chừa thêm ngoài mép đường cắt ngang (vạch dừng, vạch qua đường). */
const JUNCTION_MARGIN = 1.5;

const SPEED_LIMIT: Record<Road['kind'], number> = { avenue: 12.5, street: 10, edge: 10 };

export function buildTrafficNetwork(layout: CityLayout): TrafficNetwork {
  const roadsZ = layout.roads.filter((r) => r.axis === 'z').sort((a, b) => a.pos - b.pos);
  const roadsX = layout.roads.filter((r) => r.axis === 'x').sort((a, b) => a.pos - b.pos);
  const nodes: TrafficNode[] = [];
  const nodeAt = (i: number, j: number): TrafficNode => nodes[i * roadsX.length + j] as TrafficNode;
  for (const rz of roadsZ) for (const rx of roadsX) nodes.push({ id: nodes.length, x: rz.pos, z: rx.pos, out: [] });

  const lanes: TrafficLane[] = [];
  const addLane = (a: TrafficNode, b: TrafficNode, road: Road, trimA: number, trimB: number): void => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const hw = road.width / 2;
    const lane: TrafficLane = {
      id: lanes.length,
      from: a.id,
      to: b.id,
      road,
      dx,
      dz,
      rx: -dz,
      rz: dx,
      x0: a.x + dx * trimA,
      z0: a.z + dz * trimA,
      length: len - trimA - trimB,
      minOffset: road.kind === 'avenue' ? AVENUE_MEDIAN_HALF + CURB_MARGIN : CURB_MARGIN,
      maxOffset: hw - CURB_MARGIN,
      speedLimit: SPEED_LIMIT[road.kind],
    };
    lanes.push(lane);
    a.out.push(lane.id);
  };

  // Đường chạy dọc Z: nối các nút (i, j) → (i, j+1); lòng giao lộ rộng bằng nửa bề ngang đường cắt ngang (dọc X).
  roadsZ.forEach((road, i) => {
    for (let j = 0; j + 1 < roadsX.length; j++) {
      const a = nodeAt(i, j);
      const b = nodeAt(i, j + 1);
      const ta = (roadsX[j] as Road).width / 2 + JUNCTION_MARGIN;
      const tb = (roadsX[j + 1] as Road).width / 2 + JUNCTION_MARGIN;
      addLane(a, b, road, ta, tb);
      addLane(b, a, road, tb, ta);
    }
  });
  roadsX.forEach((road, j) => {
    for (let i = 0; i + 1 < roadsZ.length; i++) {
      const a = nodeAt(i, j);
      const b = nodeAt(i + 1, j);
      const ta = (roadsZ[i] as Road).width / 2 + JUNCTION_MARGIN;
      const tb = (roadsZ[i + 1] as Road).width / 2 + JUNCTION_MARGIN;
      addLane(a, b, road, ta, tb);
      addLane(b, a, road, tb, ta);
    }
  });

  return { nodes, lanes };
}

/** Điểm trên làn ở quãng `s` (m, tính từ đầu phần thẳng) và độ lệch ngang `offset`. */
export function lanePoint(lane: TrafficLane, s: number, offset: number): { x: number; z: number } {
  return { x: lane.x0 + lane.dx * s + lane.rx * offset, z: lane.z0 + lane.dz * s + lane.rz * offset };
}

/** Kiểu rẽ từ làn `a` sang làn `b` (đi bên phải: rẽ phải là đường cua ngắn). */
export function turnKind(a: TrafficLane, b: TrafficLane): 'straight' | 'right' | 'left' | 'uturn' {
  const dot = a.dx * b.dx + a.dz * b.dz;
  if (dot > 0.7) return 'straight';
  if (dot < -0.7) return 'uturn';
  // Hướng mới trùng với bên phải của hướng cũ ⇒ rẽ phải.
  return a.rx * b.dx + a.rz * b.dz > 0 ? 'right' : 'left';
}
