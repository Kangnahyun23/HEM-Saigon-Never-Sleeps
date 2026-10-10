import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Gộp các khối con tĩnh (không có con, cùng vật liệu, cùng cờ bóng đổ) trong từng nhóm thành MỘT mesh.
 * Nhóm vẫn xoay / di chuyển được như cũ (khớp tay chân, cụm lái, bánh xe) — chỉ các khối nằm yên trong nhóm bị gộp.
 * Xe máy và nhân vật dựng từ vài chục khối hộp: gộp lại bớt hàng trăm lệnh vẽ mỗi khung hình (cả lượt bóng đổ).
 * Trả về số mesh bớt được.
 */
export function mergeStaticMeshes(root: THREE.Object3D): number {
  const parents: THREE.Object3D[] = [];
  root.traverse((o) => parents.push(o));
  let saved = 0;
  for (const parent of parents) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const child of parent.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || mesh.children.length > 0) continue;
      if (Array.isArray(mesh.material) || !mesh.visible) continue;
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
      let list = groups.get(key);
      if (!list) groups.set(key, (list = []));
      list.push(mesh);
    }
    for (const meshes of groups.values()) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geometries, false);
      if (!merged) continue;
      const first = meshes[0] as THREE.Mesh;
      const out = new THREE.Mesh(merged, first.material);
      out.castShadow = first.castShadow;
      out.receiveShadow = first.receiveShadow;
      out.renderOrder = first.renderOrder;
      out.name = first.name;
      parent.remove(...meshes);
      parent.add(out);
      saved += meshes.length - 1;
    }
  }
  return saved;
}
