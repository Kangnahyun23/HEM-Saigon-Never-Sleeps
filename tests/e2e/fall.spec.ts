import { expect, test } from '@playwright/test';

/**
 * Lưới an toàn: lỡ lao xe xuống sông thì một lúc sau Tín được đưa lên bờ, xe đậu bên cạnh.
 * Chạy riêng: npx playwright test fall
 */
test.use({ viewport: { width: 960, height: 540 } });

type Game = {
  bikes: { phys: { reset(x: number, y: number, z: number, yaw: number): void; body: { translation(): { x: number; y: number; z: number } } } }[];
  mount(b: unknown): void;
  mode: string;
  character: { feet(): { x: number; y: number; z: number } };
};

test('rơi xuống sông: được đưa lên bờ cùng xe', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?moi=1');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));
  const simulate = (s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);

  // Đi một lúc trên bờ để lưới an toàn nhớ chỗ đứng vững, rồi lên xe và "rơi" xuống giữa sông.
  await simulate(1);
  const shore = await page.evaluate(() => {
    const g = window.__HEM__!.game as unknown as Game;
    const shoreZ = (window.__HEM__!.layout as { river: { shoreZ: number } }).river.shoreZ;
    g.mount(g.bikes[0]!);
    const p = g.bikes[0]!.phys.body.translation();
    g.bikes[0]!.phys.reset(p.x, -1.8, shoreZ + 25, 0);
    return shoreZ;
  });
  await simulate(0.3);
  expect(await page.evaluate(() => (window.__HEM__!.game as unknown as Game).mode)).toBe('ride');

  await simulate(3);
  const after = await page.evaluate(() => {
    const g = window.__HEM__!.game as unknown as Game;
    return { mode: g.mode, feet: g.character.feet(), bike: g.bikes[0]!.phys.body.translation() };
  });
  expect(after.mode).toBe('foot');
  expect(after.feet.y).toBeGreaterThan(-0.5);
  expect(after.feet.z).toBeLessThan(shore);
  expect(after.bike.y).toBeGreaterThan(-0.5);
  expect(after.bike.z).toBeLessThan(shore);
  await expect(page.locator('.hud-toast')).toContainText('Ướt sũng');
  expect(errors).toEqual([]);
});
