import * as THREE from 'three/webgpu';
import { Input } from '@/core/input';
import { Game } from '@/game/game';
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
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2500);
  const env = await createEnvironment(scene, renderer);
  const city = buildCity(scene, physics);
  const input = new Input(window, renderer.domElement);
  const hud = new Hud(hudRoot, backend);
  hud.createMinimap(city.layout);
  // ?gio=21 để vào game lúc 21 giờ (thử cảnh đêm).
  const gio = new URLSearchParams(location.search).get('gio');
  const startHour = gio === null ? NaN : Number(gio);
  // ?mua=1 để vào game giữa cơn mưa (ép mưa suốt).
  const forceRain = new URLSearchParams(location.search).get('mua') === '1';
  const game = new Game(scene, camera, physics, city, input, hud, env, Number.isFinite(startHour) ? startHour : undefined, forceRain ? 'rain' : null);
  const timer = new THREE.Timer();

  const debug: DebugInfo = {
    ready: false,
    backend,
    frames: 0,
    physicsSteps: 0,
    paused: false,
    stats: { ...city.stats, lots: city.layout.lots.length },
    setCamera(px, py, pz, tx, ty, tz) {
      game.freeCamera = true;
      camera.position.set(px, py, pz);
      camera.lookAt(tx, ty, tz);
    },
  };
  debug.layout = city.layout;
  debug.game = game;
  /** Chạy nhanh logic game (không render) — cho test e2e trên máy không GPU. */
  debug.simulate = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      game.update(1 / 60);
      input.endFrame();
    }
  };
  debug.input = input;
  /** Ép thời tiết: 'clear' | 'cloudy' | 'rain', hoặc null để tự nhiên. */
  debug.setWeather = (sky: 'clear' | 'cloudy' | 'rain' | null) => {
    game.weather.forced = sky;
    if (sky) {
      const full = { clear: [0, 0], cloudy: [0.6, 0], rain: [1, 1] }[sky];
      Object.assign(game.weather.state, { sky, cloud: full[0], rain: full[1], wet: full[1] });
    }
    if (debug.paused) game.update(0);
  };
  /** Đặt Độ Nóng 0–3 (bị truy đuổi). */
  debug.setHeat = (level: number) => game.heat.set(level);
  /** Đặt giờ trong game (0–24). */
  debug.setHour = (h: number) => {
    game.clock.hour = h;
    if (debug.paused) game.update(0);
  };
  window.__HEM__ = debug;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!debug.paused) game.update(dt);
    renderer.render(scene, camera);
    hud.update(dt);
    input.endFrame();
    debug.frames++;
    debug.physicsSteps = game.physicsSteps;
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
