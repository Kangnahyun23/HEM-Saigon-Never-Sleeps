/**
 * npm run assets — tải asset CC0 từ nguồn gốc (Poly Haven…), nén cho web rồi ghi vào:
 *   public/media/…            file game tải về (đã nén, có commit vào repo — CI và người khác không cần tải lại)
 *   src/assets/manifest.ts    danh sách asset cho code game (tự sinh — đừng sửa tay)
 *   CREDITS.md                ghi nguồn + giấy phép từng asset (tự sinh)
 * Bản gốc tải về được giữ ở .cache/assets/ (không commit) để chạy lại nhanh.
 * Thêm asset: thêm một dòng vào SOURCES bên dưới rồi chạy lại lệnh.
 */
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { URL, fileURLToPath } from 'node:url';
import sharp from 'sharp';

/* global fetch -- fetch có sẵn trong Node ≥ 18 */

// fetch() có sẵn của Node chỉ đi qua proxy (HTTPS_PROXY) khi bật NODE_USE_ENV_PROXY lúc khởi động ⇒ tự chạy lại một lần.
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ['--no-warnings', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const cacheDir = join(root, '.cache', 'assets');
const mediaDir = join(root, 'public', 'media');

/**
 * Texture lặp (tileable) từ Poly Haven, CC0. `maps`: color (màu, sRGB), normal (OpenGL), rough (độ nhám).
 * `use`: dùng ở đâu trong game (ghi vào CREDITS cho dễ tra).
 */
const SOURCES = [
  { id: 'asphalt', polyhaven: 'asphalt_02', maps: ['color', 'normal'], use: 'Mặt đường nhựa' },
  { id: 'pavers', polyhaven: 'concrete_pavers', maps: ['color', 'normal'], use: 'Vỉa hè gạch con sâu' },
  { id: 'concrete', polyhaven: 'concrete_floor_worn_001', maps: ['color', 'normal'], use: 'Nền bê tông trong hẻm' },
  { id: 'plaster', polyhaven: 'worn_plaster_wall', maps: ['color'], use: 'Tường vữa loang lổ của nhà phố' },
  { id: 'corrugated', polyhaven: 'corrugated_iron_02', maps: ['color', 'normal'], use: 'Mái tôn sóng trên sân thượng' },
];

/** Tên bản đồ trên Poly Haven tương ứng. */
const PH_MAPS = { color: 'Diffuse', normal: 'nor_gl', rough: 'Rough' };
/** Kích thước ảnh trong game (px) và chất lượng WebP. */
const SIZE = 1024;
const QUALITY = { color: 80, normal: 88, rough: 80 };
/** Ngân sách tổng dung lượng thư mục media (byte) — ghi vào manifest để test kiểm tra lại. */
const MEDIA_BUDGET = 25 * 1024 * 1024;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function download(url, file) {
  if (existsSync(file) && statSync(file).size > 0) return;
  mkdirSync(dirname(file), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

/** Màu trung bình (tuyến tính 0..1) của ảnh sRGB — để shader nhân màu gốc của game mà vẫn giữ chi tiết texture. */
async function linearMean(file) {
  const { data, info } = await sharp(file).resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const sum = [0, 0, 0];
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (let i = 0; i < data.length; i += info.channels) for (let c = 0; c < 3; c++) sum[c] += toLinear(data[i + c] / 255);
  const n = data.length / info.channels;
  return sum.map((s) => Math.round((s / n) * 1e4) / 1e4);
}

/** JSON thụt lề nhưng mảng số nằm trên một dòng. */
function compactJson(value) {
  return JSON.stringify(value, null, 2).replace(/\[\s*([-\d.,\s]+?)\s*\]/g, (_, inner) => `[${inner.split(/,\s*/).join(', ')}]`);
}

async function main() {
  rmSync(mediaDir, { recursive: true, force: true });
  mkdirSync(join(mediaDir, 'textures'), { recursive: true });
  const textures = {};
  const credits = [];
  let total = 0;

  for (const src of SOURCES) {
    const [files, info] = await Promise.all([
      fetchJson(`https://api.polyhaven.com/files/${src.polyhaven}`),
      fetchJson(`https://api.polyhaven.com/info/${src.polyhaven}`),
    ]);
    const entry = { size: info.dimensions.map((mm) => Math.round(mm) / 1000) };
    for (const map of src.maps) {
      const file = files[PH_MAPS[map]]?.['1k']?.jpg ?? files[PH_MAPS[map]]?.['1k']?.png;
      if (!file) throw new Error(`${src.polyhaven}: không có bản đồ ${map} 1k`);
      const raw = join(cacheDir, src.polyhaven, file.url.split('/').pop());
      await download(file.url, raw);
      const outRel = `media/textures/${src.id}-${map}.webp`;
      const out = join(root, 'public', outRel);
      await sharp(raw).resize(SIZE, SIZE).webp({ quality: QUALITY[map], effort: 6 }).toFile(out);
      total += statSync(out).size;
      entry[map] = outRel;
      if (map === 'color') entry.mean = await linearMean(raw);
    }
    textures[src.id] = entry;
    credits.push(
      `| \`${src.id}\` | [${info.name}](https://polyhaven.com/a/${src.polyhaven}) | ${Object.keys(info.authors).join(', ')} | Poly Haven | CC0 | ${src.use} |`,
    );
    console.info(`✓ ${src.id} ← ${src.polyhaven}`);
  }

  const manifest = `// Tự sinh bởi \`npm run assets\` (scripts/assets.mjs) — đừng sửa tay.

/** Texture lặp: đường dẫn (so với gốc trang), kích thước thật [rộng, cao] (m), màu trung bình tuyến tính. */
export interface TextureEntry {
  readonly size: readonly [number, number];
  readonly color?: string;
  readonly normal?: string;
  readonly rough?: string;
  readonly mean?: readonly [number, number, number];
}

export const TEXTURES = ${compactJson(textures)} as const satisfies Record<string, TextureEntry>;

export type TextureId = keyof typeof TEXTURES;

/** Tổng dung lượng thư mục public/media (byte) và ngân sách cho phép. */
export const MEDIA_BYTES = ${total};
export const MEDIA_BUDGET = ${MEDIA_BUDGET};
`;
  writeFileSync(join(root, 'src', 'assets', 'manifest.ts'), manifest);

  const header = readFileSync(join(root, 'scripts', 'credits-header.md'), 'utf8');
  writeFileSync(
    join(root, 'CREDITS.md'),
    `${header}
## Texture

| Mã trong game | Asset | Tác giả | Nguồn | Giấy phép | Dùng cho |
| --- | --- | --- | --- | --- | --- |
${credits.join('\n')}
`,
  );
  const mb = (total / 1024 / 1024).toFixed(2);
  console.info(`Xong: ${Object.keys(textures).length} texture, ${mb} MB / ngân sách ${MEDIA_BUDGET / 1024 / 1024} MB`);
  if (total > MEDIA_BUDGET) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
