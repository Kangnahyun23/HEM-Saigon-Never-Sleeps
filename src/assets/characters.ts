import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ANIMATIONS, CHARACTERS, type AnimationName, type CharacterId } from './manifest';

/**
 * Nhân vật có xương (Mesh2Motion, CC0 — xem CREDITS.md): tải mẫu người + file động tác một lần lúc vào game,
 * rồi nhân bản cho từng nhân vật. Mọi mẫu chung bộ xương nên một clip chạy được trên mọi mẫu (khớp theo tên xương).
 * Tải lỗi thì bỏ qua — nơi dùng tự lùi về nhân vật dựng từ khối hộp.
 */

interface Template {
  scene: THREE.Object3D;
  /** Chiều cao gốc của mẫu (m). */
  height: number;
}

const templates = new Map<CharacterId, Template>();
const clips = new Map<AnimationName, THREE.AnimationClip>();

/** Vật liệu nhân vật: chỉ ảnh màu, không kim loại — thay vật liệu Physical của GLB (đắt hơn, không cần cho người). */
function simplifyMaterial(mesh: THREE.Mesh): void {
  const src = mesh.material as THREE.MeshStandardMaterial;
  const mat = new THREE.MeshStandardNodeMaterial({ map: src.map ?? null, roughness: 0.82, metalness: 0 });
  mat.name = src.name;
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  mesh.material = mat;
  src.dispose();
}

export async function loadCharacters(onProgress?: (done: number, total: number) => void): Promise<void> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const base = import.meta.env.BASE_URL;
  const ids = Object.keys(CHARACTERS) as CharacterId[];
  const animFiles = Object.values(ANIMATIONS).map((a) => a.file);
  const total = ids.length + animFiles.length;
  let done = 0;
  const tick = (): void => onProgress?.(++done, total);
  await Promise.all([
    ...ids.map((id) =>
      loader
        .loadAsync(base + CHARACTERS[id].file)
        .then((gltf) => {
          gltf.scene.traverse((o) => {
            if (!(o as THREE.Mesh).isMesh) return;
            const mesh = o as THREE.Mesh;
            simplifyMaterial(mesh);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Khối bao của lưới có xương không theo động tác ⇒ tắt loại theo khung nhìn (nhân vật ít, gần camera).
            mesh.frustumCulled = false;
          });
          templates.set(id, { scene: gltf.scene, height: CHARACTERS[id].height });
        })
        .catch((err: unknown) => console.warn(`[HẺM] không tải được nhân vật ${id}`, err))
        .finally(tick),
    ),
    ...animFiles.map((file) =>
      loader
        .loadAsync(base + file)
        .then((gltf) => {
          for (const clip of gltf.animations) clips.set(clip.name as AnimationName, clip);
        })
        .catch((err: unknown) => console.warn(`[HẺM] không tải được động tác ${file}`, err))
        .finally(tick),
    ),
  ]);
}

/** Có đủ mẫu + động tác cơ bản để dựng nhân vật có xương không. */
export function hasCharacter(id: CharacterId): boolean {
  return templates.has(id) && clips.has('idle') && clips.has('walk');
}

/**
 * Nhân bản một mẫu người, co về chiều cao `height` (m). Gốc toạ độ ở giữa hai bàn chân, mặt hướng +Z
 * (giống nhân vật khối hộp cũ). Trả null nếu mẫu chưa tải được.
 */
export function createCharacter(id: CharacterId, height: number): THREE.Object3D | null {
  const t = templates.get(id);
  if (!t) return null;
  const obj = cloneSkinned(t.scene);
  obj.scale.setScalar(height / t.height);
  return obj;
}

export function getClip(name: AnimationName): THREE.AnimationClip | undefined {
  return clips.get(name);
}
