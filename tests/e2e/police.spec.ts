import { expect, test, type Page } from '@playwright/test';

/**
 * Truy nã công an (N5.4): có sao ⇒ xe công an (đèn chớp đỏ – xanh) chạy tới, bản đồ nhỏ có chấm + nón tầm nhìn;
 * đứng yên để công an áp sát ⇒ màn hình BỊ BẮT, về đồn công an phường (nộp phạt, tịch thu vũ khí);
 * chui vào hẻm xa khuất mặt ⇒ thoát truy nã. Hết máu ⇒ màn hình GỤC, tỉnh dậy ở trạm y tế (viện phí).
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

  // Đứng yên ⇒ bị bắt: màn hình BỊ BẮT, rồi về đồn công an phường — hết sao, bị tịch thu vũ khí, nộp phạt.
  const cash0 = await page.evaluate(() => (window.__HEM__!.game as Game).wallet.cash);
  for (let i = 0; i < 60; i++) {
    const kind = await page.evaluate(() => {
      (window.__HEM__!.simulate as (s: number) => void)(0.25);
      return (window.__HEM__!.game as { outcome: string | null }).outcome;
    });
    if (kind === 'busted') break;
  }
  await expect(page.locator('.hud-outcome')).toBeVisible();
  await expect(page.locator('.hud-outcome')).toContainText('BỊ BẮT');
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(0.2));
  await shot(page, 'busted');
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(2));
  await expect(page.locator('.hud-outcome')).toBeHidden();
  const after = await page.evaluate(() => {
    const g = window.__HEM__!.game as Game;
    return { level: g.wanted.level, knives: g.inventory.count('maTau'), equipped: g.equipped, cash: g.wallet.cash };
  });
  expect(after.level).toBe(0);
  expect(after.knives).toBe(0);
  expect(after.equipped).toBeNull();
  expect(after.cash).toBeLessThan(cash0);
  await expect(page.locator('.hud-toast')).toContainText('nộp phạt');
  // Được thả ra trước cửa đồn công an phường.
  const nearStation = await page.evaluate(() => {
    const g = window.__HEM__!.game as Game & { places: { police: { x: number; z: number } } };
    const p = g.character.feet();
    return Math.hypot(p.x - g.places.police.x, p.z - g.places.police.z);
  });
  expect(nearStation).toBeLessThan(2.5);

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

test('hết máu: màn hình GỤC, tỉnh dậy ở trạm y tế, trả viện phí, đầy máu', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });
  const cash0 = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game & { health: number; pedestrians: { walkers: Array<{ x: number; z: number; yaw: number; react: string }>; startReaction(w: unknown, k: string, t: number): void } };
    // Còn 5 máu, một thanh niên xông vào đấm.
    g.health = 5;
    const p = g.character.feet();
    const w = [...g.pedestrians.walkers].sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]!;
    g.character.teleport(w.x + Math.sin(w.yaw) * 2, 0.5, w.z + Math.cos(w.yaw) * 2, 0);
    (h.simulate as (s: number) => void)(0.1);
    g.pedestrians.startReaction(w, 'fight', 25);
    return g.wallet.cash;
  });
  for (let i = 0; i < 40; i++) {
    const kind = await page.evaluate(() => {
      (window.__HEM__!.simulate as (s: number) => void)(0.25);
      return (window.__HEM__!.game as { outcome: string | null }).outcome;
    });
    if (kind === 'wasted') break;
  }
  await expect(page.locator('.hud-outcome')).toContainText('GỤC');
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(0.3));
  await shot(page, 'wasted');
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(2));
  const after = await page.evaluate(() => {
    const g = window.__HEM__!.game as Game & { health: number; places: { clinic: { x: number; z: number } } };
    const p = g.character.feet();
    return { health: g.health, cash: g.wallet.cash, dist: Math.hypot(p.x - g.places.clinic.x, p.z - g.places.clinic.z) };
  });
  expect(after.health).toBe(100);
  expect(after.cash).toBeLessThan(cash0);
  expect(after.dist).toBeLessThan(2.5);
  await expect(page.locator('.hud-toast')).toContainText('Viện phí');
  await page.evaluate(() => (window.__HEM__!.simulate as (s: number) => void)(1));
  await shot(page, 'clinic');
});

test('công an đuổi vào hẻm: xe máy chạy chậm hơn Tín chạy bộ, ô tô dừng ở miệng hẻm', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/?moi=1&gio=10');
  await page.waitForFunction(() => window.__HEM__?.ready === true, null, { timeout: 90_000 });

  type Chaser = { kind: string; x: number; z: number; yaw: number; speed: number; prevX: number; prevZ: number; prevYaw: number };
  type Hem = { kind: string; axis: 'x' | 'z'; rect: { x0: number; z0: number; x1: number; z1: number } };
  const result = await page.evaluate(() => {
    const h = window.__HEM__!;
    h.paused = true;
    const g = h.game as Game & { police: { sim: { chasers: Chaser[]; config: { hemSpeed: number } } } };
    const hems = (h.layout as { hems: Hem[] }).hems;
    const len = (m: Hem) => (m.axis === 'x' ? m.rect.x1 - m.rect.x0 : m.rect.z1 - m.rect.z0);
    const main = hems.filter((m) => m.kind === 'main').reduce((a, b) => (len(b) > len(a) ? b : a));
    // Điểm giữa bề ngang hẻm, cách đầu phía toạ độ nhỏ `s` m vào trong (s < 0: ngoài miệng hẻm, trên đường).
    const along = (s: number) =>
      main.axis === 'x' ? { x: main.rect.x0 + s, z: (main.rect.z0 + main.rect.z1) / 2 } : { x: (main.rect.x0 + main.rect.x1) / 2, z: main.rect.z0 + s };
    const inward = main.axis === 'x' ? Math.PI / 2 : 0;
    const inHem = (x: number, z: number) => hems.some((m) => x >= m.rect.x0 && x <= m.rect.x1 && z >= m.rect.z0 && z <= m.rect.z1);

    // Tín đứng sâu trong hẻm chính; 3 sao: hai xe máy + một ô tô công an.
    const me = along(25);
    g.character.teleport(me.x, 0.6, me.z, inward + Math.PI);
    (h.simulate as (s: number) => void)(0.2);
    (h.setWanted as (n: number) => void)(3);
    (h.simulate as (s: number) => void)(1 / 60);
    const chasers = g.police.sim.chasers;
    const car = chasers.find((c) => c.kind === 'car')!;
    const bike = chasers.find((c) => c.kind === 'bike')!;
    // Cả hai đang phóng tới miệng hẻm (thấy Tín dọc hẻm).
    for (const [c, s] of [[bike, -6], [car, -16]] as const) {
      const p = along(s);
      Object.assign(c, { x: p.x, z: p.z, prevX: p.x, prevZ: p.z, yaw: inward, prevYaw: inward, speed: 14 });
    }
    let bikeEntered = false;
    let bikeTop = 0;
    let carEntered = false;
    for (let i = 0; i < 40; i++) {
      (h.simulate as (s: number) => void)(0.1);
      if (inHem(bike.x, bike.z)) {
        bikeEntered = true;
        bikeTop = Math.max(bikeTop, bike.speed);
      }
      carEntered ||= inHem(car.x, car.z);
    }
    // Nhìn từ sau lưng Tín ra miệng hẻm.
    const eye = along(29);
    const at = along(-8);
    (h.setCamera as (...a: number[]) => void)(eye.x, 2.2, eye.z, at.x, 1, at.z);
    return { bikeEntered, bikeTop, carEntered, carSpeed: car.speed, hemSpeed: g.police.sim.config.hemSpeed };
  });
  expect(result.bikeEntered).toBe(true);
  expect(result.bikeTop).toBeLessThanOrEqual(result.hemSpeed + 0.3);
  expect(result.hemSpeed).toBeLessThan(6.4);
  expect(result.carEntered).toBe(false);
  expect(result.carSpeed).toBeLessThan(0.5);
  await shot(page, 'police-hem');
});
