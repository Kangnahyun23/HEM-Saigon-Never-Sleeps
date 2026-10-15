import { expect, test, type Page } from '@playwright/test';

/**
 * Xe tuần tra (N7.3): ô tô công an chạy lẫn trong dòng xe; đánh người ngay trước mặt nó thì lên sao liền và chính chiếc
 * đó quay sang đuổi. Từ 3 sao có ô tô công an trong đoàn truy đuổi; đang phóng xe thì có chốt chặn (ô tô đỗ chắn ngang)
 * phía trước. Chạy riêng: npx playwright test patrol
 */

type Agent = { kind: string; x: number; z: number; yaw: number; speed: number; generation: number };
type Chaser = { kind: 'bike' | 'car'; mode: 'chase' | 'block' | 'parked'; x: number; z: number; yaw: number; leaving: boolean };
type Walker = { id: number; x: number; z: number; yaw: number; dead: boolean; react: string; enter: number };
type Game = {
  traffic: { sim: { bikes: number; agents: Agent[] } };
  police: { sim: { chasers: Chaser[]; placeRoadblock(p: { x: number; z: number; speed: number; dirX: number; dirZ: number }): boolean } };
  wanted: { level: number };
  pedestrians: { walkers: Walker[] };
  character: { feet(): { x: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
  freeCamera: boolean;
};

const shot = async (page: Page, name: string) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + 3, { timeout: 120_000 });
  await page.screenshot({ path: `tests/e2e/__screenshots__/${name}.png` });
};

test.use({ viewport: { width: 960, height: 540 } });

test('xe tuần tra thấy Tín đánh người: lên sao ngay, chính xe đó quay sang đuổi', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  // Chờ lúc xe tuần tra chạy ngang một người đi bộ (cách 6–20 m), chụp xe tuần tra, rồi ra đứng trước mặt người đó.
  const setup = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game;
    const sim = h.simulate as (s: number) => void;
    const t = g.traffic.sim;
    const index = t.agents.findIndex((a) => a.kind === 'police');
    if (index < 0) return null;
    const car = t.agents[index]!;
    let victim: Walker | null = null;
    for (let i = 0; i < 400 && !victim; i++) {
      // Tín đi theo xe tuần tra (đứng trên mui nhà xa xa thì không chặn đường ai) để dòng xe quanh nó không bị thả lại.
      g.character.teleport(car.x, 30, car.z, 0);
      sim(0.25);
      for (const w of g.pedestrians.walkers) {
        const d = Math.hypot(w.x - car.x, w.z - car.z);
        if (!w.dead && w.react === 'none' && d > 6 && d < 20) victim = w;
      }
    }
    if (!victim) return null;
    const fx = Math.sin(victim.yaw);
    const fz = Math.cos(victim.yaw);
    g.character.teleport(victim.x + fx * 0.9, 0.45, victim.z + fz * 0.9, Math.atan2(-fx, -fz));
    sim(0.05);
    h.setCamera(car.x + Math.cos(car.yaw) * 6 + Math.sin(car.yaw) * 5, 2.6, car.z - Math.sin(car.yaw) * 6 + Math.cos(car.yaw) * 5, car.x, 0.9, car.z);
    return { index, generation: car.generation, x: car.x, z: car.z, wanted: g.wanted.level, police: g.police.sim.chasers.length };
  });
  expect(setup, 'không có xe tuần tra nào chạy ngang người đi bộ').not.toBeNull();
  if (!setup) return;
  expect(setup.wanted).toBe(0);
  expect(setup.police).toBe(0);
  await shot(page, 'patrol-1-car');

  // Một cú đấm: chưa ai kịp gọi điện mà đã có sao — xe tuần tra thấy tận mắt.
  const after = await page.evaluate((setup) => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const sim = h.simulate as (s: number) => void;
    const input = h.input as { setKey(c: string, d: boolean): void };
    g.freeCamera = false;
    input.setKey('Mouse0', true);
    sim(1 / 60);
    input.setKey('Mouse0', false);
    sim(0.6);
    const car = g.traffic.sim.agents[setup.index]!;
    const chasers = g.police.sim.chasers.filter((c) => !c.leaving);
    return {
      wanted: g.wanted.level,
      chasers: chasers.map((c) => ({ kind: c.kind, d: Math.hypot(c.x - setup.x, c.z - setup.z) })),
      generation: car.generation,
      gone: Math.hypot(car.x - setup.x, car.z - setup.z),
    };
  }, setup);
  expect(after.wanted).toBe(1);
  // Đúng một xe đuổi (1 sao) và đó là ô tô ngay chỗ xe tuần tra vừa chạy; chỗ của xe tuần tra trong dòng xe đã đi nơi khác.
  expect(after.chasers).toHaveLength(1);
  expect(after.chasers[0]!.kind).toBe('car');
  expect(after.chasers[0]!.d).toBeLessThan(15);
  expect(after.generation).toBe(setup.generation + 1);
  expect(after.gone).toBeGreaterThan(30);
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(1.5));
  await shot(page, 'patrol-2-chasing');
});

