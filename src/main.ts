import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FixedStepAccumulator } from '@/core/fixedStep';
import { Input } from '@/core/input';
import { createPhysics } from '@/physics/physics';
import { createRenderer } from '@/render/renderer';
import { buildSandbox } from '@/world/sandbox';
import { Hud } from '@/ui/hud';
import type { DebugInfo } from '@/debug';

async function main(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;

  const [{ renderer, backend }, physics] = await Promise.all([createRenderer(app), createPhysics()]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 400);
  // Đứng giữa lòng đường nhìn dọc phố (nhà bắt đầu từ |z| > 9 m).
  camera.position.set(-26, 9, 4);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.minDistance = 4;
  controls.maxDistance = 60;
  controls.update();

  const sandbox = buildSandbox(scene, physics);
  const input = new Input();
  const hud = new Hud(hudRoot, backend);
  const stepper = new FixedStepAccumulator(1 / 60, 5);
  const timer = new THREE.Timer();

  const debug: DebugInfo = {
    ready: false,
    backend,
    frames: 0,
    physicsSteps: 0,
    crateHeights: () => sandbox.crates.map((c) => c.position.y),
  };
  window.__HEM__ = debug;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();

    if (input.wasPressed('Space')) sandbox.dropCrate();
    if (input.wasPressed('KeyR')) sandbox.respawnCrates();

    const steps = stepper.advance(dt);
    for (let i = 0; i < steps; i++) physics.step();
    debug.physicsSteps += steps;
    physics.syncMeshes();

    controls.update();
    renderer.render(scene, camera);
    hud.update(dt);
    input.endFrame();
    debug.frames++;
  });

  loading.classList.add('done');
  debug.ready = true;
  console.info(`[HẺM] sẵn sàng · render ${backend}`);
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('error');
    loading.textContent = `Không khởi động được game: ${err instanceof Error ? err.message : String(err)}`;
  }
});
