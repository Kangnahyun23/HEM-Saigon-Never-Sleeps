import * as THREE from 'three/webgpu';
import type { Obstacle } from '@/ai/traffic';
import { TrafficSystem } from '@/ai/trafficSystem';
import { ChaseSystem } from '@/ai/chaseSystem';
import { buildTrafficNetwork } from '@/ai/trafficNetwork';
import { PedestrianSim, type Threat } from '@/ai/pedestrians';
import { Heat, SightGrid } from '@/systems/heat';
import type { SaveSlot } from '@/systems/save';
import { PedestrianView } from '@/ai/pedestrianView';
import { Horn } from '@/audio/horn';
import { MissionDirector } from '@/missions/director';
import { StoryRunner } from '@/missions/storyRunner';
import { FIRST_INSTALLMENT } from '@/missions/story';
import { Inbox, type Contact } from '@/systems/inbox';
import { formatVnd, Wallet } from '@/systems/wallet';
import type { PhoneTab } from '@/ui/phone';
import { FixedStepAccumulator } from '@/core/fixedStep';
import type { Input } from '@/core/input';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import { CHARACTER, CharacterBody } from '@/player/characterBody';
import { CharacterModel } from '@/player/characterModel';
import { FollowCamera } from '@/player/followCamera';
import type { Hud } from '@/ui/hud';
import { BIKE_BODY_COLORS } from '@/vehicles/bikeModel';
import { BIKE_TUNING, MotorbikePhysics, NO_CONTROL, type BikeControls } from '@/vehicles/motorbikePhysics';
import { MotorbikeView } from '@/vehicles/motorbikeView';
import type { City } from '@/world/city/buildCity';
import { PAD_HEIGHT } from '@/world/city/layout';
import { locate } from '@/world/city/locate';
import type { Environment } from '@/world/environment';
import { RainSound } from '@/audio/rainSound';
import { Ambience } from '@/audio/ambience';
import { EngineSound } from '@/audio/engineSound';
import { mixer } from '@/audio/mixer';
import { playSfx } from '@/audio/sfx';
import { wetUniform } from '@/world/nightGlow';
import { Rain } from '@/world/rain';
import { SCENE_BUDGETS, type SceneBudget } from '@/systems/hardware';
import { FallGuard, type SafeSpot } from '@/systems/fallGuard';
import { GameClock, lightingAt } from '@/world/timeOfDay';
import { applyWeather, WeatherSim, type Sky } from '@/world/weather';

const STEP = 1 / 60;
const MOUNT_RANGE = 2.4;
const DISMOUNT_MAX_SPEED = 4;
/** Xe đang đậu: không ga, phanh tay (dùng chung, không tạo đối tượng mỗi bước). */
const PARKED: BikeControls = { ...NO_CONTROL, handbrake: true };

interface Bike {
  phys: MotorbikePhysics;
  view: MotorbikeView;
}

/**
 * Vòng chơi M1: đi bộ quanh khu phố, lên xe máy, chạy xe; camera góc nhìn thứ 3, HUD địa điểm + tốc độ.
 */
