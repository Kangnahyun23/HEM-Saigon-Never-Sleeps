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

/** Mẫu người có xương (GLB nén meshopt, texture WebP) + chiều cao gốc (m) để co về cỡ trong game. */
export interface CharacterEntry {
  readonly file: string;
  readonly height: number;
}

export const CHARACTERS = {
  "tin": {
    "file": "media/characters/tin.glb",
    "height": 1.88
  },
  "man-shirt": {
    "file": "media/characters/man-shirt.glb",
    "height": 1.8
  },
  "man-tee": {
    "file": "media/characters/man-tee.glb",
    "height": 1.85
  },
  "man-polo": {
    "file": "media/characters/man-polo.glb",
    "height": 1.82
  },
  "old-man": {
    "file": "media/characters/old-man.glb",
    "height": 1.7
  },
  "woman-young": {
    "file": "media/characters/woman-young.glb",
    "height": 1.75
  },
  "woman-style": {
    "file": "media/characters/woman-style.glb",
    "height": 1.71
  },
  "old-woman": {
    "file": "media/characters/old-woman.glb",
    "height": 1.66
  },
  "police-m": {
    "file": "media/characters/police-m.glb",
    "height": 1.86
  },
  "police-f": {
    "file": "media/characters/police-f.glb",
    "height": 1.78
  },
  "riot": {
    "file": "media/characters/riot.glb",
    "height": 1.78
  }
} as const satisfies Record<string, CharacterEntry>;

export type CharacterId = keyof typeof CHARACTERS;

/** File động tác (chỉ xương + clip, tên clip theo game) — khớp với mọi mẫu người theo tên xương. */
export const ANIMATIONS = {
  "human-base": {
    "file": "media/characters/human-base.glb",
    "clips": [
      "eat",
      "crouch",
      "deathD",
      "drive",
      "hitChest",
      "hitHead",
      "knockback",
      "idle",
      "foldArms",
      "swordIdle",
      "talk",
      "phone",
      "interact",
      "jog",
      "jumpAir",
      "jumpLand",
      "jumpStart",
      "hook",
      "pickUp",
      "cross",
      "jab",
      "push",
      "roll",
      "sit",
      "sprint",
      "slashA",
      "slashB",
      "slashC",
      "walk",
      "carry"
    ]
  },
  "human-addon": {
    "file": "media/characters/human-addon.glb",
    "clips": [
      "angry",
      "deathA",
      "deathB",
      "defend",
      "dizzy",
      "dodge",
      "fightIdle",
      "greet",
      "hurt",
      "idleSubtle",
      "runFemale",
      "victory",
      "walkFemale"
    ]
  }
} as const satisfies Record<string, { readonly file: string; readonly clips: readonly string[] }>;

export type AnimationName = (typeof ANIMATIONS)[keyof typeof ANIMATIONS]['clips'][number];

/** Tổng dung lượng thư mục public/media (byte) và ngân sách cho phép. */
export const MEDIA_BYTES = 3338128;
export const MEDIA_BUDGET = 26214400;
