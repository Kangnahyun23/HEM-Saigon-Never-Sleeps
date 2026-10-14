import { expect, test, type Page } from '@playwright/test';
import { hemMouths } from '../../src/world/city/hemDetails';
import { generateCity } from '../../src/world/city/layout';

/**
 * Ô tô lái được (N7.1): đứng cạnh xe đậu ven đường thì có gợi ý "Vào xe"; F vào xe (Tín ngồi trong khoang kín),
 * ga, cua, phanh, F ra khỏi xe đứng cạnh cửa; trụ chắn ở miệng hẻm cản ô tô nhưng xe máy lọt qua.
 * Cướp xe (N7.1 phần 2): chặn đầu ô tô NPC cho nó dừng, F kéo tài xế ra rồi lái đi; tài xế gọi báo ⇒ có sao truy nã.
 * Chạy riêng: npx playwright test car
 */

type Vehicle = {
  kind: 'bike' | 'car';
  phys: { speed: number; curr: { x: number; z: number; yaw: number }; heading(): number; reset(x: number, y: number, z: number, yaw: number): void };
  view: { root: { visible: boolean } };
};
type G = {
  mode: 'foot' | 'ride';
  autopilot: { throttle?: number; steer?: number; handbrake?: boolean } | null;
  riding: Vehicle | null;
  cars: Vehicle[];
  bikes: Vehicle[];
  model: { root: { visible: boolean } };
  character: { feet(): { x: number; y: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
  mount(v: Vehicle): void;
  freeCamera: boolean;
  wanted: { level: number };
  pedestrians: { walkers: { x: number; z: number; react: string; enter: number; generation: number }[] };
  traffic: {
    sim: {
      bikes: number;
      network: { lanes: { length: number }[] };
      agents: { kind: string; x: number; z: number; yaw: number; speed: number; lane: number; s: number; turn: unknown; generation: number }[];
    };
  };
};

const simulate = (page: Page, s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);
const shot = async (page: Page, name: string) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + 3, { timeout: 120_000 });
  await page.screenshot({ path: `tests/e2e/__screenshots__/${name}.png` });
};
const pressF = (page: Page) =>
  page.evaluate(() => {
    const h = window.__HEM__!;
    const input = h.input as { setKey(c: string, d: boolean): void };
    input.setKey('KeyF', true);
    (h.simulate as (n: number) => void)(1 / 60);
    input.setKey('KeyF', false);
    (h.simulate as (n: number) => void)(0.5);
  });
const state = (page: Page) =>
  page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    const f = g.character.feet();
    const car = g.cars[0]!;
    return {
      mode: g.mode,
      kind: g.riding?.kind ?? null,
      kmh: g.riding ? g.riding.phys.speed * 3.6 : 0,
      heading: g.riding ? g.riding.phys.heading() : 0,
      visible: g.model.root.visible,
      fromCar: Math.hypot(f.x - car.phys.curr.x, f.z - car.phys.curr.z),
    };
  });

test.use({ viewport: { width: 960, height: 540 } });

test('vào ô tô đậu ven đường, lái, phanh, ra khỏi xe', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  const cars = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as G;
    const c = g.cars[0]!.phys.curr;
    // Đứng cạnh cửa người lái (bên trái xe: (cos yaw, −sin yaw)), quay mặt vào xe.
    g.character.teleport(c.x + Math.cos(c.yaw) * 1.7, 0.3, c.z - Math.sin(c.yaw) * 1.7, c.yaw - Math.PI / 2);
    (h.simulate as (n: number) => void)(0.5);
    // Nhìn chéo từ phía trước bên trái.
    h.setCamera(c.x + Math.sin(c.yaw) * 5.5 + Math.cos(c.yaw) * 4.5, 2.4, c.z + Math.cos(c.yaw) * 5.5 - Math.sin(c.yaw) * 4.5, c.x, 0.8, c.z);
    return g.cars.length;
  });
  expect(cars).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.hud-prompt')).toContainText('Vào xe');
  await shot(page, 'car-1-parked');
  await page.evaluate(() => ((window.__HEM__!.game as G).freeCamera = false));

  await pressF(page);
  const inside = await state(page);
  expect(inside.mode).toBe('ride');
  expect(inside.kind).toBe('car');
  expect(inside.visible).toBe(false);

  // Ga 4 giây dọc theo đường.
  await page.evaluate(() => ((window.__HEM__!.game as G).autopilot = { throttle: 1, steer: 0 }));
  await simulate(page, 4);
  const fast = await state(page);
  expect(fast.kmh).toBeGreaterThan(40);
  await shot(page, 'car-2-driving');

  // Nhả ga, đánh lái trái một nhịp ngắn: đầu xe quay sang trái.
  await page.evaluate(() => ((window.__HEM__!.game as G).autopilot = { throttle: 0, steer: 1 }));
  await simulate(page, 0.5);
  const turned = await state(page);
  expect(Math.sin(turned.heading - fast.heading)).toBeGreaterThan(0.03);

  // Phanh tới khi dừng hẳn rồi nhấn F ra khỏi xe (gọn trong một lệnh evaluate — xem gameplay.spec).
  const out = await page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    const sim = window.__HEM__!.simulate as (n: number) => void;
    for (let i = 0; i < 40; i++) {
      const v = g.riding ? g.riding.phys.speed : 0;
      g.autopilot = v > 0.8 ? { throttle: -1, steer: 0, handbrake: false } : { throttle: 0, steer: 0, handbrake: true };
      sim(0.2);
    }
    g.autopilot = { throttle: 0, steer: 0, handbrake: true };
    const input = window.__HEM__!.input as { setKey(c: string, d: boolean): void };
    input.setKey('KeyF', true);
    sim(1 / 60);
    input.setKey('KeyF', false);
    sim(0.5);
    g.autopilot = null;
    return g.mode;
  });
  expect(out).toBe('foot');
  const after = await state(page);
  expect(after.visible).toBe(true);
  expect(after.fromCar).toBeGreaterThan(1);
  expect(after.fromCar).toBeLessThan(3.2);
  await shot(page, 'car-3-out');
});

