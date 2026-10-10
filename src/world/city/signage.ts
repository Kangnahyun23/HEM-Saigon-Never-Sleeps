import { pick, type Rng } from '@/core/random';
import type { SignFont } from '@/ui/fonts';

/**
 * Nội dung + kiểu dáng bảng hiệu kiểu Sài Gòn (thuần logic, có unit test; phần vẽ lên canvas ở signs.ts).
 * Bảng ngang: dòng 1 tên nghề chữ to ("CƠM TẤM"), dòng 2 tên tiệm / món ("CÔ BA"), dòng 3 địa chỉ + số điện thoại.
 * Tên tiệm, tên người đều hư cấu; số điện thoại dùng đầu số 11 chữ số cũ (0168, 0123…) — đã bị đổi sang 10 số từ 2018
 * nên không trùng số thật nào.
 */

export type SignStyle = 'alu' | 'paint' | 'lightbox' | 'neon' | 'banner';
export type TradeKind = 'food' | 'drink' | 'retail' | 'service' | 'health' | 'night' | 'money';

export interface Trade {
  readonly title: string;
  readonly kind: TradeKind;
  /** Dòng phụ hay gặp (món, dịch vụ). */
  readonly subs: readonly string[];
}

export const TRADES: readonly Trade[] = [
  { title: 'CƠM TẤM', kind: 'food', subs: ['SƯỜN BÌ CHẢ TRỨNG', 'CƠM TẤM ĐÊM', 'SƯỜN NƯỚNG THAN'] },
  { title: 'PHỞ BÒ', kind: 'food', subs: ['TÁI NẠM GẦU GÂN', 'PHỞ GIA TRUYỀN'] },
  { title: 'HỦ TIẾU NAM VANG', kind: 'food', subs: ['HỦ TIẾU - MÌ - SỦI CẢO', 'NƯỚC - KHÔ'] },
  { title: 'BÚN BÒ HUẾ', kind: 'food', subs: ['GIÒ HEO - CHẢ CUA', 'BÚN BÒ CHÍNH GỐC'] },
  { title: 'BÁNH MÌ', kind: 'food', subs: ['THỊT NƯỚNG - PATE - CHẢ', 'BÁNH MÌ CHẢO', 'BÁNH MÌ HEO QUAY'] },
  { title: 'BÁNH XÈO', kind: 'food', subs: ['BÁNH XÈO MIỀN TÂY', 'BÁNH KHỌT'] },
  { title: 'QUÁN ỐC', kind: 'food', subs: ['ỐC - SÒ - NGHÊU - HẾN', 'HẢI SẢN TƯƠI SỐNG'] },
  { title: 'LẨU DÊ', kind: 'food', subs: ['DÊ NƯỚNG - DÊ TÁI CHANH', 'LẨU - NƯỚNG'] },
  { title: 'BÚN THỊT NƯỚNG', kind: 'food', subs: ['CHẢ GIÒ - NEM NƯỚNG'] },
  { title: 'CƠM GÀ', kind: 'food', subs: ['CƠM GÀ XỐI MỠ', 'GÀ LUỘC - GÀ QUAY'] },
  { title: 'BÁNH CANH CUA', kind: 'food', subs: ['BÁNH CANH GHẸ', 'CHẢ CUA - TÔM'] },
  { title: 'XÔI CHÈ', kind: 'food', subs: ['XÔI MẶN - XÔI GẤC', 'CHÈ BƯỞI - CHÈ THÁI'] },
  { title: 'CƠM VĂN PHÒNG', kind: 'food', subs: ['CƠM PHẦN - GIAO TẬN NƠI', 'CƠM NHÀ LÀM'] },
  { title: 'BÁNH CUỐN', kind: 'food', subs: ['BÁNH CUỐN NÓNG', 'CHẢ LỤA'] },
  { title: 'BÒ KHO', kind: 'food', subs: ['BÁNH MÌ - HỦ TIẾU BÒ KHO'] },
  { title: 'CÀ PHÊ', kind: 'drink', subs: ['CÀ PHÊ SỮA ĐÁ', 'CÀ PHÊ VỢT', 'CÀ PHÊ - SINH TỐ - NƯỚC ÉP'] },
  { title: 'TRÀ SỮA', kind: 'drink', subs: ['TRÂN CHÂU ĐƯỜNG ĐEN', 'TRÀ TRÁI CÂY'] },
  { title: 'NƯỚC MÍA', kind: 'drink', subs: ['MÍA SẠCH - TẮC - THƠM'] },
  { title: 'SINH TỐ', kind: 'drink', subs: ['NƯỚC ÉP - SINH TỐ - KEM'] },
  { title: 'QUÁN NHẬU', kind: 'night', subs: ['BIA TƯƠI - MỒI NGON', 'LẨU - NƯỚNG - BIA'] },
  { title: 'TẠP HÓA', kind: 'retail', subs: ['BIA - NƯỚC NGỌT - THUỐC LÁ', 'CÓ BÁN THẺ CÀO', 'GẠO - MẮM - ĐƯỜNG'] },
  { title: 'TIỆM VÀNG', kind: 'money', subs: ['MUA BÁN VÀNG BẠC ĐÁ QUÝ', 'NỮ TRANG - ĐỔI NGOẠI TỆ'] },
  { title: 'ĐIỆN THOẠI', kind: 'retail', subs: ['MUA BÁN - SỬA CHỮA - ÉP KÍNH', 'PHỤ KIỆN CHÍNH HÃNG'] },
  { title: 'SIM SỐ ĐẸP', kind: 'retail', subs: ['SIM - THẺ CÀO - NẠP TIỀN'] },
  { title: 'SHOP QUẦN ÁO', kind: 'retail', subs: ['THỜI TRANG NAM NỮ', 'HÀNG QUẢNG CHÂU'] },
  { title: 'GIÀY DÉP', kind: 'retail', subs: ['GIÀY DÉP - TÚI XÁCH'] },
  { title: 'MẮT KÍNH', kind: 'retail', subs: ['ĐO MẮT MIỄN PHÍ', 'KÍNH CẬN - KÍNH MÁT'] },
  { title: 'ĐỒNG HỒ', kind: 'retail', subs: ['SỬA ĐỒNG HỒ - THAY PIN'] },
  { title: 'VẬT LIỆU XÂY DỰNG', kind: 'retail', subs: ['SẮT THÉP - XI MĂNG - CÁT ĐÁ'] },
  { title: 'ĐIỆN NƯỚC', kind: 'service', subs: ['THI CÔNG ĐIỆN NƯỚC', 'ỐNG NƯỚC - BỒN INOX'] },
  { title: 'CHÌA KHÓA', kind: 'service', subs: ['LÀM CHÌA KHÓA - SỬA KHÓA'] },
  { title: 'HOA TƯƠI', kind: 'retail', subs: ['HOA CƯỚI - HOA KHAI TRƯƠNG'] },
  { title: 'PHOTOCOPY', kind: 'service', subs: ['IN ẤN - ÉP PLASTIC - SCAN'] },
  { title: 'IN BẢNG HIỆU', kind: 'service', subs: ['BẢNG HIỆU - HỘP ĐÈN - BẠT HIFLEX'] },
  { title: 'NHÀ THUỐC', kind: 'health', subs: ['THUỐC TÂY - DỤNG CỤ Y TẾ', 'NHÀ THUỐC TÂY'] },
  { title: 'THUỐC BẮC', kind: 'health', subs: ['ĐÔNG Y GIA TRUYỀN'] },
  { title: 'NHA KHOA', kind: 'health', subs: ['NIỀNG RĂNG - TẨY TRẮNG'] },
  { title: 'PHÒNG KHÁM', kind: 'health', subs: ['KHÁM BỆNH NGOÀI GIỜ'] },
  { title: 'THÚ Y', kind: 'health', subs: ['CHÓ MÈO - TIÊM NGỪA'] },
  { title: 'SỬA XE', kind: 'service', subs: ['VÁ VỎ - THAY NHỚT - RỬA XE', 'SỬA XE MÁY CÁC LOẠI'] },
  { title: 'RỬA XE', kind: 'service', subs: ['RỬA XE - BẢO DƯỠNG'] },
  { title: 'CẮT TÓC', kind: 'service', subs: ['CẮT TÓC NAM', 'HAIR SALON - UỐN DUỖI NHUỘM'] },
  { title: 'GỘI ĐẦU', kind: 'service', subs: ['GỘI ĐẦU DƯỠNG SINH', 'GỘI ĐẦU - MASSAGE'] },
  { title: 'LÀM MÓNG', kind: 'service', subs: ['NAIL - MI - MÓNG'] },
  { title: 'GIẶT ỦI', kind: 'service', subs: ['GIẶT SẤY - GIẶT HẤP'] },
  { title: 'MAY ĐO', kind: 'service', subs: ['SỬA ĐỒ - MAY ÁO DÀI'] },
  { title: 'CẦM ĐỒ', kind: 'money', subs: ['CẦM ĐỒ - CHO VAY', 'NHẬN CẦM XE - ĐIỆN THOẠI'] },
  { title: 'KARAOKE', kind: 'night', subs: ['PHÒNG VIP - ÂM THANH CHUẨN'] },
  { title: 'NHÀ NGHỈ', kind: 'night', subs: ['CÓ MÁY LẠNH - GIÁ RẺ', 'NGHỈ GIỜ - QUA ĐÊM'] },
  { title: 'BI-A', kind: 'night', subs: ['CÂU LẠC BỘ BI-A'] },
  { title: 'GAME NET', kind: 'night', subs: ['MÁY CẤU HÌNH CAO - MỞ CỬA 24/24'] },
  { title: 'SỬA TIVI', kind: 'service', subs: ['SỬA ĐIỆN TỬ - ĐIỆN LẠNH'] },
  { title: 'THU MUA PHẾ LIỆU', kind: 'service', subs: ['SẮT - NHÔM - ĐỒNG - GIẤY'] },
  { title: 'TIỆM BÁNH', kind: 'food', subs: ['BÁNH KEM - BÁNH SINH NHẬT'] },
  { title: 'HEO QUAY', kind: 'food', subs: ['HEO QUAY - VỊT QUAY - XÁ XÍU'] },
];

