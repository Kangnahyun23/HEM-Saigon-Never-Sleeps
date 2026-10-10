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
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

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

/**
 * Nhân vật có xương + động tác từ Mesh2Motion (CC0: "All 3d models, blend files, rigs, animations"), ghim theo commit để
 * tải lại ra đúng file. Mọi mẫu dùng chung bộ xương người 66 khớp nên động tác dùng được cho mọi mẫu (khớp theo tên xương).
 * Chỉ lấy mẫu ghi CC0 trong RigModelVariations.ts của Mesh2Motion (bỏ các mẫu CC-BY / CC-SA).
 */
const M2M_SHA = '653a9698f5f315523072f1c3ff3496100401317b';
const M2M_RAW = `https://raw.githubusercontent.com/mesh2motion/mesh2motion-app/${M2M_SHA}/static`;
const M2M_REPO = 'https://github.com/mesh2motion/mesh2motion-app';
const CHARACTERS = [
  { id: 'tin', variant: 'male_15', author: 'elbolilloduro', texture: 1024, use: 'Tín — nhân vật chính' },
  { id: 'man-shirt', variant: 'male_5', author: 'elbolilloduro', use: 'Người đi đường (nam, sơ mi)' },
  { id: 'man-tee', variant: 'male_6', author: 'elbolilloduro', use: 'Người đi đường (nam, áo thun)' },
  { id: 'man-polo', variant: 'male_10', author: 'elbolilloduro', use: 'Người đi đường (nam, áo polo)' },
  { id: 'old-man', variant: 'male_32', author: 'elbolilloduro', use: 'Người đi đường (ông cụ)' },
  { id: 'woman-young', variant: 'female_9', author: 'elbolilloduro', use: 'Người đi đường (cô gái)' },
  { id: 'woman-style', variant: 'female_8', author: 'elbolilloduro', use: 'Người đi đường (cô gái sành điệu)' },
  { id: 'old-woman', variant: 'female_31', author: 'elbolilloduro', use: 'Người đi đường (bà cụ)' },
  { id: 'police-m', variant: 'police_male', author: 'elbolilloduro', use: 'Công an (nam) — đổi màu đồng phục trong game' },
  { id: 'police-f', variant: 'police_female', author: 'elbolilloduro', use: 'Công an (nữ) — đổi màu đồng phục trong game' },
  { id: 'riot', variant: 'swat_male', author: 'elbolilloduro', use: 'Cảnh sát cơ động (truy nã cấp cao)' },
];
/** Động tác cần dùng: tên trong game → tên clip gốc. Bỏ hết clip khác cho nhẹ. */
const ANIMATIONS = [
  {
    id: 'human-base',
    file: 'animations/human-base-animations.glb',
    clips: {
      idle: 'Idle_A',
      walk: 'Walk',
      jog: 'Jog',
      sprint: 'Sprint',
      jumpStart: 'Jump_Start',
      jumpAir: 'Jump_air',
      jumpLand: 'Jump_Land',
      drive: 'Driving',
      sit: 'Sitting_Idle',
      phone: 'Idle_TalkingPhone',
      talk: 'Idle_Talking',
      foldArms: 'Idle_FoldArms',
      jab: 'Punch_Jab',
      cross: 'Punch_Cross',
      hook: 'Melee_Hook',
      swordIdle: 'Idle_Sword',
      slashA: 'Sword_Regular_A',
      slashB: 'Sword_Regular_B',
      slashC: 'Sword_Regular_C',
      hitChest: 'Hit_Chest',
      hitHead: 'Hit_Head',
      knockback: 'Hit_Knockback',
      deathD: 'Death_D',
      crouch: 'Crouch_Idle',
      roll: 'Roll',
      interact: 'Interact',
      pickUp: 'PickUp_Table',
      carry: 'Walk_Carry',
      push: 'Push',
      eat: 'Consume',
    },
  },
  {
    id: 'human-addon',
    file: 'animations/human-addon-animations.glb',
    clips: {
      fightIdle: 'Fighting Idle',
      deathA: 'Death_A',
      deathB: 'Death_B',
      hurt: 'Idle Hurt',
      walkFemale: 'Walk_Female',
      runFemale: 'Run_Female',
      idleSubtle: 'Idle_Subtle',
      dodge: 'Dodge_back',
      angry: 'Angry',
      greet: 'Greeting',
      victory: 'Victory',
      dizzy: 'Dizzy',
      defend: 'Defend',
    },
  },
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

/** Chiều cao (m) của mẫu người: lấy theo khối bao các đỉnh lưới (POSITION min/max). */
function meshHeight(doc) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      lo = Math.min(lo, pos.getMin([])[1]);
      hi = Math.max(hi, pos.getMax([])[1]);
    }
  return Math.round((hi - lo) * 100) / 100;
}

