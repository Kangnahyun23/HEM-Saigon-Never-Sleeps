import { expect, test } from '@playwright/test';
import type { DebugInfo } from '../../src/debug';

declare global {
  interface Window {
    __HEM__?: DebugInfo;
  }
}

test('game khởi động, render và vật lý chạy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 30_000 });

  const startHeights = await page.evaluate(() => window.__HEM__!.crateHeights());
  expect(startHeights.length).toBeGreaterThan(0);

  // Chờ thùng rơi chạm đất (vật lý chạy) và đủ khung hình (render chạy).
  await page.waitForFunction(
    () => {
      const d = window.__HEM__!;
      return d.frames > 30 && d.physicsSteps > 120 && Math.max(...d.crateHeights()) < 3;
    },
    null,
    { timeout: 45_000 },
  );

  const info = await page.evaluate(() => ({ backend: window.__HEM__!.backend, frames: window.__HEM__!.frames }));
  test.info().annotations.push({ type: 'backend', description: info.backend });

  await expect(page.locator('#hud h1')).toHaveText('HẺM');
  await page.screenshot({ path: 'tests/e2e/__screenshots__/sandbox.png' });
  expect(errors).toEqual([]);
});
