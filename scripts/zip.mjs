/**
 * Đóng gói bản web (dist/) thành file zip cho itch.io — không cần thư viện ngoài, chạy được cả trên Windows.
 * Thuần logic (nhận / trả Buffer), có unit test: tests/unit/package.test.ts.
 */
import { Buffer } from 'node:buffer';
import { crc32, deflateRawSync } from 'node:zlib';

/** Giới hạn của itch.io cho game HTML (https://itch.io/docs/creators/html5). */
export const ITCH_LIMITS = {
  maxFiles: 1000,
  maxFileBytes: 200 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
};

/**
 * Kiểm tra bộ file trước khi đóng gói; trả về danh sách lỗi (rỗng = hợp lệ).
 * @param {{ path: string, size: number }[]} files đường dẫn tương đối, dùng dấu "/"
 * @param {string} indexHtml nội dung index.html
 */
export function checkBundle(files, indexHtml) {
  const problems = [];
  if (!files.some((f) => f.path === 'index.html')) problems.push('Thiếu index.html ở gốc gói (itch.io mở file này).');
  if (files.length > ITCH_LIMITS.maxFiles) problems.push(`Quá nhiều file: ${files.length} > ${ITCH_LIMITS.maxFiles}.`);
  let total = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > ITCH_LIMITS.maxFileBytes) problems.push(`File quá lớn: ${f.path} (${f.size} byte).`);
    if (f.path.includes('\\') || f.path.startsWith('/')) problems.push(`Đường dẫn không hợp lệ trong gói: ${f.path}`);
  }
  if (total > ITCH_LIMITS.maxTotalBytes) problems.push(`Tổng dung lượng quá lớn: ${total} byte.`);
  // itch.io phục vụ game trong một thư mục con: đường dẫn tuyệt đối "/assets/…" sẽ hỏng (vite.config.ts phải giữ base: './').
  const absolute = indexHtml.match(/(?:src|href)="\/(?!\/)[^"]*"/g);
  if (absolute) problems.push(`index.html dùng đường dẫn tuyệt đối (cần base: './'): ${absolute.join(', ')}`);
  return problems;
}

// Ngày giờ cố định cho mọi file ⇒ cùng nội dung thì cùng file zip (dễ so sánh giữa các bản build).
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
/** Bit 11: tên file mã hoá UTF-8. */
const UTF8_FLAG = 0x0800;

/**
 * Tạo file zip (deflate; file nào nén không nhỏ đi thì lưu nguyên).
 * @param {{ path: string, data: Uint8Array }[]} entries
 * @returns {Buffer}
 */
export function createZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf8');
    const raw = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const deflated = deflateRawSync(raw, { level: 9 });
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // phiên bản tối thiểu để giải nén
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // tạo bởi
    dir.writeUInt16LE(20, 6); // cần để giải nén
    dir.writeUInt16LE(UTF8_FLAG, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    // 30: extra, 32: comment, 34: đĩa, 36: thuộc tính trong, 38: thuộc tính ngoài — đều 0
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += local.length + name.length + body.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}
