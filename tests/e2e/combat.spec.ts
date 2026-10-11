import { expect, test, type Page } from '@playwright/test';

/**
 * Cận chiến: cầm mã tấu, đứng trước một người đi bộ, chém 3 nhịp combo (nhịp cuối đánh ngã), đánh tiếp tới khi gục.
 * Người xung quanh hoảng sợ bỏ chạy. Chạy riêng: npx playwright test combat
 */

type Walker = { id: number; x: number; z: number; yaw: number; health: number; dead: boolean; down: number; flee: number };
type Game = {
  inventory: { add(id: string): number };
  equipped: string | null;
  pedestrians: { walkers: Walker[] };
  character: { feet(): { x: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
};

const simulate = (page: Page, s: number) => page.evaluate((x) => (window.__HEM__!.simulate as (n: number) => void)(x), s);
const victim = (page: Page, id: number) =>
  page.evaluate((i) => {
    const w = (window.__HEM__!.game as Game).pedestrians.walkers[i]!;
    return { health: w.health, down: w.down, dead: w.dead, flee: w.flee };
  }, id);
/** Bấm chuột trái một khung (đòn nhẹ). */
const swing = (page: Page) =>
  page.evaluate(() => {
    const h = window.__HEM__!;
    const input = h.input as { setKey(c: string, d: boolean): void };
    input.setKey('Mouse0', true);
    (h.simulate as (s: number) => void)(1 / 60);
    input.setKey('Mouse0', false);
  });

test('cận chiến: combo mã tấu đánh ngã rồi gục, người xung quanh bỏ chạy', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  const id = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game;
    g.inventory.add('maTau');
    g.equipped = 'maTau';
    const p = g.character.feet();
    let best = g.pedestrians.walkers[0]!;
    let bd = Infinity;
    for (const w of g.pedestrians.walkers) {
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    // Đứng trước mặt người đó 0,9 m, quay mặt vào.
    const fx = Math.sin(best.yaw);
    const fz = Math.cos(best.yaw);
    g.character.teleport(best.x + fx * 0.9, 0.45, best.z + fz * 0.9, Math.atan2(-fx, -fz));
    (h.simulate as (s: number) => void)(0.05);
    return best.id;
  });

  // Nhịp 1: trúng, mất máu nhưng chưa ngã.
  await swing(page);
  await simulate(page, 0.5);
  const first = await victim(page, id);
  expect(first.health).toBeLessThan(100);
  expect(first.dead).toBe(false);

  // Nhịp 2 và 3 (bấm trong lúc đòn trước còn dở ⇒ vào bộ đệm combo).
  for (let i = 0; i < 2; i++) {
    await swing(page);
    await simulate(page, 0.6);
  }
  await simulate(page, 0.6);
  const after = await victim(page, id);
  expect(after.health).toBeLessThan(first.health);
  expect(after.dead || after.down > 0).toBe(true);

  // Người đứng gần thấy cảnh đánh nhau thì bỏ chạy.
  const fleeing = await page.evaluate(() => (window.__HEM__!.game as Game).pedestrians.walkers.filter((w) => w.flee > 0).length);
  expect(fleeing).toBeGreaterThan(0);

  // Đánh tiếp tới khi gục.
  for (let i = 0; i < 8 && !(await victim(page, id)).dead; i++) {
    await swing(page);
    await simulate(page, 0.8);
  }
  expect((await victim(page, id)).dead).toBe(true);
  await simulate(page, 2); // hết động tác ngã

  await page.evaluate((i) => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const p = g.character.feet();
    const w = g.pedestrians.walkers[i]!;
    const mx = (p.x + w.x) / 2;
    const mz = (p.z + w.z) / 2;
    const dx = w.x - p.x;
    const dz = w.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    (h.setCamera as (...a: number[]) => void)(mx - (dz / l) * 3.2, 1.6, mz + (dx / l) * 3.2, mx, 0.9, mz);
  }, id);
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + 2, { timeout: 120_000 });
  await page.screenshot({ path: 'tests/e2e/__screenshots__/combat.png' });
});