/** Tên tiệm / tên chủ hư cấu, kiểu hay gặp ngoài phố. */
export const SHOP_NAMES: readonly string[] = [
  'CÔ BA', 'DÌ TƯ', 'CHÚ BẢY', 'ANH HAI', 'BÀ NĂM', 'CÔ SÁU', 'TIẾN PHÁT', 'KIM HOÀN', 'MỸ HẠNH', 'THANH TÂM',
  'HỒNG NHUNG', 'PHƯỚC LỘC', 'MINH KHOA', 'BẢO NGỌC', 'NGỌC LAN', 'VẠN PHÁT', 'ĐẠI LỢI', 'HẢI ĐĂNG', 'THIÊN PHÚC',
  'TÂM ĐỨC', 'HOÀNG LONG', 'PHƯƠNG NAM', 'THÚY HẰNG', 'SƠN HÀ', 'NHƯ Ý', 'PHÚ QUÝ', 'TƯỜNG VY', 'GIA HUY',
  'HẠNH PHÚC', 'THÀNH CÔNG', 'MAI ANH', 'LỘC PHÁT', 'KIM ANH', 'HÒA BÌNH', 'TRUNG NGHĨA', 'TÍN NGHĨA',
];

/** Băng rôn treo lan can: khai trương, thanh lý, sang nhượng… và quảng cáo app vay của Phát. */
export const BANNERS: readonly (readonly [string, string])[] = [
  ['KHAI TRƯƠNG', 'GIẢM GIÁ 20% TOÀN BỘ'],
  ['THANH LÝ', 'XẢ KHO - ĐỒNG GIÁ 50K'],
  ['SANG NHƯỢNG', 'MẶT BẰNG KINH DOANH'],
  ['CHO THUÊ NHÀ', 'NGUYÊN CĂN - CHÍNH CHỦ'],
  ['VAY LIỀN 5S', 'DUYỆT 5 GIÂY - KHÔNG THẾ CHẤP'],
  ['TUYỂN NHÂN VIÊN', 'PHỤ QUÁN - BAO ĂN Ở'],
];

