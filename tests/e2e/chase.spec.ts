import { expect, test, type Page } from '@playwright/test';
import type { CityLayout } from '../../src/world/city/layout';

/**
 * Độ Nóng + truy đuổi: bị bám đuôi (sao đỏ, xe đàn em trên bản đồ), chui vào hẻm cụt để cắt đuôi.
 * Chạy riêng: npx playwright test chase
 */
test.use({ viewport: { width: 960, height: 540 } });

const simulate = (page: Page, s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);
const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 180_000 });
};
type G = { heat: { level: number }; chase: { sim: { chasers: Array<{ x: number; z: number; yaw: number }> } }; character: { teleport(x: number, y: number, z: number, yaw: number): void } };

test('bị truy đuổi rồi cắt đuôi trong hẻm', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  await page.evaluate(() => (window.__HEM__!.setHeat as (n: number) => void)(2));
  await simulate(page, 6);
  await expect(page.locator('[data-heat] span.on')).toHaveCount(2);
  expect(await page.evaluate(() => (window.__HEM__!.game as G).chase.sim.chasers.length)).toBe(3);

  // Cận cảnh xe truy đuổi gần nhất.
  await page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    const c = g.chase.sim.chasers[0]!;
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    window.__HEM__!.setCamera(c.x + fx * 8 + fz * 3, 2.2, c.z + fz * 8 - fx * 3, c.x, 1, c.z);
  });
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/chase-1-gang.png' });
  await page.evaluate(() => ((window.__HEM__!.game as { freeCamera: boolean }).freeCamera = false));

  // Chui vào giữa một hẻm nhánh cụt rồi đứng im chờ.
  const layout = (await page.evaluate(() => window.__HEM__!.layout)) as CityLayout;
  const hem = layout.hems.find((h) => h.kind === 'branch' && h.deadEnd) ?? layout.hems.find((h) => h.kind === 'branch')!;
  await page.evaluate(
    ([x, z]) => (window.__HEM__!.game as G).character.teleport(x, 0.6, z, 0),
    [(hem.rect.x0 + hem.rect.x1) / 2, (hem.rect.z0 + hem.rect.z1) / 2] as const,
  );
  for (let i = 0; i < 30; i++) {
    await simulate(page, 1);
    if ((await page.evaluate(() => (window.__HEM__!.game as G).heat.level)) === 0) break;
  }
  expect(await page.evaluate(() => (window.__HEM__!.game as G).heat.level)).toBe(0);
  await expect(page.locator('[data-heat]')).toBeHidden();
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/chase-2-escaped.png' });
});
