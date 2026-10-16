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
  inbox: { threads: { messages: { text: string }[] }[] };
  wanted: { level: number };
  heat: { level: number };
  places: { police: { x: number; z: number } };
  /** Riêng tư trong game.ts — test gọi thẳng để vào màn hình BỊ BẮT. */
  startOutcome(kind: 'busted' | 'wasted'): void;
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

test('lưu giữa chừng: tin mở màn chưa tới hết, đang bị truy nã, đang bị bắt; tab khác ghi bản lưu', async ({ page }) => {
  test.setTimeout(600_000);
  const save = () => page.evaluate(() => (window.__HEM__!.save as () => boolean)());
  // Đọc trạng thái xong thì dừng game (giữa hai lần đọc không để sao truy nã / Độ Nóng tự hết).
  const read = () =>
    page.evaluate(() => {
      window.__HEM__!.paused = true;
      const g = window.__HEM__!.game as G;
      const f = g.character.feet();
      const texts = g.inbox.threads.flatMap((t) => t.messages.map((m) => m.text));
      return { cash: g.wallet.cash, wanted: g.wanted.level, heat: g.heat.level, texts, police: Math.hypot(f.x - g.places.police.x, f.z - g.places.police.z) };
    });

  // 1) Lưu ngay lúc mới vào (tin mở màn còn đang tới) rồi tải lại: vẫn nhận đủ 5 tin mở màn, không tin nào lặp.
  await page.goto('/?moi=1');
  await ready(page);
  expect((await read()).texts.length).toBeLessThan(5);
  expect(await save()).toBe(true);
  // Mở lại bằng '/' (reload thì URL còn ?moi=1 — xoá luôn bản lưu).
  await page.goto('/');
  await ready(page);
  await page.evaluate(() => {
    window.__HEM__!.paused = true;
    (window.__HEM__!.simulate as (n: number) => void)(40);
  });
  const { texts } = await read();
  for (const start of ['Anh Tín ơi, người của app vay', 'Em sợ lắm', 'Khoản vay của Quý khách', 'Tín hả con', 'Có kèo giao hàng mới']) {
    expect(texts.filter((t) => t.startsWith(start)), start).toHaveLength(1);
  }

  // 2) Đang bị truy nã 3 sao + đàn em đuổi (Độ Nóng 2): tải lại vẫn bị.
  await page.evaluate(() => {
    (window.__HEM__!.setWanted as (n: number) => void)(3);
    (window.__HEM__!.setHeat as (n: number) => void)(2);
  });
  expect(await save()).toBe(true);
  await page.goto('/');
  await ready(page);
  const chased = await read();
  expect(chased.wanted).toBe(3);
  expect(chased.heat).toBe(2);

  // 3) Lưu giữa màn hình BỊ BẮT (chưa về đồn): tải lại vẫn nộp phạt, ở đồn công an, hết truy nã.
  const cash = await page.evaluate(() => {
    const g = window.__HEM__!.game as G;
    g.wallet.earn(1_000_000, 'Thử phạt');
    g.startOutcome('busted');
    return g.wallet.cash;
  });
  expect(await save()).toBe(true);
  await page.goto('/');
  await ready(page);
  const busted = await read();
  expect(busted.cash).toBeLessThan(cash);
  expect(busted.police).toBeLessThan(3);
  expect(busted.wanted).toBe(0);
  expect(busted.heat).toBe(0);
  // Nạp xong đã lưu lại kết quả: tải lại lần nữa không bị xử lần hai.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hem.save.v1')!).outcome)).toBeUndefined();

  // 4) Tab khác vừa ghi bản lưu: tab này không ghi đè, báo người chơi.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('hem.save.v1')!);
    d.jobsDone = 99;
    localStorage.setItem('hem.save.v1', JSON.stringify(d));
  });
  expect(await save()).toBe(false);
  await expect(page.locator('.hud-toast')).toContainText('tab khác');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hem.save.v1')!).jobsDone)).toBe(99);
});
