import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import type { CharacterId } from '@/assets/manifest';
import { NearRiderView, type RiderCast } from '@/ai/nearRiders';
import { RIDER_POSE } from '@/vehicles/bikeModel';
import { hipIn, NPC_ACTION, NPC_CLIPS, stepNpc, type NpcBody, type NpcSource } from '@/ai/npcBody';
import { PedestrianLod, type LodPoint } from '@/ai/pedestrianLod';
import { bikeLook, buildParts, TrafficView, type BikePose } from '@/ai/trafficView';

/** Hông của hình giả: 1 m trên gốc ở tư thế gốc; khi ngồi xe cao 0,6 và lùi 0,3 (trên 1 đơn vị co giãn) như mẫu thật. */
const DRIVE_HIP = 0.6;
const DRIVE_BACK = -0.3;

/** Hình NPC giả (không cần tải mẫu người): nhóm có xương hông + đủ action, clip "drive" hạ hông xuống. */
function fakeBody(id: CharacterId): NpcBody {
  const body = new THREE.Group();
  const pelvis = new THREE.Object3D();
  pelvis.name = 'pelvis';
  pelvis.position.y = 1;
  body.add(pelvis);
  const mixer = new THREE.AnimationMixer(body);
  const actions = NPC_CLIPS.map((n) => {
    // Rãnh tĩnh một khoá (như clip đã nén): bộ trộn trả đúng cùng giá trị mỗi khung.
    const tracks = n === 'drive' ? [new THREE.VectorKeyframeTrack('pelvis.position', [0], [0, DRIVE_HIP, DRIVE_BACK])] : [];
    return mixer.clipAction(new THREE.AnimationClip(n, 1, tracks));
  });
  for (const a of actions) a.setEffectiveWeight(0).play();
  const helmet = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardNodeMaterial());
  helmet.visible = false;
  body.add(helmet);
  return {
    id,
    body,
    perMeter: 1,
    mixer,
    actions,
    weights: actions.map(() => 0),
    timeScales: actions.map((a) => a.timeScale),
    pelvis,
    handset: new THREE.Object3D(),
    helmet,
    arms: null,
  };
}

/** Kho giả: đếm số lần lấy / trả, hình trả lại được dùng lại. */
class FakePool implements NpcSource {
  readonly free: NpcBody[] = [];
  taken = 0;
  given = 0;
  take(id: CharacterId): NpcBody | null {
    this.taken++;
    const i = this.free.findIndex((b) => b.id === id);
    const npc = i >= 0 ? this.free.splice(i, 1)[0]! : fakeBody(id);
    npc.body.visible = true;
    return npc;
  }
  give(npc: NpcBody): void {
    this.given++;
    npc.body.visible = false;
    npc.helmet.visible = false;
    this.free.push(npc);
  }
}

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
    const riders = new NearRiderView(2, pool, 'civilian', CAST);
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
    const riders = new NearRiderView(1, pool, 'civilian', CAST);
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
    const riders = new NearRiderView(1, pool, 'civilian', CAST);
    riders.update([pose(0, 3, 0, 0, 0, 7)], 1, 1, 1 / 60, 0, 0);
    const npc = riders.riderOf(0)!;
    expect(npc.helmet.visible).toBe(true);
    expect(npc.helmet.material.color.getHexString()).toBe(new THREE.Color(bikeLook(0, 7, 'civilian').colors.helmet).getHexString());
  });

  it('xe ra khỏi bán kính thì trả hình về kho; xe được thả lại (lượt mới) thì đổi người lái', () => {
    const pool = new FakePool();
    const riders = new NearRiderView(1, pool, 'civilian', CAST);
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
