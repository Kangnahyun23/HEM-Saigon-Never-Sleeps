import { expect, test } from '@playwright/test';
import type { DebugInfo } from '../../src/debug';

declare global {
  interface Window {
    __HEM__?: DebugInfo;
  }
}

test.use({ viewport: { width: 960, height: 540 } });

test('game khởi động, dựng khu phố và render không lỗi', async ({ page }) => {
  // Máy CI không có GPU: mỗi khung hình render bằng CPU mất vài giây.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.location().url)) errors.push(m.text());
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.waitForFunction(() => window.__HEM__!.frames > 3, null, { timeout: 90_000 });

  const stats = await page.evaluate(() => window.__HEM__!.stats);
  expect(stats.lots).toBeGreaterThan(800);
  expect(stats.colliders).toBeGreaterThan(1000);
  test.info().annotations.push({ type: 'stats', description: JSON.stringify(stats) });

  await expect(page.locator('.hud-location .brand')).toHaveText('HẺM');
  await page.screenshot({ path: 'tests/e2e/__screenshots__/start.png' });
  expect(errors).toEqual([]);
});
