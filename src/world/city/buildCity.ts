import * as THREE from 'three/webgpu';
import { createRng } from '@/core/random';
import { DetailCuller } from '@/render/detailCulling';
import { mergeStaticMeshes } from '@/render/merge';
import type { PhysicsWorld } from '@/physics/physics';
import { StaticWorld } from '@/physics/staticWorld';
import type { PickupSpot } from '@/systems/pickups';
import { buildBuildings } from './build/buildings';
import type { BuildContext, Seat } from './build/context';
import { buildGround } from './build/ground';
import { buildLandmarks } from './build/landmarks';
import { buildLightPools } from './build/lightPools';
import { buildHemLife } from './build/hems';
import { buildNightStreet } from './build/nightStreet';
import { buildStreetProps } from './build/streetProps';
import { generateCity, PAD_HEIGHT, type CityLayout, type CityOptions } from './layout';

export interface City {
  layout: CityLayout;
  group: THREE.Group;
  statics: StaticWorld;
  lamps: THREE.Vector3[];
  /** Ghế quán cóc / chỗ người bán hàng — xem build/context.ts. */
  seats: readonly Seat[];
  /** Đồ nhặt được ngoài phố (ghế nhựa, mũ bảo hiểm). */
  pickups: readonly PickupSpot[];
  stats: { meshes: number; instances: number; colliders: number };
  /** Ẩn / hiện các mảnh chi tiết nhỏ theo khoảng cách tới camera — gọi mỗi khung hình trước khi render. */
  updateDetail(eye: THREE.Vector3): void;
  /** Nhân tầm nhìn chi tiết nhỏ (cài đặt chất lượng: thấp 0,6 … cao 1,25). */
  setDetailScale(scale: number): void;
}

/** Camera đi được ngần này mét thì chọn lại chi tiết nhỏ quanh nó. */
const DETAIL_REFRESH = 6;

/**
 * Tầm nhìn tối đa (m) của các lô chi tiết nhỏ: xa hơn thì chỉ còn vài điểm ảnh (và đã chìm trong sương) nên không vẽ.
 * Khớp theo tiền tố tên lô (InstanceBatch `name`). Lô không có trong bảng (mặt tiền, đường, vỉa hè…) luôn vẽ.
 */
const DETAIL_DISTANCE: Record<string, number> = {
  'balcony-plants': 120,
  stools: 90,
  'ac-units': 120,
  'roof-stuff': 120,
  'cable-coils': 120,
  'pole-hardware': 120,
  'tree-grates': 90,
  'parked-bike-': 110,
  benches: 120,
  railings: 160,
  laundry: 110,
  'sidewalk-': 110,
  'hem-meters': 90,
  'hem-pots': 90,
  'hem-plants': 90,
  'hem-altars': 110,
  'hem-tarps': 140,
  'led-signs': 150,
  'tree-limewash': 120,
  'water-tanks': 180,
  'roof-sheets': 160,
  shrubs: 170,
  umbrellas: 170,
  'umbrella-poles': 140,
  stalls: 170,
  'river-railing': 160,
  canopies: 230,
  'road-marks': 200,
};

function detailDistance(name: string): number | undefined {
  for (const [prefix, d] of Object.entries(DETAIL_DISTANCE)) if (name.startsWith(prefix)) return d;
  return undefined;
}

/** Sinh bố cục rồi dựng toàn bộ khu phố (hình + va chạm). */
export function buildCity(scene: THREE.Scene, physics: PhysicsWorld, options: Partial<CityOptions> = {}): City {
  const layout = generateCity(options);
  const group = new THREE.Group();
  group.name = 'city';
  const statics = new StaticWorld(physics);
  const ctx: BuildContext = { layout, group, statics, rng: createRng(layout.seed + 1), pad: PAD_HEIGHT, lamps: [], shopFronts: [], seats: [], pickups: [] };

  buildGround(ctx);
  buildBuildings(ctx);
  buildStreetProps(ctx);
  buildHemLife(ctx);
  buildLandmarks(ctx);
  buildLightPools(ctx);
  buildNightStreet(ctx);

  // Các khối lẻ của công trình (chợ, tháp đồng hồ, ghe…) cùng vật liệu gộp thành một mesh.
  mergeStaticMeshes(group);

  // Chi tiết nhỏ chỉ vẽ quanh camera (vẫn một lệnh vẽ mỗi lô) — đỡ cả lượt vẽ chính lẫn lượt vẽ bóng đổ.
  const details: Array<{ culler: DetailCuller; base: number }> = [];
  for (const child of group.children) {
    const mesh = child as THREE.InstancedMesh;
    const far = mesh.isInstancedMesh ? detailDistance(mesh.name) : undefined;
    if (far !== undefined) details.push({ culler: new DetailCuller(mesh, far), base: far });
  }
  let lastX = Infinity;
  let lastZ = Infinity;

  // Toàn bộ khu phố là tĩnh: tắt cập nhật ma trận mỗi khung hình.
  group.updateMatrixWorld(true);
  group.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.matrixWorldAutoUpdate = false;
  });
  scene.add(group);

  let meshes = 0;
  let instances = 0;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.LineSegments).isLineSegments) meshes++;
    if ((o as THREE.InstancedMesh).isInstancedMesh) instances += (o as THREE.InstancedMesh).count;
  });
  return {
    layout,
    group,
    statics,
    lamps: ctx.lamps,
    seats: ctx.seats,
    pickups: ctx.pickups,
    stats: { meshes, instances, colliders: statics.colliders },
    updateDetail(eye) {
      if ((eye.x - lastX) ** 2 + (eye.z - lastZ) ** 2 < DETAIL_REFRESH ** 2) return;
      lastX = eye.x;
      lastZ = eye.z;
      for (const d of details) d.culler.update(eye.x, eye.z);
    },
    setDetailScale(scale) {
      for (const d of details) d.culler.distance = d.base * scale;
      lastX = Infinity; // chọn lại ngay ở khung hình sau
    },
  };
}
