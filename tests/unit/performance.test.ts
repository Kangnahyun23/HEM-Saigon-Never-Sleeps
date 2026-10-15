import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { DetailCuller, selectWithin } from '@/render/detailCulling';
import { InstanceBatch } from '@/render/instancing';
import { ResolutionGovernor } from '@/render/resolution';
import { PARTS, PedestrianView, type Part } from '@/ai/pedestrianView';
import type { Walker } from '@/ai/pedestrians';
import { buildParts, TrafficView, type BikePose } from '@/ai/trafficView';
import { PAD_HEIGHT } from '@/world/city/layout';

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

  it('khối cầu bao chứa trọn mọi instance được chọn (kể cả góc hộp, instance co giãn và nằm cao)', () => {
    const batch = new InstanceBatch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial(), {});
    for (let i = 0; i < 20; i++) batch.add(i * 7, i * 3, (i % 3) * 4, 1 + (i % 4), 2, 1.5, i * 0.3);
    const mesh = batch.build() as THREE.InstancedMesh;
    const culler = new DetailCuller(mesh, 30);
    culler.update(60, 4);
    expect(mesh.count).toBeGreaterThan(5);
    const m = new THREE.Matrix4();
    const corner = new THREE.Vector3();
    for (let j = 0; j < mesh.count; j++) {
      mesh.getMatrixAt(j, m);
      for (let c = 0; c < 8; c++) {
        corner.set(c & 1 ? 0.5 : -0.5, c & 2 ? 0.5 : -0.5, c & 4 ? 0.5 : -0.5).applyMatrix4(m);
        expect(mesh.boundingSphere!.containsPoint(corner)).toBe(true);
      }
    }
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

  it('máy yếu: bóng đổ cách khung trước, rồi hạ dần độ phân giải nhưng không thấp hơn mức tối thiểu', () => {
    const g = new ResolutionGovernor({ max: 1.5, min: 0.6 });
    expect(g.pixelRatio).toBe(1.5);
    expect(g.shadowInterval).toBe(1);
    run(g, 30, 1.6);
    expect(g.shadowInterval).toBe(2);
    expect(g.pixelRatio).toBe(1.5);
    run(g, 30, 1.6);
    expect(g.pixelRatio).toBeLessThan(1.5);
    expect(g.struggling).toBe(false);
    run(g, 20, 30);
    expect(g.pixelRatio).toBe(0.6);
    expect(g.struggling).toBe(true);
  });

  it('máy khoẻ (60 fps): giữ nguyên mức cao nhất', () => {
    const g = new ResolutionGovernor({ max: 1.5 });
    run(g, 60, 30);
    expect(g.pixelRatio).toBe(1.5);
    expect(g.shadowInterval).toBe(1);
  });

  it('chậm thoáng qua: chỉ bật bóng đổ cách khung, mượt lại lâu thì bật lại mọi khung', () => {
    const g = new ResolutionGovernor({ max: 1.5 });
    run(g, 40, 1.6);
    expect(g.shadowInterval).toBe(2);
    expect(g.pixelRatio).toBe(1.5);
    run(g, 60, 10);
    expect(g.shadowInterval).toBe(2); // còn trong 20 giây giữ nấc
    run(g, 60, 20);
    expect(g.shadowInterval).toBe(1);
  });

  it('mượt trở lại thì nâng dần, nhưng không nâng ngay lên mức vừa bị chậm', () => {
    const g = new ResolutionGovernor({ max: 1.5, min: 0.5 });
    run(g, 35, 3.1);
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

describe('revealAll (làm nóng pipeline lúc tải)', () => {
  it('tạm hiện vật ẩn (kể cả con của nhóm ẩn), tắt cắt khung nhìn, cho InstancedMesh rỗng 1 bản — rồi trả lại y như cũ', async () => {
    const { revealAll } = await import('@/render/warmup');
    const root = new THREE.Group();
    const hiddenGroup = new THREE.Group();
    hiddenGroup.visible = false;
    const inner = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial());
    inner.visible = false;
    hiddenGroup.add(inner);
    const shown = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial());
    shown.frustumCulled = false;
    const empty = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial(), 8);
    empty.count = 0;
    const partial = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial(), 8);
    partial.count = 3;
    root.add(hiddenGroup, shown, empty, partial);

    const restore = revealAll(root);
    root.traverse((o) => {
      expect(o.visible).toBe(true);
      expect(o.frustumCulled).toBe(false);
    });
    expect(empty.count).toBe(1);
    expect(partial.count).toBe(3);

    restore();
    expect(hiddenGroup.visible).toBe(false);
    expect(inner.visible).toBe(false);
    expect(shown.visible).toBe(true);
    expect(shown.frustumCulled).toBe(false);
    expect(inner.frustumCulled).toBe(true);
    expect(empty.count).toBe(0);
    expect(partial.count).toBe(3);
  });
});

