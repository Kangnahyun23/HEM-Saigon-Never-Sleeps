import * as THREE from 'three/webgpu';
import { TEXTURES, type TextureEntry, type TextureId } from './manifest';

/** Một bộ texture lặp đã tải (ảnh màu / normal / độ nhám) kèm thông tin trong manifest. */
export interface TextureSet {
  readonly entry: TextureEntry;
  color?: THREE.Texture;
  normal?: THREE.Texture;
  rough?: THREE.Texture;
}

const MAPS = ['color', 'normal', 'rough'] as const;
const loaded = new Map<TextureId, TextureSet>();

/**
 * Tải mọi texture trong manifest (gọi một lần lúc vào game, song song với dựng renderer).
 * Ảnh nào lỗi thì bỏ qua: shader dùng texture đó tự lùi về cách vẽ thủ tục cũ, game vẫn chạy.
 */
export async function loadTextures(onProgress?: (done: number, total: number) => void): Promise<void> {
  const loader = new THREE.TextureLoader();
  const jobs: Promise<void>[] = [];
  let done = 0;
  for (const id of Object.keys(TEXTURES) as TextureId[]) {
    const entry: TextureEntry = TEXTURES[id];
    const set: TextureSet = { entry };
    loaded.set(id, set);
    for (const map of MAPS) {
      const path = entry[map];
      if (!path) continue;
      jobs.push(
        loader
          .loadAsync(import.meta.env.BASE_URL + path)
          .then((tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.colorSpace = map === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            tex.name = `${id}-${map}`;
            set[map] = tex;
          })
          .catch((err: unknown) => console.warn(`[HẺM] không tải được texture ${path}`, err))
          .finally(() => onProgress?.(++done, jobs.length)),
      );
    }
  }
  await Promise.all(jobs);
}

/** Lọc bất đẳng hướng cho mọi texture (mặt đường nhìn xiên vẫn nét). Gọi sau khi có renderer. */
export function setTextureAnisotropy(level: number): void {
  for (const set of loaded.values()) for (const map of MAPS) if (set[map]) set[map].anisotropy = level;
}

/** Bộ texture đã tải, hoặc undefined nếu chưa tải / lỗi (khi đó dùng cách vẽ thủ tục). */
export function getTextures(id: TextureId): TextureSet | undefined {
  const set = loaded.get(id);
  return set?.color ? set : undefined;
}