/** Đầu số di động 11 chữ số cũ (đã chuyển sang 10 số năm 2018) — số giả, không gọi được. */
const OLD_PREFIXES = ['0120', '0121', '0122', '0126', '0128', '0162', '0163', '0164', '0165', '0166', '0167', '0168', '0169', '0186', '0188', '0199'];

export function fakePhone(rng: Rng): string {
  const d = (n: number): string => Array.from({ length: n }, () => Math.floor(rng() * 10)).join('');
  return `${pick(rng, OLD_PREFIXES)}.${d(3)}.${d(4)}`;
}

/** Bảng màu [nền, chữ, nhấn] hay gặp theo phong cách. */
const PALETTES: Record<SignStyle, readonly (readonly [string, string, string])[]> = {
  alu: [
    ['#c62828', '#ffe14d', '#ffffff'],
    ['#1557b0', '#ffffff', '#ffd23f'],
    ['#11804a', '#ffffff', '#ffe14d'],
    ['#f6c400', '#c4161c', '#1a1a1a'],
    ['#ffffff', '#c4161c', '#1557b0'],
    ['#151515', '#f2c14e', '#ffffff'],
    ['#ff7a00', '#ffffff', '#1a1a1a'],
    ['#6a1b9a', '#ffffff', '#ffd23f'],
  ],
  paint: [
    ['#f4ecd6', '#c4161c', '#1557b0'],
    ['#fbf6e9', '#1557b0', '#c4161c'],
    ['#ffe58a', '#b3121b', '#11804a'],
    ['#e9f1f5', '#0d5e3a', '#c4161c'],
  ],
  lightbox: [
    ['#ffffff', '#d81b60', '#ffd23f'],
    ['#ffffff', '#0b5ed7', '#00a3e0'],
    ['#fffbe8', '#c4161c', '#ff9800'],
    ['#f2fff6', '#0d8a4f', '#7ccf2c'],
  ],
  neon: [
    ['#12081f', '#ff4fd8', '#3df5ff'],
    ['#07121c', '#3df5ff', '#ffe066'],
    ['#14060a', '#ff5252', '#ffd23f'],
  ],
  banner: [
    ['#d6161d', '#ffe14d', '#ffffff'],
    ['#ffcf00', '#c4161c', '#1557b0'],
    ['#0a7d3e', '#ffffff', '#ffe14d'],
  ],
};