describe('PedestrianView (ghi ma trận trực tiếp, không qua Matrix4)', () => {
  /** Cách tính cũ bằng Matrix4: khung người (· nằm ngửa) · T(khớp) · Rx(góc) · T(lệch) · S(cỡ). */
  const reference = (w: Walker, alpha: number, k: number, part: Part): THREE.Matrix4 => {
    const dyaw = Math.atan2(Math.sin(w.yaw - w.prevYaw), Math.cos(w.yaw - w.prevYaw));
    const frame = new THREE.Matrix4().compose(
      new THREE.Vector3(w.prevX + (w.x - w.prevX) * alpha, PAD_HEIGHT, w.prevZ + (w.z - w.prevZ) * alpha),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), w.prevYaw + dyaw * alpha),
      new THREE.Vector3(1, 1, 1),
    );
    const lying = w.dead || w.down > 0;
    if (lying) frame.multiply(new THREE.Matrix4().makeTranslation(0, 0.11, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
    if (k < 0) return frame.multiply(new THREE.Matrix4().makeTranslation(0, 1.79, -0.01));
    const swing = Math.sin(w.phase) * 0.55 * (lying ? 0 : Math.min(1, w.speed / 1.3));
    const angle = part.limb === 'leg' ? swing * part.swing : part.limb === 'arm' ? (w.dodge > 0 ? -2.6 : swing * part.swing * 0.8) : 0;
    const local = new THREE.Matrix4()
      .makeTranslation(part.pivot[0], part.pivot[1], part.pivot[2])
      .multiply(new THREE.Matrix4().makeRotationX(angle))
      .multiply(new THREE.Matrix4().makeTranslation(part.offset[0], part.offset[1], part.offset[2]))
      .scale(new THREE.Vector3(...part.size));
    return frame.multiply(local);
  };

  it('khớp cách tính bằng Matrix4 cho người đi, đứng, nhảy tránh xe, nằm; người vẽ bằng nhân vật có xương thì ẩn', () => {
    const base = { x: 3, z: -7, prevX: 2.6, prevZ: -7.4, yaw: 0.4, prevYaw: 0.2, speed: 1.4, phase: 1.1, dodge: 0, down: 0, dead: false, generation: 0 };
    const walkers = [
      { ...base, id: 0 },
      { ...base, id: 1, yaw: -2.9, prevYaw: 3.0, speed: 0, phase: 0.3 },
      { ...base, id: 2, dodge: 0.6, phase: 4.2 },
      { ...base, id: 3, down: 1.5, yaw: 1.7, prevYaw: 1.7 },
      { ...base, id: 4, dead: true, yaw: -0.8, prevYaw: -0.6 },
      { ...base, id: 5 },
    ] as unknown as Walker[];
    const view = new PedestrianView(walkers.length);
    view.update(walkers, 0.35, { has: (id) => id === 5 });
    const [bodies, hats] = view.root.children as THREE.InstancedMesh[];
    const got = new THREE.Matrix4();
    let hatsChecked = 0;
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < PARTS.length; k++) {
        bodies!.getMatrixAt(i * PARTS.length + k, got);
        const want = reference(walkers[i]!, 0.35, k, PARTS[k]!);
        got.elements.forEach((v, j) => expect(v).toBeCloseTo(want.elements[j]!, 5));
      }
      hats!.getMatrixAt(i, got);
      // Nón chỉ có ở một số người (theo diện mạo); có thì phải đúng chỗ trên đầu.
      if (got.elements[15] === 1 && got.elements[0] !== 0) {
        const want = reference(walkers[i]!, 0.35, -1, PARTS[0]!);
        got.elements.forEach((v, j) => expect(v).toBeCloseTo(want.elements[j]!, 5));
        hatsChecked++;
      }
    }
    expect(hatsChecked).toBeGreaterThan(0);
    bodies!.getMatrixAt(5 * PARTS.length + 4, got);
    expect(got.elements.slice(0, 15).every((v) => v === 0)).toBe(true);
  });
});

