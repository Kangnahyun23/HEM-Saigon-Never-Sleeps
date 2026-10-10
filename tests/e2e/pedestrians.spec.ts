import { expect, test, type Page } from '@playwright/test';
import type { Walker } from '../../src/ai/pedestrians';

/**
 * Người đi bộ trên vỉa hè: có đi lại, và chụp cận cảnh để kiểm tra bằng mắt.
 * Chạy riêng: npx playwright test pedestrians
 */
test.use({ viewport: { width: 960, height: 540 } });

const walkers = (page: Page) =>
  page.evaluate(() => (window.__HEM__!.game as { pedestrians: { walkers: Walker[] } }).pedestrians.walkers.map((w) => ({ x: w.x, z: w.z, yaw: w.yaw }))) as Promise<
    Array<{ x: number; z: number; yaw: number }>
  >;

test('người đi bộ trên vỉa hè', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  const before = await walkers(page);
  expect(before.length).toBeGreaterThanOrEqual(40);
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(5));
  const after = await walkers(page);
  const moved = after.filter((a, i) => Math.hypot(a.x - before[i]!.x, a.z - before[i]!.z) > 2).length;
  expect(moved).toBeGreaterThan(after.length * 0.4);

  // Bảng phím đã thu gọn mặc định (F1) ⇒ ảnh chụp thoáng, không cần ẩn.

  // Cận cảnh hai người gần điểm xuất phát nhất.
  await page.evaluate(() => {
    const g = window.__HEM__!.game as { pedestrians: { walkers: Walker[] }; character: { feet(): { x: number; z: number } } };
    const p = g.character.feet();
    const w = [...g.pedestrians.walkers].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]!;
    const fx = Math.sin(w.yaw);
    const fz = Math.cos(w.yaw);
    window.__HEM__!.setCamera(w.x + fx * 3.6 - fz * 1.2, 1.6, w.z + fz * 3.6 + fx * 1.2, w.x, 1.0, w.z);
  });
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((n) => window.__HEM__!.frames > n + 1, f0, { timeout: 180_000 });
  await page.screenshot({ path: 'tests/e2e/__screenshots__/pedestrians-closeup.png' });
});
