import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ANIMATIONS, CHARACTERS, MEDIA_BUDGET, MEDIA_BYTES, TEXTURES, type TextureEntry } from '@/assets/manifest';

const root = join(__dirname, '..', '..');

describe('asset nhập ngoài (public/media)', () => {
  const entries: TextureEntry[] = Object.values(TEXTURES);
  const files = [
    ...entries.flatMap((t) => [t.color, t.normal, t.rough]).filter((f) => f !== undefined),
    ...Object.values(CHARACTERS).map((c) => c.file),
    ...Object.values(ANIMATIONS).map((a) => a.file),
  ];

  it('mọi file trong manifest có trên đĩa, đúng dung lượng đã ghi và nằm trong ngân sách', () => {
    let total = 0;
    for (const f of files) total += statSync(join(root, 'public', f)).size;
    expect(total).toBe(MEDIA_BYTES);
    expect(total).toBeLessThanOrEqual(MEDIA_BUDGET);
  });

  it('mọi texture, nhân vật, file động tác đều được ghi công trong CREDITS.md với giấy phép CC0', () => {
    const credits = readFileSync(join(root, 'CREDITS.md'), 'utf8');
    for (const id of [...Object.keys(TEXTURES), ...Object.keys(CHARACTERS), ...Object.keys(ANIMATIONS)]) {
      const row = credits.split('\n').find((line) => line.startsWith(`| \`${id}\``));
      expect(row, id).toBeDefined();
      expect(row).toContain('| CC0 |');
    }
  });

  it('kích thước thật và màu trung bình hợp lệ (shader dùng để tính toạ độ và giữ tông màu gốc)', () => {
    for (const t of entries) {
      expect(t.mean).toBeDefined();
      expect(t.size[0]).toBeGreaterThan(0.2);
      expect(t.size[1]).toBeGreaterThan(0.2);
      for (const c of t.mean ?? []) expect(c).toBeGreaterThan(0.005);
    }
  });

  it('nhân vật cao 1,4–2,1 m (co về cỡ trong game); động tác cần cho lối chơi đều có, không trùng tên', () => {
    for (const c of Object.values(CHARACTERS)) {
      expect(c.height).toBeGreaterThan(1.4);
      expect(c.height).toBeLessThan(2.1);
    }
    const clips = Object.values(ANIMATIONS).flatMap((a) => [...a.clips]);
    expect(new Set(clips).size).toBe(clips.length);
    for (const need of ['idle', 'walk', 'jog', 'sprint', 'jumpAir', 'drive', 'jab', 'slashA', 'hitChest', 'deathA', 'sit']) expect(clips).toContain(need);
  });
});
