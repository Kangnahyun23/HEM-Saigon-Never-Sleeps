import * as THREE from 'three/webgpu';
import { createRng } from '@/core/random';
import { signFont, type SignFont } from '@/ui/fonts';
import {
  ATLAS_SIZE,
  BANNER_COUNT,
  designBanner,
  designShopSign,
  designVerticalSign,
  H_CELL,
  hCellPx,
  SHOP_SIGN_COUNT,
  V_CELL,
  V_COUNT,
  vCellPx,
  type SignDesign,
} from './signage';

/** Bộ bảng hiệu của cả khu phố: thiết kế (thuần dữ liệu) + atlas vẽ sẵn. */
export interface SignSet {
  readonly shops: readonly SignDesign[];
  readonly banners: readonly SignDesign[];
  readonly verticals: readonly SignDesign[];
  readonly atlas: THREE.CanvasTexture;
}

/**
 * Đặt font cỡ lớn nhất ≤ `max` để dòng chữ (tính cả dấu tiếng Việt nhô cao như Ầ, Ồ, Ữ) vừa khung `width` × `height`,
 * trả về toạ độ baseline để khối chữ nằm giữa khung theo chiều dọc. Dấu bị cắt nếu chỉ canh theo cỡ chữ.
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, kind: SignFont, max: number, width: number, top: number, height: number, min = 8): number {
  let size = Math.floor(max);
  let m: TextMetrics;
  for (;;) {
    ctx.font = signFont(kind, size);
    m = ctx.measureText(text);
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (size <= min || (m.width <= width && h <= height)) break;
    size -= 1;
  }
  return top + height / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
}

/** Chữ nổi: bóng đổ sẫm lệch xuống dưới (bảng alu chữ nổi, băng rôn) hoặc quầng sáng (neon). */
function drawText(ctx: CanvasRenderingContext2D, d: SignDesign, text: string, x: number, y: number, color: string): void {
  if (d.style === 'neon') {
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
    return;
  }
  if (d.style === 'alu' || d.style === 'banner') {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, x + 2, y + 3);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Nền + viền theo phong cách. */
function drawPanel(ctx: CanvasRenderingContext2D, d: SignDesign, x: number, y: number, w: number, h: number, seed: number): void {
  const rng = createRng(seed);
  ctx.fillStyle = d.bg;
  ctx.fillRect(x, y, w, h);
  if (d.style === 'banner' || d.style === 'lightbox') {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, d.style === 'banner' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }
  switch (d.style) {
    case 'alu':
      // Viền nẹp nhôm + đường chỉ màu nhấn.
      ctx.strokeStyle = '#d9dcdf';
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 10, y + 10, w - 20, h - 20);
      break;
    case 'paint': {
      // Sơn tay trên tôn: lấm tấm bụi, vệt ố chảy dọc.
      ctx.strokeStyle = d.fg;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(80,60,40,${0.05 + rng() * 0.12})`;
        ctx.fillRect(x + rng() * w, y + rng() * h, 1 + rng() * 3, 1 + rng() * 2);
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(90,70,50,0.10)';
        ctx.fillRect(x + rng() * w, y + h * 0.4, 2 + rng() * 5, h * 0.6);
      }
      break;
    }
    case 'lightbox': {
      // Hộp đèn: dải màu nhấn trên dưới, nẹp hai đầu.
      const band = Math.max(4, h * 0.06);
      const side = Math.max(6, w * 0.03);
      ctx.fillStyle = d.accent;
      ctx.fillRect(x, y, w, band);
      ctx.fillRect(x, y + h - band, w, band);
      ctx.fillStyle = d.fg;
      ctx.fillRect(x, y, side, h);
      ctx.fillRect(x + w - side, y, side, h);
      break;
    }
    case 'neon':
      ctx.shadowColor = d.accent;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = d.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
      ctx.shadowBlur = 0;
      break;
    case 'banner':
      // Băng rôn: cờ đuôi nheo hai đầu.
      ctx.fillStyle = d.accent;
      for (const right of [false, true]) {
        const bx = right ? x + w - 22 : x + 22;
        for (let k = 0; k < 4; k++) {
          const by = y + 14 + k * (h / 4.4);
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + (right ? 12 : -12), by + 6);
          ctx.lineTo(bx, by + 12);
          ctx.fill();
        }
      }
      break;
  }
}

function drawHorizontal(ctx: CanvasRenderingContext2D, d: SignDesign, x: number, y: number, seed: number): void {
  const [w, h] = H_CELL;
  drawPanel(ctx, d, x, y, w, h, seed);
  const pad = d.style === 'banner' ? 44 : 26;
  const inner = w - pad * 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const [title, second, third] = d.lines;
  const cx = x + w / 2;
  // Ba dải: tên nghề (to), tên tiệm / món, địa chỉ + điện thoại.
  if (title) drawText(ctx, d, title, cx, fitText(ctx, title, d.font, 64, inner, y + 12, h * 0.5), d.fg);
  const subColor = d.style === 'lightbox' || d.style === 'neon' ? d.accent : d.fg;
  if (second) drawText(ctx, d, second, cx, fitText(ctx, second, d.style === 'paint' ? 'hand' : 'tall', 28, inner, y + h * 0.62, h * 0.2), subColor);
  if (third) {
    ctx.globalAlpha = 0.85;
    drawText(ctx, d, third, cx, fitText(ctx, third, 'narrow', 17, inner, y + h * 0.83, h * 0.12), subColor);
    ctx.globalAlpha = 1;
  }
}

function drawVertical(ctx: CanvasRenderingContext2D, d: SignDesign, x: number, y: number, seed: number): void {
  const [w, h] = V_CELL;
  drawPanel(ctx, d, x, y, w, h, seed);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const words = d.lines.slice(0, -1);
  const phone = d.lines[d.lines.length - 1] ?? '';
  const slot = (h - 70) / Math.max(1, words.length);
  words.forEach((word, k) => {
    drawText(ctx, d, word, x + w / 2, fitText(ctx, word, d.font, 64, w - 22, y + 22 + slot * k + slot * 0.1, slot * 0.8), d.fg);
  });
  drawText(ctx, d, phone, x + w / 2, fitText(ctx, phone, 'narrow', 16, w - 16, y + h - 40, 22), d.style === 'neon' ? d.accent : d.fg);
}

/**
 * Sinh toàn bộ bảng hiệu (có seed) và vẽ lên MỘT atlas 2048² — mọi bảng hiệu cả phố chỉ tốn một lệnh vẽ.
 * Gọi sau loadFonts() để chữ dùng đúng font bảng hiệu.
 */
export function createSignSet(seed: number): SignSet {
  const rng = createRng(seed);
  const shops = Array.from({ length: SHOP_SIGN_COUNT }, () => designShopSign(rng));
  const banners = Array.from({ length: BANNER_COUNT }, (_, i) => designBanner(i, rng));
  const verticals = Array.from({ length: V_COUNT }, () => designVerticalSign(rng));

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  [...shops, ...banners].forEach((d, i) => {
    const [x, y] = hCellPx(i);
    drawHorizontal(ctx, d, x, y, seed + i * 31);
  });
  verticals.forEach((d, j) => {
    const [x, y] = vCellPx(j);
    drawVertical(ctx, d, x, y, seed + 9000 + j * 17);
  });
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  atlas.name = 'shop-signs';
  return { shops, banners, verticals, atlas };
}