test('trụ chắn miệng hẻm: ô tô không vào được, xe máy lọt qua', async ({ page }) => {
  test.setTimeout(600_000);
  // Bố cục có seed nên tính miệng hẻm ngay ở đây: lấy một hẻm chính.
  const layout = generateCity();
  const mouth = hemMouths(layout).find((m) => layout.hems[m.hemId]?.kind === 'main');
  if (!mouth) throw new Error('không có hẻm chính');
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  /**
   * Đặt xe cách miệng hẻm `from` mét phía ngoài, đầu quay vào hẻm, ga 6 giây; trả về xe đã vào sâu bao nhiêu mét (âm = còn ở ngoài).
   * Ô tô lấy đà từ giữa đường (lúc đó Tín còn ở xa nên chưa có xe NPC quanh đây); tới lượt xe máy thì giao thông đã kéo về
   * quanh người chơi — băng ngang làn là bị tông lệch — nên xe máy xuất phát ngay trên vỉa hè (rộng 3,5 m).
   */
  const driveIn = (which: 'car' | 'bike', from: number) =>
    page.evaluate(
      ({ m, which, from }) => {
        const h = window.__HEM__!;
        h.paused = true;
        const g = h.game as G;
        const sim = h.simulate as (n: number) => void;
        const v = which === 'car' ? g.cars[0]! : g.bikes[0]!;
        const ox = Math.sin(m.yaw);
        const oz = Math.cos(m.yaw);
        v.phys.reset(m.x + ox * from, 0, m.z + oz * from, m.yaw + Math.PI);
        sim(0.3);
        g.mount(v);
        g.autopilot = { throttle: 0.5, steer: 0 };
        sim(6);
        g.autopilot = { throttle: 0, steer: 0, handbrake: true };
        sim(0.5);
        const c = v.phys.curr;
        const depth = -((c.x - m.x) * ox + (c.z - m.z) * oz);
        if (which === 'car') h.setCamera(m.x + ox * 7 + oz * 3, 3.2, m.z + oz * 7 - ox * 3, m.x - ox * 2, 0.6, m.z - oz * 2);
        return depth;
      },
      { m: mouth, which, from },
    );

  const home = await page.evaluate(() => ({ ...(window.__HEM__!.game as G).cars[0]!.phys.curr }));
  const car = await driveIn('car', 9);
  // Mũi xe (cách tâm 2,15 m) dừng ở hàng trụ (lùi vào hẻm 0,6 m) ⇒ tâm xe còn ở ngoài miệng hẻm.
  expect(car).toBeLessThan(-1);
  await shot(page, 'car-4-hem-blocked');

  await page.evaluate((home) => {
    const g = window.__HEM__!.game as G;
    g.freeCamera = false;
    g.autopilot = null;
    const input = window.__HEM__!.input as { setKey(c: string, d: boolean): void };
    input.setKey('KeyF', true);
    (window.__HEM__!.simulate as (n: number) => void)(1 / 60);
    input.setKey('KeyF', false);
    (window.__HEM__!.simulate as (n: number) => void)(0.3);
    // Trả ô tô về chỗ đậu cũ để xe máy có lối vào.
    g.cars[0]!.phys.reset(home.x, 0, home.z, home.yaw);
  }, home);
  const bike = await driveIn('bike', 2.4);
  expect(bike).toBeGreaterThan(8);
});

