import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { DetailCuller, selectWithin } from '@/render/detailCulling';
import { InstanceBatch } from '@/render/instancing';
import { ResolutionGovernor } from '@/render/resolution';

describe('selectWithin', () => {
  it('chọn đúng các điểm trong bán kính', () => {
    const out = new Uint32Array(5);
    const n = selectWithin([0, 0, 10, 0, 0, -9.9, 30, 30, -7, 7], 0, 0, 10, out);
    expect([...out.subarray(0, n)]).toEqual([0, 1, 2, 4]);
  });
});

describe('DetailCuller', () => {
  const build = () => {
    const batch = new InstanceBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial(), {
      colors: true,
      attributes: { aTag: 1 },
    });
    // 30 instance xếp thành hàng dọc trục X, cách nhau 10 m.
    for (let i = 0; i < 30; i++) batch.add(i * 10, 2, 5, 1, 1, 1, 0, i % 2 ? '#ff0000' : '#0000ff', { aTag: i });
    return batch.build() as THREE.InstancedMesh;
  };

  it('chỉ giữ instance trong tầm, ma trận / màu / thuộc tính riêng vẫn khớp nhau', () => {
    const mesh = build();
    const culler = new DetailCuller(mesh, 25);
    culler.update(100, 5);
    expect(mesh.count).toBe(5); // x = 80, 90, 100, 110, 120
    const tags = mesh.geometry.getAttribute('aTag');
    for (let j = 0; j < mesh.count; j++) {
      const i = tags.getX(j);
      expect(mesh.instanceMatrix.array[j * 16 + 12]).toBeCloseTo(i * 10);
      expect(mesh.instanceColor!.getX(j)).toBeCloseTo(i % 2 ? 1 : 0);
      expect(Math.abs(i * 10 - 100)).toBeLessThanOrEqual(25);
    }
    expect(mesh.boundingSphere!.containsPoint(new THREE.Vector3(120, 2, 5))).toBe(true);
  });

  it('đi xa rồi quay lại: lấy lại đủ instance từ bản gốc; không còn gì trong tầm thì ẩn', () => {
    const mesh = build();
    const culler = new DetailCuller(mesh, 15);
    culler.update(0, 5);
    expect(mesh.count).toBe(2);
    culler.update(5000, 5000);
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    expect(culler.total).toBe(30);
    expect(new DetailCuller(mesh, 1).total).toBe(30);
    culler.update(290, 5);
    expect(mesh.visible).toBe(true);
    expect([...Array(mesh.count).keys()].map((j) => mesh.geometry.getAttribute('aTag').getX(j))).toEqual([28, 29]);
  });
});

describe('ResolutionGovernor', () => {
  const run = (g: ResolutionGovernor, fps: number, seconds: number): void => {
    for (let t = 0; t < seconds; t += 1 / fps) g.sample(1 / fps);
  };

  it('máy yếu: hạ dần độ phân giải nhưng không thấp hơn mức tối thiểu', () => {
    const g = new ResolutionGovernor({ max: 1.5, min: 0.6 });
    expect(g.pixelRatio).toBe(1.5);
    run(g, 30, 2);
    expect(g.pixelRatio).toBeLessThan(1.5);
    run(g, 20, 30);
    expect(g.pixelRatio).toBe(0.6);
  });

  it('máy khoẻ (60 fps): giữ nguyên mức cao nhất', () => {
    const g = new ResolutionGovernor({ max: 1.5 });
    run(g, 60, 30);
    expect(g.pixelRatio).toBe(1.5);
  });

  it('mượt trở lại thì nâng dần, nhưng không nâng ngay lên mức vừa bị chậm', () => {
    const g = new ResolutionGovernor({ max: 1.5, min: 0.5 });
    run(g, 35, 1.6);
    const dropped = g.pixelRatio;
    expect(dropped).toBeLessThan(1.5);
    run(g, 60, 10);
    // Trong 20 giây sau lần hạ, không quay lại mức 1,5 đã từng chậm.
    expect(g.pixelRatio).toBeLessThan(1.5);
    run(g, 60, 60);
    expect(g.pixelRatio).toBe(1.5);
  });

  it('bỏ qua khung hình bất thường (chuyển tab, tải shader)', () => {
    const g = new ResolutionGovernor({ max: 1 });
    for (let i = 0; i < 20; i++) expect(g.sample(2)).toBe(false);
    expect(g.pixelRatio).toBe(1);
  });
});

describe('mergeStaticMeshes', () => {
  it('gộp khối cùng vật liệu trong từng nhóm, giữ nguyên nhóm con xoay được và vị trí các khối', async () => {
    const { mergeStaticMeshes } = await import('@/render/merge');
    const a = new THREE.MeshStandardNodeMaterial();
    const b = new THREE.MeshStandardNodeMaterial();
    const root = new THREE.Group();
    const joint = new THREE.Group();
    root.add(joint);
    const mk = (mat: THREE.Material, x: number, parent: THREE.Object3D, shadow = true): void => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.x = x;
      m.castShadow = shadow;
      parent.add(m);
    };
    mk(a, 0, root);
    mk(a, 5, root);
    mk(b, 0, root);
    mk(a, 0, root, false);
    mk(a, 1, joint);
    mk(a, 2, joint);
    const before = new THREE.Box3().setFromObject(root);

    expect(mergeStaticMeshes(root)).toBe(2);
    // root: 2 khối `a` có bóng gộp làm một; `b` và `a` không bóng giữ riêng; nhóm khớp vẫn còn.
    expect(root.children.filter((c) => (c as THREE.Mesh).isMesh)).toHaveLength(3);
    expect(root.children).toContain(joint);
    expect(joint.children).toHaveLength(1);
    expect(new THREE.Box3().setFromObject(root).equals(before)).toBe(true);
  });
});
