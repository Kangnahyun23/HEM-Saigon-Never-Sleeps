/**
 * File giấy phép đi kèm bản build (GitHub Pages, gói zip itch.io): CREDITS.md + toàn văn SIL OFL 1.1 của từng font
 * @fontsource mà src/ui/fonts.ts nạp — giấy phép OFL buộc mỗi bản phát hành kèm thông báo bản quyền và giấy phép.
 * vite.config.ts đưa các file này vào dist/ lúc build.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} root thư mục gốc dự án
 * @returns {{ fileName: string, source: string }[]}
 */
export function licenseFiles(root) {
  const fontsTs = readFileSync(join(root, 'src', 'ui', 'fonts.ts'), 'utf8');
  const fonts = [...new Set([...fontsTs.matchAll(/@fontsource\/([a-z0-9-]+)\//g)].map((m) => m[1]))];
  return [
    { fileName: 'CREDITS.md', source: readFileSync(join(root, 'CREDITS.md'), 'utf8') },
    ...fonts.map((name) => ({
      fileName: `licenses/${name}-OFL.txt`,
      source: readFileSync(join(root, 'node_modules', '@fontsource', name, 'LICENSE'), 'utf8'),
    })),
  ];
}
