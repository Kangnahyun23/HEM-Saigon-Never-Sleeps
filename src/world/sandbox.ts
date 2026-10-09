import * as THREE from 'three/webgpu';
import type { PhysicsWorld } from '@/physics/physics';
import { createRng, pick, range } from '@/core/random';
import { COLORS, FACADE_COLORS } from './palette';

/** Kích thước khu sandbox M0 (mét). */
export const SANDBOX = {
  size: 160,
  roadHalfWidth: 6,
  sidewalkWidth: 3,
  hemHalfWidth: 1.6,
  floorHeight: 3.2,
} as const;

export interface Sandbox {
  crates: THREE.Mesh[];
  respawnCrates(): void;
  dropCrate(): void;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function box(material: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addStaticCollider(physics: PhysicsWorld, sx: number, sy: number, sz: number, x: number, y: number, z: number): void {
  const { RAPIER, world } = physics;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2), body);
}

/**
 * Sandbox M0: một đoạn đường lớn, vỉa hè, hai dãy nhà ống và một con hẻm cắt ngang.
 * Đây là nơi thử vật lý / render, sẽ được thay bằng bộ sinh thành phố ở M1.
 */
export function buildSandbox(scene: THREE.Scene, physics: PhysicsWorld, seed = 2026): Sandbox {
  const rng = createRng(seed);
  const { size, roadHalfWidth, sidewalkWidth, hemHalfWidth, floorHeight } = SANDBOX;

  // Bầu trời hoàng hôn + sương mờ.
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.fog, 60, 170);

  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
  sun.position.set(-40, 45, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera;
  s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 1; s.far = 160;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // Mặt đất.
  const groundMat = new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 1 });
  const ground = box(groundMat, size, 1, size, 0, -0.5, 0);
  ground.castShadow = false;
  scene.add(ground);
  addStaticCollider(physics, size, 1, size, 0, -0.5, 0);

  // Đường lớn + vạch kẻ.
  const asphalt = new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.95 });
  const road = box(asphalt, size, 0.02, roadHalfWidth * 2, 0, 0.01, 0);
  road.castShadow = false;
  scene.add(road);
  const lineMat = new THREE.MeshStandardMaterial({ color: COLORS.laneLine, roughness: 0.6 });
  for (let x = -size / 2 + 2; x < size / 2; x += 6) {
    const dash = box(lineMat, 3, 0.03, 0.18, x, 0.02, 0);
    dash.castShadow = false;
    scene.add(dash);
  }

  // Vỉa hè hai bên (có va chạm, cao 15 cm).
  const curbMat = new THREE.MeshStandardMaterial({ color: COLORS.sidewalk, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const z = side * (roadHalfWidth + sidewalkWidth / 2);
    scene.add(box(curbMat, size, 0.15, sidewalkWidth, 0, 0.075, z));
    addStaticCollider(physics, size, 0.15, sidewalkWidth, 0, 0.075, z);
  }

  // Dãy nhà ống: mặt tiền 4–6 m, sâu 12–16 m, 1–6 tầng; chừa khe hẻm ở x≈0.
  const facadeMats = FACADE_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.9 });
  const awningMats = COLORS.awning.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }));
  const frontZ = roadHalfWidth + sidewalkWidth;

  for (const side of [-1, 1]) {
    for (const rowOffset of [0, 18]) {
      let x = -size / 2 + 4;
      while (x < size / 2 - 4) {
        const width = range(rng, 4, 6);
        const centerX = x + width / 2;
        x += width + 0.05;
        if (Math.abs(centerX) < hemHalfWidth + width / 2) continue; // khe hẻm
        const depth = range(rng, 12, 16);
        const floors = 1 + Math.floor(rng() * 6);
        const height = floors * floorHeight;
        const z = side * (frontZ + rowOffset + depth / 2);
        scene.add(box(pick(rng, facadeMats), width, height, depth, centerX, height / 2, z));
        scene.add(box(roofMat, width + 0.2, 0.3, depth + 0.2, centerX, height + 0.15, z));
        addStaticCollider(physics, width, height, depth, centerX, height / 2, z);
        // Mái hiên tầng trệt hướng ra đường (chỉ dãy mặt tiền).
        if (rowOffset === 0 && rng() < 0.6) {
          const az = side * (frontZ + 0.6);
          const awning = box(pick(rng, awningMats), width * 0.9, 0.12, 1.2, centerX, 2.6, az);
          awning.rotation.x = side * 0.18;
          scene.add(awning);
        }
      }
    }
  }

  // Thùng gỗ động để thử vật lý.
  const crateMat = new THREE.MeshStandardMaterial({ color: COLORS.crate, roughness: 0.8 });
  const crates: THREE.Mesh[] = [];
  const { RAPIER, world } = physics;

  const spawnCrate = (x: number, y: number, z: number): void => {
    const mesh = box(crateMat, 0.8, 0.8, 0.8, x, y, z);
    mesh.name = 'crate';
    scene.add(mesh);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: rng() * 0.3, y: rng() * 0.3, z: 0, w: 1 }),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.4, 0.4, 0.4).setRestitution(0.25).setFriction(0.8), body);
    physics.links.push({ body, mesh });
    crates.push(mesh);
  };

  const respawnCrates = (): void => {
    for (const link of physics.links.splice(0)) {
      world.removeRigidBody(link.body);
      scene.remove(link.mesh);
    }
    crates.length = 0;
    for (let i = 0; i < 12; i++) spawnCrate(range(rng, -8, 8), range(rng, 6, 16), range(rng, -4, 4));
  };

  respawnCrates();

  return {
    crates,
    respawnCrates,
    dropCrate: () => spawnCrate(range(rng, -4, 4), 14, range(rng, -3, 3)),
  };
}