/** Mẫu người: nén texture sang WebP (thu nhỏ), gộp dữ liệu trùng, nén lưới bằng meshopt. */
async function processCharacter(io, src, file, out) {
  const doc = await io.read(file);
  doc.getRoot().listAnimations().forEach((a) => a.dispose());
  const size = src.texture ?? 512;
  await doc.transform(prune(), dedup(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  return { height: meshHeight(await io.read(file)) };
}

/** Động tác: giữ các clip cần dùng (đổi sang tên trong game), bỏ lưới / texture, bỏ dịch chuyển của xương gốc (root motion). */
async function processAnimations(io, src, file, out) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const byName = new Map(Object.entries(src.clips).map(([game, orig]) => [orig, game]));
  const kept = [];
  for (const anim of root.listAnimations()) {
    const game = byName.get(anim.getName());
    if (!game) {
      // Bỏ cả kênh + sampler: sampler mồ côi vẫn giữ accessor nên prune() không dọn được.
      anim.listChannels().forEach((c) => c.dispose());
      anim.listSamplers().forEach((sp) => sp.dispose());
      anim.dispose();
      continue;
    }
    anim.setName(game);
    kept.push(game);
    for (const ch of anim.listChannels()) {
      const bone = ch.getTargetNode()?.getName() ?? '';
      const path = ch.getTargetPath();
      // Vật lý (Rapier) điều khiển di chuyển ⇒ xương gốc đứng yên tại chỗ. Chỉ hông được dịch chuyển (nhún, ngồi);
      // không xương nào co giãn. Ngón tay giữ lại: nắm đấm, cầm mã tấu.
      const drop = path === 'scale' || (path === 'translation' && bone !== 'pelvis');
      if (drop) {
        // Bỏ cả sampler (dữ liệu khung hình) — chỉ bỏ kênh thì sampler vẫn nằm trong file.
        const sampler = ch.getSampler();
        ch.dispose();
        if (sampler && !anim.listChannels().some((c) => c.getSampler() === sampler)) sampler.dispose();
      }
    }
  }
  const missing = Object.values(src.clips).filter((orig) => !kept.includes(byName.get(orig)));
  if (missing.length) throw new Error(`${src.file}: thiếu clip ${missing.join(', ')}`);
  for (const node of root.listNodes()) node.setMesh(null).setSkin(null);
  root.listMeshes().forEach((m) => m.dispose());
  root.listSkins().forEach((s) => s.dispose());
  await doc.transform(prune({ keepLeaves: true }), resample({ tolerance: 5e-4 }), dedup(), prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  return kept;
}

async function main() {
  rmSync(mediaDir, { recursive: true, force: true });
  mkdirSync(join(mediaDir, 'textures'), { recursive: true });
  mkdirSync(join(mediaDir, 'characters'), { recursive: true });
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

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const characters = {};
  const modelCredits = [];
  for (const src of CHARACTERS) {
    const rel = `static/models-variation/human/${src.variant}.glb`;
    const raw = join(cacheDir, 'mesh2motion', M2M_SHA, `${src.variant}.glb`);
    await download(`${M2M_RAW}/models-variation/human/${src.variant}.glb`, raw);
    const outRel = `media/characters/${src.id}.glb`;
    const { height } = await processCharacter(io, src, raw, join(root, 'public', outRel));
    total += statSync(join(root, 'public', outRel)).size;
    characters[src.id] = { file: outRel, height };
    modelCredits.push(`| \`${src.id}\` | [${src.variant}](${M2M_REPO}/blob/${M2M_SHA}/${rel}) | ${src.author} | Mesh2Motion | CC0 | ${src.use} |`);
    console.info(`✓ ${src.id} ← ${src.variant} (cao ${height} m)`);
  }
  const animations = {};
  for (const src of ANIMATIONS) {
    const raw = join(cacheDir, 'mesh2motion', M2M_SHA, src.file.split('/').pop());
    await download(`${M2M_RAW}/${src.file}`, raw);
    const outRel = `media/characters/${src.id}.glb`;
    const clips = await processAnimations(io, src, raw, join(root, 'public', outRel));
    total += statSync(join(root, 'public', outRel)).size;
    animations[src.id] = { file: outRel, clips };
    modelCredits.push(`| \`${src.id}\` | [${src.file.split('/').pop()}](${M2M_REPO}/blob/${M2M_SHA}/static/${src.file}) (${clips.length} động tác) | Nhóm Mesh2Motion | Mesh2Motion | CC0 | Động tác nhân vật |`);
    console.info(`✓ ${src.id}: ${clips.length} động tác`);
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

/** Mẫu người có xương (GLB nén meshopt, texture WebP) + chiều cao gốc (m) để co về cỡ trong game. */
export interface CharacterEntry {
  readonly file: string;
  readonly height: number;
}

export const CHARACTERS = ${compactJson(characters)} as const satisfies Record<string, CharacterEntry>;

export type CharacterId = keyof typeof CHARACTERS;

/** File động tác (chỉ xương + clip, tên clip theo game) — khớp với mọi mẫu người theo tên xương. */
export const ANIMATIONS = ${compactJson(animations)} as const satisfies Record<string, { readonly file: string; readonly clips: readonly string[] }>;

export type AnimationName = (typeof ANIMATIONS)[keyof typeof ANIMATIONS]['clips'][number];

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

## Nhân vật và động tác

Từ [Mesh2Motion](${M2M_REPO}) (commit \`${M2M_SHA.slice(0, 7)}\`): "All 3d models, blend files, rigs, animations" theo CC0 1.0.
Chỉ dùng các mẫu ghi CC0 trong danh sách mẫu của Mesh2Motion (bỏ các mẫu CC-BY / CC-SA).

| Mã trong game | Asset | Tác giả | Nguồn | Giấy phép | Dùng cho |
| --- | --- | --- | --- | --- | --- |
${modelCredits.join('\n')}
`,
  );
  const mb = (total / 1024 / 1024).toFixed(2);
  console.info(`Xong: ${Object.keys(textures).length} texture, ${Object.keys(characters).length} nhân vật, ${mb} MB / ngân sách ${MEDIA_BUDGET / 1024 / 1024} MB`);
  if (total > MEDIA_BUDGET) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
