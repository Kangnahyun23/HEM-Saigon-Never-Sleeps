import * as THREE from 'three/webgpu';
import { Input } from '@/core/input';
import { Game } from '@/game/game';
import { createPhysics } from '@/physics/physics';
import { createRenderer } from '@/render/renderer';
import { ResolutionGovernor } from '@/render/resolution';
import { buildCity } from '@/world/city/buildCity';
import { createEnvironment } from '@/world/environment';
import { Hud } from '@/ui/hud';
import { SaveSlot } from '@/systems/save';
import { qualityProfile, SettingsStore, type Settings } from '@/systems/settings';
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
  // ?moi=1 để chơi lại từ đầu (xoá bản lưu).
  const saveSlot = SaveSlot.browser();
  if (new URLSearchParams(location.search).get('moi') === '1') saveSlot.clear();
  const game = new Game(scene, camera, physics, city, input, hud, env, Number.isFinite(startHour) ? startHour : undefined, forceRain ? 'rain' : null, saveSlot);
  // Rời trang / chuyển tab: lưu lại.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.save();
  });
  window.addEventListener('pagehide', () => game.save());
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
  debug.renderer = renderer;
  debug.scene = scene;
  debug.camera = camera;
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
  /** Lưu game ngay. */
  debug.save = () => game.save(true);
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

  // Cài đặt người chơi (tab Cài đặt trong điện thoại): chất lượng đồ hoạ, hiện FPS, độ nhạy chuột.
  const settingsStore = SettingsStore.browser();
  let settings = settingsStore.load();
  // ?fps=1: luôn hiện số khung hình / giây, tỉ lệ điểm ảnh và số lệnh vẽ (để báo lỗi giật lag).
  const fpsParam = new URLSearchParams(location.search).get('fps') === '1';
  const fpsBox = hud.createPerfBox();
  let fpsTime = 0;
  let fpsFrames = 0;
  /** Chất lượng tự động (chỉ ở mức "Tự động"). Chạy tự động (Playwright) thì tắt để ảnh chụp so sánh được. */
  let resolution: ResolutionGovernor | null = null;
  let lowHintShown = false;
  const applySettings = (s: Settings): void => {
    const profile = qualityProfile(s.quality, window.devicePixelRatio);
    resolution = profile.adaptive && !navigator.webdriver ? new ResolutionGovernor({ max: profile.pixelRatio, min: Math.min(0.6, profile.pixelRatio) }) : null;
    if (renderer.getPixelRatio() !== profile.pixelRatio) renderer.setPixelRatio(profile.pixelRatio);
    env.setShadowInterval(1);
    env.setShadows(profile.shadows);
    city.setDetailScale(profile.detailScale);
    fpsBox.hidden = !(s.showFps || fpsParam);
    game.setLookOptions(s.mouseSensitivity, s.invertY);
  };
  applySettings(settings);
  hud.phone?.setSettings(settings, (next) => {
    settings = next;
    settingsStore.save(next);
    applySettings(next);
  });
  debug.settings = () => settings;

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const raw = timer.getDelta();
    const dt = Math.min(raw, 0.1);
    if (!debug.paused) game.update(dt);
    if (resolution?.sample(raw)) {
      if (renderer.getPixelRatio() !== resolution.pixelRatio) renderer.setPixelRatio(resolution.pixelRatio);
      env.setShadowInterval(resolution.shadowInterval);
    }
    if (resolution?.struggling && !lowHintShown) {
      // Hạ hết nấc tự động mà vẫn chậm: gợi ý một lần (không tự tắt bóng vì đổi bóng phải dựng lại mọi shader).
      lowHintShown = true;
      hud.showToast('Máy hơi yếu: mở điện thoại (P) → Cài đặt (5) → chọn "Thấp" cho mượt hơn', 6);
    }
    city.updateDetail(camera.position);
    renderer.render(scene, camera);
    if (!fpsBox.hidden) {
      fpsTime += raw;
      fpsFrames++;
      if (fpsTime >= 0.5) {
        const info = renderer.info.render;
        const shadow = resolution?.shadowInterval === 2 ? ' · bóng ½' : '';
        fpsBox.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${renderer.getPixelRatio().toFixed(2)}×${shadow} · ${info.drawCalls} lệnh vẽ · ${Math.round(info.triangles / 1000)}k tam giác · ${backend}`;
        fpsTime = 0;
        fpsFrames = 0;
      }
    }
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
