import * as THREE from 'three/webgpu';
import { abs, attribute, cameraPosition, float, floor, fract, fwidth, hash, length, mix, mod, positionGeometry, select, smoothstep, texture, time, uv, vec2, vec3 } from 'three/tsl';
import { closedUniform, nightUniform, wetUniform } from '../nightGlow';
import { LED_ATLAS_W, LED_COLORS, LED_ROWS } from './signage';
import type { LedAtlas } from './signs';

/**
 * Vật liệu đêm Sài Gòn: bảng LED chạy chữ, vũng đèn tiệm hắt ra vỉa hè, vệt bảng hiệu phản chiếu trên đường ướt.
 * Đều là vật liệu không chiếu sáng (tự phát sáng) — rẻ, một lệnh vẽ cho cả phố mỗi loại.
 */

function linear(hex: string) {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
}

/**
 * Bảng LED chạy chữ: lưới điểm LED_ROWS hàng × (rộng / bước điểm) cột; mỗi điểm lấy mẫu atlas chữ ở đúng tâm
 * nên chữ chạy theo từng bước điểm như bảng thật. Thuộc tính: aSize = [rộng, cao, pha], aLed = [câu, độ dài vòng, tốc độ, màu].
 */
export function createLedMaterial(atlas: LedAtlas): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  const size = attribute<'vec3'>('aSize', 'vec3');
  const led = attribute<'vec4'>('aLed', 'vec4');
  const st = uv();
  const cols = floor(size.x.div(size.y).mul(LED_ROWS));
  const gx = st.x.mul(cols);
  const gy = st.y.mul(LED_ROWS);
  const col = floor(gx);
  const rowFromTop = float(LED_ROWS - 1).sub(floor(gy));
  // Chữ chạy từ phải sang trái theo từng bước điểm; pha riêng mỗi bảng để các bảng không chạy đồng loạt.
  const scroll = floor(time.mul(led.z).add(size.z.mul(997)));
  const px = mod(col.add(scroll), led.y);
  const tu = px.add(0.5).div(LED_ATLAS_W);
  const tv = float(1).sub(led.x.mul(LED_ROWS).add(rowFromTop).add(0.5).div(atlas.height));
  const on = select(texture(atlas.texture, vec2(tu, tv)).r.greaterThan(0.45), float(1), float(0));
  // Điểm LED tròn; nhìn xa (mỗi điểm < ~2 điểm ảnh) thì hoà thành mảng sáng trung bình thay vì nhiễu.
  const dot = select(length(vec2(fract(gx), fract(gy)).sub(0.5)).lessThan(0.36), float(1), float(0));
  const far = smoothstep(0.35, 0.8, fwidth(gx));
  const lit = mix(on.mul(dot), on.mul(0.42), far);
  const ci = led.w;
  const ledColor = select(ci.lessThan(0.5), linear(LED_COLORS[0]!), select(ci.lessThan(1.5), linear(LED_COLORS[1]!), select(ci.lessThan(2.5), linear(LED_COLORS[2]!), linear(LED_COLORS[3]!))));
  // Ban ngày vẫn đọc được; ban đêm rực hơn (đủ vượt ngưỡng bloom).
  const bright = mix(float(1.1), float(2.6), nightUniform);
  const housing = vec3(0.035, 0.035, 0.04);
  mat.colorNode = housing.add(ledColor.mul(lit.mul(bright).add(dot.mul(0.03))));
  return mat;
}

/** Giống shader mặt tiền: tiệm có kéo cửa không (cùng hàm băm, cùng seed ⇒ vũng sáng khớp với cửa tiệm). */
function shopOpen(seed: ReturnType<typeof attribute<'float'>>) {
  return select(hash(seed.mul(4567)).lessThan(closedUniform), float(0), float(1));
}

