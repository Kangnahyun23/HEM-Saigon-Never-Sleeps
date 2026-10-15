/**
 * Toán chiếu cho bản đồ nhỏ (thuần logic, có unit test).
 *
 * Bản đồ xoay theo camera: phía TRÊN bản đồ là hướng camera đang nhìn (fx, fz), bên PHẢI là (−fz, fx).
 * Người chơi luôn ở tâm (cx, cy); `scale` = pixel trên mét.
 */

export interface MapView {
  /** Vị trí người chơi (m). */
  px: number;
  pz: number;
  /** Hướng camera trên mặt XZ (vector đơn vị). */
  fx: number;
  fz: number;
  /** Tâm bản đồ trên canvas (px). */
  cx: number;
  cy: number;
  /** Pixel trên mét. */
  scale: number;
}

/** Điểm thế giới → toạ độ canvas (ghi vào `out` nếu có — bản đồ vẽ lại 30 lần / giây, khỏi tạo đối tượng). */
export function worldToMap(view: MapView, x: number, z: number, out = { u: 0, v: 0 }): { u: number; v: number } {
  const dx = x - view.px;
  const dz = z - view.pz;
  const right = -dx * view.fz + dz * view.fx;
  const ahead = dx * view.fx + dz * view.fz;
  out.u = view.cx + right * view.scale;
  out.v = view.cy - ahead * view.scale;
  return out;
}

/**
 * Ma trận cho `ctx.setTransform(a, b, c, d, e, f)` để vẽ một ảnh nền mà pixel (i, j) ứng với điểm thế giới
 * (x0 + i / k, z0 + j / k) — `k` là pixel ảnh trên mét.
 */
export function mapImageTransform(view: MapView, x0: number, z0: number, k: number): [number, number, number, number, number, number] {
  const s = view.scale / k;
  const o = worldToMap(view, x0, z0);
  // u = e + a·i + c·j ;  v = f + b·i + d·j
  return [-view.fz * s, -view.fx * s, view.fx * s, -view.fz * s, o.u, o.v];
}

/**
 * Vị trí điểm đánh dấu trên bản đồ tròn bán kính `radius` (px): nếu nằm ngoài thì ghim lên mép (kèm cờ `edge`)
 * để người chơi biết hướng cần đi.
 */
export function markerOnMap(view: MapView, x: number, z: number, radius: number, out = { u: 0, v: 0, edge: false }): { u: number; v: number; edge: boolean } {
  worldToMap(view, x, z, out);
  const du = out.u - view.cx;
  const dv = out.v - view.cy;
  const d = Math.hypot(du, dv);
  out.edge = d > radius;
  if (out.edge) {
    out.u = view.cx + (du / d) * radius;
    out.v = view.cy + (dv / d) * radius;
  }
  return out;
}

/** Góc xoay (rad, theo chiều kim đồng hồ trên màn hình) của mũi tên người chơi có hướng `yaw` khi camera nhìn (fx, fz). */
export function arrowAngle(yaw: number, fx: number, fz: number): number {
  const hx = Math.sin(yaw);
  const hz = Math.cos(yaw);
  const right = -hx * fz + hz * fx;
  const ahead = hx * fx + hz * fz;
  return Math.atan2(right, ahead);
}
