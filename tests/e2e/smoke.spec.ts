import { expect, test } from '@playwright/test';
import type { DebugInfo } from '../../src/debug';

declare global {
  interface Window {
    __HEM__?: DebugInfo;
  }
}

test('game khởi động, dựng khu phố và render không lỗi', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__HEM__!.frames > 3, null, { timeout: 90_000 });

  const stats = await page.evaluate(() => window.__HEM__!.stats);
  expect(stats.lots).toBeGreaterThan(800);
  expect(stats.colliders).toBeGreaterThan(1000);
  test.info().annotations.push({ type: 'stats', description: JSON.stringify(stats) });

  await expect(page.locator('#hud h1')).toHaveText('HẺM');
  await page.screenshot({ path: 'tests/e2e/__screenshots__/start.png' });
  expect(errors).toEqual([]);
});
