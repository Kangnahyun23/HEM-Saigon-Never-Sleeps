import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FixedStepAccumulator } from '@/core/fixedStep';
import { createPhysics } from '@/physics/physics';
import { createRenderer } from '@/render/renderer';
import { buildCity } from '@/world/city/buildCity';
import { createEnvironment } from '@/world/environment';
import { Hud } from '@/ui/hud';
import type { DebugInfo } from '@/debug';

async function main(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;

  const [{ renderer, backend }, physics] = await Promise.all([createRenderer(app), createPhysics()]);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2500);
  const env = await createEnvironment(scene, renderer);
  const city = buildCity(scene, physics);
  const { spawn } = city.layout;

  camera.position.set(spawn.x + 30, 25, spawn.z + 30);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(spawn.x, 2, spawn.z);
  controls.enableDamping = true;
  controls.update();

  const hud = new Hud(hudRoot, backend);
  const stepper = new FixedStepAccumulator(1 / 60, 5);
  const timer = new THREE.Timer();

  const debug: DebugInfo = {
    ready: false,
    backend,
    frames: 0,
    physicsSteps: 0,
    stats: { ...city.stats, lots: city.layout.lots.length },
    setCamera(px, py, pz, tx, ty, tz) {
      camera.position.set(px, py, pz);
      controls.target.set(tx, ty, tz);
      controls.update();
    },
  };
  debug.layout = city.layout;
  window.__HEM__ = debug;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = timer.getDelta();
    const steps = stepper.advance(dt);
    for (let i = 0; i < steps; i++) physics.step();
    debug.physicsSteps += steps;
    controls.update();
    env.update(controls.target);
    renderer.render(scene, camera);
    hud.update(dt);
    debug.frames++;
  });

  loading.classList.add('done');
  debug.ready = true;
  console.info(`[HẺM] sẵn sàng · render ${backend} · ${city.stats.meshes} mesh · ${city.stats.instances} instance · ${city.stats.colliders} collider`);
}

main().catch((err: unknown) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('error');
    loading.textContent = `Không khởi động được game: ${err instanceof Error ? err.message : String(err)}`;
  }
});
