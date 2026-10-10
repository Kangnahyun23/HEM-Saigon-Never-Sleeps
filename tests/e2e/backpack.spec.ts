import { expect, test, type Page } from '@playwright/test';

/**
 * Balo (phím I): mở balo, xem đồ khởi đầu, ăn bánh mì để hồi máu, vứt đồ, đóng balo.
 * Chạy riêng: npx playwright test backpack
 */

const simulate = (page: Page, s: number) => page.evaluate((x) => (window.__HEM__!.simulate as (n: number) => void)(x), s);
const press = async (page: Page, key: string) => {
  await page.keyboard.press(key);
  await simulate(page, 1 / 60);
};

test('balo: mở, ăn bánh mì hồi máu, vứt đồ', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  await press(page, 'KeyI');
  await expect(page.locator('.hud-backpack')).toBeVisible();
  await expect(page.locator('.bp-slot')).toHaveCount(12);
  await expect(page.locator('.bp-slot:not(.empty)')).toHaveCount(4);
  await expect(page.locator('[data-bp-title]')).toHaveText('Balo · 4/12 ô');

  // Bị thương nhẹ rồi ăn bánh mì (ô đầu: 2 ổ, mỗi ổ +20 máu).
  await page.evaluate(() => ((window.__HEM__!.game as { health: number }).health = 50));
  await page.locator('[data-slot="0"]').click();
  await expect(page.locator('.bp-info b')).toHaveText('Bánh mì thịt');
  await press(page, 'KeyE');
  expect(await page.evaluate(() => (window.__HEM__!.game as { health: number }).health)).toBe(70);
  await expect(page.locator('[data-slot="0"] b')).toHaveCount(0); // còn 1 ổ ⇒ không hiện "×n"
  await expect(page.locator('.hud-toast')).toContainText('Bánh mì thịt: +20 máu');

  // Giấy tờ xe là đồ quan trọng: không vứt được.
  await page.locator('.bp-slot', { hasText: 'Giấy tờ xe' }).click();
  await expect(page.locator('.bp-info')).toContainText('không vứt được');
  await page.screenshot({ path: 'tests/e2e/__screenshots__/backpack.png' });

  await press(page, 'KeyI');
  await expect(page.locator('.hud-backpack')).toBeHidden();
});
