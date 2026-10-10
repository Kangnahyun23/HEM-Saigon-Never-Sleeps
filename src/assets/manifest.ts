// Tự sinh bởi `npm run assets` (scripts/assets.mjs) — đừng sửa tay.

/** Texture lặp: đường dẫn (so với gốc trang), kích thước thật [rộng, cao] (m), màu trung bình tuyến tính. */
export interface TextureEntry {
  readonly size: readonly [number, number];
  readonly color?: string;
  readonly normal?: string;
  readonly rough?: string;
  readonly mean?: readonly [number, number, number];
}

export const TEXTURES = {
  "asphalt": {
    "size": [3, 3],
    "color": "media/textures/asphalt-color.webp",
    "mean": [0.1044, 0.102, 0.0913],
    "normal": "media/textures/asphalt-normal.webp"
  },
  "pavers": {
    "size": [1.92, 1.92],
    "color": "media/textures/pavers-color.webp",
    "mean": [0.1378, 0.1133, 0.0874],
    "normal": "media/textures/pavers-normal.webp"
  },
  "concrete": {
    "size": [3, 3],
    "color": "media/textures/concrete-color.webp",
    "mean": [0.0932, 0.0943, 0.0889],
    "normal": "media/textures/concrete-normal.webp"
  },
  "plaster": {
    "size": [1.8, 1.8],
    "color": "media/textures/plaster-color.webp",
    "mean": [0.182, 0.1548, 0.1107]
  },
  "corrugated": {
    "size": [2.7, 2.7],
    "color": "media/textures/corrugated-color.webp",
    "mean": [0.0993, 0.0977, 0.0826],
    "normal": "media/textures/corrugated-normal.webp"
  }
} as const satisfies Record<string, TextureEntry>;

export type TextureId = keyof typeof TEXTURES;

/** Tổng dung lượng thư mục public/media (byte) và ngân sách cho phép. */
export const MEDIA_BYTES = 1478952;
export const MEDIA_BUDGET = 26214400;
