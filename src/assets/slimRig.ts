import * as THREE from 'three/webgpu';

/**
 * Xương bỏ đi ở NPC: ngón tay (40 xương) và xương "lá" ở đầu mút (đầu, mũi chân, đầu ngón) — mẫu Mesh2Motion còn 23 / 66.
 * NPC đứng xa, không cầm gì cần co ngón ⇒ không ai thấy khác; Tín giữ đủ xương (cận cảnh, nắm đấm, cầm đồ).
 */
const DROP = /^(index|middle|pinky|ring|thumb)_|_leaf/;

export const isSlimDropped = (boneName: string): boolean => DROP.test(boneName);

/**
 * Gộp các xương bị bỏ vào xương cha gần nhất còn giữ (ngón → bàn tay, xương lá → đầu / bàn chân): đỉnh bám xương bỏ
 * chuyển sang bám xương cha, bộ xương dựng lại chỉ còn xương giữ, xương bỏ gỡ khỏi cây. Gọi trên MẪU trước khi nhân bản
 * (lưới dùng chung hình học). Ít xương ⇒ ít ma trận tính mỗi khung, ít rãnh động tác phải nội suy, ít dữ liệu gửi GPU.
 */
export function slimSkeleton(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const old = mesh.skeleton;
    const keep: THREE.Bone[] = [];
    const inverses: THREE.Matrix4[] = [];
    const index = new Map<THREE.Object3D, number>();
    old.bones.forEach((bone, i) => {
      if (isSlimDropped(bone.name)) return;
      index.set(bone, keep.length);
      keep.push(bone);
      inverses.push(old.boneInverses[i]!.clone());
    });
    if (keep.length === old.bones.length) return;
    // Xương cũ thứ i → chỉ số xương giữ gần nhất trên đường lên gốc.
    const remap = old.bones.map((bone) => {
      let p: THREE.Object3D | null = bone;
      while (p && !index.has(p)) p = p.parent;
      return p ? index.get(p)! : 0;
    });
    const joints = mesh.geometry.getAttribute('skinIndex');
    for (let v = 0; v < joints.count; v++) {
      joints.setXYZW(v, remap[joints.getX(v)]!, remap[joints.getY(v)]!, remap[joints.getZ(v)]!, remap[joints.getW(v)]!);
    }
    joints.needsUpdate = true;
    mesh.bind(new THREE.Skeleton(keep, inverses), mesh.bindMatrix);
  });
  const dropped: THREE.Object3D[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone && isSlimDropped(o.name)) dropped.push(o);
  });
  for (const bone of dropped) bone.removeFromParent();
}

/** Bản động tác cho NPC đã gộp xương: bỏ các rãnh của xương bị bỏ (dùng chung dữ liệu khung hình với bản gốc). */
export function slimClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => !isSlimDropped(THREE.PropertyBinding.parseTrackName(t.name).nodeName ?? ''));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks, clip.blendMode);
}
