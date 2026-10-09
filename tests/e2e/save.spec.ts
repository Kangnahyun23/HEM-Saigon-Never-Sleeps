import { expect, test, type Page } from '@playwright/test';

/**
 * Lưu game: lưu, tải lại trang thì còn tiền / tiến độ Hồi 1 / vị trí; ?moi=1 thì chơi lại từ đầu.
 * Chạy riêng: npx playwright test save
 */
test.use({ viewport: { width: 960, height: 540 } });

type G = {
  wallet: { cash: number; earn(n: number, r: string): void };
  story: { progress: { next: number } };
  character: { feet(): { x: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
  loaded: boolean;
};
const ready = (page: Page) => page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
const state = (page: Page) =>
  page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    const f = g.character.feet();
    return { cash: g.wallet.cash, next: g.story.progress.next, x: f.x, z: f.z, loaded: g.loaded };
  });

test('lưu game và tải lại', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await ready(page);
  expect((await state(page)).loaded).toBe(false);

  await page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    g.wallet.earn(1_000_000, 'Thử lưu');
    g.story.progress.next = 2;
    const f = g.character.feet();
    g.character.teleport(f.x + 6, 0.6, f.z, 0);
    (window.__HEM__!.simulate as (n: number) => void)(0.5);
  });
  const before = await state(page);
  expect(await page.evaluate(() => (window.__HEM__!.save as () => boolean)())).toBe(true);

  await page.reload();
  await ready(page);
  const after = await state(page);
  expect(after.loaded).toBe(true);
  expect(after.cash).toBe(before.cash);
  expect(after.next).toBe(2);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1.5);

  await page.goto('/?moi=1');
  await ready(page);
  const fresh = await state(page);
  expect(fresh.loaded).toBe(false);
  expect(fresh.cash).toBe(150_000);
  expect(fresh.next).toBe(0);
});