export class Game {
  readonly character: CharacterBody;
  readonly model = new CharacterModel();
  readonly camera: FollowCamera;
  readonly bikes: Bike[] = [];
  readonly traffic: TrafficSystem;
  readonly pedestrians: PedestrianSim;
  private readonly pedestrianView: PedestrianView;
  /** Giờ trong game (mặc định 16:30, 1 phút thật = 1 giờ game). */
  readonly clock: GameClock;
  readonly weather: WeatherSim;
  private readonly rain: Rain;
  private readonly rainSound = new RainSound();
  private readonly engineSound = new EngineSound();
  private readonly ambience = new Ambience();
  /** Ga đang bóp (cho tiếng máy), tiền / Độ Nóng lần trước (để phát âm báo khi đổi). */
  private throttle = 0;
  private lastCash = -1;
  private lastHeat = 0;
  private ambienceTimer = 0;
  /** Lưới an toàn khi rơi khỏi mặt đất. */
  private readonly fallGuard: FallGuard;
  readonly wallet = new Wallet();
  readonly inbox = new Inbox();
  readonly missions: MissionDirector;
  readonly heat = new Heat();
  readonly story: StoryRunner;
  readonly chase: ChaseSystem;
  private caughtThisStep = false;
  /** Thời gian chơi (giây thật) — dùng hẹn giờ tin nhắn, sự kiện. */
  playTime = 0;
  private readonly scheduled: Array<{ at: number; run: () => void }> = [];
  /** Đèn pha thật của xe người chơi (một SpotLight dùng chung, gắn vào xe đang chạy). */
  private readonly headlamp = new THREE.SpotLight('#fff1d6', 0, 45, 0.55, 0.65, 1.2);
  mode: 'foot' | 'ride' = 'foot';
  riding: Bike | null = null;
  physicsSteps = 0;
  private readonly stepper = new FixedStepAccumulator(STEP, 5);
  private readonly horn = new Horn();
  /** Còi của xe NPC (khoá bận riêng, không chặn còi người chơi). */
  private readonly trafficHorn = new Horn();
  private readonly tmp = new THREE.Vector3();
  private headlight = false;
  /** Lệnh nhảy chờ bước vật lý kế tiếp (nhấn một lần = nhảy một lần). */
  private jumpQueued = false;
  private stillTime = 0;
  private locateTimer = 0;
  /** Điều khiển giả lập từ test (ghi đè bàn phím). */
  autopilot: Partial<BikeControls> | null = null;
  /** Điều khiển xe dùng lại mỗi bước (không tạo đối tượng mới). */
  private readonly controls: BikeControls = { ...NO_CONTROL };
  /** Camera do debug/test điều khiển, game không đụng tới. */
  freeCamera = false;

  constructor(
    private readonly scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    private readonly physics: PhysicsWorld,
    private readonly city: City,
    private readonly input: Input,
    private readonly hud: Hud,
    private readonly env: Environment,
    startHour = 16.5,
    startSky: Sky | null = null,
    /** Nơi lưu game (null = không lưu, ví dụ khi test). */
    private readonly saveSlot: SaveSlot | null = null,
    /** Số xe NPC / người đi bộ / hạt mưa theo sức máy (hardware.ts). */
    budget: SceneBudget = SCENE_BUDGETS.high,
  ) {
    this.rain = new Rain(budget.rain);
    this.clock = new GameClock(startHour);
    this.weather = new WeatherSim(city.layout.seed + 7, startSky ?? 'clear');
    this.weather.forced = startSky;
    scene.add(this.rain.mesh);
    // Đèn luôn nằm trong cảnh (cường độ 0 khi tắt) để không phải biên dịch lại shader khi bật/tắt.
    this.headlamp.position.set(0, 0.98, 0.62);
    this.headlamp.target.position.set(0, -0.6, 12);
    this.headlamp.add(this.headlamp.target);
    scene.add(this.headlamp);

    this.hud.createPhone(this.inbox, this.wallet);
    this.inbox.onMessage = (_m, contact) => {
      this.hud.phone?.invalidate();
      if (!this.hud.phone?.open) this.hud.showToast(`Tin nhắn mới: ${contact}`, 2.4);
      playSfx('message');
    };
    this.missions = new MissionDirector(scene, city.layout, hud, this.wallet, this.inbox, () => this.clock.hour, (lvl) => this.heat.set(lvl));
    this.story = new StoryRunner(scene, city.layout, this.missions, hud, this.inbox, this.wallet, () => this.clock.hour, (s, run) => this.schedule(s, run));
    const sight = new SightGrid(city.layout.lots.map((l) => l.rect));
    this.chase = new ChaseSystem(scene, physics, buildTrafficNetwork(city.layout), sight, city.layout.seed + 11);
    const { spawn } = city.layout;
    this.fallGuard = new FallGuard({ x: spawn.x, y: PAD_HEIGHT, z: spawn.z, yaw: spawn.yaw });
    this.character = new CharacterBody(physics.RAPIER, physics.world, spawn.x, PAD_HEIGHT, spawn.z);
    this.character.yaw = spawn.yaw;
    scene.add(this.model.root);

    // Xe của Tín đậu sẵn cạnh điểm xuất phát (bên trái, đầu xe cùng hướng nhìn), thêm hai xe khác để thử.
    const fx = Math.sin(spawn.yaw);
    const fz = Math.cos(spawn.yaw);
    const lx = fz; // bên trái = (cos yaw, -sin yaw)… với yaw quanh +Y: trái của hướng (sin, cos) là (cos, -sin)
    const lz = -fx;
    this.addBike(spawn.x + lx * 1.6 + fx * 1.5, spawn.z + lz * 1.6 + fz * 1.5, spawn.yaw + Math.PI / 2, '#b3242b');
    this.addBike(spawn.x + lx * 1.6 + fx * 3.0, spawn.z + lz * 1.6 + fz * 3.0, spawn.yaw + Math.PI / 2, BIKE_BODY_COLORS[2]);
    this.addBike(spawn.x + lx * 1.6 + fx * 4.5, spawn.z + lz * 1.6 + fz * 4.5, spawn.yaw + Math.PI / 2, BIKE_BODY_COLORS[3]);

    this.camera = new FollowCamera(camera, physics);
    this.camera.yaw = spawn.yaw + Math.PI;

    this.traffic = new TrafficSystem(scene, physics, city.layout, { x: spawn.x, z: spawn.z }, { count: budget.traffic });
    this.pedestrians = new PedestrianSim(city.layout, { x: spawn.x, z: spawn.z }, { count: budget.pedestrians });
    this.pedestrianView = new PedestrianView(this.pedestrians.walkers.length);
    scene.add(this.pedestrianView.root);

    // Cuối cùng (mọi thứ đã dựng xong): nạp bản lưu, không có thì chạy tin nhắn mở màn.
    this.loaded = this.restore();
    if (!this.loaded) this.scheduleIntro();
  }

