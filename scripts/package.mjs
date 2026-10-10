/**
 * npm run package — build rồi đóng gói dist/ thành release/hem-saigon-v<phiên bản>-web.zip để tải lên itch.io.
 * Hướng dẫn tải lên: README.md, mục "Bản demo trên itch.io".
 */
import console from 'node:console';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { checkBundle, createZip } from './zip.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** @returns {string[]} */
function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

let paths;
try {
  paths = listFiles(dist).sort();
} catch {
  console.error('Chưa có dist/ — chạy "npm run build" trước (hoặc dùng "npm run package").');
  process.exit(1);
}

const files = paths.map((full) => ({ path: relative(dist, full).split(sep).join('/'), full, size: statSync(full).size }));
const problems = checkBundle(files, readFileSync(join(dist, 'index.html'), 'utf8'));
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}

const zip = createZip(files.map((f) => ({ path: f.path, data: readFileSync(f.full) })));
const outDir = join(root, 'release');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `hem-saigon-v${version}-web.zip`);
writeFileSync(out, zip);
const mb = (n) => (n / 1024 / 1024).toFixed(1);
const total = files.reduce((n, f) => n + f.size, 0);
console.info(`✓ ${relative(root, out)} — ${files.length} file, ${mb(total)} MB → nén còn ${mb(zip.length)} MB`);