/** Độ tự phát sáng ban đêm theo phong cách: hộp đèn / neon sáng rực, alu có đèn LED hắt, bảng sơn gần như tối. */
export const SIGN_GLOW: Record<SignStyle, number> = { alu: 0.45, paint: 0.12, lightbox: 1.0, neon: 1.25, banner: 0.2 };

export interface SignDesign {
  readonly style: SignStyle;
  /** Dòng chữ, từ to tới nhỏ. Bảng dọc: mỗi phần tử là một dòng xếp chồng. */
  readonly lines: readonly string[];
  readonly bg: string;
  readonly fg: string;
  readonly accent: string;
  /** Font dòng chính. */
  readonly font: SignFont;
  readonly glow: number;
}

function styleFor(rng: Rng, kind: TradeKind): SignStyle {
  const r = rng();
  switch (kind) {
    case 'night':
      return r < 0.55 ? 'neon' : r < 0.85 ? 'lightbox' : 'alu';
    case 'food':
    case 'drink':
      return r < 0.45 ? 'alu' : r < 0.75 ? 'paint' : 'lightbox';
    case 'health':
      return r < 0.6 ? 'lightbox' : 'alu';
    default:
      return r < 0.6 ? 'alu' : r < 0.82 ? 'lightbox' : 'paint';
  }
}

function fontFor(rng: Rng, style: SignStyle): SignFont {
  switch (style) {
    case 'neon':
      return 'neon';
    case 'paint':
      return rng() < 0.6 ? 'brush' : 'hand';
    case 'lightbox':
      return rng() < 0.5 ? 'block' : 'tall';
    default:
      return rng() < 0.75 ? 'condensed' : 'tall';
  }
}

/** Bảng hiệu ngang của một tiệm. */
export function designShopSign(rng: Rng): SignDesign {
  const trade = pick(rng, TRADES);
  const style = styleFor(rng, trade.kind);
  const [bg, fg, accent] = pick(rng, PALETTES[style]);
  const name = pick(rng, SHOP_NAMES);
  // Dòng 2: nửa số bảng ghi tên tiệm, nửa ghi món / dịch vụ.
  const second = rng() < 0.5 ? name : pick(rng, trade.subs);
  const third = `${1 + Math.floor(rng() * 480)}${rng() < 0.3 ? `/${1 + Math.floor(rng() * 60)}` : ''} · ĐT: ${fakePhone(rng)}`;
  return { style, lines: [trade.title, second, third], bg, fg, accent, font: fontFor(rng, style), glow: SIGN_GLOW[style] };
}

/** Bảng dọc chìa ra vỉa hè: tên nghề xếp từng chữ một dòng (2–3 dòng) + số điện thoại. */
export function designVerticalSign(rng: Rng): SignDesign {
  const short = TRADES.filter((t) => t.title.split(' ').length <= 3);
  const trade = pick(rng, short);
  const style = styleFor(rng, trade.kind) === 'paint' ? 'alu' : styleFor(rng, trade.kind);
  const [bg, fg, accent] = pick(rng, PALETTES[style]);
  return { style, lines: [...trade.title.split(' '), fakePhone(rng)], bg, fg, accent, font: style === 'neon' ? 'neon' : 'condensed', glow: SIGN_GLOW[style] };
}

