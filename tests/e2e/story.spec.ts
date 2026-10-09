import { expect, test, type Page } from '@playwright/test';

/**
 * Hồi 1: chơi lướt cả 5 nhiệm vụ cốt truyện (dịch chuyển tới từng mục tiêu), kiểm tra tiền thưởng và trả nợ kỳ đầu.
 * Chạy riêng: npx playwright test story
 */
test.use({ viewport: { width: 960, height: 540 } });

const simulate = (page: Page, s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);
const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 180_000 });
};

/** Đi tới điểm hẹn của nhiệm vụ cốt truyện kế tiếp (đi bộ). */
const goToStart = (page: Page) =>
  page.evaluate(() => {
    const g = window.__HEM__!.game as {
      story: { current: { start: { x: number; z: number } } | null };
      riding: unknown;
      character: { teleport(x: number, y: number, z: number, yaw: number): void };
      riding_reset?: never;
      mode: string;
    } & { riding: { phys: { reset(x: number, y: number, z: number, yaw: number): void } } | null };
    const s = g.story.current!.start;
    if (g.riding) g.riding.phys.reset(s.x, 0.2, s.z, 0);
    else g.character.teleport(s.x, 0.6, s.z, 0);
  });

/** "Chơi" mục tiêu hiện tại: lên xe, dịch chuyển tới điểm cần tới, hoặc cắt đuôi. Trả về nhãn mục tiêu. */
const playObjective = (page: Page) =>
  page.evaluate(() => {
    type O = { kind: string; x: number; z: number; label: string };
    const g = window.__HEM__!.game as {
      missions: { active: { objective: O | null } | null };
      bikes: unknown[];
      mount(b: unknown): void;
      riding: { phys: { reset(x: number, y: number, z: number, yaw: number): void } } | null;
      character: { teleport(x: number, y: number, z: number, yaw: number): void };
      heat: { set(n: number): void };
    };
    const o = g.missions.active?.objective;
    if (!o) return null;
    if (o.kind === 'mount') g.mount(g.bikes[0]);
    else if (o.kind === 'escape') g.heat.set(0);
    else if (g.riding) g.riding.phys.reset(o.x, 0.2, o.z, 0);
    else g.character.teleport(o.x, 0.6, o.z, 0);
    return o.label;
  });

const storyIndex = (page: Page) => page.evaluate(() => (window.__HEM__!.game as { story: { progress: { next: number } } }).story.progress.next);

test('Hồi 1: năm nhiệm vụ, từ về nhà tới trả nợ kỳ đầu', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));
  await simulate(page, 3);

  const debt0 = await page.evaluate(() => (window.__HEM__!.game as { wallet: { debt: number } }).wallet.debt);
  for (let mission = 0; mission < 5; mission++) {
    if (mission === 4) {
      // Kỳ trả nợ cần 1,5 triệu: giả như đã chạy thêm vài kèo.
      await page.evaluate(() => (window.__HEM__!.game as { wallet: { earn(n: number, r: string): void } }).wallet.earn(400_000, 'Kèo (test)'));
    }
    await goToStart(page);
    await simulate(page, 4);
    if (mission === 0) {
      await nextFrames(page);
      await page.screenshot({ path: 'tests/e2e/__screenshots__/story-1-home.png' });
    }
    for (let step = 0; step < 12; step++) {
      const label = await playObjective(page);
      if (label === null) break;
      await simulate(page, 3.5);
      if (mission === 3 && step === 0) {
        await nextFrames(page);
        await page.screenshot({ path: 'tests/e2e/__screenshots__/story-4-chased.png' });
      }
    }
    // Chờ lời kết.
    await simulate(page, 12);
    expect(await storyIndex(page)).toBe(mission + 1);
  }
  const g = await page.evaluate(() => (window.__HEM__!.game as { wallet: { debt: number; cash: number } }).wallet);
  expect(g.debt).toBe(debt0 - 1_500_000);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/story-5-paid.png' });
});
