import * as THREE from 'three/webgpu';
import { loadCharacters } from '@/assets/characters';
import { loadTextures, setTextureAnisotropy } from '@/assets/textures';
import { Input } from '@/core/input';
import { loadFonts } from '@/ui/fonts';
import { Game } from '@/game/game';
import { createPhysics } from '@/physics/physics';
import { NightBloom } from '@/render/bloom';
import { createRenderer } from '@/render/renderer';
import { ResolutionGovernor } from '@/render/resolution';
import { buildCity } from '@/world/city/buildCity';
import { createEnvironment } from '@/world/environment';
import { nightUniform } from '@/world/nightGlow';
import { Hud } from '@/ui/hud';
import { SaveSlot } from '@/systems/save';
import { detectTier, probeHardware, SCENE_BUDGETS, shortGpuName, TIER_LABELS, type Tier } from '@/systems/hardware';
import { qualityProfile, sceneTier, SettingsStore, type Settings } from '@/systems/settings';
import type { DebugInfo } from '@/debug';


async function main(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const loading = document.getElementById('loading') as HTMLElement;

  // Thời gian từng bước dựng cảnh (ms) — xem bằng __HEM__.timings để biết lúc tải chậm ở đâu.
  const timings: Record<string, number> = {};
  let mark = performance.now();
  const lap = (name: string): void => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  // Texture CC0 (public/media) tải song song với dựng renderer + vật lý; tiến độ hiện ở màn hình tải.
  const loadingSub = loading.querySelector('.sub');
  const texturesReady = loadTextures((done, total) => {
    if (loadingSub) loadingSub.textContent = `Sài Gòn Không Ngủ · đang tải texture ${done}/${total}…`;
  });
  // Font bảng hiệu phải có trước khi vẽ atlas bảng hiệu (lúc dựng phố).
  const fontsReady = loadFonts();
  // Nhân vật có xương + động tác (Mesh2Motion, CC0); lỗi thì người chơi dùng mẫu khối hộp.
  const charactersReady = loadCharacters();
  const [{ renderer, backend }, physics] = await Promise.all([createRenderer(app), createPhysics()]);
  lap('renderer+physics');
  await Promise.all([texturesReady, fontsReady, charactersReady]);
  setTextureAnisotropy(Math.min(8, renderer.getMaxAnisotropy()));
  lap('textures+fonts+characters');

  // Sức máy ⇒ ngân sách dựng cảnh (số xe, người đi bộ, mưa, bản đồ bóng) và mức khởi đầu của chất lượng "Tự động".
  // Chạy tự động (Playwright) thì cố định bậc "mạnh" để ảnh chụp so sánh được giữa các máy.
  const hardware = probeHardware();
  const autoTier: Tier = navigator.webdriver ? 'high' : detectTier(hardware);
  // Cài đặt người chơi (tab Cài đặt trong điện thoại): chất lượng đồ hoạ, hiện FPS, độ nhạy chuột.
  const settingsStore = SettingsStore.browser();
  let settings = settingsStore.load();
  const budget = SCENE_BUDGETS[sceneTier(settings.quality, autoTier)];

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2500);
  const env = await createEnvironment(scene, renderer);
  env.setShadowMapSize(budget.shadowMapSize);
  lap('environment');
  const city = buildCity(scene, physics);
  lap('city');
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
  const game = new Game(scene, camera, physics, city, input, hud, env, Number.isFinite(startHour) ? startHour : undefined, forceRain ? 'rain' : null, saveSlot, budget);
  lap('game');
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
  debug.timings = timings;
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

  // ?fps=1: luôn hiện số khung hình / giây, tỉ lệ điểm ảnh và số lệnh vẽ (để báo lỗi giật lag).
  const fpsParam = new URLSearchParams(location.search).get('fps') === '1';
  const fpsBox = hud.createPerfBox();
  let fpsTime = 0;
  let fpsFrames = 0;
  /** Chất lượng tự động (chỉ ở mức "Tự động"). Chạy tự động (Playwright) thì tắt để ảnh chụp so sánh được. */
  let resolution: ResolutionGovernor | null = null;
  let lowHintShown = false;
  // Bloom ban đêm (neon, LED, hộp đèn): ?bloom=0 để tắt khi so hiệu năng.
  const bloom = new NightBloom(renderer, scene, camera);
  // App Camera trên điện thoại: chụp khung hình kế tiếp.
  let photoRequested = false;
  if (hud.phone) hud.phone.onCapture = () => (photoRequested = true);
  const bloomParam = new URLSearchParams(location.search).get('bloom');
  const applySettings = (s: Settings): void => {
    const profile = qualityProfile(s.quality, window.devicePixelRatio, autoTier);
    resolution =
      profile.adaptive && !navigator.webdriver
        ? new ResolutionGovernor({ max: profile.maxPixelRatio, min: Math.min(0.6, profile.pixelRatio), start: profile.pixelRatio })
        : null;
    if (renderer.getPixelRatio() !== profile.pixelRatio) renderer.setPixelRatio(profile.pixelRatio);
    env.setShadowInterval(1);
    env.setShadows(profile.shadows);
    city.setDetailScale(profile.detailScale);
    bloom.setScale(bloomParam === '0' ? 0 : profile.bloom);
    fpsBox.hidden = !(s.showFps || fpsParam);
    game.setLookOptions(s.mouseSensitivity, s.invertY);
    game.setVolume(s.volume);
  };
  applySettings(settings);
  hud.phone?.setHardware(`${shortGpuName(hardware.gpu)} · ${hardware.cores || '?'} luồng CPU`, autoTier, sceneTier(settings.quality, autoTier));
  hud.phone?.setSettings(settings, (next) => {
    settings = next;
    settingsStore.save(next);
    applySettings(next);
  });
  if (settings.quality === 'auto' && autoTier !== 'high') {
    // Nói rõ cho người chơi biết game đã tự chọn đồ hoạ nhẹ và đổi ở đâu.
    hud.showToast(`Máy ${TIER_LABELS[autoTier]}: đã chọn đồ hoạ nhẹ cho mượt — đổi ở Điện thoại (P) → Cài đặt (5)`, 6);
  }
  debug.settings = () => settings;
  debug.hardware = { ...hardware, autoTier, budget };

  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const raw = timer.getDelta();
    const dt = Math.min(raw, 0.1);
    // Vòng chọn đồ (giữ Tab) làm game chậm lại: nhân hệ số thời gian của game vào dt.
    if (!debug.paused) game.update(dt * game.timeScale);
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
    const firstFrame = debug.frames === 0 ? performance.now() : 0;
    if (!bloom.render(nightUniform.value)) renderer.render(scene, camera);
    if (photoRequested) {
      // Chụp ngay sau lệnh vẽ (cùng tác vụ ⇒ khung hình còn trên canvas), thu nhỏ cho nhẹ.
      photoRequested = false;
      const src = renderer.domElement;
      const shot = document.createElement('canvas');
      shot.width = 320;
      shot.height = Math.round((320 * src.height) / Math.max(1, src.width));
      shot.getContext('2d')?.drawImage(src, 0, 0, shot.width, shot.height);
      hud.phone?.addPhoto(shot.toDataURL('image/jpeg', 0.82));
    }
    // Khung hình đầu biên dịch toàn bộ shader — thường là bước tải lâu nhất.
    if (firstFrame) {
      timings.firstFrame = Math.round(performance.now() - firstFrame);
      // Chỉ bỏ màn hình tải khi khung hình đầu đã vẽ xong — tránh cảnh game đứng hình vài giây lúc biên dịch shader.
      loading.classList.add('done');
    }
    if (!fpsBox.hidden) {
      fpsTime += raw;
      fpsFrames++;
      if (fpsTime >= 0.5) {
        const info = renderer.info.render;
        const shadow = resolution?.shadowInterval === 2 ? ' · bóng ½' : '';
        const glow = bloom.active ? ' · bloom' : '';
        fpsBox.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${renderer.getPixelRatio().toFixed(2)}×${shadow}${glow} · ${info.drawCalls} lệnh vẽ · ${Math.round(info.triangles / 1000)}k tam giác · ${backend}`;
        fpsTime = 0;
        fpsFrames = 0;
      }
    }
    hud.update(dt);
    input.endFrame();
    debug.frames++;
    debug.physicsSteps = game.physicsSteps;
  });

  if (loadingSub) loadingSub.textContent = 'Sài Gòn Không Ngủ · đang chuẩn bị đồ hoạ…';
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