export function designBanner(index: number, rng: Rng): SignDesign {
  const [title, sub] = BANNERS[index % BANNERS.length]!;
  const [bg, fg, accent] = pick(rng, PALETTES.banner);
  return { style: 'banner', lines: [title, sub, `LH: ${fakePhone(rng)}`], bg, fg, accent, font: 'condensed', glow: SIGN_GLOW.banner };
}

// ---- Atlas ---------------------------------------------------------------------------------------------------
/** Atlas 2048²: 12 hàng × 4 ô ngang (512 × 128 px), dưới cùng 1 hàng × 16 ô dọc (128 × 512 px). */
export const ATLAS_SIZE = 2048;
export const H_COLS = 4;
export const H_ROWS = 12;
export const H_CELL = [512, 128] as const;
export const V_COUNT = 16;
export const V_CELL = [128, 512] as const;
/** Trong 48 ô ngang: ô cuối dành cho băng rôn. */
export const BANNER_COUNT = BANNERS.length;
export const SHOP_SIGN_COUNT = H_COLS * H_ROWS - BANNER_COUNT;

/** Ô ngang thứ i: [x, y] góc trái-trên trên canvas (px). */
export function hCellPx(i: number): [number, number] {
  return [(i % H_COLS) * H_CELL[0], Math.floor(i / H_COLS) * H_CELL[1]];
}

/** Ô dọc thứ j: [x, y] góc trái-trên trên canvas (px). */
export function vCellPx(j: number): [number, number] {
  return [j * V_CELL[0], H_ROWS * H_CELL[1]];
}

/**
 * Toạ độ uv [u0, v0, du, dv] của một ô (texture flipY: v = 0 ở đáy canvas).
 * `inset` (px): thu vào mỗi cạnh để mipmap không lem màu ô bên cạnh.
 */
export function cellUv(px: readonly [number, number], size: readonly [number, number], inset = 0): [number, number, number, number] {
  return [(px[0] + inset) / ATLAS_SIZE, 1 - (px[1] + size[1] - inset) / ATLAS_SIZE, (size[0] - 2 * inset) / ATLAS_SIZE, (size[1] - 2 * inset) / ATLAS_SIZE];
}

// ---- Bảng LED chạy chữ -----------------------------------------------------------------------------------------
/** Câu chạy trên bảng LED trước tiệm (hư cấu; dòng cuối là quảng cáo app vay của Phát). */
export const LED_MESSAGES: readonly string[] = [
  'CHÀO MỪNG QUÝ KHÁCH',
  'MỞ CỬA 24/24',
  'SALE 50% TOÀN BỘ CỬA HÀNG',
  'CÓ WIFI MIỄN PHÍ',
  'NHẬN SHIP TẬN NƠI',
  'MUA 1 TẶNG 1',
  'XẢ KHO GIÁ GỐC',
  'THU MUA ĐIỆN THOẠI CŨ GIÁ CAO',
  'CẮT TÓC NAM 40K',
  'TUYỂN NHÂN VIÊN BÁN HÀNG',
  'SIM SỐ ĐẸP GIÁ RẺ',
  'NẠP CARD · THU HỘ TIỀN ĐIỆN NƯỚC',
  'HÀNG MỚI VỀ',
  'GIẢM GIÁ CỰC SỐC',
  'SỬA ĐIỆN THOẠI LẤY LIỀN',
  'TRÀ SỮA MUA 2 TẶNG 1',
  'VAY LIỀN 5S · KHÔNG CẦN THẾ CHẤP',
];

/** Màu LED hay gặp: đỏ, hổ phách, xanh lá, trắng xanh. */
export const LED_COLORS: readonly string[] = ['#ff2a1a', '#ffb31a', '#2bff5a', '#9fd8ff'];

/** Số hàng điểm LED theo chiều cao bảng (đủ chỗ cho dấu tiếng Việt trên chữ hoa). */
export const LED_ROWS = 16;
/** Atlas chữ LED: mỗi câu một dải cao LED_ROWS px, rộng tối đa LED_ATLAS_W px (1 px = 1 điểm LED). */
export const LED_ATLAS_W = 1024;

export interface LedDesign {
  /** Chỉ số câu trong LED_MESSAGES. */
  readonly message: number;
  readonly color: number;
  /** Tốc độ chạy chữ (điểm LED / giây). */
  readonly speed: number;
}

export function designLed(rng: Rng): LedDesign {
  return {
    message: Math.floor(rng() * LED_MESSAGES.length),
    // Đỏ phổ biến nhất.
    color: rng() < 0.45 ? 0 : 1 + Math.floor(rng() * (LED_COLORS.length - 1)),
    speed: 14 + Math.floor(rng() * 14),
  };
}
