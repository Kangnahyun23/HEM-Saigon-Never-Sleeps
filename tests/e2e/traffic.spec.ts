import { expect, test } from '@playwright/test';
import type { TrafficAgent } from '../../src/ai/traffic';
import type { CityLayout } from '../../src/world/city/layout';

/**
 * Giao thông NPC: xe máy chạy được, nằm trên đường; đủ loại xe khác (ô tô, buýt, ba gác, xích lô, xe đẩy); chụp ảnh để kiểm tra bằng mắt.
 * Chạy riêng: npx playwright test traffic
 */
test.use({ viewport: { width: 960, height: 540 } });

type Snapshot = Array<Pick<TrafficAgent, 'x' | 'z' | 'speed'>>;

const agents = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const g = window.__HEM__!.game as { traffic: { sim: { agents: TrafficAgent[] } } };
    return g.traffic.sim.agents.map((a) => ({ x: a.x, z: a.z, speed: a.speed }));
  }) as Promise<Snapshot>;

test('xe máy NPC chạy khắp phố', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  const before = await agents(page);
  expect(before.length).toBeGreaterThanOrEqual(40);
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(6));
  const after = await agents(page);
  const moved = after.filter((a, i) => Math.hypot(a.x - before[i]!.x, a.z - before[i]!.z) > 5).length;
  expect(moved).toBeGreaterThan(after.length * 0.6);

  const layout = (await page.evaluate(() => window.__HEM__!.layout)) as CityLayout;
  // Giao lộ gần điểm xuất phát nhất.
  const s = layout.spawn;
  const xs = layout.roads.filter((r) => r.axis === 'z').map((r) => r.pos);
  const zs = layout.roads.filter((r) => r.axis === 'x').map((r) => r.pos);
  const nx = xs.reduce((b, x) => (Math.abs(x - s.x) < Math.abs(b - s.x) ? x : b));
  const nz = zs.reduce((b, z) => (Math.abs(z - s.z) < Math.abs(b - s.z) ? z : b));

  const views: Record<string, [number, number, number, number, number, number]> = {
    // Giao lộ nhìn từ trên cao dọc tim đường.
    junction: [nx, 16, nz - 40, nx, 0, nz],
    street: [nx - 2, 1.6, nz - 30, nx + 1, 1.4, nz + 20],
  };
  for (const [name, v] of Object.entries(views)) {
    await page.evaluate((c) => window.__HEM__!.setCamera(...c), v);
    const f0 = await page.evaluate(() => window.__HEM__!.frames);
    await page.waitForFunction((n) => window.__HEM__!.frames > n + 1, f0, { timeout: 180_000 });
    await page.screenshot({ path: `tests/e2e/__screenshots__/traffic-${name}.png` });
  }

  // Cận cảnh xe NPC gần người chơi nhất: chọn xe và đặt camera trong CÙNG một lệnh (xe vẫn chạy giữa các khung hình).
  await page.evaluate(() => {
    const g = window.__HEM__!.game as { traffic: { sim: { agents: TrafficAgent[] } }; character: { feet(): { x: number; z: number } } };
    const p = g.character.feet();
    const near = g.traffic.sim.agents.reduce((b, a) => (Math.hypot(a.x - p.x, a.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? a : b));
    const fx = Math.sin(near.yaw);
    const fz = Math.cos(near.yaw);
    // Đứng chéo phía trước bên phải xe, nhìn vào điểm xe sắp tới.
    window.__HEM__!.setCamera(near.x + fx * 8 - fz * 2.2, 1.7, near.z + fz * 8 + fx * 2.2, near.x + fx * 2.5, 0.9, near.z + fz * 2.5);
  });
  const f1 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((n) => window.__HEM__!.frames > n + 1, f1, { timeout: 180_000 });
  await page.screenshot({ path: 'tests/e2e/__screenshots__/traffic-closeup.png' });
});

test('giao thông đa dạng: ô tô, taxi, buýt, ba gác, xích lô, xe đẩy', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));
  type Sim = { agents: TrafficAgent[]; bikes: number };
  const fleet = () =>
    page.evaluate(() => {
      const sim = (window.__HEM__!.game as { traffic: { sim: Sim } }).traffic.sim;
      return { bikes: sim.bikes, others: sim.agents.slice(sim.bikes).map((a) => ({ kind: a.kind, x: a.x, z: a.z })) };
    });

  const before = await fleet();
  const kinds = new Set(before.others.map((a) => a.kind));
  for (const kind of ['sedan', 'taxi', 'pickup', 'bus', 'baGac', 'xichLo', 'cart']) expect(kinds.has(kind as TrafficAgent['kind'])).toBe(true);
  expect(kinds.has('bike')).toBe(false);
  expect(before.bikes).toBeGreaterThanOrEqual(40);

  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(10));
  const after = await fleet();
  const moved = after.others.filter((a, i) => Math.hypot(a.x - before.others[i]!.x, a.z - before.others[i]!.z) > 3).length;
  expect(moved).toBeGreaterThan(after.others.length * 0.6);
  const layout = (await page.evaluate(() => window.__HEM__!.layout)) as CityLayout;
  for (const a of after.others) expect(layout.roads.some((r) => a.x >= r.rect.x0 && a.x <= r.rect.x1 && a.z >= r.rect.z0 && a.z <= r.rect.z1)).toBe(true);

  // Cận cảnh từng loại: đứng chéo phía trước bên trái (phía tim đường) nhìn lại, xa gần theo cỡ xe.
  const closeup = async (kind: string, name: string) => {
    await page.evaluate((kind) => {
      const sim = (window.__HEM__!.game as { traffic: { sim: Sim } }).traffic.sim;
      const a = sim.agents.find((g) => g.kind === kind)!;
      const fx = Math.sin(a.yaw);
      const fz = Math.cos(a.yaw);
      const far = kind === 'bus' ? 11 : 6.5;
      // Trái của hướng (fx, fz) là (fz, −fx).
      window.__HEM__!.setCamera(a.x + fx * far * 0.75 + fz * far * 0.6, kind === 'bus' ? 3 : 2, a.z + fz * far * 0.75 - fx * far * 0.6, a.x, kind === 'bus' ? 1.4 : 0.9, a.z);
    }, kind);
    const f0 = await page.evaluate(() => window.__HEM__!.frames);
    await page.waitForFunction((n) => window.__HEM__!.frames > n + 2, f0, { timeout: 180_000 });
    await page.screenshot({ path: `tests/e2e/__screenshots__/${name}.png` });
  };
  for (const kind of ['taxi', 'pickup', 'bus', 'baGac', 'xichLo', 'cart']) await closeup(kind, `fleet-${kind}`);

  // Ban đêm: đèn pha, đèn hậu, bảng tuyến xe buýt, bóng đèn xe đẩy.
  await page.evaluate(() => (window.__HEM__!.setHour as (h: number) => void)(21));
  await closeup('bus', 'fleet-night-bus');
  await closeup('cart', 'fleet-night-cart');
});
