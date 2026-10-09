import { expect, test, type Page } from '@playwright/test';
import type { CityLayout } from '../../src/world/city/layout';

/**
 * Chu kỳ ngày đêm: chụp cùng một góc phố ở nhiều giờ, và cảnh chạy xe ban đêm (đèn pha, đèn đường, cửa sổ sáng).
 * Chạy riêng: npx playwright test dayNight
 */
test.use({ viewport: { width: 960, height: 540 } });

const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 180_000 });
};
const setHour = (page: Page, h: number) => page.evaluate((x) => (window.__HEM__!.setHour as (n: number) => void)(x), h);

test('ngày đêm: trời, nắng, đèn đường, cửa sổ, đèn xe', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  const layout = (await page.evaluate(() => window.__HEM__!.layout)) as CityLayout;
  const s = layout.spawn;
  // Góc phố cố định: đứng giữa đường nhìn dọc dãy nhà mặt tiền.
  const street: [number, number, number, number, number, number] = [s.x + 2, 2.2, s.z - 26, s.x - 4, 4, s.z + 30];

  for (const h of [7, 12, 18, 21]) {
    await setHour(page, h);
    await page.evaluate((c) => window.__HEM__!.setCamera(...c), street);
    await nextFrames(page);
    await expect(page.locator('[data-clock]')).toHaveText(`${String(h).padStart(2, '0')}:00`);
    await page.screenshot({ path: `tests/e2e/__screenshots__/daynight-${String(h).padStart(2, '0')}h.png` });
  }

  // Đêm: lên xe, chạy vài giây — đèn tự bật, có vệt đèn pha.
  await setHour(page, 21.5);
  const night = await page.evaluate(() => {
    const g = window.__HEM__!.game as { bikes: unknown[]; mount(b: unknown): void; freeCamera: boolean; autopilot: unknown };
    g.freeCamera = false;
    g.mount(g.bikes[0]);
    g.autopilot = { throttle: 0.6, steer: 0 };
    (window.__HEM__!.simulate as (n: number) => void)(3);
    g.autopilot = { throttle: 0, steer: 0, handbrake: true };
    (window.__HEM__!.simulate as (n: number) => void)(1.5);
    return (window.__HEM__!.game as { clock: { hour: number } }).clock.hour;
  });
  expect(night).toBeGreaterThan(21);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/daynight-ride-night.png' });
});
