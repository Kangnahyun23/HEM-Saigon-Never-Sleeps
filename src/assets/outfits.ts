/**
 * Trang phục theo phe, nướng thẳng vào ảnh màu của mẫu người lúc tải (characters.ts) — không thêm shader nên không
 * thêm pipeline. Đổi mọi chỗ không phải da / tóc (áo, quần, thắt lưng, giày) sang màu mới; nếp vải, bóng đổ vẽ sẵn
 * trong ảnh vẫn còn nhưng dịu lại (độ sáng lấy căn bậc hai) — ảnh gốc tương phản mạnh.
 * - Công an: mẫu `police-m` / `police-f` (CC0) mặc đồng phục xanh đen kiểu Mỹ ⇒ quân phục xanh ô-liu như công an thật.
 * - Đàn em của Phát: đồ đen như người lái khối hộp.
 * Chỉ phân biệt "da hay không" (đỏ trội hơn hẳn xanh dương): ảnh gốc nén thành ô 8×8 lệch màu nhau chút ít, mặt nạ
 * theo sắc độ hẹp hơn (vd. "xanh dương trội") bật / tắt theo từng ô ⇒ quân phục loang lổ như áo rằn ri.
 */
export interface Outfit {
  /** Tên trang phục (khoá bộ nhớ đệm vật liệu). */
  readonly name: string;
  /** Màu vải mới (sRGB 0–255) cho điểm ảnh có độ sáng `refLum` (0–1); vải sáng / tối hơn thì màu mới sáng / tối theo. */
  readonly color: readonly [number, number, number];
  readonly refLum: number;
}

/** Quân phục xanh ô-liu (cùng tông áo người lái khối hộp của công an — trafficView STYLE_COLORS.police). */
export const POLICE_UNIFORM: Outfit = { name: 'police', color: [92, 108, 54], refLum: 0.14 };
/** Đồ đen của đàn em (áo người lái khối hộp '#1d1d1f'). */
export const GANG_CLOTHES: Outfit = { name: 'gang', color: [30, 30, 34], refLum: 0.45 };

/** Vải sáng hơn hẳn `refLum` thì màu mới cũng chỉ sáng tới mức này (khỏi cháy trắng chỗ vải bóng). */
const MAX_GAIN = 1.8;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Mức "là vải phải đổi màu" của một điểm ảnh sRGB (kênh đỏ, xanh dương 0–255): 0 giữ nguyên (da, tóc nâu), 1 đổi hẳn. */
export function clothWeight(r: number, b: number): number {
  return 1 - smooth(0.12, 0.24, (r - b) / (r + 1));
}

/** Đổi màu tại chỗ một ảnh RGBA 8 bit (dữ liệu của getImageData). */
export function recolor(data: Uint8ClampedArray, outfit: Outfit): void {
  const [cr, cg, cb] = outfit.color;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const w = clothWeight(r, b);
    if (w <= 0) continue;
    const gain = Math.min(MAX_GAIN, Math.sqrt((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 / outfit.refLum));
    // Uint8ClampedArray tự làm tròn + kẹp 0–255.
    data[i] = r + (cr * gain - r) * w;
    data[i + 1] = g + (cg * gain - g) * w;
    data[i + 2] = b + (cb * gain - b) * w;
  }
}