/**
 * Vũng đèn tiệm hắt ra vỉa hè: tấm phẳng cộng sáng, sáng nhất sát cửa rồi nhạt dần ra mép đường; chỉ tiệm còn mở.
 * uv: u ngang mặt tiền, v = 1 sát cửa. Thuộc tính aSeed = seed lô (giống aInfo.y của mặt tiền).
 */
export function createShopSpillMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const seed = attribute<'float'>('aSeed', 'float');
  const st = uv();
  const across = float(1).sub(smoothstep(0.6, 1.0, abs(st.x.sub(0.5)).mul(2)));
  const depth = st.y.mul(st.y);
  const roomLight = mix(vec3(1.0, 0.84, 0.6), vec3(0.88, 0.96, 1.0), hash(seed.mul(53)));
  // Đường ướt phản chiếu mạnh hơn.
  const gain = nightUniform.mul(0.3).mul(wetUniform.mul(0.8).add(1));
  mat.colorNode = roomLight.mul(across.mul(depth).mul(shopOpen(seed)).mul(gain));
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  return mat;
}

/**
 * Bảng hiệu phản chiếu trên mặt đường ướt: vệt màu hẹp nằm trên mặt đường, bắt đầu ở mép vỉa hè dưới bảng hiệu và
 * luôn kéo dài VỀ PHÍA CAMERA (như phản chiếu thật trên mặt nước), gợn ngang lăn tăn; chỉ hiện khi tối + ướt.
 * Hình vệt dựng hẳn trong vertex shader theo camera, từ điểm đầu aCenter (toạ độ thế giới).
 * Thuộc tính: aTint = [r, g, b, độ sáng bảng], aWidth = bề rộng vệt (m).
 */
export function createWetStreakMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const tint = attribute<'vec4'>('aTint', 'vec4');
  const width = attribute<'float'>('aWidth', 'float');
  const center = attribute<'vec3'>('aCenter', 'vec3');
  // Hình gốc: tấm phẳng nằm ngang x, z ∈ [−0,5; 0,5]. across = x, along = 0 ở điểm đầu → 1 ở đầu gần camera.
  const across = positionGeometry.x;
  const along = float(0.5).sub(positionGeometry.z);
  const toCam = vec2(cameraPosition.x.sub(center.x), cameraPosition.z.sub(center.z));
  const dist = length(toCam).max(0.01);
  const dir = toCam.div(dist);
  const len = dist.mul(0.55).clamp(1.5, 9);
  const off = vec2(dir.y.negate(), dir.x).mul(across.mul(width)).add(dir.mul(along.mul(len)));
  // positionNode được gán SAU bước instancing (ghi đè cả phần dịch của instance) ⇒ tự cộng toạ độ điểm đầu vệt.
  mat.positionNode = vec3(center.x.add(off.x), center.y, center.z.add(off.y));
  const st = uv();
  const side = float(1).sub(smoothstep(0.1, 1.0, abs(st.x.sub(0.5)).mul(2)));
  // a: 0 ở điểm đầu (mép đường dưới bảng) → 1 ở đầu gần camera. Sáng nhất khoảng giữa (chỗ phản chiếu thật của bảng
  // treo cao), nhạt về hai đầu; gợn ngang mảnh ~9 dải / m (mặt nước lăn tăn).
  const a = st.y;
  const fade = smoothstep(0.0, 0.25, a).mul(float(1).sub(smoothstep(0.45, 1.0, a)));
  const ripple = hash(floor(a.mul(len).mul(9)).add(floor(st.x.mul(3)).mul(57))).mul(0.85).add(0.15);
  // Bảng ngay cạnh người nhìn: góc phản chiếu không tới mắt ⇒ mờ đi (cũng đỡ vệt to choán màn hình).
  const near = smoothstep(4.0, 12.0, dist);
  const gain = nightUniform.mul(wetUniform).mul(tint.w).mul(near).mul(0.22);
  mat.colorNode = tint.xyz.mul(side.mul(fade).mul(ripple).mul(gain));
  return mat;
}
