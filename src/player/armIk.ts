import * as THREE from 'three/webgpu';

/**
 * IK hai đoạn cho tay nhân vật có xương (cánh tay trên → cẳng tay → cổ tay): xoay hai xương để cổ tay tới điểm đích,
 * khuỷu tay chĩa về phía điểm "cực". Dùng đặt tay người lái lên tay nắm ghi-đông (động tác lái xe gốc cầm vô-lăng trước
 * ngực). Chạy SAU bộ trộn động tác mỗi khung; ghi giá trị tuyệt đối nên không cộng dồn. Không tạo đối tượng mới.
 */

const _s = new THREE.Vector3();
const _e = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _p = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** Xoay `bone` (trong không gian thế giới) sao cho hướng `from` thành hướng `to`; ma trận cha phải đang đúng. */
function turnBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  const parent = bone.parent;
  if (!parent || from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.matrixWorld.decompose(_p, _qw, _sc);
  parent.matrixWorld.decompose(_p, _qp, _sc);
  // Hướng mới trong thế giới = xoay thêm · hướng cũ; đổi về toạ độ của cha.
  bone.quaternion.copy(_qp.invert().multiply(_qw.premultiply(_q)));
  bone.updateMatrixWorld(true);
}

/**
 * Đưa cổ tay (`hand`) tới `target` (toạ độ thế giới); quá tầm thì duỗi thẳng tay về phía đích. `pole` (thế giới):
 * khuỷu tay nằm trong mặt phẳng vai – đích – pole, lệch về phía pole.
 */
export function reachArm(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3): void {
  const parent = upper.parent;
  if (!parent) return;
  // Ma trận thế giới từ gốc cảnh xuống vai, rồi cả đoạn tay theo tư thế hiện tại.
  parent.updateWorldMatrix(true, false);
  upper.updateMatrixWorld(true);
  _s.setFromMatrixPosition(upper.matrixWorld);
  _e.setFromMatrixPosition(lower.matrixWorld);
  _w.setFromMatrixPosition(hand.matrixWorld);
  const a = _s.distanceTo(_e);
  const b = _e.distanceTo(_w);
  if (a < 1e-6 || b < 1e-6) return;
  _u.subVectors(target, _s);
  const reach = _u.length();
  if (reach < 1e-6) return;
  _u.multiplyScalar(1 / reach);
  const d = Math.min(Math.max(reach, Math.abs(a - b) + 1e-4), a + b - 1e-4);
  // Hướng khuỷu: phần của (pole − vai) vuông góc với hướng tới đích.
  _v.subVectors(pole, _s);
  _v.addScaledVector(_u, -_v.dot(_u));
  if (_v.lengthSq() < 1e-10) return;
  _v.normalize();
  // Định lý cos: góc ở vai giữa hướng tới đích và cánh tay trên.
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  _goal.copy(_s).addScaledVector(_u, a * cos).addScaledVector(_v, a * sin);
  turnBone(upper, _from.subVectors(_e, _s), _to.subVectors(_goal, _s));
  // Cánh tay trên đã xoay: khuỷu ở chỗ mới, xoay cẳng tay cho cổ tay tới đích (hoặc điểm xa nhất với tới được).
  _e.setFromMatrixPosition(lower.matrixWorld);
  _w.setFromMatrixPosition(hand.matrixWorld);
  _goal.copy(_s).addScaledVector(_u, d);
  turnBone(lower, _from.subVectors(_w, _e), _to.subVectors(_goal, _e));
}
