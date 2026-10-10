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

  // Chạy từng bước nhỏ tới lúc được cứu, đọc thông báo ngay khi đó (tin nhắn cốt truyện có thể đè thông báo sau đó).
  const after = await page.evaluate(() => {
    const g = window.__HEM__!.game as unknown as Game;
    const step = window.__HEM__!.simulate as (n: number) => void;
    let t = 0;
    while (g.mode === 'ride' && t < 5) {
      step(1 / 30);
      t += 1 / 30;
    }
    const toast = document.querySelector('.hud-toast')?.textContent ?? '';
    return { mode: g.mode, t, toast, feet: g.character.feet(), bike: g.bikes[0]!.phys.body.translation() };
  });
  expect(after.mode).toBe('foot');
  expect(after.t).toBeGreaterThan(1); // để khoảnh khắc rơi còn kịp thấy (FALL_GRACE)
  expect(after.toast).toContain('Ướt sũng');
  expect(after.feet.y).toBeGreaterThan(-0.5);
  expect(after.feet.z).toBeLessThan(shore);
  expect(after.bike.y).toBeGreaterThan(-0.5);
  expect(after.bike.z).toBeLessThan(shore);
  expect(errors).toEqual([]);
});