test('3 sao: ô tô công an truy đuổi, chốt chặn chắn ngang đường phía trước (ban đêm)', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?moi=1&gio=21');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  // Đứng giữa đại lộ nhìn dọc đường; đặt chốt chặn phía trước như lúc Tín đang phóng xe tới.
  const block = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game;
    const layout = h.layout as { spawn: { x: number }; roads: Array<{ axis: string; kind: string; pos: number }> };
    const avenue = layout.roads.find((r) => r.axis === 'x' && r.kind === 'avenue')!;
    // Xe chạy bên phải: đi theo +X thì ở nửa +Z của đường.
    const z = avenue.pos + 4;
    g.character.teleport(layout.spawn.x, 0.4, z, Math.PI / 2);
    (h.simulate as (s: number) => void)(0.2);
    (h.setWanted as (n: number) => void)(3);
    const p = g.character.feet();
    const placed = g.police.sim.placeRoadblock({ x: p.x, z: p.z, speed: 15, dirX: 1, dirZ: 0 });
    const blocks = g.police.sim.chasers.filter((c) => c.mode === 'block');
    (h.simulate as (s: number) => void)(0.5);
    const b = blocks[0];
    if (b) h.setCamera(b.x - 22, 4.2, p.z + 3, b.x, 0.8, b.z);
    return { placed, blocks: blocks.map((c) => ({ x: c.x - p.x, z: c.z - p.z, across: Math.abs(Math.sin(c.yaw)) })) };
  });
  expect(block.placed).toBe(true);
  expect(block.blocks.length).toBeGreaterThanOrEqual(2);
  for (const b of block.blocks) {
    expect(b.x).toBeGreaterThan(60);
    // Đỗ ngang: đầu xe hướng ±Z (vuông góc với đại lộ chạy dọc X).
    expect(b.across).toBeLessThan(0.05);
  }
  await shot(page, 'patrol-3-roadblock-night');

  // Chờ đoàn xe đuổi tới: 3 sao có một ô tô công an (tới gần Tín đang đi bộ thì dừng cho người lái xuống — vẫn tính).
  const cars = await page.evaluate(() => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const p = g.character.feet();
    let near = Infinity;
    for (let i = 0; i < 60 && near > 15; i++) {
      (h.simulate as (s: number) => void)(0.5);
      for (const c of g.police.sim.chasers) if (c.kind === 'car' && c.mode !== 'block' && !c.leaving) near = Math.min(near, Math.hypot(c.x - p.x, c.z - p.z));
    }
    const car = g.police.sim.chasers.find((c) => c.kind === 'car' && c.mode !== 'block' && !c.leaving);
    if (car) h.setCamera(car.x + 7, 3, car.z + 6, car.x, 0.8, car.z);
    return { near, chase: g.police.sim.chasers.filter((c) => c.mode !== 'block' && !c.leaving).map((c) => c.kind) };
  });
  expect(cars.chase.filter((k) => k === 'car')).toHaveLength(1);
  expect(cars.chase).toHaveLength(3);
  expect(cars.near).toBeLessThan(15);
  await shot(page, 'patrol-4-police-car-night');
});
