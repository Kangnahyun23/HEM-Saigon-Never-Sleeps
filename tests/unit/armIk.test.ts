import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { reachArm } from '@/player/armIk';

/** Tay trái kiểu tư thế chữ T: vai ở (0,18; 1,4; 0), cánh tay trên 0,3 m, cẳng tay 0,27 m duỗi theo +X. */
function arm(root = new THREE.Group()) {
  const spine = new THREE.Bone();
  spine.position.set(0, 1.4, 0);
  const upper = new THREE.Bone();
  upper.position.set(0.18, 0, 0);
  const lower = new THREE.Bone();
  lower.position.set(0.3, 0, 0);
  const hand = new THREE.Bone();
  hand.position.set(0.27, 0, 0);
  root.add(spine);
  spine.add(upper);
  upper.add(lower);
  lower.add(hand);
  root.updateMatrixWorld(true);
  return { root, upper, lower, hand };
}

const world = (o: THREE.Object3D): THREE.Vector3 => {
  o.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
};

describe('IK hai đoạn cho tay (đặt tay lên ghi-đông)', () => {
  it('cổ tay tới đúng đích trong tầm, giữ độ dài xương, khuỷu tay lệch về phía điểm cực', () => {
    const { upper, lower, hand } = arm();
    const target = new THREE.Vector3(0.3, 1.1, 0.4);
    const pole = new THREE.Vector3(0.7, 0.9, -0.3);
    reachArm(upper, lower, hand, target, pole);
    const s = world(upper);
    const e = world(lower);
    const w = world(hand);
    expect(w.distanceTo(target)).toBeLessThan(1e-4);
    expect(s.distanceTo(e)).toBeCloseTo(0.3, 5);
    expect(e.distanceTo(w)).toBeCloseTo(0.27, 5);
    // Khuỷu nằm cùng phía với điểm cực so với đường vai → đích.
    const u = target.clone().sub(s).normalize();
    const side = pole.clone().sub(s);
    side.addScaledVector(u, -side.dot(u));
    const elbow = e.clone().sub(s);
    elbow.addScaledVector(u, -elbow.dot(u));
    expect(elbow.dot(side)).toBeGreaterThan(0);
  });

  it('đích quá xa: duỗi thẳng tay về phía đích', () => {
    const { upper, lower, hand } = arm();
    const target = new THREE.Vector3(0.18, 1.4, 3);
    reachArm(upper, lower, hand, target, new THREE.Vector3(0.18, 0.5, 0));
    const s = world(upper);
    const w = world(hand);
    expect(w.distanceTo(s)).toBeCloseTo(0.57, 3);
    const dir = target.clone().sub(s).normalize();
    expect(w.clone().sub(s).normalize().dot(dir)).toBeGreaterThan(0.9999);
  });

  it('đúng cả khi nhân vật bị xoay + co giãn, gọi lặp lại vẫn ổn định (ghi giá trị tuyệt đối, không cộng dồn)', () => {
    const root = new THREE.Group();
    root.position.set(5, 0, -3);
    root.rotation.set(0.1, 0.8, -0.2);
    root.scale.setScalar(0.9);
    const { upper, lower, hand } = arm(root);
    // Đích trong tầm với (tay dài 0,57 × 0,9 = 0,513 m).
    const shoulder = world(upper);
    const target = shoulder.clone().add(new THREE.Vector3(0.15, -0.25, 0.25));
    const pole = shoulder.clone().add(new THREE.Vector3(0.5, -0.3, -0.3));
    for (let k = 0; k < 5; k++) reachArm(upper, lower, hand, target, pole);
    expect(world(hand).distanceTo(target)).toBeLessThan(1e-4);
    const q = upper.quaternion.clone();
    reachArm(upper, lower, hand, target, pole);
    expect(upper.quaternion.angleTo(q)).toBeLessThan(1e-6);
  });
});
