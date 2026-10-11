import * as THREE from 'three/webgpu';
import type { Obstacle } from '@/ai/traffic';
import { TrafficSystem } from '@/ai/trafficSystem';
import { ChaseSystem } from '@/ai/chaseSystem';
import { POLICE_CHASE } from '@/ai/chase';
import { Siren } from '@/audio/siren';
import type { Blip } from '@/ui/minimap';
import { buildTrafficNetwork } from '@/ai/trafficNetwork';
import { PedestrianSim, type Threat } from '@/ai/pedestrians';
import { Heat, SightGrid } from '@/systems/heat';
import type { SaveSlot } from '@/systems/save';
import { NearPedestrianView } from '@/ai/nearPedestrians';
import { SeatedPeopleView } from '@/ai/seatedPeople';
import { PedestrianView } from '@/ai/pedestrianView';
import { Horn } from '@/audio/horn';
import { MissionDirector } from '@/missions/director';
import { StoryRunner } from '@/missions/storyRunner';
import { FIRST_INSTALLMENT } from '@/missions/story';
import { Inbox, type Contact } from '@/systems/inbox';
import { formatVnd, Wallet } from '@/systems/wallet';
import type { PhoneTab } from '@/ui/phone';
import { Inventory, ITEMS, starterInventory, type ItemDef, type ItemId } from '@/systems/inventory';
import { buildWheel, sectorAt, type WheelEntry } from '@/systems/wheel';
import { attackFor, bloodFor, inStrike, nextCombo, type AttackDef } from '@/systems/combat';
import { Pickups } from '@/systems/pickups';
import type { CityPlaces } from '@/world/city/places';
import { insideShop, SHOP_TYPES, type Shop } from '@/world/city/shops';
import { bargain, canBuy, CATALOG, finalPrice, GREETINGS, isService, offerName, sellPrice, SERVICES, type Service } from '@/systems/shopCatalog';
import type { ShopRow } from '@/ui/shopPanel';
import { createRng } from '@/core/random';
import type { OutcomeKind } from '@/ui/outcome';
import { Wanted } from '@/systems/wanted';
import { BloodSim } from '@/world/blood';
import { BloodView } from '@/world/bloodView';
import { PickupView } from '@/world/pickupView';

