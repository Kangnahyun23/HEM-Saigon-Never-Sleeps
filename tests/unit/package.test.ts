import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checkBundle, createZip, ITCH_LIMITS } from '../../scripts/zip.mjs';

/** Đọc lại zip qua thư mục trung tâm (như các trình giải nén) để kiểm tra file tạo ra. */
function readZip(zip: Buffer): Map<string, Buffer> {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(p)).toBe(0x02014b50);
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const body = zip.subarray(start, start + size);
    out.set(name, method === 8 ? inflateRawSync(body) : Buffer.from(body));
    p += 46 + nameLen;
  }
  return out;
}

describe('đóng gói bản web cho itch.io', () => {
  it('zip giải nén ra đúng nội dung, tên file tiếng Việt, file nén được và không nén được', () => {
    const html = Buffer.from('<!doctype html><title>HẺM</title>'.repeat(50));
    const noise = Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 7919) % 251));
    const zip = createZip([
      { path: 'index.html', data: html },
      { path: 'assets/đèn-đường.bin', data: noise },
    ]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(['index.html', 'assets/đèn-đường.bin']);
    expect(files.get('index.html')!.equals(html)).toBe(true);
    expect(files.get('assets/đèn-đường.bin')!.equals(noise)).toBe(true);
    expect(zip.length).toBeLessThan(html.length); // index.html lặp lại ⇒ nén nhỏ hẳn
  });

  it('cùng nội dung thì cùng file zip (không phụ thuộc giờ build)', () => {
    const entries = [{ path: 'index.html', data: Buffer.from('a') }];
    expect(createZip(entries).equals(createZip(entries))).toBe(true);
  });

  it('báo lỗi gói không hợp lệ cho itch.io', () => {
    const ok = [
      { path: 'index.html', size: 1000 },
      { path: 'assets/index.js', size: 5000 },
    ];
    expect(checkBundle(ok, '<script src="./assets/index.js"></script><a href="//x.org">x</a>')).toEqual([]);
    expect(checkBundle([{ path: 'game.html', size: 1 }], '')[0]).toContain('index.html');
    expect(checkBundle(ok, '<script src="/assets/index.js"></script>')[0]).toContain('tuyệt đối');
    expect(checkBundle([...ok, { path: 'big.wasm', size: ITCH_LIMITS.maxFileBytes + 1 }], '')[0]).toContain('quá lớn');
    const many = Array.from({ length: ITCH_LIMITS.maxFiles + 1 }, (_, i) => ({ path: i ? `f${i}` : 'index.html', size: 1 }));
    expect(checkBundle(many, '')[0]).toContain('Quá nhiều file');
  });
});
