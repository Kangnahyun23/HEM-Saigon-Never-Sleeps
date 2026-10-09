import { expect, test, type Page } from '@playwright/test';
import type { Game } from '../../src/game/game';

type G = Pick<Game, 'mode' | 'physicsSteps'> & {
  autopilot: Game['autopilot'];
  riding: { phys: { speed: number; heading(): number } } | null;
  character: { feet(): { x: number; y: number; z: number }; actualSpeed: number };
};

const game = (page: Page) => page.evaluate(() => {
  const g = window.__HEM__!.game as G;
  const f = g.character.feet();
  return { mode: g.mode, x: f.x, y: f.y, z: f.z, speed: g.riding ? g.riding.phys.speed * 3.6 : g.character.actualSpeed * 3.6 };
});
const simulate = (page: Page, s: number) => page.evaluate((sec) => (window.__HEM__!.simulate as (n: number) => void)(sec), s);
const nextFrames = async (page: Page, n = 2) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + n, { timeout: 120_000 });
};

test.use({ viewport: { width: 960, height: 540 } });

test('đi bộ, lên xe, chạy xe, cua, phanh, xuống xe', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('/');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  // Chỉ cho game chạy qua `simulate`: khung hình thật (số lượng khác nhau giữa các máy) không được chen vào điều khiển,
  // nếu không xe có thể chạy tiếp lúc chờ chụp ảnh, đâm tường, và kết quả test phụ thuộc tốc độ máy.
  await page.evaluate(() => (window.__HEM__!.paused = true));
  await nextFrames(page);
  await simulate(page, 1);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/play-1-spawn.png' });

  // Chân dung Tín (camera tự do nhìn trực diện), rồi trả camera cho game.
  await page.evaluate(() => {
    const g = window.__HEM__!.game as G & { character: { yaw: number } };
    const f = g.character.feet();
    const yaw = g.character.yaw;
    window.__HEM__!.setCamera(f.x + Math.sin(yaw) * 2.6 + Math.cos(yaw) * 0.8, f.y + 1.5, f.z + Math.cos(yaw) * 2.6 - Math.sin(yaw) * 0.8, f.x, f.y + 1.0, f.z);
  });
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/play-0-portrait.png' });
  await page.evaluate(() => ((window.__HEM__!.game as { freeCamera: boolean }).freeCamera = false));

  // Đi bộ về phía trước 1.5 s.
  const start = await game(page);
  await page.evaluate(() => (window.__HEM__!.input as { setKey(c: string, d: boolean): void }).setKey('KeyW', true));
  await simulate(page, 1.5);
  await page.evaluate(() => (window.__HEM__!.input as { setKey(c: string, d: boolean): void }).setKey('KeyW', false));
  const walked = await game(page);
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(2);
  expect(walked.mode).toBe('foot');

  // Quay lại chỗ xe và lên xe bằng phím F.
  await page.evaluate(() => {
    const g = window.__HEM__!.game as { bikes: Array<unknown>; mount(b: unknown): void };
    g.mount(g.bikes[0]);
  });
  await simulate(page, 0.5);
  expect((await game(page)).mode).toBe('ride');
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/play-2-mounted.png' });

  // Ga 4 giây.
  await page.evaluate(() => ((window.__HEM__!.game as G).autopilot = { throttle: 1, steer: 0 }));
  await simulate(page, 4);
  const fast = await game(page);
  expect(fast.speed).toBeGreaterThan(30);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/play-3-riding.png' });

  // Cua trái.
  await page.evaluate(() => ((window.__HEM__!.game as G).autopilot = { throttle: 0.4, steer: 1 }));
  await simulate(page, 0.6);
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/play-4-lean.png' });

  // Phanh tới khi dừng hẳn (không để xe lùi), rồi nhấn F xuống xe.
  // Mọi thao tác chạy trong cùng một lệnh evaluate để khung hình render thật (chậm trên CI) không chen vào giữa.
  const stopped = await page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    const sim = window.__HEM__!.simulate as (n: number) => void;
    for (let i = 0; i < 40; i++) {
      const v = g.riding ? g.riding.phys.speed : 0;
      g.autopilot = v > 0.8 ? { throttle: -1, steer: 0, handbrake: false } : { throttle: 0, steer: 0, handbrake: true };
      sim(0.2);
    }
    g.autopilot = { throttle: 0, steer: 0, handbrake: true };
    const input = window.__HEM__!.input as { setKey(c: string, d: boolean): void };
    input.setKey('KeyF', true);
    sim(1 / 60);
    input.setKey('KeyF', false);
    sim(0.5);
    return g.mode;
  });
  expect(stopped).toBe('foot');
  await nextFrames(page);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/play-5-dismounted.png' });
});
