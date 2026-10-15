import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { isSlimDropped, slimClip, slimSkeleton } from '@/assets/slimRig';

/** Bộ xương thu nhỏ kiểu Mesh2Motion: gốc → hông → bàn tay → hai đốt ngón trỏ; hông → đầu → xương lá. */
function rig(): { root: THREE.Group; mesh: THREE.SkinnedMesh; bones: Record<string, THREE.Bone> } {
  const names = ['root', 'pelvis', 'hand_l', 'index_01_l', 'index_02_l', 'head', 'head_leaf'];
  const bones: Record<string, THREE.Bone> = {};
  for (const [i, n] of names.entries()) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(0, i * 0.1, 0);
    bones[n] = b;
  }
  bones.root!.add(bones.pelvis!);
  bones.pelvis!.add(bones.hand_l!, bones.head!);
  bones.hand_l!.add(bones.index_01_l!);
  bones.index_01_l!.add(bones.index_02_l!);
  bones.head!.add(bones.head_leaf!);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(4 * 3).fill(0), 3));
  // Đỉnh 0 bám đốt ngón 2 + bàn tay; đỉnh 1 bám đầu; đỉnh 2 bám xương lá; đỉnh 3 bám hông.
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([4, 2, 0, 0, 5, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0, 0], 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([0.7, 0.3, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicNodeMaterial());
  const root = new THREE.Group();
  root.add(bones.root!, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(names.map((n) => bones[n]!)));
  return { root, mesh, bones };
}

describe('slimSkeleton (NPC bớt xương ngón tay)', () => {
  it('nhận đúng xương ngón tay và xương lá', () => {
    expect(['index_01_l', 'thumb_04_leaf_r', 'pinky_02_r', 'head_leaf', 'ball_leaf_l'].every(isSlimDropped)).toBe(true);
    expect(['root', 'pelvis', 'hand_r', 'head', 'ball_l', 'foot_r', 'spine_03'].some(isSlimDropped)).toBe(false);
  });

  it('chuyển đỉnh của xương bỏ sang xương cha còn giữ, bộ xương chỉ còn xương giữ (giữ nguyên ma trận nghịch)', () => {
    const { root, mesh, bones } = rig();
    const inverseHead = mesh.skeleton.boneInverses[5]!.clone();
    slimSkeleton(root);
    expect(mesh.skeleton.bones.map((b) => b.name)).toEqual(['root', 'pelvis', 'hand_l', 'head']);
    expect(mesh.skeleton.boneInverses[3]!.equals(inverseHead)).toBe(true);
    const idx = mesh.geometry.getAttribute('skinIndex');
    // Ngón trỏ → bàn tay (2); đầu → 3; xương lá đầu → đầu (3); hông giữ nguyên (1).
    expect([idx.getX(0), idx.getY(0)]).toEqual([2, 2]);
    expect(idx.getX(1)).toBe(3);
    expect(idx.getX(2)).toBe(3);
    expect(idx.getX(3)).toBe(1);
    // Xương bỏ đã gỡ khỏi cây.
    expect(bones.index_01_l!.parent).toBeNull();
    expect(bones.head_leaf!.parent).toBeNull();
    expect(root.getObjectByName('index_02_l')).toBeUndefined();
  });

  it('nhân bản sau khi bớt xương: bản sao có bộ xương riêng, cùng số xương', () => {
    const { root } = rig();
    slimSkeleton(root);
    const copy = cloneSkinned(root);
    let skinned: THREE.SkinnedMesh | null = null;
    copy.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    });
    const mesh = skinned as unknown as THREE.SkinnedMesh;
    expect(mesh.skeleton.bones).toHaveLength(4);
    expect(mesh.skeleton.bones.every((b) => copy.getObjectById(b.id) === b)).toBe(true);
  });

  it('slimClip bỏ rãnh động tác của xương bị bỏ, giữ dữ liệu rãnh còn lại', () => {
    const q = new THREE.QuaternionKeyframeTrack('hand_l.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
    const clip = new THREE.AnimationClip('jab', 1, [
      q,
      new THREE.QuaternionKeyframeTrack('index_01_l.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
      new THREE.VectorKeyframeTrack('pelvis.position', [0, 1], [0, 1, 0, 0, 1, 0]),
      new THREE.QuaternionKeyframeTrack('head_leaf.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    ]);
    const slim = slimClip(clip);
    expect(slim.tracks.map((t) => t.name)).toEqual(['hand_l.quaternion', 'pelvis.position']);
    expect(slim.tracks[0]).toBe(q);
    expect(slim.duration).toBe(1);
    expect(slim.name).toBe('jab');
  });
});
