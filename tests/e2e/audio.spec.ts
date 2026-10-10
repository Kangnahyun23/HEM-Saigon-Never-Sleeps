import { expect, test, type Page } from '@playwright/test';

/**
 * Âm thanh: im lặng tới khi người chơi tương tác; sau đó tiếng máy xe to dần theo ga, phím M tắt / bật tiếng.
 * Chạy riêng: npx playwright test audio
 */
test.use({ viewport: { width: 960, height: 540 } });

type Audio = {
  engineSound: { gain: { gain: { value: number } } | null };
  lastCash: number;
};
const simulate = (page: Page, s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);
const press = (page: Page, code: string) =>
  page.evaluate((c) => {
    const input = window.__HEM__!.input as { setKey(c: string, d: boolean): void };
    input.setKey(c, true);
    (window.__HEM__!.simulate as (n: number) => void)(1 / 60);
    input.setKey(c, false);
  }, code);

test('âm thanh: tiếng máy theo ga, tắt tiếng bằng phím M', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?moi=1');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  // Chưa tương tác: chưa có âm thanh nào được tạo.
  await simulate(page, 0.5);
  expect(await page.evaluate(() => (window.__HEM__!.game as unknown as Audio).engineSound.gain)).toBeNull();

  // Bấm vào màn hình (trình duyệt cho phép phát tiếng), lên xe, ga hết cỡ.
  await page.mouse.click(480, 270);
  const engineGain = () => page.evaluate(() => (window.__HEM__!.game as unknown as Audio).engineSound.gain?.gain.value ?? -1);
  await page.evaluate(() => {
    const g = window.__HEM__!.game as unknown as { bikes: unknown[]; mount(b: unknown): void; autopilot: unknown };
    g.mount(g.bikes[0]);
    g.autopilot = { throttle: 1, steer: 0 };
  });
  await simulate(page, 2);
  // Gain trượt mượt theo thời gian thật của AudioContext: chờ một chút rồi đọc.
  await page.waitForTimeout(600);
  const riding = await engineGain();
  expect(riding).toBeGreaterThan(0.02);

  // Xuống xe: tiếng máy tắt dần.
  await page.evaluate(() => {
    const g = window.__HEM__!.game as unknown as { autopilot: unknown };
    g.autopilot = { throttle: 0, steer: 0, handbrake: true };
  });
  await simulate(page, 3);
  await press(page, 'KeyF');
  await simulate(page, 0.5);
  await page.waitForTimeout(1500);
  expect(await engineGain()).toBeLessThan(riding / 3);

  // M: tắt tiếng / bật lại, có thông báo.
  await press(page, 'KeyM');
  await expect(page.locator('.hud-toast')).toContainText('tắt tiếng');
  await press(page, 'KeyM');
  await expect(page.locator('.hud-toast')).toContainText('bật tiếng');

  // Tiền vào ⇒ âm báo (không lỗi).
  await page.evaluate(() => (window.__HEM__!.game as unknown as { wallet: { earn(n: number, r: string): void } }).wallet.earn(50_000, 'Thử'));
  await simulate(page, 0.1);
  expect(errors).toEqual([]);
});
