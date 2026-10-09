import { expect, test, type Page } from '@playwright/test';
import type { CityLayout } from '../../src/world/city/layout';

/**
 * Mưa: chụp cùng góc phố lúc mưa chiều và mưa đêm (hạt mưa, trời xám, đường ướt bóng đèn).
 * Chạy riêng: npx playwright test weather
 */
test.use({ viewport: { width: 960, height: 540 } });

const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 180_000 });
};

test('mưa chiều và mưa đêm', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));
  const layout = (await page.evaluate(() => window.__HEM__!.layout)) as CityLayout;
  const s = layout.spawn;
  const street: [number, number, number, number, number, number] = [s.x + 2, 2.2, s.z - 26, s.x - 4, 4, s.z + 30];

  for (const [name, hour] of [
    ['afternoon', 16.5],
    ['night', 21],
  ] as const) {
    await page.evaluate((h) => (window.__HEM__!.setHour as (n: number) => void)(h), hour);
    await page.evaluate(() => (window.__HEM__!.setWeather as (w: string) => void)('rain'));
    await page.evaluate((c) => window.__HEM__!.setCamera(...c), street);
    // Cho hạt mưa rơi một chút.
    await page.evaluate(() => (window.__HEM__!.simulate as (n: number) => void)(0.5));
    await nextFrames(page);
    await expect(page.locator('[data-clock]')).toContainText('Mưa');
    await page.screenshot({ path: `tests/e2e/__screenshots__/rain-${name}.png` });
  }

  // Trời mưa thì xe NPC chạy chậm lại.
  const factor = await page.evaluate(() => (window.__HEM__!.game as { traffic: { sim: { speedFactor: number } } }).traffic.sim.speedFactor);
  expect(factor).toBeLessThan(0.8);
});
