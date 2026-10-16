import { describe, expect, it } from 'vitest';
import type * as THREE from 'three/webgpu';
import { reflective, setReflectionIntensity, unreflective } from '@/world/reflections';

/** Vật liệu giả: module chỉ đọc / ghi envMap, envMapIntensity, needsUpdate. */
const fakeMaterial = (): THREE.MeshStandardNodeMaterial => ({ envMap: null, envMapIntensity: 0, needsUpdate: false }) as unknown as THREE.MeshStandardNodeMaterial;

describe('phản chiếu bầu trời', () => {
  it('vật liệu bị huỷ (xe bị thay chiếc khác) bỏ khỏi danh sách: không còn được cập nhật, không bị giữ trong bộ nhớ', () => {
    const kept = reflective(fakeMaterial());
    const gone = reflective(fakeMaterial());
    setReflectionIntensity(0.2);
    expect(gone.envMapIntensity).toBe(0.2);
    unreflective(gone);
    setReflectionIntensity(0.5);
    expect(kept.envMapIntensity).toBe(0.5);
    expect(gone.envMapIntensity).toBe(0.2);
    // Gỡ lần nữa / gỡ vật liệu chưa đăng ký: không làm gì.
    unreflective(gone);
    unreflective(fakeMaterial());
    setReflectionIntensity(0.6);
    expect(kept.envMapIntensity).toBe(0.6);
  });
});