  /** Có nạp từ bản lưu không (để bỏ tin nhắn mở màn). */
  readonly loaded: boolean;
  private saveTimer = 0;
  private savedProgress = '';

  /** Nạp bản lưu (nếu có): tiền, nợ, tin nhắn, tiến độ Hồi 1, giờ, vị trí. */
  private restore(): boolean {
    const data = this.saveSlot?.load();
    if (!data) return false;
    this.wallet.restore(data.wallet);
    this.inbox.restore(data.inbox);
    this.story.progress.next = Math.max(0, Math.min(this.story.missions.length, Math.floor(data.story.next)));
    this.missions.jobsDone = data.jobsDone;
    this.clock.hour = data.hour;
    const { x, z, yaw } = data.player;
    this.character.teleport(x, PAD_HEIGHT + 0.3, z, yaw);
    // Xe của Tín đậu ngay cạnh chỗ đứng.
    this.bikes[0]?.phys.reset(x + Math.cos(yaw) * 1.6, PAD_HEIGHT, z - Math.sin(yaw) * 1.6, yaw);
    this.savedProgress = this.progressKey();
    this.schedule(1, () => this.hud.showToast('Đã tải bản lưu', 2));
    return true;
  }

  private progressKey(): string {
    return `${this.story.progress.next}|${this.missions.jobsDone}`;
  }

  /** Lưu game ngay (tự gọi sau mỗi nhiệm vụ, mỗi 30 giây và khi rời trang). */
  save(announce = false): boolean {
    if (!this.saveSlot) return false;
    const p = this.riding ? this.riding.phys.body.translation() : this.character.feet();
    const yaw = this.riding ? this.riding.phys.heading() : this.character.yaw;
    const ok = this.saveSlot.save({
      hour: this.clock.hour,
      wallet: this.wallet.toJSON(),
      inbox: this.inbox.toJSON(),
      story: { next: this.story.progress.next },
      jobsDone: this.missions.jobsDone,
      player: { x: p.x, z: p.z, yaw },
    });
    if (announce) this.hud.showToast(ok ? 'Đã lưu game' : 'Trình duyệt chặn lưu game', 1.6);
    return ok;
  }

