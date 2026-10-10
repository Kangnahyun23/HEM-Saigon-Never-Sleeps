import * as THREE from 'three/webgpu';
import { signFont, type SignFont } from '@/ui/fonts';

/** Bảng hiệu cửa hàng hư cấu: [chữ, nền, màu chữ]. Không dùng tên thương hiệu có thật. */
export const SHOP_SIGNS: ReadonlyArray<readonly [string, string, string]> = [
  ['PHỞ BẮC', '#c0392b', '#ffe08a'],
  ['BÁNH MÌ', '#f4c430', '#a0191e'],
  ['CƠM TẤM', '#1f6f43', '#ffffff'],
  ['CÀ PHÊ', '#3b2416', '#f6d7a7'],
  ['TẠP HÓA', '#1e4fa0', '#ffffff'],
  ['SỬA XE', '#f2f2f2', '#1e4fa0'],
  ['TIỆM VÀNG', '#b0141c', '#f9d54a'],
  ['NHÀ THUỐC', '#0f7f6e', '#ffffff'],
  ['TRÀ SỮA', '#f7c6d9', '#7a1f4a'],
  ['HỦ TIẾU', '#e35d2a', '#ffffff'],
  ['BÚN BÒ', '#8e1b1b', '#ffe9b0'],
  ['GỘI ĐẦU', '#7b4bb3', '#ffffff'],
  ['PHOTOCOPY', '#ffffff', '#c0392b'],
  ['ĐIỆN THOẠI', '#123c69', '#7fd3ff'],
  ['KARAOKE', '#2a0f45', '#ff5fd2'],
  ['NƯỚC MÍA', '#4f9a2c', '#ffffff'],
  ['QUÁN ỐC', '#e86a2c', '#fff3b0'],
  ['BÁNH XÈO', '#f0b429', '#7a2e0e'],
  ['QUẦN ÁO', '#ffffff', '#222222'],
  ['GIÀY DÉP', '#2b2b2b', '#ffd166'],
  ['KÍNH MẮT', '#e9eef2', '#1e4fa0'],
  ['NHA KHOA', '#ffffff', '#0f7f6e'],
  ['MAY ĐO', '#5a3d2b', '#ffffff'],
  ['HOA TƯƠI', '#ffe3ec', '#c2185b'],
  ['VÁ VỎ', '#ffd400', '#111111'],
  ['CƠM GÀ', '#ff7b00', '#ffffff'],
  ['VẬT LIỆU XD', '#3a5a7a', '#ffffff'],
  ['IN ẤN', '#00897b', '#ffffff'],
  ['LẨU', '#9b1111', '#ffd54a'],
  ['CHÈ', '#a3d977', '#2e4d12'],
  ['SIM SỐ', '#0057b8', '#ffd700'],
  ['ĐỒNG HỒ', '#1c1c1c', '#e0c38c'],
];

/** Quán ăn uống: chữ vẽ tay hoặc chữ đứng đậm xen kẽ; quán chơi đêm: chữ khối / neon; còn lại: chữ alu chữ nổi. */
const FOOD = /PHỞ|BÁNH|CƠM|HỦ TIẾU|BÚN|ỐC|LẨU|CHÈ|NƯỚC MÍA|CÀ PHÊ/;
const NIGHT = /KARAOKE|TRÀ SỮA/;
export function signStyle(text: string, i: number): SignFont {
  if (NIGHT.test(text)) return i % 2 ? 'neon' : 'block';
  if (FOOD.test(text)) return i % 2 ? 'brush' : 'condensed';
  return (['condensed', 'tall', 'condensed', 'narrow'] as const)[i % 4]!;
}

export const SIGN_COLS = 4;
export const SIGN_ROWS = 8;

/** Vẽ atlas bảng hiệu lên canvas (mỗi ô 256 × 64 px). */
export function createSignAtlas(): THREE.CanvasTexture {
  const cw = 256;
  const ch = 64;
  const canvas = document.createElement('canvas');
  canvas.width = cw * SIGN_COLS;
  canvas.height = ch * SIGN_ROWS;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  SHOP_SIGNS.forEach(([text, bg, fg], i) => {
    const x = (i % SIGN_COLS) * cw;
    const y = Math.floor(i / SIGN_COLS) * ch;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, cw, ch);
    // Viền trong mảnh cho giống bảng hiệu tôn sơn.
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const style = signStyle(text, i);
    let size = 44;
    do {
      ctx.font = signFont(style, size);
      size -= 2;
    } while (ctx.measureText(text).width > cw - 24 && size > 16);
    ctx.fillText(text, x + cw / 2, y + ch / 2 + 2);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Góc uv trái-dưới của ô thứ i trong atlas (texture flipY mặc định: v = 0 ở đáy canvas). */
export function signOffset(i: number): [number, number] {
  const col = i % SIGN_COLS;
  const row = Math.floor(i / SIGN_COLS) % SIGN_ROWS;
  return [col / SIGN_COLS, 1 - (row + 1) / SIGN_ROWS];
}
