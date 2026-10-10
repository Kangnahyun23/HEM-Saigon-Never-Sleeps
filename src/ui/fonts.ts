/**
 * Font có đủ dấu tiếng Việt (giấy phép SIL OFL, gói @fontsource — đi kèm bản build, không gọi Google Fonts):
 * giao diện dùng Be Vietnam Pro; bảng hiệu dùng các font chữ đứng / chữ đậm / chữ viết tay giống bảng hiệu Sài Gòn.
 * Chỉ nhúng 3 bảng mã latin, latin-ext, vietnamese (trình duyệt tự tải đúng phần cần dùng theo unicode-range).
 */
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/latin-ext-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/latin-ext-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource/be-vietnam-pro/latin-ext-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
import '@fontsource/be-vietnam-pro/latin-800.css';
import '@fontsource/be-vietnam-pro/latin-ext-800.css';
import '@fontsource/be-vietnam-pro/vietnamese-800.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/oswald/latin-ext-700.css';
import '@fontsource/oswald/vietnamese-700.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/anton/latin-ext-400.css';
import '@fontsource/anton/vietnamese-400.css';
import '@fontsource/bungee/latin-400.css';
import '@fontsource/bungee/latin-ext-400.css';
import '@fontsource/bungee/vietnamese-400.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-ext-700.css';
import '@fontsource/barlow-condensed/vietnamese-700.css';
import '@fontsource/sriracha/latin-400.css';
import '@fontsource/sriracha/latin-ext-400.css';
import '@fontsource/sriracha/vietnamese-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/patrick-hand/latin-ext-400.css';
import '@fontsource/patrick-hand/vietnamese-400.css';
import '@fontsource/tilt-neon/latin-400.css';
import '@fontsource/tilt-neon/latin-ext-400.css';
import '@fontsource/tilt-neon/vietnamese-400.css';

/** Kiểu chữ bảng hiệu: [độ đậm + họ font] dùng cho `ctx.font` trên canvas. */
export const SIGN_FONTS = {
  /** Chữ đứng đậm, hẹp — bảng alu chữ nổi phổ biến nhất. */
  condensed: '400 "Anton"',
  /** Chữ đứng vừa — tên tiệm, dòng phụ. */
  tall: '700 "Oswald"',
  /** Chữ hẹp gọn — số điện thoại, địa chỉ. */
  narrow: '700 "Barlow Condensed"',
  /** Chữ khối tròn — bảng hiệu mới, quán trà sữa, karaoke. */
  block: '400 "Bungee"',
  /** Chữ vẽ tay — quán ăn, xe đẩy. */
  brush: '400 "Sriracha"',
  /** Chữ viết bút lông — bảng giá, giấy dán. */
  hand: '400 "Patrick Hand"',
  /** Chữ neon. */
  neon: '400 "Tilt Neon"',
} as const;

export type SignFont = keyof typeof SIGN_FONTS;

/** Font dự phòng khi font chính chưa tải được (vẫn có dấu tiếng Việt trên hầu hết máy). */
export const FONT_FALLBACK = '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif';

/** Chuỗi `ctx.font` cho một kiểu bảng hiệu ở cỡ chữ `px` (chèn cỡ chữ vào giữa độ đậm và họ font). */
export function signFont(kind: SignFont, px: number): string {
  return `${SIGN_FONTS[kind].replace(' ', ` ${px}px `)}, ${FONT_FALLBACK}`;
}

/**
 * Tải trước các font dùng trên canvas (bảng hiệu vẽ một lần lúc dựng phố — font chưa tải thì canvas vẽ bằng font dự phòng).
 * Có thời hạn: mạng chậm thì thôi, không giữ màn hình tải mãi.
 */
export async function loadFonts(timeoutMs = 4000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const sample = 'ẮẰẲẴẶÂĐÊÔƠƯ àáạảãăâđêôơư 0123456789';
  const faces = [
    ...(Object.keys(SIGN_FONTS) as SignFont[]).map((k) => signFont(k, 48).split(',')[0]!),
    '800 48px "Be Vietnam Pro"',
    '700 16px "Be Vietnam Pro"',
    '600 16px "Be Vietnam Pro"',
    '400 16px "Be Vietnam Pro"',
  ];
  const all = Promise.all(faces.map((f) => document.fonts.load(f, sample).catch(() => [])));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