  /** Bị đàn em của Phát chặn đầu: bị "lục túi" (mất 30 % tiền mặt, ít nhất 50.000 đ), hết truy đuổi. */
  private caught(): void {
    const lost = this.wallet.spend(Math.max(50_000, this.wallet.cash * 0.3), 'Bị đàn em Phát chặn đầu', this.clock.hour);
    this.heat.set(0);
    this.chase.sim.disperse();
    this.hud.showToast(lost > 0 ? `Bị chặn đầu! Mất ${formatVnd(lost)}` : 'Bị chặn đầu! May mà túi rỗng', 3);
    this.schedule(3, () => this.inbox.receive('Phát CEO', 'Chạy đâu cho thoát hả tài xế? Lo mà trả nợ đúng hạn đi.', this.clock.hour));
  }

  /** Đưa người chơi (và xe đang lái) về chỗ an toàn sau khi rơi xuống sông / lọt khe va chạm. */
  private rescue(spot: Readonly<SafeSpot>): void {
    const bike = this.riding;
    if (bike) this.dismount();
    this.character.teleport(spot.x, spot.y + 0.3, spot.z, spot.yaw);
    // Dắt xe lên theo, đậu bên trái người chơi (trái của hướng (sin, cos) là (cos, −sin)).
    if (bike) bike.phys.reset(spot.x + Math.cos(spot.yaw) * 1.6, spot.y, spot.z - Math.sin(spot.yaw) * 1.6, spot.yaw);
    this.hud.showToast(bike ? 'Ướt sũng! Tín dắt xe lên bờ…' : 'Ướt sũng! Tín bò lên bờ…', 2.4);
  }

  /** Tiếng máy xe, tiếng phố, âm báo tiền vào / ra và bị truy đuổi. */
  private updateSounds(dt: number): void {
    const p = this.riding?.phys;
    this.engineSound.update(this.mode === 'ride' && !!p, p ? p.speed : 0, this.throttle);
    this.ambienceTimer -= dt;
    if (this.ambienceTimer <= 0) {
      // Nửa giây một lần: đếm xe NPC trong 60 m quanh người chơi.
      this.ambienceTimer = 0.5;
      const me = this.riding ? this.riding.view.root.position : this.tmp.copy(this.character.feet());
      let near = 0;
      for (const a of this.traffic.sim.agents) if ((a.x - me.x) ** 2 + (a.z - me.z) ** 2 < 3600) near++;
      this.ambience.update(this.clock.hour, this.weather.state.rain, near);
    }
    const cash = this.wallet.cash;
    if (this.lastCash >= 0 && cash !== this.lastCash) playSfx(cash > this.lastCash ? 'money' : 'lose');
    this.lastCash = cash;
    if (this.heat.level > this.lastHeat) playSfx('alert');
    this.lastHeat = this.heat.level;
  }

  /** Âm lượng tổng từ cài đặt (0…1). */
  setVolume(volume: number): void {
    mixer.setVolume(volume);
  }

  /** Độ nhạy chuột / đảo trục dọc từ cài đặt. */
  setLookOptions(sensitivity: number, invertY: boolean): void {
    this.camera.sensitivity = sensitivity;
    this.camera.invertY = invertY;
  }

  /** Hẹn một việc sau `seconds` giây chơi. */
  schedule(seconds: number, run: () => void): void {
    this.scheduled.push({ at: this.playTime + seconds, run });
  }

  /** Tin nhắn mở màn Hồi 1: Ngân bị siết nợ, app vay đòi tiền, chú Sáu hẹn gặp. */
  private scheduleIntro(): void {
    const say = (at: number, who: Contact, text: string): void => this.schedule(at, () => this.inbox.receive(who, text, this.clock.hour));
    say(4, 'Ngân', 'Anh Tín ơi, người của app vay lại tới nhà. Họ dán giấy đỏ lên cửa, la lối cả xóm nghe.');
    say(7, 'Ngân', 'Em sợ lắm. Tiền học kỳ này em chưa đóng, giờ còn thêm khoản này nữa...');
    say(12, 'Vay Liền 5S', `Khoản vay của Quý khách: ${formatVnd(this.wallet.debt)}. Kỳ 1 cần thanh toán ${formatVnd(FIRST_INSTALLMENT)} trước 23:59 Chủ nhật. Trễ hạn phí 3%/ngày.`);
    say(20, 'Chú Sáu', 'Tín hả con. Tối nay ghé xe hủ tiếu chú ở đầu chợ. Chú có mối kèo cho con, mà phải biết đường hẻm mới chạy được.');
    say(30, 'Tổng đài kèo', 'Có kèo giao hàng mới quanh bạn. Mở điện thoại (P) › Kèo để nhận. Giao đúng giờ được boa thêm!');
  }

