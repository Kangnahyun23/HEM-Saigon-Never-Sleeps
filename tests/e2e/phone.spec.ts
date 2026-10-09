import { expect, test, type Page } from '@playwright/test';

/**
 * Điện thoại: tin nhắn mở màn tới, mở điện thoại bằng P, đọc tin, xem Ví và Bản đồ.
 * Chạy riêng: npx playwright test phone
 */
test.use({ viewport: { width: 960, height: 540 } });

const simulate = (page: Page, s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);
const press = (page: Page, code: string) =>
  page.evaluate((c) => {
    const input = window.__HEM__!.input as { setKey(c: string, d: boolean): void };
    input.setKey(c, true);
    (window.__HEM__!.simulate as (n: number) => void)(1 / 60);
    input.setKey(c, false);
  }, code);
const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 180_000 });
};

test('điện thoại: tin nhắn, ví, bản đồ', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  // Sau ~22 giây chơi: 4 tin nhắn mở màn (Ngân ×2, app vay, chú Sáu).
  await simulate(page, 22);
  await expect(page.locator('[data-phone-hint] i')).toHaveText('4');
  await expect(page.locator('[data-cash]')).toHaveText('150.000 đ');

  await press(page, 'KeyP');
  await press(page, 'Digit3');
  await expect(page.locator('.hud-phone')).toBeVisible();
  await expect(page.locator('[data-thread]')).toHaveCount(3);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/phone-1-messages.png' });

  await page.locator('[data-thread="Ngân"]').click();
  await simulate(page, 1 / 60);
  await expect(page.locator('.chat .them')).toHaveCount(2);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/phone-2-chat.png' });

  await press(page, 'Digit4');
  await expect(page.locator('.money.debt b')).toHaveText('30.000.000 đ');
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/phone-3-wallet.png' });

  await press(page, 'Digit2');
  await simulate(page, 0.1);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/phone-4-map.png' });

  await press(page, 'KeyP');
  await expect(page.locator('.hud-phone')).toBeHidden();
});
