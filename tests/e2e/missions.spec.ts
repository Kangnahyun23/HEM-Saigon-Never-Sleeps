import { expect, test, type Page } from '@playwright/test';

/**
 * Kèo giao hàng: nhận kèo trong điện thoại, tới điểm lấy hàng (cột sáng vàng), giao tới nhà khách, nhận tiền.
 * Chạy riêng: npx playwright test missions
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

type G = {
  wallet: { cash: number };
  character: { teleport(x: number, y: number, z: number, yaw: number): void };
  missions: { active: { def: { objectives: Array<{ x: number; z: number }> }; index: number } | null };
};

/** Đưa Tín tới mục tiêu hiện tại của nhiệm vụ (đứng cách 6 m để chụp được cột sáng). */
const goToTarget = (page: Page, offset: number) =>
  page.evaluate((off) => {
    const g = window.__HEM__!.game as G;
    const m = g.missions.active!;
    const t = m.def.objectives[m.index]!;
    g.character.teleport(t.x + off, 0.6, t.z, 0);
  }, offset);

test('kèo giao hàng: nhận, lấy hàng, giao, nhận tiền', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));
  await simulate(page, 1);

  // Mở điện thoại › Kèo, nhận kèo đầu tiên.
  await press(page, 'KeyP');
  await press(page, 'Digit1');
  await expect(page.locator('[data-accept]')).toHaveCount(3);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/mission-1-offers.png' });
  await page.locator('[data-accept]').first().click();
  await simulate(page, 0.1);
  await expect(page.locator('.hud-phone')).toBeHidden();
  await expect(page.locator('[data-objective-text]')).toContainText('Lấy');

  // Đứng gần điểm lấy hàng: thấy cột sáng.
  await goToTarget(page, 7);
  await simulate(page, 1);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/mission-2-pickup.png' });

  const cash0 = await page.evaluate(() => (window.__HEM__!.game as G).wallet.cash);
  await goToTarget(page, 0);
  await simulate(page, 0.5);
  await expect(page.locator('[data-objective-text]')).toContainText('Giao');
  await expect(page.locator('[data-objective-timer]')).toHaveText(/\d+:\d\d/);

  await goToTarget(page, 0);
  await simulate(page, 0.5);
  await expect(page.locator('[data-objective]')).toBeHidden();
  const cash1 = await page.evaluate(() => (window.__HEM__!.game as G).wallet.cash);
  expect(cash1).toBeGreaterThan(cash0 + 15_000);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/mission-3-paid.png' });
});
