import { expect, test, type Page } from '@playwright/test';

/**
 * Truy nã công an (N5.4): có sao ⇒ xe công an (đèn chớp đỏ – xanh) chạy tới, bản đồ nhỏ có chấm + nón tầm nhìn;
 * đứng yên để công an áp sát ⇒ bị bắt (nộp phạt, tịch thu vũ khí); chui vào hẻm xa khuất mặt ⇒ thoát truy nã.
 * Chạy riêng: npx playwright test police
 */

type Unit = { x: number; z: number; yaw: number };
type Game = {
  police: { units: Unit[]; unitCount: number };
  wanted: { level: number; seen: boolean };
  character: { feet(): { x: number; z: number }; teleport(x: number, y: number, z: number, yaw: number): void };
  inventory: { add(id: string): number; count(id: string): number };
  equipped: string | null;
  wallet: { cash: number };
};

const shot = async (page: Page, name: string) => {
  const f0 = await page.evaluate(() => window.__HEM__!.frames);
  await page.waitForFunction((x) => window.__HEM__!.frames >= x, f0 + 2, { timeout: 120_000 });
  await page.screenshot({ path: `tests/e2e/__screenshots__/${name}.png` });
};

test('công an truy nã: xe tới, bị bắt khi đứng yên; trốn vào hẻm thì thoát', async ({ page }) => {
  test.setTimeout(400_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  // 2 sao, đang cầm mã tấu: đứng yên giữa đại lộ (công an nhìn thấy từ xa) chờ công an tới.
  await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game;
    const layout = h.layout as { spawn: { x: number }; roads: Array<{ axis: string; kind: string; pos: number }> };
    const avenue = layout.roads.find((r) => r.axis === 'x' && r.kind === 'avenue')!;
    g.character.teleport(layout.spawn.x, 0.4, avenue.pos, 0);
    g.inventory.add('maTau');
    g.equipped = 'maTau';
    (h.simulate as (s: number) => void)(0.2);
    (h.setWanted as (n: number) => void)(2);
  });
  let close = Infinity;
  for (let i = 0; i < 30 && close > 12; i++) {
    close = await page.evaluate(() => {
      const h = window.__HEM__!;
      (h.simulate as (s: number) => void)(0.5);
      const g = h.game as Game;
      const p = g.character.feet();
      let d = Infinity;
      for (let k = 0; k < g.police.unitCount; k++) d = Math.min(d, Math.hypot(g.police.units[k]!.x - p.x, g.police.units[k]!.z - p.z));
      return d;
    });
  }
  expect(close).toBeLessThan(12);
  expect(await page.evaluate(() => (window.__HEM__!.game as Game).police.unitCount)).toBe(2);
  // Chụp xe công an gần nhất từ bên hông.
  await page.evaluate(() => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    const p = g.character.feet();
    let u = g.police.units[0]!;
    for (let k = 0; k < g.police.unitCount; k++) {
      const o = g.police.units[k]!;
      if (Math.hypot(o.x - p.x, o.z - p.z) < Math.hypot(u.x - p.x, u.z - p.z)) u = o;
    }
    (h.setCamera as (...a: number[]) => void)(u.x + Math.cos(u.yaw) * 3.5, 1.8, u.z - Math.sin(u.yaw) * 3.5, u.x, 0.9, u.z);
  });
  await shot(page, 'police-bike');

  // Đứng yên ⇒ bị bắt: hết sao, bị tịch thu vũ khí, nộp phạt.
  const cash0 = await page.evaluate(() => (window.__HEM__!.game as Game).wallet.cash);
  for (let i = 0; i < 40; i++) {
    const level = await page.evaluate(() => {
      (window.__HEM__!.simulate as (s: number) => void)(0.5);
      return (window.__HEM__!.game as Game).wanted.level;
    });
    if (level === 0) break;
  }
  const after = await page.evaluate(() => {
    const g = window.__HEM__!.game as Game;
    return { level: g.wanted.level, knives: g.inventory.count('maTau'), equipped: g.equipped, cash: g.wallet.cash };
  });
  expect(after.level).toBe(0);
  expect(after.knives).toBe(0);
  expect(after.equipped).toBeNull();
  expect(after.cash).toBeLessThan(cash0);
  await expect(page.locator('.hud-toast')).toContainText('Bị công an bắt');

  // 1 sao, chui sâu vào hẻm cách xa ⇒ khuất mặt, ra khỏi vùng tìm kiếm ⇒ thoát.
  await page.evaluate(() => {
    const h = window.__HEM__!;
    const g = h.game as Game;
    (h.setWanted as (n: number) => void)(1);
    const layout = h.layout as { hems: Array<{ rect: { x0: number; z0: number; x1: number; z1: number } }> };
    const p = g.character.feet();
    // Hẻm xa nhất trong khoảng 90–200 m.
    let best = layout.hems[0]!;
    let bestD = -1;
    for (const hm of layout.hems) {
      const cx = (hm.rect.x0 + hm.rect.x1) / 2;
      const cz = (hm.rect.z0 + hm.rect.z1) / 2;
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d > 90 && d < 200 && d > bestD) {
        bestD = d;
        best = hm;
      }
    }
    g.character.teleport((best.rect.x0 + best.rect.x1) / 2, 0.6, (best.rect.z0 + best.rect.z1) / 2, 0);
    (h.simulate as (s: number) => void)(1 / 60);
  });
  await expect(page.locator('[data-wanted]')).toBeVisible();
  for (let i = 0; i < 40; i++) {
    const level = await page.evaluate(() => {
      (window.__HEM__!.simulate as (s: number) => void)(0.5);
      return (window.__HEM__!.game as Game).wanted.level;
    });
    if (level === 0) break;
  }
  expect(await page.evaluate(() => (window.__HEM__!.game as Game).wanted.level)).toBe(0);
  await expect(page.locator('.hud-toast')).toContainText('thoát khỏi truy nã');
});