describe('TrafficView (ghi ma trận xe máy NPC trực tiếp)', () => {
  it('khớp cách tính bằng Euler + Matrix4: khung xe (hướng, nghiêng) · khối cục bộ; vệt đèn nằm phẳng theo hướng xe', () => {
    const poses: BikePose[] = [
      { id: 0, x: 12, z: -4, yaw: 0.7, lean: 0.25, prevX: 11.5, prevZ: -4.2, prevYaw: 0.6, prevLean: 0.2, generation: 1 },
      { id: 1, x: -30, z: 8, yaw: -2.8, lean: -0.4, prevX: -29.6, prevZ: 8.3, prevYaw: 3.1, prevLean: -0.35, generation: 3 },
    ];
    const view = new TrafficView(2);
    view.update(poses, 0.6);
    const parts = buildParts();
    const groups = [parts.filter((p) => p.shape === 'box' && !p.lamp), parts.filter((p) => p.shape === 'cyl' && !p.lamp), parts.filter((p) => p.lamp)];
    const meshes = view.root.children as THREE.InstancedMesh[];
    const got = new THREE.Matrix4();
    for (const [i, a] of poses.entries()) {
      const dyaw = Math.atan2(Math.sin(a.yaw - a.prevYaw), Math.cos(a.yaw - a.prevYaw));
      const yaw = a.prevYaw + dyaw * 0.6;
      const pos = new THREE.Vector3(a.prevX + (a.x - a.prevX) * 0.6, 0, a.prevZ + (a.z - a.prevZ) * 0.6);
      const lean = a.prevLean + (a.lean - a.prevLean) * 0.6;
      const frame = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -lean, 'YXZ')), new THREE.Vector3(1, 1, 1));
      groups.forEach((list, g) => {
        list.forEach((part, k) => {
          meshes[g]!.getMatrixAt(i * list.length + k, got);
          // Thùng hàng chỉ hiện ở xe chở hàng: ẩn thì co về một điểm.
          if (part.cargo && got.elements[0] === 0) return;
          const want = new THREE.Matrix4().multiplyMatrices(frame, part.local);
          got.elements.forEach((v, j) => expect(v).toBeCloseTo(want.elements[j]!, 5));
        });
      });
      // Vệt đèn pha: tâm cách đầu xe 4,3 m theo hướng xe, sát mặt đường, không nghiêng.
      meshes[3]!.getMatrixAt(i, got);
      const beam = new THREE.Vector3().setFromMatrixPosition(got);
      expect(beam.x).toBeCloseTo(pos.x + Math.sin(yaw) * 4.3, 5);
      expect(beam.z).toBeCloseTo(pos.z + Math.cos(yaw) * 4.3, 5);
      expect(beam.y).toBeCloseTo(0.04, 5);
    }
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
