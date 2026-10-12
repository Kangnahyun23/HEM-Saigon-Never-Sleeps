import * as THREE from 'three/webgpu';
import type { Rng } from '@/core/random';
import type { StaticWorld } from '@/physics/staticWorld';
import type { PickupSpot } from '@/systems/pickups';
import type { Shop } from '../shops';
import type { CityLayout, Dir } from '../layout';

/** Hình học dùng chung (đơn vị): hộp 1×1×1 tâm ở gốc, trụ bán kính 1 cao 1 tâm ở gốc. */
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  /** Hộp có đáy ở y = 0 (dựng cột, tường cho dễ). */
  boxBase: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cylBase: new THREE.CylinderGeometry(1, 1, 1, 10).translate(0, 0.5, 0),
  /** Trụ nằm theo trục X (bánh xe, bồn nước nằm). */
  cylX: new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2),
  plane: new THREE.PlaneGeometry(1, 1),
  blob: new THREE.IcosahedronGeometry(1, 1),
  cone4: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
};

export interface BuildContext {
  layout: CityLayout;
  group: THREE.Group;
  statics: StaticWorld;
  rng: Rng;
  /** Cao độ mặt vỉa hè (đỉnh nền block). */
  pad: number;
  /** Đèn (đường, chợ…) để bật lúc tối ở M2. */
  lamps: THREE.Vector3[];
  /** Tiệm mặt đường (buildBuildings điền) — cho vũng đèn hắt ra vỉa hè và bảng hiệu phản chiếu trên đường ướt. */
  shopFronts: ShopFront[];
  /** Chỗ ngồi quán cóc / chỗ đứng bán hàng (streetProps điền) — để đặt người ngồi ăn, người bán gần camera. */
  seats: Seat[];
  /** Đồ nhặt được (streetProps điền): chồng ghế nhựa quán cóc, mũ bảo hiểm trên yên xe đậu. */
  pickups: PickupSpot[];
  /** Cửa hàng vào được (chọn trước khi dựng): tầng trệt các lô này thành phòng thật. */
  shops: readonly Shop[];
}

/** Chỗ có người: ghế đẩu quán cóc (ngồi) hoặc cạnh xe đẩy (người bán đứng). */
export interface Seat {
  readonly id: number;
  readonly x: number;
  /** Độ cao mặt ghế (ngồi) hoặc mặt vỉa hè (đứng). */
  readonly y: number;
  readonly z: number;
  /** Hướng mặt (yaw: (sin, cos) là hướng nhìn). */
  readonly yaw: number;
  /** 'keeper': chủ tiệm trong cửa hàng vào được — trực cả ngày lẫn đêm. */
  readonly kind: 'stool' | 'vendor' | 'keeper';
}

export interface ShopFront {
  /** Giữa chân mặt tiền (m) và yaw: trục +Z cục bộ trỏ ra đường. */
  x: number;
  z: number;
  yaw: number;
  width: number;
  /** Seed lô như aInfo.y của mặt tiền (0..1) — để biết tiệm đang mở hay kéo cửa. */
  seed: number;
  /** Bề rộng vỉa hè trước tiệm (m). */
  sidewalk: number;
  /** Bảng hiệu tự sáng (màu chính, độ sáng ban đêm, bề rộng) — null nếu không có / gần như tối. */
  sign: { color: string; glow: number; width: number } | null;
}

export function addMesh(ctx: BuildContext, mesh: THREE.Object3D | null): void {
  if (mesh) ctx.group.add(mesh);
}

/** Góc xoay quanh Y để trục +Z cục bộ trỏ theo hướng `dir`. */
export function yawFor(dir: Dir): number {
  switch (dir) {
    case '+z':
      return 0;
    case '-z':
      return Math.PI;
    case '+x':
      return Math.PI / 2;
    case '-x':
      return -Math.PI / 2;
  }
}

/** Đổi toạ độ cục bộ (x ngang mặt tiền, z hướng ra ngoài) quanh điểm gốc theo góc yaw sang toạ độ thế giới. */
export function localToWorld(ox: number, oz: number, yaw: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [ox + lx * c + lz * s, oz - lx * s + lz * c];
}