  /** Vị trí người chơi + các xe của người chơi: vật cản mà xe NPC phải phanh / lách. */
  private trafficObstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    if (this.mode === 'foot') {
      const f = this.character.feet();
      out.push({ x: f.x, z: f.z, radius: 0.45 });
    }
    for (const b of this.bikes) {
      const t = b.phys.body.translation();
      out.push({ x: t.x, z: t.z, radius: 0.9 });
    }
    return out;
  }

  private addBike(x: number, z: number, yaw: number, color: string): void {
    const phys = new MotorbikePhysics(this.physics.RAPIER, this.physics.world, x, PAD_HEIGHT, z, yaw);
    const view = new MotorbikeView(color);
    this.scene.add(view.root);
    this.bikes.push({ phys, view });
  }

  private nearestBike(): { bike: Bike; dist: number } | null {
    const p = this.character.feet();
    let best: Bike | null = null;
    let bestD = Infinity;
    for (const b of this.bikes) {
      const t = b.phys.body.translation();
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best ? { bike: best, dist: bestD } : null;
  }

  mount(bike: Bike): void {
    this.mode = 'ride';
    this.riding = bike;
    this.character.setEnabled(false);
    bike.view.seat.add(this.model.root);
    bike.view.model.add(this.headlamp);
    this.model.root.position.set(0, 0, 0);
    this.model.root.rotation.set(0, 0, 0);
    this.model.setHelmet(true);
    this.camera.zoom = Math.max(this.camera.zoom, 1);
    bike.phys.body.wakeUp();
  }

  /** Xuống xe: đặt Tín đứng cạnh xe (ưu tiên bên trái), kiểm tra chỗ trống. */
  private dismount(thrown = false): void {
    const bike = this.riding;
    if (!bike) return;
    const t = bike.phys.body.translation();
    const h = bike.phys.heading();
    const { RAPIER, world } = this.physics;
    const shape = new RAPIER.Capsule(CHARACTER.halfHeight, CHARACTER.radius);
    let spot: { x: number; y: number; z: number } | null = null;
    for (const side of [1, -1, 0]) {
      const ox = side === 0 ? -Math.sin(h) * 1.4 : Math.cos(h) * 0.85 * side;
      const oz = side === 0 ? -Math.cos(h) * 1.4 : -Math.sin(h) * 0.85 * side;
      const x = t.x + ox;
      const z = t.z + oz;
      // Tìm mặt đất bằng tia bắn xuống.
      const hit = world.castRay(new RAPIER.Ray({ x, y: t.y + 2, z }, { x: 0, y: -1, z: 0 }), 6, true, undefined, interaction(GROUP.ALL, GROUP.WORLD));
      const gy = hit ? t.y + 2 - hit.timeOfImpact : PAD_HEIGHT;
      let blocked = false;
      world.intersectionsWithShape(
        { x, y: gy + CHARACTER.halfHeight + CHARACTER.radius + 0.05, z },
        { x: 0, y: 0, z: 0, w: 1 },
        shape,
        () => {
          blocked = true;
          return false;
        },
        undefined,
        interaction(GROUP.ALL, GROUP.WORLD | GROUP.PROP),
      );
      if (!blocked) {
        spot = { x, y: gy, z };
        break;
      }
    }
    spot ??= { x: t.x, y: t.y + 1, z: t.z };

    this.scene.add(this.model.root);
    this.scene.add(this.headlamp);
    this.model.setHelmet(false);
    this.character.setEnabled(true);
    this.character.teleport(spot.x, spot.y + 0.02, spot.z, h);
    if (thrown) {
      // Văng khỏi xe theo quán tính TRƯỚC cú va (lúc này xe đã gần như đứng lại).
      const v = bike.phys.lastSpeed * 0.45;
      this.character.vx = Math.sin(h) * v;
      this.character.vz = Math.cos(h) * v;
      this.character.vy = 4.5;
    }
    this.jumpQueued = false;
    this.mode = 'foot';
    this.riding = null;
  }

  /** Cập nhật mỗi khung hình (dt thực, giây). */
  update(dt: number): void {
    const input = this.input;
    if (input.mouseDX || input.mouseDY) this.camera.look(input.mouseDX, input.mouseDY);
    if (input.wheel) this.camera.addZoom(input.wheel);
    if (input.wasPressed('Tab')) this.hud.toggleHelp();
    if (input.wasPressed('KeyH')) this.horn.beep();
    if (input.wasPressed('KeyM')) this.hud.showToast(mixer.toggleMute() ? 'Đã tắt tiếng (M)' : 'Đã bật tiếng (M)', 1.4);
    if (input.wasPressed('KeyL')) this.headlight = !this.headlight;

    // Điện thoại: P bật/tắt, Esc cất, 1–4 đổi tab.
    const phone = this.hud.phone;
    if (phone) {
      if (input.wasPressed('KeyP')) phone.toggle();
      else if (phone.open && input.wasPressed('Escape')) phone.setOpen(false);
      if (phone.open) {
        const tabs: PhoneTab[] = ['jobs', 'map', 'messages', 'wallet', 'settings'];
        tabs.forEach((t, i) => {
          if (input.wasPressed(`Digit${i + 1}`)) phone.show(t);
        });
      }
    }

    // Tự lưu: xong nhiệm vụ / kèo thì lưu ngay (báo trên HUD), còn lại mỗi 30 giây.
    this.saveTimer += dt;
    const progress = this.progressKey();
    if (progress !== this.savedProgress) {
      this.savedProgress = progress;
      this.saveTimer = 0;
      this.save(true);
    } else if (this.saveTimer > 30) {
      this.saveTimer = 0;
      this.save();
    }

    // Việc đã hẹn giờ (tin nhắn, sự kiện nhiệm vụ).
    this.playTime += dt;
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const job = this.scheduled[i] as { at: number; run: () => void };
      if (job.at <= this.playTime) {
        this.scheduled.splice(i, 1);
        job.run();
      }
    }

    // Giờ trong ngày ⇒ trời, nắng, sương, đèn ban đêm.
    this.clock.advance(dt);
    const sky = this.weather.update(dt * this.clock.rate, this.clock.hour);
    const light = applyWeather(lightingAt(this.clock.hour), sky);
    this.env.setLighting(light);
    wetUniform.value = sky.wet;
    this.traffic.sim.speedFactor = 1 - 0.25 * sky.rain;
    this.rainSound.update(sky.rain);
    this.hud.setClock(`${this.clock.label()}${sky.rain > 0.3 ? ' · Mưa' : sky.cloud > 0.5 ? ' · Nhiều mây' : ''}`);
    // Trời tối thì xe đang chạy tự bật đèn; phím L bật/tắt đèn pha thủ công.
    const lightsOn = this.headlight || light.night > 0.35;
    for (const b of this.bikes) b.view.setLights(b === this.riding && lightsOn, light.night);
    this.headlamp.intensity = this.riding && lightsOn ? 6 + 34 * light.night : 0;

    // Lên / xuống xe.
    let prompt = '';
    if (this.mode === 'foot') {
      const near = this.nearestBike();
      if (near && near.dist < MOUNT_RANGE) {
        prompt = '<kbd>F</kbd> Lên xe';
        if (input.wasPressed('KeyF')) this.mount(near.bike);
      }
    } else if (this.riding) {
      const speed = Math.abs(this.riding.phys.speed);
      if (input.wasPressed('KeyF')) {
        if (speed < DISMOUNT_MAX_SPEED) this.dismount();
        else this.hud.showToast('Chạy chậm lại rồi mới xuống xe!', 1.6);
      }
      if (input.wasPressed('KeyR')) {
        const t = this.riding.phys.body.translation();
        this.riding.phys.reset(t.x, t.y - 0.3, t.z, this.riding.phys.heading());
      }
      if (speed < 0.5) prompt = '<kbd>F</kbd> Xuống xe';
    }
    this.hud.setPrompt(prompt);

    if (this.mode === 'foot' && input.wasPressed('Space')) this.jumpQueued = true;

    // Bước vật lý cố định.
    const steps = this.stepper.advance(dt);
    const cam = this.camera.forward();
    const fwd = input.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
    const strafe = input.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']);
    for (let i = 0; i < steps; i++) {
      const me = this.riding ? this.riding.phys.body.translation() : this.character.feet();
      this.traffic.step(STEP, { x: me.x, z: me.z, dirX: cam.x, dirZ: cam.z }, this.trafficObstacles());
      // Người đi bộ né xe của người chơi khi xe lao tới.
      const threats: Threat[] = [];
      if (this.riding) {
        const v = this.riding.phys.body.linvel();
        threats.push({ x: me.x, z: me.z, vx: v.x, vz: v.z });
      }
      this.pedestrians.step(STEP, me, threats);

      // Truy đuổi: xe đàn em bám theo khi có Độ Nóng; khuất tầm nhìn đủ lâu thì cắt đuôi.
      const mySpeed = this.riding ? Math.abs(this.riding.phys.speed) : this.character.actualSpeed;
      if (this.chase.step(STEP, { x: me.x, z: me.z, speed: mySpeed }, this.heat.level)) this.caughtThisStep = true;
      if (this.heat.update(STEP, this.chase.sim.seen)) {
        this.chase.sim.disperse();
        this.hud.showToast('Cắt đuôi thành công!', 2.4);
        playSfx('escaped');
      }
      for (const h of this.traffic.sim.honks) {
        const d = Math.hypot(h.x - me.x, h.z - me.z);
        this.trafficHorn.beep(1 / (1 + d / 8), 0.85 + ((h.id * 37) % 40) / 100);
      }
      if (this.mode === 'foot') {
        // Phải của hướng nhìn (fx, fz) là (−fz, fx).
        const mx = cam.x * fwd - cam.z * strafe;
        const mz = cam.z * fwd + cam.x * strafe;
        this.character.update(STEP, { x: mx, z: mz, run: input.isDown('ShiftLeft', 'ShiftRight'), jump: this.jumpQueued });
        this.jumpQueued = false;
      }
      for (const b of this.bikes) {
        if (b === this.riding) {
          const controls = this.controls;
          controls.throttle = this.autopilot?.throttle ?? fwd;
          controls.steer = this.autopilot?.steer ?? -strafe;
          controls.handbrake = this.autopilot?.handbrake ?? input.isDown('Space');
          this.throttle = Math.max(0, controls.throttle);
          b.phys.update(STEP, controls);
        } else {
          b.phys.update(STEP, PARKED);
        }
      }
      this.physics.step();
      this.physicsSteps++;
      this.character.snapshot();
      for (const b of this.bikes) b.phys.snapshot();

      // Đâm xe: tốc độ tụt đột ngột ⇒ văng khỏi xe.
      if (this.riding && this.riding.phys.impact > 7) {
        this.hud.showToast('Ui da! Té xe rồi…');
        playSfx('crash');
        this.dismount(true);
      }
    }

    // Rơi khỏi mặt đất (xuống sông, lọt khe va chạm): quá lâu thì đưa về chỗ đứng vững gần nhất, kèm xe.
    {
      const bike = this.riding;
      const p = bike ? bike.phys.body.translation() : this.character.feet();
      const yaw = bike ? bike.phys.heading() : this.character.yaw;
      const grounded = bike ? bike.phys.grounded() : this.character.grounded;
      const spot = this.fallGuard.update(dt, p.x, p.y, p.z, yaw, grounded);
      if (spot) this.rescue(spot);
    }

    // Đồng bộ hình ảnh.
    const alpha = this.stepper.alpha;
    for (const b of this.bikes) b.view.sync(b.phys, alpha);
    this.traffic.render(alpha);
    this.chase.render(alpha);
    if (this.caughtThisStep) {
      this.caughtThisStep = false;
      this.caught();
    }
    this.hud.setHeat(this.heat.level, this.heat.escapeProgress, this.chase.sim.seen);
    this.hud.minimap?.setBlips(this.chase.positions.map((p) => ({ ...p, color: '#ff4b3e' })));
    this.pedestrianView.update(this.pedestrians.walkers, alpha);
    let speedKmh: number | null = null;
    const cp = this.character.prev;
    const cc = this.character.curr;
    const feet = { x: cp.x + (cc.x - cp.x) * alpha, y: cp.y + (cc.y - cp.y) * alpha, z: cp.z + (cc.z - cp.z) * alpha };
    if (this.mode === 'foot') {
      this.model.root.position.set(feet.x, feet.y, feet.z);
      this.model.root.rotation.set(0, this.character.yaw, 0);
      this.model.update(dt, {
        mode: 'foot',
        speed: this.character.actualSpeed,
        grounded: this.character.grounded,
        running: input.isDown('ShiftLeft', 'ShiftRight'),
      });
    } else if (this.riding) {
      const p = this.riding.phys;
      const still = Math.abs(p.speed) < 0.4;
      this.stillTime = still ? this.stillTime + dt : 0;
      this.model.update(dt, { mode: 'ride', speed: Math.abs(p.speed), grounded: true, running: false, footDown: this.stillTime > 0.25, steer: p.steer });
      speedKmh = p.speed * 3.6;
    }
    this.hud.setSpeed(speedKmh);
    this.updateSounds(dt);

    // Camera.
    if (this.freeCamera) {
      this.tmp.copy(this.camera.camera.position);
      this.env.update(this.tmp);
      this.rain.update(dt, this.tmp, this.weather.state.rain);
      return;
    }
    const looking = performance.now() / 1000 - input.lastLookTime < 1.4;
    if (this.mode === 'ride' && this.riding) {
      const p = this.riding.phys;
      const t = this.riding.view.root.position;
      this.tmp.set(t.x, t.y + 1.25, t.z);
      const v = Math.abs(p.speed);
      this.camera.update(
        dt,
        {
          target: this.tmp,
          distance: 4.6 + Math.min(2.2, v * 0.1),
          followYaw: v > 1.5 ? p.heading() + Math.PI : null,
          followRate: 2.4,
          fovBoost: (v / BIKE_TUNING.maxSpeed) * 14,
        },
        looking,
      );
    } else {
      this.tmp.set(feet.x, feet.y + 1.55, feet.z);
      this.camera.update(dt, { target: this.tmp, distance: 3.6, followYaw: null, followRate: 0, fovBoost: Math.min(this.character.actualSpeed, 6.4) * 0.6 }, looking);
    }
    this.env.update(this.tmp);
    this.rain.update(dt, this.camera.camera.position, this.weather.state.rain);

    // Nhiệm vụ / kèo: kiểm tra mục tiêu theo vị trí người chơi.
    const pos = this.riding ? this.riding.phys.body.translation() : this.character.feet();
    this.missions.update(dt, { x: pos.x, z: pos.z, riding: this.mode === 'ride', heat: this.heat.level });
    this.story.update(dt, pos.x, pos.z);

    // Bản đồ nhỏ xoay theo camera.
    const look = this.camera.forward();
    const yaw = this.riding ? this.riding.phys.heading() : this.character.yaw;
    this.hud.minimap?.update(dt, this.tmp.x, this.tmp.z, look.x, look.z, yaw, this.mode === 'ride');
    this.hud.phone?.update(this.clock.label(), this.tmp.x, this.tmp.z);
    this.hud.setStatus(this.wallet.cash, this.inbox.unread);

    // Địa điểm trên HUD (4 lần/giây là đủ).
    this.locateTimer -= dt;
    if (this.locateTimer <= 0) {
      this.locateTimer = 0.25;
      this.hud.setPlace(locate(this.city.layout, this.tmp.x, this.tmp.z).name);
    }
  }
}

