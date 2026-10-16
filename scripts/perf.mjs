// Đo hiệu năng trên GPU thật: mở bản build (dist/) trong Chrome cài trên máy (không có thì Chromium của Playwright),
// tắt khoá vsync, chạy xe qua vài cảnh rồi in thời gian khung hình, logic game, gửi lệnh vẽ, khựng, rác bộ nhớ.
// Trình duyệt chạy ẨN (headless kiểu mới — vẫn dùng card đồ hoạ thật cho WebGPU / WebGL), không bật cửa sổ lên màn hình.
//   npm run build && npm run perf                 # mọi cảnh
//   npm run perf -- night-ride chase              # chỉ vài cảnh
//   PERF_BROWSER=chromium npm run perf            # Chromium của Playwright
//   PERF_WINDOW=1 npm run perf                    # hiện cửa sổ trình duyệt (xem game chạy — cửa sổ sẽ bật lên màn hình)
// Cần máy có GPU: máy không có (CI / cloud) thì trình duyệt vẽ bằng SwiftShader — số đo vô nghĩa, script báo trước.
/* global process, fetch, setTimeout, console -- Node */
/* global window, performance, requestAnimationFrame -- hàm `measure` chạy trong trang */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const SECONDS = 8;

/** Lên xe máy giữa đại lộ, hướng +X, giữ ga (chạy trong trang). */
const RIDE = `(() => {
  const h = window.__HEM__;
  const g = h.game;
  const avenue = h.layout.roads.find((r) => r.axis === 'x' && r.kind === 'avenue');
  g.mount(g.bikes[0]);
  g.riding.phys.reset(h.layout.spawn.x - 150, 0.3, avenue.pos + 4, Math.PI / 2);
  h.input.setKey('KeyW', true);
})()`;

const SCENARIOS = {
  'day-idle': { query: '&gio=10', setup: '0' },
  'day-ride': { query: '&gio=10', setup: RIDE },
  'night-ride': { query: '&gio=21', setup: RIDE },
  'rain-night': { query: '&gio=21&mua=1', setup: RIDE },
  chase: { query: '&gio=21', setup: `${RIDE}; window.__HEM__.setWanted(4); window.__HEM__.setHeat(2)` },
};

const wanted = process.argv.slice(2).filter((a) => a in SCENARIOS);
const names = wanted.length > 0 ? wanted : Object.keys(SCENARIOS);

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { shell: true, stdio: 'ignore' });
const stop = () => {
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
};
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    // Chưa lên.
  }
  await new Promise((r) => setTimeout(r, 500));
}

const useChrome = process.env.PERF_BROWSER !== 'chromium';
const showWindow = process.env.PERF_WINDOW === '1';
// --enable-precise-memory-info: performance.memory không làm tròn ⇒ đo rác bộ nhớ đúng hơn.
const args = ['--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-precise-memory-info'];
let browser;
if (showWindow) {
  try {
    browser = await chromium.launch({ headless: false, args, ...(useChrome ? { channel: 'chrome' } : {}) });
  } catch {
    browser = await chromium.launch({ headless: false, args });
  }
} else {
  try {
    if (!useChrome) throw new Error('chromium');
    // Chrome cài trên máy + `--headless=new` tự thêm (Playwright `headless: true` với Chrome mới làm trình duyệt thoát ngay).
    browser = await chromium.launch({ headless: false, channel: 'chrome', args: [...args, '--headless=new'] });
  } catch {
    // Chromium của Playwright, headless kiểu mới (bản "headless shell" mặc định chỉ có SwiftShader).
    browser = await chromium.launch({ headless: true, channel: 'chromium', args });
  }
}
const context = await browser.newContext({ viewport: { width: 1707, height: 1067 }, deviceScaleFactor: 1.5 });

/** Chạy trong trang: đo `seconds` giây, gói game.update và renderer.render (không đếm lồng nhau). */
async function measure(seconds) {
  const h = window.__HEM__;
  const g = h.game;
  const renderer = h.renderer;
  const frames = [];
  const upd = [];
  const ren = [];
  let renAcc = 0;
  let depth = 0;
  const ou = g.update;
  g.update = function (dt) {
    const t = performance.now();
    ou.call(this, dt);
    upd.push(performance.now() - t);
  };
  const orr = renderer.render;
  renderer.render = function (...a) {
    if (depth++ > 0) {
      try {
        return orr.apply(this, a);
      } finally {
        depth--;
      }
    }
    const t = performance.now();
    try {
      return orr.apply(this, a);
    } finally {
      depth--;
      renAcc += performance.now() - t;
    }
  };
  const mem = () => performance.memory?.usedJSHeapSize ?? 0;
  let lastMem = mem();
  let allocated = 0;
  let gcs = 0;
  let last = performance.now();
  const end = last + seconds * 1000;
  await new Promise((resolve) => {
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      ren.push(renAcc);
      renAcc = 0;
      const m = mem();
      if (m < lastMem) gcs++;
      else allocated += m - lastMem;
      lastMem = m;
      if (now < end) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  g.update = ou;
  renderer.render = orr;
  const stat = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const avg = s.reduce((x, y) => x + y, 0) / Math.max(1, s.length);
    return { avg, p95: s[Math.floor(0.95 * (s.length - 1))] ?? 0, max: s[s.length - 1] ?? 0 };
  };
  const f = stat(frames.slice(1));
  return {
    backend: renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2',
    gpu: h.hardware.gpu,
    canvas: `${renderer.domElement.width}x${renderer.domElement.height}`,
    fps: 1000 / f.avg,
    frame: f,
    hitches: frames.filter((x) => x > 33).length,
    update: stat(upd),
    render: stat(ren),
    draws: renderer.info.render.drawCalls,
    allocMBps: allocated / 1048576 / seconds,
    gcs,
  };
}

const rows = [];
try {
  for (const name of names) {
    const s = SCENARIOS[name];
    const page = await context.newPage();
    await page.goto(`${BASE}/?moi=1${s.query}`);
    await page.waitForFunction(() => window.__HEM__?.ready === true && window.__HEM__.frames > 5, null, { timeout: 120_000 });
    await page.evaluate(s.setup);
    await page.waitForTimeout(3000); // shader biên dịch xong, cảnh ổn định
    const r = await page.evaluate(measure, SECONDS);
    await page.close();
    if (rows.length === 0) {
      console.info(`${r.backend} · ${r.gpu} · ${r.canvas}\n`);
      if (/swiftshader|llvmpipe|software/i.test(r.gpu)) console.warn('⚠ Trình duyệt không dùng được card đồ hoạ (vẽ bằng phần mềm) — số đo dưới đây không phản ánh máy thật.\n');
    }
    rows.push({ name, ...r });
  }
} finally {
  await browser.close();
  stop();
}

const n = (v, d = 1) => v.toFixed(d).padStart(6);
console.info('cảnh            fps   khung  p95   max  khựng  logic  vẽ(CPU)  lệnh vẽ  rác MB/s  dọn rác');
for (const r of rows) {
  console.info(
    `${r.name.padEnd(12)} ${n(r.fps, 0)} ${n(r.frame.avg)} ${n(r.frame.p95)} ${n(r.frame.max, 0)} ${String(r.hitches).padStart(5)} ${n(r.update.avg)} ${n(r.render.avg)}   ${String(r.draws).padStart(6)}   ${n(r.allocMBps)}   ${String(r.gcs).padStart(5)}`,
  );
}
console.info(`\n(ms; đo ${SECONDS} s mỗi cảnh, không khoá vsync. "vẽ(CPU)" gồm cả lượt bloom ban đêm; khựng = khung > 33 ms)`);
