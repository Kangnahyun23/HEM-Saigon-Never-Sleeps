import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { NearRiderView, type RiderCast } from '@/ai/nearRiders';
import { RIDER_POSE } from '@/vehicles/bikeModel';
import { hipIn, NPC_ACTION, NPC_CLIPS, stepNpc } from '@/ai/npcBody';
import { PedestrianLod, type LodPoint } from '@/ai/pedestrianLod';
import { bikeLook, buildParts, TrafficView, type BikePose } from '@/ai/trafficView';
import { DRIVE_BACK, DRIVE_HIP, fakeBody, FakePool } from './fakeNpc';

const CAST: readonly RiderCast[] = [{ id: 'man-tee', height: [1.7, 1.7] }];

const pose = (id: number, x: number, z: number, yaw = 0, lean = 0, generation = 1): BikePose => ({
  id,
  x,
  z,
  yaw,
  lean,
  prevX: x,
  prevZ: z,
  prevYaw: yaw,
  prevLean: lean,
  generation,
});

describe('người lái xe máy NPC gần camera vẽ bằng nhân vật có xương', () => {
  it('chọn tối đa `capacity` xe gần nhất trong bán kính, chỉ xét `count` xe đầu (xe máy)', () => {
    const pool = new FakePool();
    const riders = new NearRiderView(2, pool, { cast: CAST });
    // Xe 3 gần nhất nhưng nằm ngoài `count` (là ô tô trong mảng xe NPC) ⇒ bỏ qua.
    const poses = [pose(0, 20, 0), pose(1, 5, 0), pose(2, 9, 0), pose(3, 1, 0)];
    riders.update(poses, 3, 1, 1 / 60, 0, 0);
    expect(riders.active).toBe(2);
    expect(riders.has(1)).toBe(true);
    expect(riders.has(2)).toBe(true);
    expect(riders.has(0)).toBe(false);
    expect(riders.has(3)).toBe(false);
  });

  it('ngồi đúng yên: hông ở RIDER_POSE.hip trên khung xe (theo hướng + độ nghiêng của xe)', () => {
    const pool = new FakePool();
    const riders = new NearRiderView(1, pool, { cast: CAST });
    const yaw = 0.8;
    const lean = 0.3;
    riders.update([pose(0, 10, -4, yaw, lean)], 1, 1, 1 / 60, 0, 0);
    const npc = riders.riderOf(0);
    expect(npc).not.toBeNull();
    npc!.body.updateMatrixWorld(true);
    // Hông thật (sau khi chạy động tác lái) = khung xe · RIDER_POSE.hip.
    const frame = new THREE.Matrix4().compose(new THREE.Vector3(10, 0, -4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -lean, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const want = new THREE.Vector3(...RIDER_POSE.hip).applyMatrix4(frame);
    const hip = new THREE.Vector3().setFromMatrixPosition(npc!.pelvis!.matrixWorld);
    expect(hip.x).toBeCloseTo(want.x, 5);
    expect(hip.y).toBeCloseTo(want.y, 5);
    expect(hip.z).toBeCloseTo(want.z, 5);
    // Co giãn theo chiều cao người, động tác lái bật ngay.
    expect(npc!.body.scale.y).toBeCloseTo(1.7);
    expect(npc!.weights[NPC_ACTION.drive]).toBe(1);
  });

  it('đội mũ bảo hiểm cùng màu mũ khối hộp lúc ở xa (bikeLook)', () => {
    const pool = new FakePool();
    const riders = new NearRiderView(1, pool, { cast: CAST });
    riders.update([pose(0, 3, 0, 0, 0, 7)], 1, 1, 1 / 60, 0, 0);
    const npc = riders.riderOf(0)!;
    expect(npc.helmet.visible).toBe(true);
    expect(npc.helmet.material.color.getHexString()).toBe(new THREE.Color(bikeLook(0, 7, 'civilian').colors.helmet).getHexString());
  });

  it('xe ra khỏi bán kính thì trả hình về kho; xe được thả lại (lượt mới) thì đổi người lái', () => {
    const pool = new FakePool();
    const riders = new NearRiderView(1, pool, { cast: CAST });
    const poses = [pose(0, 3, 0)];
    riders.update(poses, 1, 1, 1 / 60, 0, 0);
    expect(pool.taken).toBe(1);
    // Cùng xe, cùng lượt: giữ nguyên hình.
    riders.update(poses, 1, 1, 1 / 60, 0, 0);
    expect(pool.taken).toBe(1);
    // Thả lại chỗ khác gần camera: người lái mới.
    poses[0] = pose(0, 4, 2, 0, 0, 2);
    riders.update(poses, 1, 1, 1 / 60, 0, 0);
    expect(pool.given).toBe(1);
    expect(pool.taken).toBe(2);
    // Đi xa: trả hình, khối hộp người lái hiện lại.
    poses[0] = pose(0, 300, 0, 0, 0, 2);
    riders.update(poses, 1, 1, 1 / 60, 0, 0);
    expect(pool.given).toBe(2);
    expect(riders.has(0)).toBe(false);
    expect(pool.free.every((b) => !b.body.visible && !b.helmet.visible)).toBe(true);
  });

  it('xe truy đuổi (id = chỗ trong mảng): chọn người lái theo `generation` — xe đổi chỗ vẫn giữ người lái; mũ theo phe', () => {
    const pool = new FakePool();
    const cast: readonly RiderCast[] = [
      { id: 'police-m', height: [1.66, 1.76] },
      { id: 'police-f', height: [1.58, 1.68] },
    ];
    const riders = new NearRiderView(2, pool, { style: 'police', cast, byGeneration: true });
    riders.update([pose(0, 3, 0, 0, 0, 12)], 1, 1, 1 / 60, 0, 0);
    const before = riders.riderOf(0)!;
    const look = { id: before.id, height: before.body.scale.y };
    // Một xe khác chen lên đầu mảng ⇒ xe cũ sang chỗ 1 (cùng `generation`): cùng mẫu người, cùng chiều cao.
    riders.update([pose(0, 200, 0, 0, 0, 30), pose(1, 3, 0, 0, 0, 12)], 2, 1, 1 / 60, 0, 0);
    const after = riders.riderOf(1)!;
    expect(after.id).toBe(look.id);
    expect(after.body.scale.y).toBeCloseTo(look.height, 6);
    expect(after.helmet.material.color.getHexString()).toBe(new THREE.Color(bikeLook(1, 12, 'police').colors.helmet).getHexString());
  });

  it('TrafficView bỏ khối người lái (giữ xe, đèn, thùng hàng) của xe đang có người lái có xương', () => {
    const view = new TrafficView(2);
    const poses = [pose(0, 0, 0), pose(1, 8, 0)];
    view.update(poses, 1, 2, { has: (id) => id === 0 });
    const parts = buildParts();
    const boxes = parts.filter((p) => p.shape === 'box' && !p.lamp);
    const mesh = view.root.children[0] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const hidden = (i: number): boolean => {
      mesh.getMatrixAt(i, m);
      return m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0;
    };
    let riderParts = 0;
    boxes.forEach((part, k) => {
      if (part.cargo) return;
      if (part.rider) {
        riderParts++;
        expect(hidden(k)).toBe(true);
        expect(hidden(boxes.length + k)).toBe(false);
      } else {
        expect(hidden(k)).toBe(false);
      }
    });
    expect(riderParts).toBeGreaterThan(5);
  });
});

describe('hipIn (đo hông trong một động tác)', () => {
  it('đo xong thì động tác có rãnh không đổi theo thời gian vẫn ghi được lên xương (không kẹt ở tư thế cũ)', () => {
    const npc = fakeBody('man-tee');
    const hip = hipIn(npc, NPC_ACTION.drive);
    expect(hip.y).toBeCloseTo(DRIVE_HIP);
    expect(hip.z).toBeCloseTo(DRIVE_BACK);
    // Đo xong: xương về tư thế gốc.
    expect(npc.pelvis!.position.y).toBeCloseTo(1);
    // Bật động tác lái: rãnh hông hằng số — bộ trộn chỉ ghi khi kết quả khác khung trước, phải ghi được ngay.
    const targets = NPC_CLIPS.map((_, i) => (i === NPC_ACTION.drive ? 1 : 0));
    npc.weights[NPC_ACTION.drive] = 1;
    for (let k = 0; k < 3; k++) stepNpc(npc, targets, 10, 1 / 60);
    expect(npc.pelvis!.position.y).toBeCloseTo(DRIVE_HIP);
    expect(npc.pelvis!.position.z).toBeCloseTo(DRIVE_BACK);
  });
});

describe('PedestrianLod chỉ xét `count` điểm đầu', () => {
  it('điểm sau `count` không được chọn dù gần hơn', () => {
    const lod = new PedestrianLod(2, 30);
    const pts: LodPoint[] = [5, 1, 2].map((x, id) => ({ id, x, z: 0 }));
    lod.update(pts, 0, 0, 2);
    expect([...lod.slots].sort()).toEqual([0, 1]);
  });
});
