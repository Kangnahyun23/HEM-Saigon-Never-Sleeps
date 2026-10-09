import * as THREE from 'three/webgpu';
import { createRng } from '@/core/random';
import type { PhysicsWorld } from '@/physics/physics';
import { StaticWorld } from '@/physics/staticWorld';
import { buildBuildings } from './build/buildings';
import type { BuildContext } from './build/context';
import { buildGround } from './build/ground';
import { buildLandmarks } from './build/landmarks';
import { buildStreetProps } from './build/streetProps';
import { generateCity, PAD_HEIGHT, type CityLayout, type CityOptions } from './layout';

export interface City {
  layout: CityLayout;
  group: THREE.Group;
  statics: StaticWorld;
  lamps: THREE.Vector3[];
  stats: { meshes: number; instances: number; colliders: number };
}

/** Sinh bố cục rồi dựng toàn bộ khu phố (hình + va chạm). */
export function buildCity(scene: THREE.Scene, physics: PhysicsWorld, options: Partial<CityOptions> = {}): City {
  const layout = generateCity(options);
  const group = new THREE.Group();
  group.name = 'city';
  const statics = new StaticWorld(physics);
  const ctx: BuildContext = { layout, group, statics, rng: createRng(layout.seed + 1), pad: PAD_HEIGHT, lamps: [] };

  buildGround(ctx);
  buildBuildings(ctx);
  buildStreetProps(ctx);
  buildLandmarks(ctx);

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
  return { layout, group, statics, lamps: ctx.lamps, stats: { meshes, instances, colliders: statics.colliders } };
}
