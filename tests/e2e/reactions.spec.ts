import { expect, test, type Page } from '@playwright/test';

/**
 * Phản ứng người đi đường (N5.3): người gọi báo công an đứng quay lưng 5 giây ⇒ lên sao truy nã; Tín chạy tới kịp thì
 * người đó cúp máy bỏ chạy; thanh niên xông vào đánh trả làm Tín mất máu.
 * Chạy riêng: npx playwright test reactions
 */

type Walker = { id: number; x: number; z: number; yaw: number; react: string; flee: number };
type Game = {
  pedestrians: { walkers: Walker[]; startReaction(w: Walker, kind: string, time: number): void };
  character: { feet(): { x: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
  health: number;
  wanted: { level: number };
};

const simulate = (page: Page, s: number) => page.evaluate((x) => (window.__HEM__!.simulate as (n: number) => void)(x), s);
const shot = async (page: Page, name: string) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + 2, { timeout: 120_000 });
  await page.screenshot({ path: `tests/e2e/__screenshots__/${name}.png` });
};

test('người đi đường gọi công an, bị ngăn cuộc gọi, đánh trả', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  // Người gần nhất (cách ≥ 4 m) gọi báo; Tín đứng yên ở xa ⇒ 5 giây sau có 1 sao truy nã.
  const caller = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game;
    const p = g.character.feet();
    const byDist = [...g.pedestrians.walkers].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const w = byDist.find((o) => Math.hypot(o.x - p.x, o.z - p.z) > 4)!;
    g.pedestrians.startReaction(w, 'call', 0);
    (h.simulate as (s: number) => void)(1);
    (h.setCamera as (...a: number[]) => void)(w.x + 2.4, 2, w.z + 2.4, w.x, 1.2, w.z);
    return w.id;
  });
  expect(await page.evaluate((i) => (window.__HEM__!.game as Game).pedestrians.walkers[i]!.react, caller)).toBe('call');
  await shot(page, 'reaction-call');
  await simulate(page, 4.5);
  expect(await page.evaluate(() => (window.__HEM__!.game as Game).wanted.level)).toBe(1);
  await expect(page.locator('[data-wanted]')).toBeVisible();
  await expect(page.locator('.hud-toast')).toContainText('gọi công an');

  // Người khác gọi báo, Tín chạy tới sát ⇒ cúp máy bỏ chạy, không lên thêm sao.
  const stopped = await page.evaluate((skip) => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const p = g.character.feet();
    const w = [...g.pedestrians.walkers]
      .filter((o) => o.id !== skip && o.react === 'none')
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]!;
    g.pedestrians.startReaction(w, 'call', 0);
    g.character.teleport(w.x + 1, 0.5, w.z, 0);
    (h.simulate as (s: number) => void)(0.2);
    return { react: w.react, flee: w.flee };
  }, caller);
  expect(stopped.react).toBe('none');
  expect(stopped.flee).toBeGreaterThan(0);
  await expect(page.locator('.hud-toast')).toContainText('cúp máy');
  await simulate(page, 6);
  expect(await page.evaluate(() => (window.__HEM__!.game as Game).wanted.level)).toBe(1);

  // Thanh niên xông vào đánh trả: Tín đứng trước mặt 2,5 m ⇒ bị đấm mất máu.
  const fighter = await page.evaluate(() => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const p = g.character.feet();
    const w = [...g.pedestrians.walkers]
      .filter((o) => o.react === 'none' && o.flee <= 0)
      .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]!;
    const fx = Math.sin(w.yaw);
    const fz = Math.cos(w.yaw);
    g.character.teleport(w.x + fx * 2.5, 0.5, w.z + fz * 2.5, Math.atan2(-fx, -fz));
    (h.simulate as (s: number) => void)(0.1);
    g.pedestrians.startReaction(w, 'fight', 25);
    return w.id;
  });
  await simulate(page, 3);
  const after = await page.evaluate((i) => {
    const g = window.__HEM__!.game as Game;
    const w = g.pedestrians.walkers[i]!;
    const p = g.character.feet();
    return { health: g.health, react: w.react, dist: Math.hypot(w.x - p.x, w.z - p.z) };
  }, fighter);
  expect(after.react).toBe('fight');
  expect(after.dist).toBeLessThan(1.4);
  expect(after.health).toBeLessThan(100);
  await page.evaluate((i) => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const w = g.pedestrians.walkers[i]!;
    const p = g.character.feet();
    const mx = (p.x + w.x) / 2;
    const mz = (p.z + w.z) / 2;
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    (h.setCamera as (...a: number[]) => void)(mx - (dz / l) * 3, 1.6, mz + (dx / l) * 3, mx, 1, mz);
  }, fighter);
  await shot(page, 'reaction-fight');
});
