// Chuẩn bị thư viện trước khi chạy game: chỉ `npm install` khi chưa cài hoặc package.json / package-lock.json đã đổi,
// nên gọi bao nhiêu lần cũng được (npm start, npm run dev, hook của phiên Claude trên cloud).
import { execSync } from 'node:child_process';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const stampPath = join(root, 'node_modules', '.hem-install-stamp');

const [nodeMajor = 0, nodeMinor = 0] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.error(`✗ Cần Node ≥ 22.12 (đang dùng ${process.versions.node}). Tải tại https://nodejs.org`);
  process.exit(1);
}

/** Dấu vân tay của danh sách thư viện: đổi file nào thì cài lại. */
function manifestHash() {
  const hash = createHash('sha256');
  for (const file of ['package.json', 'package-lock.json']) hash.update(readFileSync(join(root, file)));
  return hash.digest('hex');
}

const installed = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : '';
if (installed === manifestHash()) {
  console.info('✓ Thư viện đã cài sẵn.');
  process.exit(0);
}

// npm 10.9 lỗi `edgesOut` khi cài vitest 4 → máy nào còn npm cũ thì mượn npm 11 qua npx, không cần cài global.
const npmMajor = Number(execSync('npm --version', { encoding: 'utf8' }).split('.')[0]);
const command = npmMajor >= 11 ? 'npm install' : 'npx -y npm@11 install';
console.info(`→ Đang cài thư viện (${command})…`);
execSync(command, { cwd: root, stdio: 'inherit' });

// Băm lại sau khi cài vì npm có thể vừa cập nhật package-lock.json.
writeFileSync(stampPath, `${manifestHash()}\n`);
console.info('✓ Cài xong.');