/** Phím di chuyển (hằng số — khỏi tạo mảng mới mỗi khung hình). */
const MOVE_ALL = { fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
const MOVE_WASD = { fwd: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };

/** Phím 1–8 trên điện thoại mở thẳng app (thứ tự như màn hình chính). */
const PHONE_KEYS: readonly PhoneTab[] = ['jobs', 'map', 'messages', 'wallet', 'settings', 'bank', 'social', 'camera'];
import { FixedStepAccumulator } from '@/core/fixedStep';
import { containsPoint } from '@/core/rect';
import type { Input } from '@/core/input';
import { GROUP, interaction } from '@/physics/groups';
import type { PhysicsWorld } from '@/physics/physics';
import { CHARACTER, CharacterBody } from '@/player/characterBody';
import { createPlayerView, type CharacterView } from '@/player/skinnedCharacter';
import { FollowCamera, type CameraRig } from '@/player/followCamera';
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
/** Gợi ý trong cửa hàng. */
const SHOP_PROMPT = '<kbd>E</kbd> Mua hàng';
const SHOP_PROMPT_PAWN = '<kbd>E</kbd> Mua / bán đồ';
/** Gợi ý / thông báo khi nhặt đồ ngoài phố. */
const PICKUP_PROMPT: Partial<Record<ItemId, string>> = { gheNhua: '<kbd>G</kbd> Lấy ghế nhựa', muBaoHiem: '<kbd>G</kbd> Lấy mũ bảo hiểm' };
const PICKUP_DONE: Partial<Record<ItemId, string>> = {
  gheNhua: 'Lấy một cái ghế nhựa — chủ quán nhìn theo, không dám nói gì',
  muBaoHiem: 'Lấy mũ bảo hiểm trên yên xe — mong chủ xe không ra kịp',
};
/** Câu báo khi vũ khí hỏng (mặc định "… gãy rồi!"). */
const BREAK_TEXT: Partial<Record<ItemId, string>> = { gheNhua: 'Ghế nhựa vỡ tan!', muBaoHiem: 'Mũ bảo hiểm bể làm đôi!' };
/** Nhịp màn hình kết cục (giây): bắt đầu mờ đen, đưa về đồn / trạm, sáng lại, hết khoá điều khiển. */
const OUTCOME = { black: 2.6, respawn: 3.2, reveal: 3.5, end: 4.1 } as const;
/** Tiền phạt khi bị bắt / viện phí khi gục: ít nhất ngần này, hoặc 20 % / 10 % tiền mặt (không đủ thì lấy hết). */
const BUSTED_FINE = 150_000;
const HOSPITAL_FEE = 100_000;
/** Số vũng máu chờ loang cùng lúc tối đa. */
const POOL_QUEUE = 8;
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
  readonly model: CharacterView = createPlayerView();
  readonly camera: FollowCamera;
  readonly bikes: Bike[] = [];
  readonly traffic: TrafficSystem;
  readonly pedestrians: PedestrianSim;
  private readonly pedestrianView: PedestrianView;
  /** Người đi bộ gần camera vẽ bằng nhân vật có xương (null nếu chưa tải được mẫu người). */
  private readonly nearPedestrians: NearPedestrianView | null;
  /** Người ngồi quán cóc / người bán ở xe đẩy quanh camera. */
  private readonly seated: SeatedPeopleView | null;
  private readonly view: THREE.PerspectiveCamera;
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
  /** Sao truy nã (công an) — dân gọi báo khi thấy Tín đánh người. */
  readonly wanted = new Wanted();
  /** Còn bao lâu (s) thì vụ có người chết còn "nóng" (báo lúc này là 2 sao). */
  private murderT = 0;
  private lowHealthWarned = false;
  readonly story: StoryRunner;
  readonly chase: ChaseSystem;
  readonly police: ChaseSystem;
  private readonly siren = new Siren();
  /** Chấm xe đàn em trên bản đồ nhỏ (dùng lại, không tạo mảng mỗi khung hình). */
  private readonly gangBlips: Blip[] = [];
  private bustedThisStep = false;
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
  /** Thông số camera khi đi bộ (dùng lại mỗi khung hình). */
  private readonly footRig: CameraRig = { target: new THREE.Vector3(), distance: 3.6, followYaw: null, followRate: 0, fovBoost: 0 };
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
    this.inbox.onMessage = (m, contact) => {
      this.hud.phone?.invalidate();
      if (this.hud.phone?.open) this.hud.phone.notify(contact, m.text);
      else this.hud.showToast(`Tin nhắn mới: ${contact}`, 2.4);
      playSfx('message');
    };
    this.hud.phone?.setFeedSource(() => ({
      seed: city.layout.seed,
      day: this.clock.day,
      hour: this.clock.hour,
      heat: this.heat.level,
      raining: this.weather.state.rain > 0.3,
      debt: this.wallet.debt,
    }));
    this.missions = new MissionDirector(scene, city.layout, hud, this.wallet, this.inbox, () => this.clock.hour, (lvl) => this.heat.set(lvl));
    this.story = new StoryRunner(scene, city.layout, this.missions, hud, this.inbox, this.wallet, () => this.clock.hour, (s, run) => this.schedule(s, run));
    const sight = new SightGrid(city.layout.lots.map((l) => l.rect));
    const network = buildTrafficNetwork(city.layout);
    this.chase = new ChaseSystem(scene, physics, network, sight, city.layout.seed + 11);
    // Công an: cùng cách bám theo đường lớn như đàn em Phát, số xe theo sao truy nã, có đèn chớp + còi hú.
    this.police = new ChaseSystem(scene, physics, network, sight, city.layout.seed + 13, 'police', POLICE_CHASE);
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
    this.view = camera;
    this.nearPedestrians = NearPedestrianView.available() && budget.nearPedestrians > 0 ? new NearPedestrianView(budget.nearPedestrians) : null;
    if (this.nearPedestrians) scene.add(this.nearPedestrians.root);
    this.seated = SeatedPeopleView.available() && budget.nearPedestrians > 0 ? new SeatedPeopleView(city.seats, Math.max(2, Math.round(budget.nearPedestrians * 0.6))) : null;
    if (this.seated) scene.add(this.seated.root);
    this.places = city.places;
    this.shopRng = createRng(city.layout.seed + 41);
    this.hud.shop.onConfirm = (key, mode) => (mode === 'buy' ? this.buyOffer(key) : this.sellSlot(Number(key)));
    this.hud.shop.onBargain = () => this.haggle();
    this.hud.shop.onMode = () => this.refreshShop();
    this.hud.minimap?.setPlaces(this.places);
    this.pickups = new Pickups(city.pickups);
    this.pickupView = new PickupView(this.pickups);
    scene.add(this.pickupView.mesh);
    // Vết máu chỉ đọng trên vỉa hè (cùng cao độ với chỗ người đi bộ đứng), rơi xuống lòng đường thì thôi.
    const blocks = city.layout.blocks;
    this.blood = new BloodSim(city.layout.seed + 23, (x, z) => {
      for (const b of blocks) if (containsPoint(b.rect, x, z)) return true;
      return false;
    });
    scene.add(this.bloodView.root);

    // Cuối cùng (mọi thứ đã dựng xong): nạp bản lưu, không có thì chạy tin nhắn mở màn.
    this.bindBackpack();
    this.loaded = this.restore();
    if (!this.loaded) this.scheduleIntro();
  }

  /** Balo của Tín (phím I). */
  inventory: Inventory = starterInventory();
  /** Máu 0..100 (chiến đấu ở N5; giờ chỉ hồi bằng đồ ăn / thuốc). */
  health = 100;
  /** Vũ khí đang cầm (null = tay không). */
  equipped: ItemId | null = null;
  /** Hệ số thời gian (vòng chọn đồ làm game chậm lại 30 %) — main nhân vào dt. */
  timeScale = 1;
  /** Đòn đang ra (null = không đánh), thời gian từ lúc ra đòn, đã tính trúng chưa, nhịp combo. */
  private attack: AttackDef | null = null;
  private attackT = 0;
  private attackHit = false;
  private combo = 2;
  private sinceAttack = 99;
  /** Cú bấm sát cuối đòn được giữ lại để nối combo ('light' / 'heavy'), null = không có. */
  private queuedAttack: 'light' | 'heavy' | null = null;
  /** Khựng hình khi đòn trúng (giây thật còn lại) — main nhân hệ số chậm vào dt. */
  hitStop = 0;
  /** Đồn công an phường (bị bắt thì được thả ở đây) và trạm y tế phường (gục thì tỉnh dậy ở đây). */
  readonly places: CityPlaces;
  /** Đang mua bán ở tiệm nào (null = không), mức bớt giá đã mặc cả được, kết quả mặc cả ('' = chưa mặc cả). */
  shopping: Shop | null = null;
  private shopDiscount = 0;
  private shopBargain = '';
  private readonly shopRng: () => number;
  /** Nâng cấp đã mua (điện thoại Pro…) — lưu cùng bản lưu. */
  readonly services = new Set<Service>();
  /** Máu đồ ăn còn hồi dần (đồ ăn hồi từ từ, thuốc hồi ngay). */
  private healPending = 0;
  /** Màn hình kết cục đang chạy (null = không), thời gian đã qua (s thật), đã đưa về đồn / trạm chưa. */
  outcome: OutcomeKind | null = null;
  private outcomeT = 0;
  private outcomeDone = false;
  /** Đồ nhặt ngoài phố: ghế nhựa ở chồng ghế quán cóc, mũ bảo hiểm trên yên xe đậu. */
  readonly pickups: Pickups;
  private readonly pickupView: PickupView;
  /** Máu nhẹ (tắt được trong Cài đặt). */
  readonly blood: BloodSim;
  private readonly bloodView = new BloodView();
  private bloodOn = true;
  /** Vũng máu chờ loang dưới người vừa gục (đợi động tác ngã xong): người, đời thứ mấy, còn bao lâu, cỡ vũng. */
  private readonly poolWalker = new Int32Array(POOL_QUEUE).fill(-1);
  private readonly poolGeneration = new Int32Array(POOL_QUEUE);
  private readonly poolTimer = new Float32Array(POOL_QUEUE);
  private readonly poolRadius = new Float32Array(POOL_QUEUE);

  /** Hệ số thời gian cho khung hình này (giây thật `realDt`): khựng hình khi trúng đòn, chậm khi mở vòng chọn đồ. */
  tickScale(realDt: number): number {
    if (this.hitStop > 0) {
      this.hitStop -= realDt;
      return 0.06;
    }
    return this.timeScale;
  }
  private wheelEntries: WheelEntry[] = [];
  private wheelSel = 0;
  private wheelDX = 0;
  private wheelDY = 0;

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
    if (data.inventory !== undefined) this.inventory = Inventory.fromJSON(data.inventory);
    if (typeof data.health === 'number' && Number.isFinite(data.health)) this.health = Math.max(1, Math.min(100, data.health));
    if (typeof data.equipped === 'string' && Object.hasOwn(ITEMS, data.equipped) && ITEMS[data.equipped as ItemId].kind === 'weapon') this.equipped = data.equipped as ItemId;
    // Bản lưu hỏng / cũ: chỉ nhận chuỗi là tên nâng cấp hợp lệ.
    if (Array.isArray(data.services)) for (const sv of data.services) if (typeof sv === 'string' && Object.hasOwn(SERVICES, sv)) this.services.add(sv as Service);
    if (this.services.has('dienThoaiPro')) this.hud.phone?.setPro(true);
    this.bindBackpack();
    const { x, z, yaw } = data.player;
    this.character.teleport(x, PAD_HEIGHT + 0.3, z, yaw);
    // Xe của Tín đậu ngay cạnh chỗ đứng.
    this.bikes[0]?.phys.reset(x + Math.cos(yaw) * 1.6, PAD_HEIGHT, z - Math.sin(yaw) * 1.6, yaw);
    this.savedProgress = this.progressKey();
    this.schedule(1, () => this.hud.showToast('Đã tải bản lưu', 2));
    return true;
  }

  /** Nối balo với giao diện: dùng đồ ăn / thuốc hồi máu, vứt đồ. */
  private bindBackpack(): void {
    this.hud.backpack.setInventory(
      this.inventory,
      (i) => {
        const def = this.inventory.use(i);
        if (def) this.consume(def);
      },
      (i) => {
        const s = this.inventory.slots[i];
        if (!s) return;
        const kind = ITEMS[s.id].kind;
        if (kind === 'quest' || kind === 'misc') return;
        this.inventory.remove(i, 1);
        this.hud.showToast(`Đã vứt: ${ITEMS[s.id].name}`, 1.4);
      },
    );
  }

  /** Ra đòn: nhịp combo kế tiếp, tự xoay về người gần nhất phía trước (khoá mục tiêu nhẹ), phát động tác. */
  private startAttack(heavy: boolean): void {
    this.combo = heavy ? 0 : nextCombo(this.combo, this.sinceAttack);
    const def = attackFor(this.equipped, this.combo, heavy);
    const p = this.character.feet();
    let best = -1;
    let bestD = 2.4;
    const yaw = this.character.yaw;
    for (const w of this.pedestrians.walkers) {
      if (w.dead) continue;
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      const facing = ((w.x - p.x) * Math.sin(yaw) + (w.z - p.z) * Math.cos(yaw)) / Math.max(d, 1e-3);
      if (d < bestD && facing > 0.25) {
        bestD = d;
        best = w.id;
      }
    }
    if (best >= 0) {
      const w = this.pedestrians.walkers[best]!;
      this.character.yaw = Math.atan2(w.x - p.x, w.z - p.z);
    }
    this.model.attack?.(def.clip, def.duration);
    this.attack = def;
    this.attackT = 0;
    this.attackHit = false;
  }

  /** Đòn đang ra: tới thời điểm chạm thì tính trúng ai (quạt phía trước), trừ máu, khựng hình, rung camera. */
  private updateAttack(dt: number): void {
    this.sinceAttack += dt;
    const def = this.attack;
    if (!def) return;
    this.attackT += dt;
    if (!this.attackHit && this.attackT >= def.hitAt) {
      this.attackHit = true;
      const p = this.character.feet();
      const yaw = this.character.yaw;
      let hits = 0;
      let kills = 0;
      for (const w of this.pedestrians.walkers) {
        if (w.dead || !inStrike(p.x, p.z, yaw, def.reach, def.arc, w.x, w.z)) continue;
        const r = this.pedestrians.hit(w.id, def.damage, p.x, p.z, def.knock);
        if (!r) continue;
        hits++;
        if (r === 'dead') kills++;
        if (this.bloodOn) {
          // Giọt bắn từ ngực / vai nạn nhân theo hướng đòn; gục (hoặc ngã vì lưỡi sắc) thì chờ ngã xong mới loang vũng.
          const b = bloodFor(this.equipped, r);
          this.blood.spray(w.x, PAD_HEIGHT + 1.2, w.z, w.x - p.x, w.z - p.z, b.drops, PAD_HEIGHT);
          if (b.pool > 0) this.queuePool(w.id, w.generation, r === 'dead' ? 1.5 : 0.7, b.pool);
        }
      }
      if (hits > 0) {
        this.hitStop = def.knock ? 0.11 : 0.06;
        this.camera.shake(def.knock ? 0.07 : 0.035);
        playSfx(def.knock ? 'hitHeavy' : 'hit');
        // Người xung quanh thấy đánh nhau: bỏ chạy, la lên, quay video, gọi công an, có người xông vào. Có người chết
        // thì nhiều người thấy hơn và báo nặng hơn.
        this.pedestrians.witness(p.x, p.z, kills > 0 ? 22 : 16);
        if (kills > 0) this.murderT = 90;
        this.wearWeapon(hits);
      } else playSfx('swing');
    }
    if (this.attackT >= def.duration) {
      this.attack = null;
      this.sinceAttack = 0;
    }
  }

  /** Sự kiện từ đám đông mỗi bước: bị đấm (người đánh trả), có người gọi báo xong (⇒ sao truy nã) / bị ngăn. */
  private handleCrowd(dt: number, px: number, pz: number): void {
    const sim = this.pedestrians;
    if (sim.damageToPlayer > 0) {
      this.hurtPlayer(sim.damageToPlayer);
      sim.damageToPlayer = 0;
    }
    if (sim.reports > 0) {
      for (; sim.reports > 0; sim.reports--) this.wanted.report(this.murderT > 0 ? 2 : 1, px, pz);
      this.hud.showToast(this.murderT > 0 ? 'Có người báo công an: có án mạng!' : 'Có người gọi công an báo vụ ẩu đả!', 2.6);
      playSfx('alert');
    }
    if (sim.shouts > 0) {
      sim.shouts = 0;
      playSfx('scream');
    }
    if (sim.callsStopped > 0) {
      sim.callsStopped = 0;
      this.hud.showToast('Người kia hoảng quá, cúp máy bỏ chạy', 1.8);
    }
    this.murderT = Math.max(0, this.murderT - dt);
  }

  /** Tín trúng đòn (người đi đường đánh trả): mất máu, khựng nhẹ, rung camera; hết máu thì GỤC. */
  private hurtPlayer(damage: number): void {
    if (this.outcome) return;
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.startOutcome('wasted');
      return;
    }
    this.camera.shake(0.045);
    playSfx('hit');
    if (this.mode === 'foot' && !this.attack) this.model.attack?.('hitChest', 0.42);
    if (this.bloodOn) {
      const f = this.character.curr;
      this.blood.spray(f.x, f.y + 1.35, f.z, -Math.sin(this.character.yaw), -Math.cos(this.character.yaw), 2, f.y);
    }
    if (this.health < 25 && !this.lowHealthWarned) {
      this.lowHealthWarned = true;
      this.hud.showToast('Máu thấp! Ăn gì đó (I) hoặc chạy đi', 2.4);
    } else if (this.health >= 40) this.lowHealthWarned = false;
  }

  private queuePool(walker: number, generation: number, delay: number, radius: number): void {
    let slot = 0;
    for (let i = 0; i < POOL_QUEUE; i++) {
      if (this.poolWalker[i] === -1) {
        slot = i;
        break;
      }
      if (this.poolTimer[i]! < this.poolTimer[slot]!) slot = i;
    }
    this.poolWalker[slot] = walker;
    this.poolGeneration[slot] = generation;
    this.poolTimer[slot] = delay;
    this.poolRadius[slot] = radius;
  }

  /** Máu: giọt bay, vết mờ dần; tới giờ thì loang vũng dưới thân người nằm (hông nhân vật có xương, hoặc ước lượng). */
  private updateBlood(dt: number): void {
    this.blood.step(dt);
    for (let i = 0; i < POOL_QUEUE; i++) {
      const id = this.poolWalker[i]!;
      if (id < 0) continue;
      this.poolTimer[i]! -= dt;
      if (this.poolTimer[i]! > 0) continue;
      this.poolWalker[i] = -1;
      const w = this.pedestrians.walkers[id];
      // Người đã được đặt lại chỗ khác (đi xa rồi quay lại) ⇒ thôi.
      if (!w || w.generation !== this.poolGeneration[i]) continue;
      let x = w.x;
      let z = w.z;
      if (this.nearPedestrians?.pelvisOf(id, this.tmp)) {
        x = this.tmp.x;
        z = this.tmp.z;
      } else if (w.dead || w.down > 0) {
        // Hình ở xa nằm ngửa ra sau từ chỗ chân: thân ở sau lưng ~0,8 m.
        x -= Math.sin(w.yaw) * 0.8;
        z -= Math.cos(w.yaw) * 0.8;
      }
      this.blood.pool(x, PAD_HEIGHT, z, this.poolRadius[i]!);
    }
  }

  /** Mỗi lần đánh trúng hao 1 độ bền vũ khí; hết độ bền thì gãy (mất khỏi balo). */
  private wearWeapon(hits: number): void {
    if (!this.equipped) return;
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const sl = this.inventory.slots[i];
      if (sl?.id !== this.equipped || sl.durability === undefined) continue;
      sl.durability -= hits;
      if (sl.durability <= 0) {
        this.hud.showToast(BREAK_TEXT[sl.id] ?? `${ITEMS[sl.id].name} gãy rồi!`, 2);
        this.inventory.remove(i, 1);
        this.hud.backpack.invalidate();
      }
      return;
    }
  }

  /** Vũ khí bị vứt / hỏng ⇒ về tay không; cập nhật hình cầm tay + ô vũ khí trên HUD. */
  private syncWeapon(): void {
    if (this.equipped && this.inventory.count(this.equipped) === 0) this.equipped = null;
    this.model.setWeapon?.(this.equipped);
    if (!this.equipped) {
      this.hud.setWeapon(null, 1);
      return;
    }
    const def: ItemDef = ITEMS[this.equipped];
    let wear = 1;
    for (const sl of this.inventory.slots) {
      if (sl?.id !== this.equipped) continue;
      if (sl.durability !== undefined && def.durability) wear = sl.durability / def.durability;
      break;
    }
    this.hud.setWeapon(def.name, wear);
  }

  private updateWheel(dx: number, dy: number): void {
    const wheel = this.hud.wheel;
    if (!wheel.open) {
      this.wheelEntries = buildWheel(this.inventory);
      const cur = this.wheelEntries.findIndex((e) => (e.kind === 'hand' ? this.equipped === null : e.kind === 'weapon' && e.id === this.equipped));
      this.wheelSel = Math.max(0, cur);
      this.wheelDX = 0;
      this.wheelDY = 0;
      wheel.show(this.wheelEntries, this.wheelSel, this.equipped ? ITEMS[this.equipped].name : 'Tay không');
    }
    // Như cần analog: cộng dồn chuyển động chuột, giới hạn bán kính ⇒ đổi hướng là đổi ô ngay.
    this.wheelDX += dx;
    this.wheelDY += dy;
    const len = Math.hypot(this.wheelDX, this.wheelDY);
    if (len > 120) {
      this.wheelDX *= 120 / len;
      this.wheelDY *= 120 / len;
    }
    this.wheelSel = sectorAt(this.wheelDX, this.wheelDY, this.wheelEntries.length, this.wheelSel);
    wheel.select(this.wheelSel, this.equipped ? ITEMS[this.equipped].name : 'Tay không');
    this.timeScale = 0.3;
  }

  private closeWheel(): void {
    const e = this.wheelEntries[this.wheelSel];
    this.hud.wheel.hide();
    this.timeScale = 1;
    if (e) this.applyWheel(e);
  }

  /** Dùng một ô của vòng chọn đồ: cầm / cất vũ khí, ăn / băng bó (bớt một món trong balo). */
  private applyWheel(e: WheelEntry): void {
    if (e.kind === 'hand') {
      if (this.equipped) this.hud.showToast('Cất vũ khí', 1);
      this.equipped = null;
      return;
    }
    if (e.kind === 'weapon') {
      if (this.equipped !== e.id) this.hud.showToast(`Cầm ${e.label}`, 1.2);
      this.equipped = e.id;
      return;
    }
    const index = this.inventory.slots.findIndex((sl) => sl?.id === e.id);
    if (index < 0) return;
    const def = this.inventory.use(index);
    if (!def) return;
    this.consume(def);
    this.hud.backpack.invalidate();
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
      inventory: this.inventory.toJSON(),
      health: this.health,
      equipped: this.equipped,
      services: [...this.services],
    });
    if (announce) this.hud.showToast(ok ? 'Đã lưu game' : 'Trình duyệt chặn lưu game', 1.6);
    return ok;
  }

  /** Bị công an bắt (áp sát khi Tín đứng yên / chạy chậm) ⇒ màn hình BỊ BẮT rồi về đồn. */
  private busted(): void {
    this.startOutcome('busted');
  }

  /**
   * Bắt đầu màn hình kết cục: game chậm lại, khung hình mất màu, chữ lớn; khoá điều khiển. Sau ~3 s mờ đen rồi đưa về
   * đồn công an (bị bắt) / trạm y tế (gục).
   */
  private startOutcome(kind: OutcomeKind): void {
    if (this.outcome) return;
    this.outcome = kind;
    this.outcomeT = 0;
    this.outcomeDone = false;
    this.attack = null;
    this.queuedAttack = null;
    this.hud.phone?.setOpen(false);
    this.hud.backpack.setOpen(false);
    if (this.hud.wheel.open) this.hud.wheel.hide();
    this.timeScale = 0.35;
    this.hud.outcome.show(kind);
    // Gục thì ngã xuống; bị bắt thì giơ tay chống đỡ (giữ tư thế tới lúc màn hình đen).
    this.model.attack?.(kind === 'wasted' ? 'deathB' : 'defend', 1.6);
    playSfx('fail');
  }

  /** Nhịp màn hình kết cục (theo giây thật xấp xỉ: dt game chia hệ số chậm). Trả true khi còn khoá điều khiển. */
  private updateOutcome(dt: number): boolean {
    const kind = this.outcome;
    if (!kind) return false;
    this.outcomeT += dt / Math.max(0.05, this.timeScale);
    if (this.outcomeT >= OUTCOME.black) this.hud.outcome.setBlack(true);
    if (this.outcomeT >= OUTCOME.respawn && !this.outcomeDone) {
      this.outcomeDone = true;
      this.timeScale = 1;
      this.hud.outcome.hide();
      this.respawnAfter(kind);
    }
    if (this.outcomeT >= OUTCOME.reveal) this.hud.outcome.setBlack(false);
    if (this.outcomeT >= OUTCOME.end) this.outcome = null;
    return true;
  }

  /** Sau màn hình đen: về đồn / trạm y tế, trả giá, hết truy nã, nhiệm vụ đang làm thất bại. */
  private respawnAfter(kind: OutcomeKind): void {
    if (this.riding) this.dismount();
    const place = kind === 'busted' ? this.places.police : this.places.clinic;
    this.character.teleport(place.x, PAD_HEIGHT + 0.3, place.z, place.yaw);
    this.camera.yaw = place.yaw + Math.PI;
    // Xe của Tín được đưa tới đậu bên trái (trái của hướng (sin, cos) là (cos, −sin)).
    this.bikes[0]?.phys.reset(place.x + Math.cos(place.yaw) * 1.6, PAD_HEIGHT, place.z - Math.sin(place.yaw) * 1.6, place.yaw);
    this.wanted.clear();
    this.police.sim.disperse();
    this.heat.set(0);
    this.chase.sim.disperse();
    this.missions.fail(kind === 'busted' ? 'Tín bị công an bắt' : 'Tín bị gục');
    if (kind === 'busted') {
      const fine = this.wallet.spend(Math.max(BUSTED_FINE, this.wallet.cash * 0.2), 'Nộp phạt (bị công an bắt)', this.clock.hour);
      let seized = 0;
      for (let i = 0; i < this.inventory.slots.length; i++) {
        const sl = this.inventory.slots[i];
        if (sl && ITEMS[sl.id].kind === 'weapon') {
          seized += sl.count;
          this.inventory.slots[i] = null;
        }
      }
      this.equipped = null;
      this.hud.backpack.invalidate();
      this.hud.showToast(`Ra khỏi ${place.name}: nộp phạt ${formatVnd(fine)}${seized > 0 ? ', bị tịch thu vũ khí' : ''}`, 4);
      this.schedule(3, () => this.inbox.receive('Ngân', 'Anh lại lên phường hả?? Hàng xóm đăng lên Phây rồi kìa 😭', this.clock.hour));
    } else {
      const fee = this.wallet.spend(Math.max(HOSPITAL_FEE, this.wallet.cash * 0.1), 'Viện phí', this.clock.hour);
      this.health = 100;
      this.lowHealthWarned = false;
      this.hud.showToast(`Tỉnh dậy ở ${place.name}. Viện phí ${formatVnd(fee)}`, 4);
    }
  }

  /** Cửa hàng Tín đang đứng bên trong (null nếu không). */
  private shopAt(x: number, z: number): Shop | null {
    for (const s of this.city.shops) if (insideShop(s, x, z)) return s;
    return null;
  }

  /** Bảng mua bán: E mở khi đứng trong tiệm; đang mở thì ↑ ↓ chọn, E / Enter mua, B mặc cả, Tab mua ⇄ bán, Esc đóng. */
  private updateShop(input: Input): void {
    const here = this.shopAt(this.character.curr.x, this.character.curr.z);
    if (this.shopping) {
      if (here !== this.shopping || this.hud.phone?.open || input.wasPressed('Escape')) {
        this.closeShop();
        return;
      }
      const panel = this.hud.shop;
      if (input.wasPressed('ArrowUp')) panel.move(-1);
      if (input.wasPressed('ArrowDown')) panel.move(1);
      if (input.wasPressed('KeyE', 'Enter')) panel.confirm();
      if (input.wasPressed('KeyB')) this.haggle();
      if (input.wasPressed('Tab')) panel.setMode(panel.mode === 'buy' ? 'sell' : 'buy');
      return;
    }
    if (here && input.wasPressed('KeyE') && !this.hud.backpack.open && !this.hud.phone?.open) this.openShop(here);
  }

  private openShop(shop: Shop): void {
    const t = SHOP_TYPES[shop.kind];
    this.shopping = shop;
    this.shopDiscount = 0;
    this.shopBargain = '';
    this.hud.shop.show(t.title, t.color, shop.kind === 'camDo');
    this.hud.shop.setTalk(GREETINGS[shop.kind]);
    this.refreshShop();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private closeShop(): void {
    this.shopping = null;
    this.hud.shop.hide();
  }

  /** Vẽ lại danh sách hàng (mua) / đồ tiệm mua lại (bán). Chỉ gọi khi có thay đổi, không mỗi khung hình. */
  private refreshShop(): void {
    const shop = this.shopping;
    if (!shop) return;
    const panel = this.hud.shop;
    const rows: ShopRow[] = [];
    if (panel.mode === 'buy') {
      for (const o of CATALOG[shop.kind]) {
        const price = finalPrice(o.price, this.shopDiscount);
        const status = canBuy(o, price, Number.MAX_SAFE_INTEGER, this.inventory, this.services);
        const have = isService(o.id) ? 0 : this.inventory.count(o.id);
        rows.push({
          key: o.id,
          name: offerName(o.id),
          desc: isService(o.id) ? SERVICES[o.id].desc : ITEMS[o.id].desc,
          color: isService(o.id) ? SERVICES[o.id].color : ITEMS[o.id].color,
          price,
          listPrice: o.price,
          note: status === 'owned' ? 'Đã có' : have > 0 ? `Có ${have}` : undefined,
          disabled: status === 'owned',
        });
      }
    } else {
      this.inventory.slots.forEach((sl, i) => {
        if (!sl) return;
        const price = sellPrice(sl.id, sl.durability);
        if (price <= 0) return;
        const def: ItemDef = ITEMS[sl.id];
        const wear = sl.durability !== undefined && def.durability ? ` · độ bền ${Math.round((sl.durability / def.durability) * 100)}%` : '';
        rows.push({ key: String(i), name: def.name, desc: `Tiệm mua lại${wear}`, color: def.color, price, note: sl.id === this.equipped ? 'Đang cầm' : undefined });
      });
    }
    panel.setRows(rows, this.wallet.cash, this.shopBargain);
  }

  private buyOffer(key: string): void {
    const shop = this.shopping;
    const offer = shop ? CATALOG[shop.kind].find((o) => o.id === key) : undefined;
    if (!shop || !offer) return;
    const cost = finalPrice(offer.price, this.shopDiscount);
    const status = canBuy(offer, cost, this.wallet.cash, this.inventory, this.services);
    if (status !== 'ok') {
      this.hud.shop.setTalk(status === 'no-money' ? 'Thiếu tiền rồi con, chạy thêm vài kèo rồi quay lại.' : status === 'full' ? 'Balo đầy rồi, bỏ bớt đồ ra đi.' : 'Cái này có rồi mà.');
      return;
    }
    this.wallet.spend(cost, `Mua ${offerName(offer.id)}`, this.clock.hour);
    if (isService(offer.id)) this.applyService(offer.id);
    else this.inventory.add(offer.id);
    this.hud.shop.setTalk(shop.kind === 'camDo' ? 'Hàng xài kỹ nha, gãy không đổi trả.' : 'Cảm ơn con, lần sau ghé nữa nha!');
    this.hud.backpack.invalidate();
    playSfx('pickup');
    this.refreshShop();
  }

  /** Nâng cấp / dịch vụ mua ở tiệm: balo lớn hơn, điện thoại Pro, thay đồ (công an khó nhận ra). */
  private applyService(id: Service): void {
    switch (id) {
      case 'balo16':
      case 'balo24':
        this.inventory.upgrade(id === 'balo16' ? 16 : 24);
        this.hud.showToast(`${SERVICES[id].name} — balo rộng hơn rồi`, 2.2);
        break;
      case 'dienThoaiPro':
        this.services.add(id);
        this.hud.phone?.setPro(true);
        this.hud.showToast('Lên đời Sầu Riêng S9 Pro!', 2.2);
        break;
      case 'doiDo':
        this.hud.showToast(this.wanted.disguise() ? 'Thay đồ xong — công an khó nhận ra hơn' : 'Thay đồ mới — bảnh!', 2.4);
        break;
    }
  }

  private sellSlot(index: number): void {
    const sl = this.inventory.slots[index];
    if (!sl || !this.shopping) return;
    const price = sellPrice(sl.id, sl.durability);
    if (price <= 0) return;
    this.wallet.earn(price, `Bán ${ITEMS[sl.id].name}`, this.clock.hour);
    this.inventory.remove(index, 1);
    this.hud.shop.setTalk('Đồ cũ rồi, nhiêu đó thôi nha. Khỏi hỏi nguồn gốc.');
    this.hud.backpack.invalidate();
    playSfx('money');
    this.refreshShop();
  }

  /** Mặc cả một lần mỗi lần ghé: hên thì được bớt 10–20 %. */
  private haggle(): void {
    if (!this.shopping || this.shopBargain || this.hud.shop.mode !== 'buy') return;
    const r = bargain(this.shopRng);
    this.shopDiscount = r.discount;
    this.shopBargain = r.ok ? `Đã bớt ${Math.round(r.discount * 100)}%` : 'Không bớt';
    this.hud.shop.setTalk(r.ok ? 'Thôi được, khách quen bớt cho chút đỉnh.' : 'Giá này là giá chót rồi con ơi!');
    this.refreshShop();
  }

  /** Ăn / dùng thuốc: đồ ăn hồi máu từ từ (vài giây), thuốc hồi ngay. */
  private consume(def: ItemDef): void {
    const room = Math.max(0, 100 - this.health - this.healPending);
    const gain = Math.min(room, def.heal ?? 0);
    if (def.kind === 'food') this.healPending += gain;
    else this.health = Math.min(100, this.health + gain);
    this.hud.showToast(gain > 0 ? `${def.name}: +${Math.round(gain)} máu${def.kind === 'food' ? ' (từ từ)' : ''}` : `${def.name}: đã đầy máu rồi`, 1.8);
  }

  /** Tín đang ở trong một cửa hàng hoặc trên vỉa hè ngay trước cửa (2,5 m). */
  private nearShop(x: number, z: number): boolean {
    for (const s of this.city.shops) if (insideShop(s, x, z, 2.5)) return true;
    return false;
  }

  /** Tên chỗ đang đứng cho HUD: trong cửa hàng vào được thì tên tiệm, không thì tên đường / khu. */
  private placeName(x: number, z: number): string {
    for (const s of this.city.shops) if (insideShop(s, x, z)) return SHOP_TYPES[s.kind].title;
    return locate(this.city.layout, x, z).name;
  }

  /** Điểm (x, z) có nằm trong hẻm không (trốn trong hẻm thì mau thoát truy nã). */
  private inHem(x: number, z: number): boolean {
    const hems = this.city.layout.hems;
    for (let i = 0; i < hems.length; i++) if (containsPoint(hems[i]!.rect, x, z)) return true;
    return false;
  }

  /** Bản đồ nhỏ: chấm đàn em, xe công an + nón tầm nhìn, vùng tìm kiếm khi khuất mặt; còi hú theo xe gần nhất. */
  private updateMapAndSiren(): void {
    const gang = this.chase;
    for (let i = this.gangBlips.length; i < gang.unitCount; i++) this.gangBlips.push({ x: 0, z: 0, color: '#ff4b3e' });
    for (let i = 0; i < gang.unitCount; i++) {
      this.gangBlips[i]!.x = gang.units[i]!.x;
      this.gangBlips[i]!.z = gang.units[i]!.z;
    }
    const map = this.hud.minimap;
    map?.setBlips(this.gangBlips, gang.unitCount);
    map?.setPolice(this.police.units, this.police.unitCount);
    const w = this.wanted;
    map?.setSearch(w.searchX, w.searchZ, w.level > 0 && !w.seen ? w.radius : 0);
    let nearest = Infinity;
    const me = this.riding ? this.riding.view.root.position : this.character.curr;
    const px = me.x;
    const pz = me.z;
    for (let i = 0; i < this.police.unitCount; i++) {
      const u = this.police.units[i]!;
      nearest = Math.min(nearest, Math.hypot(u.x - px, u.z - pz));
    }
    this.siren.update(nearest);
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

  /** Giờ game tính từ lúc vào game (đồ nhặt được có lại theo giờ game). */
  private gameHours(): number {
    return this.clock.day * 24 + this.clock.hour;
  }

  /** Nhặt đồ ở chỗ `spot`: cho vào balo rồi cầm lên tay luôn. */
  private pickUp(spot: number): void {
    const item = this.pickups.spots[spot]!.item;
    if (this.inventory.add(item) > 0) {
      this.hud.showToast('Balo đầy rồi — vứt bớt đồ (I) mới nhặt được', 2);
      return;
    }
    this.pickups.take(spot, this.gameHours());
    this.equipped = item;
    this.hud.backpack.invalidate();
    this.hud.showToast(`${PICKUP_DONE[item] ?? `Đã nhặt: ${ITEMS[item].name}`}`, 2);
    playSfx('pickup');
  }

  /** Bật / tắt máu nhẹ (Cài đặt). Tắt thì xoá luôn vết đang có. */
  setBlood(on: boolean): void {
    this.bloodOn = on;
    if (!on) {
      this.blood.clear();
      this.poolWalker.fill(-1);
    }
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
    // Màn hình BỊ BẮT / GỤC: khoá điều khiển tới khi được đưa về đồn / trạm y tế.
    const locked = this.updateOutcome(dt);
    // Vòng chọn đồ: giữ Tab ⇒ mở vòng, game chậm lại, chuột chọn ô (không xoay camera); nhả Tab ⇒ dùng ô đang chọn.
    const wheelWanted = !locked && !this.shopping && input.isDown('Tab') && !this.hud.phone?.open && !this.hud.backpack.open;
    if (wheelWanted) this.updateWheel(input.mouseDX, input.mouseDY);
    else if (this.hud.wheel.open) this.closeWheel();
    if (!wheelWanted && (input.mouseDX || input.mouseDY)) this.camera.look(input.mouseDX, input.mouseDY);
    // Phím nhanh (điện thoại đóng): 1 tay không, 2–3 vũ khí, 4 ăn món hồi nhiều nhất.
    if (!locked && !this.hud.phone?.open && !wheelWanted && input.wasPressed('Digit1', 'Digit2', 'Digit3', 'Digit4')) {
      // Chỉ dựng danh sách khi có bấm phím (không tạo rác mỗi khung hình).
      const quick = buildWheel(this.inventory);
      const weapons = quick.filter((e) => e.kind === 'weapon');
      const food = quick.find((e) => e.kind === 'food');
      if (input.wasPressed('Digit1')) this.applyWheel(quick[0]!);
      if (input.wasPressed('Digit2') && weapons[0]) this.applyWheel(weapons[0]);
      if (input.wasPressed('Digit3') && weapons[1]) this.applyWheel(weapons[1]);
      if (input.wasPressed('Digit4') && food) this.applyWheel(food);
    }
    this.syncWeapon();
    // Cận chiến (đi bộ, không mở điện thoại / balo / vòng chọn đồ): chuột trái đòn nhẹ (combo 3 nhịp), chuột phải đòn mạnh.
    const busyUi = locked || this.shopping !== null || this.hud.phone?.open || this.hud.backpack.open || wheelWanted;
    if (this.mode === 'foot' && !busyUi && input.wasPressed('Mouse0', 'Mouse2')) {
      const heavy = input.wasPressed('Mouse2');
      if (!this.attack) this.startAttack(heavy);
      // Bấm trong 0,35 s cuối đòn: giữ lại, đòn xong thì ra đòn kế (nối combo mượt).
      else if (this.attack.duration - this.attackT < 0.35) this.queuedAttack = heavy ? 'heavy' : 'light';
    }
    this.updateAttack(dt);
    if (!this.attack && this.queuedAttack && this.mode === 'foot') {
      const heavy = this.queuedAttack === 'heavy';
      this.queuedAttack = null;
      this.startAttack(heavy);
    }
    this.updateBlood(dt);
    if (input.wheel) this.camera.addZoom(input.wheel);
    if (input.wasPressed('F1')) this.hud.toggleHelp();
    if (input.wasPressed('KeyH')) this.horn.beep();
    if (input.wasPressed('KeyM')) this.hud.showToast(mixer.toggleMute() ? 'Đã tắt tiếng (M)' : 'Đã bật tiếng (M)', 1.4);
    if (input.wasPressed('KeyL')) this.headlight = !this.headlight;

    // Balo: I bật/tắt; đang mở thì mũi tên chọn ô, E dùng, X vứt, Esc đóng.
    const bp = this.hud.backpack;
    if (input.wasPressed('KeyI') && !locked) bp.toggle();
    else if (bp.open) {
      if (input.wasPressed('Escape')) bp.setOpen(false);
      if (input.wasPressed('ArrowLeft')) bp.move(-1, 0);
      if (input.wasPressed('ArrowRight')) bp.move(1, 0);
      if (input.wasPressed('ArrowUp')) bp.move(0, -1);
      if (input.wasPressed('ArrowDown')) bp.move(0, 1);
      if (input.wasPressed('KeyE') || input.wasPressed('Enter')) bp.useSelected();
      if (input.wasPressed('KeyX') || input.wasPressed('Delete')) bp.dropSelected();
    }
    bp.update();

    // Điện thoại: P bật/tắt, 1–8 mở thẳng app, Backspace / Esc lùi về màn hình chính (đang ở đó thì cất máy).
    const phone = this.hud.phone;
    if (phone) {
      if (input.wasPressed('KeyP') && !locked) phone.toggle();
      else if (phone.open && (input.wasPressed('Escape') || input.wasPressed('Backspace')) && !phone.back()) phone.setOpen(false);
      if (phone.open) {
        for (let i = 0; i < PHONE_KEYS.length; i++) if (input.wasPressed(`Digit${i + 1}`)) phone.show(PHONE_KEYS[i]!);
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
    if (locked) {
      // Đang ở màn hình kết cục: không lên xe / nhặt đồ.
    } else if (this.mode === 'foot') {
      const near = this.nearestBike();
      if (near && near.dist < MOUNT_RANGE) {
        prompt = '<kbd>F</kbd> Lên xe';
        if (input.wasPressed('KeyF')) this.mount(near.bike);
      }
      // Cửa hàng: đứng trong tiệm thì E mở bảng mua bán.
      this.updateShop(input);
      const inShop = this.shopping ? null : this.shopAt(this.character.curr.x, this.character.curr.z);
      if (this.shopping) prompt = '';
      else if (inShop) prompt = inShop.kind === 'camDo' ? SHOP_PROMPT_PAWN : SHOP_PROMPT;
      // Đồ nhặt được (ghế nhựa, mũ bảo hiểm): phím G (gợi ý lên xe được ưu tiên hiện).
      const spot = this.pickups.nearest(this.character.curr.x, this.character.curr.z, this.gameHours());
      if (spot >= 0) {
        if (!prompt) prompt = PICKUP_PROMPT[this.pickups.spots[spot]!.item] ?? '<kbd>G</kbd> Nhặt';
        if (input.wasPressed('KeyG')) this.pickUp(spot);
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

    if (this.mode === 'foot' && !locked && input.wasPressed('Space')) this.jumpQueued = true;

    // Bước vật lý cố định.
    const steps = this.stepper.advance(dt);
    const cam = this.camera.forward();
    // Balo đang mở thì mũi tên dùng để chọn ô ⇒ chỉ đi / lái bằng WASD.
    const keys = this.hud.backpack.open ? MOVE_WASD : MOVE_ALL;
    const frozen = locked || this.shopping !== null;
    const fwd = frozen ? 0 : input.axis(keys.back, keys.fwd);
    const strafe = frozen ? 0 : input.axis(keys.left, keys.right);
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
      this.handleCrowd(STEP, me.x, me.z);

      // Truy đuổi: xe đàn em bám theo khi có Độ Nóng; khuất tầm nhìn đủ lâu thì cắt đuôi.
      const mySpeed = this.riding ? Math.abs(this.riding.phys.speed) : this.character.actualSpeed;
      if (this.chase.step(STEP, { x: me.x, z: me.z, speed: mySpeed }, this.heat.level)) this.caughtThisStep = true;
      // Truy nã: xe công an theo sao; công an thấy thì vùng tìm kiếm đi theo Tín, khuất mặt đủ lâu thì thoát.
      if (this.police.step(STEP, { x: me.x, z: me.z, speed: mySpeed }, this.wanted.level) && !this.outcome) this.bustedThisStep = true;
      if (this.wanted.update(STEP, this.police.sim.seen, me.x, me.z, this.wanted.level > 0 && this.inHem(me.x, me.z)) === 'escaped') {
        this.police.sim.disperse();
        this.hud.showToast('Đã thoát khỏi truy nã!', 2.4);
        playSfx('escaped');
      }
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
        // Đang ra đòn thì đứng tấn (không đi).
        const still = this.attack ? 0 : 1;
        const mx = (cam.x * fwd - cam.z * strafe) * still;
        const mz = (cam.z * fwd + cam.x * strafe) * still;
        this.character.update(STEP, { x: mx, z: mz, run: input.isDown('ShiftLeft', 'ShiftRight'), jump: this.jumpQueued });
        this.jumpQueued = false;
      }
      for (const b of this.bikes) {
        if (b === this.riding) {
          const controls = this.controls;
          controls.throttle = this.autopilot?.throttle ?? fwd;
          controls.steer = this.autopilot?.steer ?? -strafe;
          controls.handbrake = this.autopilot?.handbrake ?? (locked || input.isDown('Space'));
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
    this.police.render(alpha, dt);
    if (this.caughtThisStep) {
      this.caughtThisStep = false;
      this.caught();
    }
    if (this.bustedThisStep) {
      this.bustedThisStep = false;
      this.busted();
    }
    this.hud.setHeat(this.heat.level, this.heat.escapeProgress, this.chase.sim.seen);
    this.hud.setWanted(this.wanted.level, this.wanted.escapeProgress, this.wanted.seen);
    // Đồ ăn hồi máu từ từ (8 máu / giây).
    if (this.healPending > 0) {
      const h = Math.min(this.healPending, 8 * dt);
      this.healPending -= h;
      this.health = Math.min(100, this.health + h);
    }
    // Máu / giáp (giáp có ở N5).
    this.hud.setVitals(this.health / 100, 0);
    this.updateMapAndSiren();
    if (this.nearPedestrians) this.nearPedestrians.update(this.pedestrians.walkers, alpha, dt, this.view.position.x, this.view.position.z);
    this.pickupView.update(this.view.position.x, this.view.position.z, this.gameHours());
    this.bloodView.update(this.blood);
    this.seated?.update(dt, this.clock.hour, this.view.position.x, this.view.position.z);
    this.pedestrianView.update(this.pedestrians.walkers, alpha, this.nearPedestrians?.lod);
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
        phone: this.hud.phone?.open === true,
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
      // Trong tiệm (hoặc ngay trước cửa): camera gần hơn, thấp hơn, không nhô lên quá mái hiên / trần.
      const indoors = this.nearShop(feet.x, feet.z);
      this.tmp.set(feet.x, feet.y + (indoors ? 1.45 : 1.55), feet.z);
      this.footRig.target = this.tmp;
      this.footRig.distance = indoors ? 2.6 : 3.6;
      this.footRig.fovBoost = Math.min(this.character.actualSpeed, 6.4) * 0.6;
      this.footRig.maxHeight = indoors ? PAD_HEIGHT + 2.1 : undefined;
      this.camera.update(dt, this.footRig, looking);
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
      this.hud.setPlace(this.placeName(this.tmp.x, this.tmp.z));
    }
  }
}

