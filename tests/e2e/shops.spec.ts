import { expect, test, type Page } from '@playwright/test';

/**
 * Cửa hàng vào được (N6.1): đi bộ từ vỉa hè vào thẳng tiệm tạp hoá (không chuyển cảnh), HUD ghi tên tiệm, đi tiếp
 * không xuyên tường sau; chụp trong tiệm bằng camera theo người và từ ngoài phố nhìn vào.
 * Mua bán (N6.2–N6.3): E mở bảng hàng, mua trà đá, mặc cả; tiệm cầm đồ mua lại mã tấu.
 * Chạy riêng: npx playwright test shops
 */

type Shop = { kind: string; ox: number; oz: number; yaw: number; width: number; depth: number };
type Game = {
  city: { shops: Shop[] };
  wallet: { cash: number };
  inventory: { add(id: string): number; count(id: string): number };
  shopping: Shop | null;
  character: { feet(): { x: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
  camera: { yaw: number };
};

const simulate = (page: Page, s: number) => page.evaluate((x) => (window.__HEM__!.simulate as (n: number) => void)(x), s);
const walk = (page: Page, s: number) =>
  page.evaluate((sec) => {
    const h = window.__HEM__!;
    const input = h.input as { setKey(c: string, d: boolean): void };
    input.setKey('KeyW', true);
    (h.simulate as (n: number) => void)(sec);
    input.setKey('KeyW', false);
    (h.simulate as (n: number) => void)(0.3);
  }, s);
/** Toạ độ của Tín trong hệ phòng tiệm: dọc mặt tiền, ra đường (âm = trong tiệm). */
const inShop = (page: Page) =>
  page.evaluate(() => {
    const g = window.__HEM__!.game as Game;
    const s = g.city.shops[0]!;
    const p = g.character.feet();
    const dx = p.x - s.ox;
    const dz = p.z - s.oz;
    return { along: dx * Math.cos(s.yaw) - dz * Math.sin(s.yaw), out: dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw), width: s.width, depth: s.depth };
  });
const shot = async (page: Page, name: string) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + 3, { timeout: 120_000 });
  await page.screenshot({ path: `tests/e2e/__screenshots__/${name}.png` });
};

test('đi bộ vào tiệm tạp hoá: không chuyển cảnh, có tên tiệm, không xuyên tường', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  const kind = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game;
    const s = g.city.shops[0]!;
    // Đứng trên vỉa hè trước cửa 2,5 m, quay mặt vào tiệm; camera sau lưng.
    g.character.teleport(s.ox + Math.sin(s.yaw) * 2.5, 0.5, s.oz + Math.cos(s.yaw) * 2.5, s.yaw + Math.PI);
    g.camera.yaw = s.yaw;
    (h.simulate as (n: number) => void)(0.3);
    return s.kind;
  });
  expect(kind).toBe('tapHoa');
  await shot(page, 'shop-front');

  await walk(page, 2.2);
  const a = await inShop(page);
  expect(a.out).toBeLessThan(-0.3);
  expect(Math.abs(a.along)).toBeLessThan(a.width / 2);
  await expect(page.locator('.hud-location .place')).toHaveText('Tạp hóa Ba Bốn');
  await shot(page, 'shop-inside');

  // Đi tiếp vào sâu: dừng ở tường sau, không lọt ra khối nhà phía sau.
  await walk(page, 4);
  const b = await inShop(page);
  expect(b.out).toBeGreaterThan(-b.depth);
  expect(b.out).toBeLessThan(a.out);

  // Quay ra phố.
  await page.evaluate(() => {
    const g = window.__HEM__!.game as Game;
    const s = g.city.shops[0]!;
    g.camera.yaw = s.yaw + Math.PI;
  });
  await walk(page, 4);
  expect((await inShop(page)).out).toBeGreaterThan(0.2);
  await simulate(page, 0.3);
  await expect(page.locator('.hud-location .place')).not.toHaveText('Tạp hóa Ba Bốn');
});

/** Đưa Tín vào giữa tiệm thứ `i` (theo loại), quay mặt vào trong. */
const enterShop = (page: Page, kind: string) =>
  page.evaluate((k) => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const s = g.city.shops.find((o) => o.kind === k)!;
    g.character.teleport(s.ox - Math.sin(s.yaw) * 1.5, 0.5, s.oz - Math.cos(s.yaw) * 1.5, s.yaw + Math.PI);
    g.camera.yaw = s.yaw;
    (h.simulate as (n: number) => void)(0.3);
  }, kind);
const press = (page: Page, code: string) =>
  page.evaluate((c) => {
    const h = window.__HEM__!;
    const input = h.input as { setKey(c: string, d: boolean): void };
    input.setKey(c, true);
    (h.simulate as (n: number) => void)(1 / 60);
    input.setKey(c, false);
    (h.simulate as (n: number) => void)(1 / 60);
  }, code);
const cash = (page: Page) => page.evaluate(() => (window.__HEM__!.game as Game).wallet.cash);

test('mua bán: mua trà đá ở tạp hoá, mặc cả, bán mã tấu ở tiệm cầm đồ', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  await page.evaluate(() => (window.__HEM__!.paused = true));

  await enterShop(page, 'tapHoa');
  await expect(page.locator('[data-prompt]')).toContainText('Mua hàng');
  await press(page, 'KeyE');
  await expect(page.locator('.hud-shop')).toBeVisible();
  await expect(page.locator('.hud-shop')).toContainText('Tạp hóa Ba Bốn');
  // Dòng đầu: trà đá 5.000 đ.
  const before = await cash(page);
  const tea = await page.evaluate(() => (window.__HEM__!.game as Game).inventory.count('traDa'));
  await press(page, 'KeyE');
  expect(await cash(page)).toBe(before - 5000);
  expect(await page.evaluate(() => (window.__HEM__!.game as Game).inventory.count('traDa'))).toBe(tea + 1);
  // Mặc cả một lần: nút đổi thành kết quả, không bấm lại được.
  await press(page, 'KeyB');
  await expect(page.locator('[data-shop-bargain]')).toBeDisabled();
  await page.screenshot({ path: 'tests/e2e/__screenshots__/shop-panel.png' });
  await press(page, 'Escape');
  await expect(page.locator('.hud-shop')).toBeHidden();

  // Cầm đồ: Tab sang Bán, bán mã tấu.
  await page.evaluate(() => (window.__HEM__!.game as Game).inventory.add('maTau'));
  await enterShop(page, 'camDo');
  await press(page, 'KeyE');
  await press(page, 'Tab');
  await expect(page.locator('.shop-row').first()).toContainText('Mã tấu');
  const c0 = await cash(page);
  await press(page, 'KeyE');
  expect(await cash(page)).toBe(c0 + 100_000);
  expect(await page.evaluate(() => (window.__HEM__!.game as Game).inventory.count('maTau'))).toBe(0);
  await page.screenshot({ path: 'tests/e2e/__screenshots__/shop-pawn.png' });
  // Ra khỏi tiệm thì bảng tự đóng.
  await page.evaluate(() => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const s = g.city.shops.find((o) => o.kind === 'camDo')!;
    g.character.teleport(s.ox + Math.sin(s.yaw) * 3, 0.5, s.oz + Math.cos(s.yaw) * 3, 0);
    (h.simulate as (n: number) => void)(0.2);
  });
  await expect(page.locator('.hud-shop')).toBeHidden();
});
