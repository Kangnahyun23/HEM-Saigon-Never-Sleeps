import { expect, test, type Page } from '@playwright/test';

/**
 * Cài đặt trong điện thoại (phím P → 5): chất lượng đồ hoạ, hiện FPS, độ nhạy chuột; lưu lại sau khi tải lại trang.
 * Chạy riêng: npx playwright test settings
 */
test.use({ viewport: { width: 960, height: 540 } });

type Renderer = { getPixelRatio(): number; shadowMap: { enabled: boolean } };
const press = (page: Page, code: string) =>
  page.evaluate((c) => {
    const input = window.__HEM__!.input as { setKey(c: string, d: boolean): void };
    input.setKey(c, true);
    (window.__HEM__!.simulate as (n: number) => void)(1 / 60);
    input.setKey(c, false);
  }, code);
const tick = (page: Page) => page.evaluate(() => (window.__HEM__!.simulate as (n: number) => void)(1 / 60));
const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 180_000 });
};
const graphics = (page: Page) =>
  page.evaluate(() => {
    const r = window.__HEM__!.renderer as Renderer;
    return { pixelRatio: r.getPixelRatio(), shadows: r.shadowMap.enabled, settings: (window.__HEM__!.settings as () => Record<string, unknown>)() };
  });

test('cài đặt: chất lượng thấp, hiện FPS, độ nhạy chuột — lưu qua lần tải lại', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/?moi=1');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));
  expect((await graphics(page)).shadows).toBe(true);
  await expect(page.locator('.hud-perf')).toBeHidden();

  await press(page, 'KeyP');
  await press(page, 'Digit5');
  await expect(page.locator('.seg [data-quality="auto"]')).toHaveClass(/on/);

  await page.locator('[data-quality="low"]').click();
  await tick(page);
  await page.locator('[data-toggle="showFps"]').click();
  await tick(page);
  await page.locator('[data-sens="0.1"]').click();
  await tick(page);
  await expect(page.locator('.seg [data-quality="low"]')).toHaveClass(/on/);
  await expect(page.locator('[data-sensitivity]')).toHaveText('1.1');
  await expect(page.locator('.hud-perf')).toBeVisible();
  const low = await graphics(page);
  expect(low.pixelRatio).toBe(0.75);
  expect(low.shadows).toBe(false);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/phone-5-settings.png' });

  // Tải lại: cài đặt còn nguyên và được áp ngay từ đầu.
  await page.reload();
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  const again = await graphics(page);
  expect(again.settings).toMatchObject({ quality: 'low', showFps: true, mouseSensitivity: 1.1 });
  expect(again.pixelRatio).toBe(0.75);
  expect(again.shadows).toBe(false);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/quality-low.png' });

  // Về lại Tự động: bóng đổ bật lại, không lỗi.
  await page.evaluate(() => (window.__HEM__!.paused = true));
  await press(page, 'KeyP');
  await press(page, 'Digit5');
  await page.locator('[data-quality="auto"]').click();
  await tick(page);
  await nextFrames(page, 3);
  expect((await graphics(page)).shadows).toBe(true);
});