test('cướp ô tô NPC: chặn đầu xe, kéo tài xế ra, lái đi, tài xế gọi báo công an', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  // Chọn một ô tô con đang chạy trên đoạn thẳng còn dài, ra đứng chặn trước mũi nó 10 m rồi chờ nó dừng.
  const stop = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as G;
    const sim = h.simulate as (n: number) => void;
    const t = g.traffic.sim;
    const index = t.agents.findIndex(
      (a, i) => i >= t.bikes && ['sedan', 'taxi', 'pickup'].includes(a.kind) && !a.turn && t.network.lanes[a.lane]!.length - a.s > 40,
    );
    if (index < 0) return null;
    const a = t.agents[index]!;
    const fx = Math.sin(a.yaw);
    const fz = Math.cos(a.yaw);
    g.character.teleport(a.x + fx * 10, 0.05, a.z + fz * 10, a.yaw + Math.PI);
    const cars = g.cars.length;
    let waited = 0;
    for (; waited < 120 && !(a.speed < 0.6 && Math.hypot(a.x - g.character.feet().x, a.z - g.character.feet().z) < 4); waited++) sim(0.1);
    const f = g.character.feet();
    // Camera nhìn từ bên hông: thấy Tín đứng trước mũi xe.
    h.setCamera(a.x + fz * 6 + fx * 5, 2.6, a.z - fx * 6 + fz * 5, a.x + fx * 1.5, 0.9, a.z + fz * 1.5);
    return {
      index,
      cars,
      kind: a.kind,
      generation: a.generation,
      speed: a.speed,
      gap: Math.hypot(a.x - f.x, a.z - f.z),
      x: a.x,
      z: a.z,
      yaw: a.yaw,
      // Gợi ý ẩn đi thì chữ cũ vẫn còn trong thẻ ⇒ chỉ đọc khi đang hiện.
      prompt: document.querySelector('.hud-prompt:not(.hidden)')?.textContent ?? '',
    };
  });
  expect(stop, 'không tìm được ô tô NPC nào trên đoạn thẳng').not.toBeNull();
  if (!stop) return;
  // Xe dừng trước mặt Tín (không cán qua), hiện gợi ý cướp xe.
  expect(stop.speed).toBeLessThan(0.6);
  expect(stop.gap).toBeGreaterThan(2.4);
  expect(stop.prompt).toContain('Cướp xe');
  await shot(page, 'car-5-jack-stop');

  const jacked = await page.evaluate((stop) => {
    const h = window.__HEM__!;
    const g = h.game as G;
    const sim = h.simulate as (n: number) => void;
    const input = h.input as { setKey(c: string, d: boolean): void };
    input.setKey('KeyF', true);
    sim(1 / 60);
    input.setKey('KeyF', false);
    sim(0.35);
    const a = g.traffic.sim.agents[stop.index]!;
    const car = g.riding;
    const driver = g.pedestrians.walkers.find((w) => w.react === 'call' && Math.hypot(w.x - stop.x, w.z - stop.z) < 14);
    const fx = Math.sin(stop.yaw);
    const fz = Math.cos(stop.yaw);
    // Nhìn từ phía trước bên trái: xe vừa cướp + tài xế đang chạy lên vỉa hè.
    h.setCamera(stop.x + fz * 5 + fx * 7, 2.8, stop.z - fx * 5 + fz * 7, stop.x + fz * 1.5, 0.9, stop.z - fx * 1.5);
    return {
      mode: g.mode,
      kind: car?.kind ?? null,
      model: (car?.view as unknown as { kind: string } | undefined)?.kind ?? null,
      cars: g.cars.length,
      moved: car ? Math.hypot(car.phys.curr.x - stop.x, car.phys.curr.z - stop.z) : -1,
      npcAway: Math.hypot(a.x - stop.x, a.z - stop.z),
      generation: a.generation,
      driver: driver ? { entering: driver.enter > 0, from: Math.hypot(driver.x - stop.x, driver.z - stop.z) } : null,
      wanted: g.wanted.level,
    };
  }, stop);
  expect(jacked.mode).toBe('ride');
  expect(jacked.kind).toBe('car');
  // Xe lái được đúng kiểu chiếc NPC, nằm đúng chỗ nó vừa đứng; chiếc NPC đã rời đi chỗ khác.
  expect(jacked.model).toBe(stop.kind);
  expect(jacked.cars).toBe(stop.cars + 1);
  expect(jacked.moved).toBeLessThan(0.6);
  expect(jacked.npcAway).toBeGreaterThan(40);
  expect(jacked.generation).toBe(stop.generation + 1);
  // Tài xế đã ra khỏi xe, đang chạy lên vỉa hè; chưa gọi xong nên chưa có sao.
  expect(jacked.driver).not.toBeNull();
  expect(jacked.driver!.from).toBeLessThan(12);
  expect(jacked.wanted).toBe(0);
  await shot(page, 'car-6-jacked');

  // Lái đi; vài giây sau tài xế gọi xong ⇒ 1 sao truy nã.
  const after = await page.evaluate((stop) => {
    const h = window.__HEM__!;
    const g = h.game as G;
    const sim = h.simulate as (n: number) => void;
    g.freeCamera = false;
    g.autopilot = { throttle: 0.7, steer: 0 };
    sim(2.5);
    const run = Math.hypot(g.riding!.phys.curr.x - stop.x, g.riding!.phys.curr.z - stop.z);
    g.autopilot = { throttle: 0, steer: 0, handbrake: true };
    sim(6);
    return { run, wanted: g.wanted.level, mode: g.mode };
  }, stop);
  expect(after.run).toBeGreaterThan(5);
  expect(after.mode).toBe('ride');
  expect(after.wanted).toBe(1);
});
