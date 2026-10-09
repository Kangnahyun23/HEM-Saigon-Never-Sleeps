import { test } from '@playwright/test';
import type { CityLayout } from '../../src/world/city/layout';

/**
 * Chụp khu phố từ nhiều góc để kiểm tra bằng mắt (không so sánh pixel).
 * Chạy riêng: npx playwright test views
 */
test.use({ viewport: { width: 960, height: 540 } });

test('chụp các góc nhìn khu phố', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  const layout = (await page.evaluate(() => window.__HEM__!.layout)) as CityLayout;
  const s = layout.spawn;
  const hem = layout.hems.find((h) => h.kind === 'main' && Math.abs(h.rect.x0 - s.x) < 200)!;
  const hx = (hem.rect.x0 + hem.rect.x1) / 2;
  const hz = (hem.rect.z0 + hem.rect.z1) / 2;
  const alongX = hem.axis === 'x';
  const views: Record<string, [number, number, number, number, number, number]> = {
    street: [s.x + 2, 1.7, s.z - 22, s.x - 2, 3, s.z + 30],
    aerial: [s.x + 120, 140, s.z + 160, s.x, 0, s.z],
    hem: alongX ? [hx - 30, 1.7, hz, hx + 20, 2.5, hz] : [hx, 1.7, hz - 30, hx, 2.5, hz + 20],
    market: [s.x + 30, 6, s.z + 8, layout.market.hall.x1, 8, (layout.market.tower.z0 + layout.market.tower.z1) / 2],
    river: [0, 3, layout.river.shoreZ - 18, 30, 4, layout.river.shoreZ + 120],
    rooftops: [s.x + 60, 30, s.z - 60, s.x - 20, 8, s.z + 20],
  };
  for (const [name, v] of Object.entries(views)) {
    await page.evaluate((c) => window.__HEM__!.setCamera(...c), v);
    const f0 = await page.evaluate(() => window.__HEM__!.frames);
    await page.waitForFunction((n) => window.__HEM__!.frames > n + 1, f0, { timeout: 180_000 });
    await page.screenshot({ path: `tests/e2e/__screenshots__/view-${name}.png` });
  }
});
