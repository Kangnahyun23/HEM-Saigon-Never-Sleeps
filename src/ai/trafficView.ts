import * as THREE from 'three/webgpu';
import { abs, float, mix, smoothstep, uv, vec3 } from 'three/tsl';
import { createRng, pick } from '@/core/random';
import { BIKE_BODY_COLORS, BIKE_PARTS, BIKE_ROLE_COLORS } from '@/vehicles/bikeModel';
import { addNightOnly, nightUniform } from '@/world/nightGlow';
/** Tư thế một xe để vẽ (xe NPC, xe truy đuổi đều dùng). */
export interface BikePose {
  id: number;
  x: number;
  z: number;
  yaw: number;
  lean: number;
  prevX: number;
  prevZ: number;
  prevYaw: number;
  prevLean: number;
  generation: number;
}

/**
 * 'civilian': dân thường đủ màu; 'gang': đàn em của Phát — xe đen, áo đen, mũ đỏ;
 * 'police': công an — xe trắng, quân phục xanh ô-liu, mũ bảo hiểm xanh đậm (đèn chớp gắn riêng ở ChaseSystem).
 */
export type RiderStyle = 'civilian' | 'gang' | 'police';

const STYLE_COLORS: Record<Exclude<RiderStyle, 'civilian'>, { body: string; shirt: string; pants: string; helmet: string }> = {
  gang: { body: '#151515', shirt: '#1d1d1f', pants: '#2a2a30', helmet: '#c4161c' },
  police: { body: '#e8ebe6', shirt: '#5b6b35', pants: '#46532a', helmet: '#2e4a2c' },
};

/**
 * Hình dòng xe NPC: mọi xe + người lái gom vào vài InstancedMesh (hộp, trụ, đèn, vệt đèn pha) ⇒ 4 draw call cho cả đàn xe.
 * Mỗi khung hình chỉ ghi lại ma trận instance từ vị trí nội suy giữa hai bước mô phỏng.
 */

type Look = 'shirt' | 'pants' | 'skin' | 'helmet' | 'shoe' | 'visor' | 'cargo';

export interface Part {
  shape: 'box' | 'cyl';
  local: THREE.Matrix4;
  /** Màu cố định, hoặc vai trò lấy màu theo "diện mạo" từng xe. */
  color: string | Look | 'body';
  /** Chỉ hiện khi xe chở hàng. */
  cargo?: boolean;
  /** Đèn pha / đèn hậu: vẽ bằng vật liệu tự phát sáng, rực hơn khi tối. */
  lamp?: boolean;
}

export const SHIRTS = ['#f2efe6', '#2b5fa8', '#c8402e', '#3b8a52', '#e0b43a', '#7a4fa0', '#2a2a2a', '#e98aa6', '#4ab0c2', '#d9d4c5'];
export const PANTS = ['#2b2f3a', '#3d4b6b', '#5a4632', '#1f1f1f', '#6e6e6e', '#7c6a55'];
export const SKINS = ['#c88d62', '#e0ac7f', '#a66d45', '#d9a07a'];
export const HELMETS = ['#ff8c1a', '#1f8a3c', '#d22b2b', '#f2f2f2', '#2050c0', '#e6c220', '#222222', '#8a5a2b'];
export const CARGO = ['#c9a26b', '#2e9b4f', '#e86a1c', '#b8b2a6'];
const CARGO_CHANCE = 0.22;

/** Người lái ngồi trên yên (toạ độ xe: đầu xe +Z, gốc ở mặt đất). Góc rx > 0 = đỉnh ngả về trước. */
const RIDER: Array<{ size: [number, number, number]; pos: [number, number, number]; rx?: number; color: Look; cargo?: boolean }> = [
  { size: [0.34, 0.18, 0.3], pos: [0, 0.97, -0.3], color: 'pants' },
  { size: [0.14, 0.14, 0.46], pos: [0.12, 0.98, -0.06], rx: 0.15, color: 'pants' },
  { size: [0.14, 0.14, 0.46], pos: [-0.12, 0.98, -0.06], rx: 0.15, color: 'pants' },
  { size: [0.12, 0.46, 0.13], pos: [0.16, 0.7, 0.16], rx: 0.15, color: 'pants' },
  { size: [0.12, 0.46, 0.13], pos: [-0.16, 0.7, 0.16], rx: 0.15, color: 'pants' },
  { size: [0.11, 0.08, 0.24], pos: [0.17, 0.44, 0.17], color: 'shoe' },
  { size: [0.11, 0.08, 0.24], pos: [-0.17, 0.44, 0.17], color: 'shoe' },
  { size: [0.38, 0.55, 0.24], pos: [0, 1.33, -0.24], rx: 0.18, color: 'shirt' },
  { size: [0.09, 0.09, 0.56], pos: [0.24, 1.3, 0.08], rx: 0.55, color: 'shirt' },
  { size: [0.09, 0.09, 0.56], pos: [-0.24, 1.3, 0.08], rx: 0.55, color: 'shirt' },
  { size: [0.21, 0.23, 0.22], pos: [0, 1.72, -0.15], color: 'skin' },
  { size: [0.27, 0.17, 0.3], pos: [0, 1.81, -0.16], color: 'helmet' },
  { size: [0.22, 0.07, 0.03], pos: [0, 1.75, -0.01], color: 'visor' },
  { size: [0.46, 0.42, 0.42], pos: [0, 1.12, -0.74], color: 'cargo', cargo: true },
];

/** Các khối của một xe máy + người lái (xuất ra cho unit test). */
export function buildParts(): Part[] {
  const parts: Part[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const p of BIKE_PARTS) {
    v.set(p.pos[0], p.pos[1], p.pos[2]);
    q.setFromEuler(e.set(p.tilt ?? 0, 0, 0));
    if (p.shape === 'box') s.set(p.size[0], p.size[1], p.size[2]);
    else s.set(p.size[1], p.size[0], p.size[0]);
    const lamp = p.role === 'light' || p.role === 'tail';
    parts.push({
      shape: p.shape,
      local: new THREE.Matrix4().compose(v, q, s),
      color: p.role === 'body' ? 'body' : BIKE_ROLE_COLORS[p.role],
      ...(lamp ? { lamp: true } : {}),
    });
  }
  for (const r of RIDER) {
    v.set(...r.pos);
    q.setFromEuler(e.set(r.rx ?? 0, 0, 0));
    s.set(...r.size);
    parts.push({ shape: 'box', local: new THREE.Matrix4().compose(v, q, s), color: r.color, ...(r.cargo ? { cargo: true } : {}) });
  }
  return parts;
}

interface AgentLook {
  generation: number;
  cargo: boolean;
  colors: Record<Look | 'body', string>;
}

/** Vật liệu đèn xe: không chịu ánh sáng, màu theo instance (trắng ngà / đỏ), sáng gấp mấy lần khi tối. */
export function lampMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = vec3(1, 1, 1).mul(mix(float(0.9), float(4), nightUniform));
  return mat;
}

/** Vật liệu vệt đèn pha in trên mặt đường phía trước xe (cộng sáng, chỉ hiện khi tối). uv.y = 1 ở sát xe, 0 ở xa. */
export function beamMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const far = float(1).sub(uv().y);
  const side = abs(uv().x.sub(0.5)).mul(2);
  const shape = float(1).sub(smoothstep(far.mul(0.5).add(0.25), float(1), side)).mul(float(1).sub(far).pow(1.4)).mul(smoothstep(0, 0.12, far));
  mat.colorNode = vec3(1.0, 0.93, 0.78).mul(shape).mul(nightUniform.mul(0.3));
  return mat;
}

const _c = new THREE.Color();
/**
 * Khung xe đang ghi: _r[0..8] = ma trận quay 3×3 (theo hàng), _r[9..11] = vị trí, _r[12] = hướng, _r[13] = độ nghiêng.
 * Truyền qua mảng thay vì tham số số thực (gọi hàm với số thực ⇒ V8 "đóng hộp" từng số = rác bộ nhớ) và ghi thẳng vào
 * bộ đệm, không qua Matrix4.
 */
const _r = new Float64Array(14);

/** Tính phần quay của khung từ _r[12] (hướng) và _r[13] (nghiêng quanh trục dọc xe) — như Euler 'YXZ' (0, hướng, −nghiêng). */
function setFrame(): void {
  const r = _r;
  const cy = Math.cos(r[12]!);
  const sy = Math.sin(r[12]!);
  const cz = Math.cos(r[13]!);
  const sz = -Math.sin(r[13]!);
  r[0] = cy * cz;
  r[1] = -cy * sz;
  r[2] = sy;
  r[3] = sz;
  r[4] = cz;
  r[5] = 0;
  r[6] = -sy * cz;
  r[7] = sy * sz;
  r[8] = cy;
}

/** Ghi `khung · e` (e: ma trận cục bộ affine của khối, theo cột như three.js) vào `out` tại `o`. */
function writeFramed(out: Float32Array, o: number, e: readonly number[]): void {
  const r = _r;
  for (let j = 0; j < 12; j += 4) {
    const ex = e[j]!;
    const ey = e[j + 1]!;
    const ez = e[j + 2]!;
    out[o + j] = r[0]! * ex + r[1]! * ey + r[2]! * ez;
    out[o + j + 1] = r[3]! * ex + r[4]! * ey + r[5]! * ez;
    out[o + j + 2] = r[6]! * ex + r[7]! * ey + r[8]! * ez;
    out[o + j + 3] = 0;
  }
  const tx = e[12]!;
  const ty = e[13]!;
  const tz = e[14]!;
  out[o + 12] = r[0]! * tx + r[1]! * ty + r[2]! * tz + r[9]!;
  out[o + 13] = r[3]! * tx + r[4]! * ty + r[5]! * tz + r[10]!;
  out[o + 14] = r[6]! * tx + r[7]! * ty + r[8]! * tz + r[11]!;
  out[o + 15] = 1;
}

/** Ma trận "ẩn" (co về một điểm) tại `o`. */
function writeHidden(out: Float32Array, o: number): void {
  out.fill(0, o, o + 15);
  out[o + 15] = 1;
}

/** Ghi ma trận các khối của xe thứ `i` (khung trong _r đã đặt sẵn). Hàm thường, không tạo closure mỗi khung hình. */
function writeParts(mesh: THREE.InstancedMesh, parts: readonly Part[], i: number, cargo: boolean): void {
  const out = mesh.instanceMatrix.array as Float32Array;
  const base = i * parts.length * 16;
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k] as Part;
    if (part.cargo && !cargo) writeHidden(out, base + k * 16);
    else writeFramed(out, base + k * 16, part.local.elements);
  }
}
/** Vệt đèn pha: rộng 2.6 m, dài 7 m, bắt đầu ngay trước đầu xe, sát mặt đường. */
const BEAM_LOCAL = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.04, 4.3), new THREE.Quaternion(), new THREE.Vector3(2.6, 1, 7)).elements;

export class TrafficView {
  readonly root = new THREE.Group();
  private readonly parts = buildParts();
  private readonly boxParts: Part[];
  private readonly cylParts: Part[];
  private readonly lampParts: Part[];
  private readonly boxes: THREE.InstancedMesh;
  private readonly cyls: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly beams: THREE.InstancedMesh;
  private readonly looks: AgentLook[] = [];

  constructor(
    private readonly capacity: number,
    private readonly style: RiderStyle = 'civilian',
  ) {
    this.boxParts = this.parts.filter((p) => p.shape === 'box' && !p.lamp);
    this.cylParts = this.parts.filter((p) => p.shape === 'cyl' && !p.lamp);
    this.lampParts = this.parts.filter((p) => p.lamp);
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.1 });
    const lampMat = lampMaterial();
    const mesh = (geo: THREE.BufferGeometry, perAgent: number, name: string, material: THREE.Material = mat): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, material, capacity * perAgent);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * perAgent * 3), 3);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      this.root.add(m);
      return m;
    };
    this.boxes = mesh(new THREE.BoxGeometry(1, 1, 1), this.boxParts.length, 'traffic-boxes');
    this.cyls = mesh(new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2), this.cylParts.length, 'traffic-wheels');
    this.lamps = mesh(new THREE.BoxGeometry(1, 1, 1), this.lampParts.length, 'traffic-lamps', lampMat);
    this.lamps.castShadow = false;

    const beamMat = beamMaterial();
    this.beams = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 1, 'traffic-beams', beamMat);
    // Vệt đèn không dùng màu theo instance (bộ đệm màu khởi tạo bằng 0 sẽ làm tắt vệt sáng).
    this.beams.instanceColor = null;
    this.beams.castShadow = false;
    this.beams.receiveShadow = false;
    this.beams.renderOrder = 1;
    addNightOnly(this.beams);
    this.root.name = 'traffic';
  }

  /** Diện mạo (màu xe, áo, mũ, có chở hàng không) suy ra từ id + lượt thả ⇒ ổn định, không cần lưu. */
  private lookFor(agent: BikePose): AgentLook {
    let look = this.looks[agent.id];
    if (look && look.generation === agent.generation) return look;
    const rng = createRng(agent.id * 7919 + agent.generation * 104729);
    const fixed = this.style === 'civilian' ? null : STYLE_COLORS[this.style];
    look = {
      generation: agent.generation,
      cargo: !fixed && rng() < CARGO_CHANCE,
      colors: {
        body: fixed ? fixed.body : pick(rng, BIKE_BODY_COLORS),
        shirt: fixed ? fixed.shirt : pick(rng, SHIRTS),
        pants: fixed ? fixed.pants : pick(rng, PANTS),
        skin: pick(rng, SKINS),
        helmet: fixed ? fixed.helmet : pick(rng, HELMETS),
        shoe: '#24211e',
        visor: '#1b2229',
        cargo: pick(rng, CARGO),
      },
    };
    this.looks[agent.id] = look;
    this.paint(agent.id, look);
    return look;
  }

  private paint(slot: number, look: AgentLook): void {
    const write = (mesh: THREE.InstancedMesh, parts: Part[]): void => {
      parts.forEach((p, k) => {
        const role = p.color as Look | 'body';
        _c.set(role in look.colors ? look.colors[role] : p.color);
        mesh.setColorAt(slot * parts.length + k, _c);
      });
      (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    };
    write(this.boxes, this.boxParts);
    write(this.cyls, this.cylParts);
    write(this.lamps, this.lampParts);
  }

  /** Ghi ma trận cho mọi xe; `alpha` nội suy giữa bước mô phỏng trước và sau. */
  /** `count`: chỉ vẽ `count` xe đầu của `agents` (mảng dùng lại có thể dài hơn số xe thật). */
  update(agents: readonly BikePose[], alpha: number, count = agents.length): void {
    const n = Math.min(count, agents.length, this.capacity);
    // Không có xe (đàn em / công an lúc không truy đuổi): ẩn cả nhóm — InstancedMesh 0 bản vẫn tốn lệnh vẽ ở mọi lượt.
    this.root.visible = n > 0;
    const beams = this.beams.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const a = agents[i] as BikePose;
      const look = this.lookFor(a);
      const dyaw = Math.atan2(Math.sin(a.yaw - a.prevYaw), Math.cos(a.yaw - a.prevYaw));
      const r = _r;
      r[9] = a.prevX + (a.x - a.prevX) * alpha;
      r[10] = 0;
      r[11] = a.prevZ + (a.z - a.prevZ) * alpha;
      r[12] = a.prevYaw + dyaw * alpha;
      r[13] = a.prevLean + (a.lean - a.prevLean) * alpha;
      setFrame();
      writeParts(this.boxes, this.boxParts, i, look.cargo);
      writeParts(this.cyls, this.cylParts, i, look.cargo);
      writeParts(this.lamps, this.lampParts, i, look.cargo);
      // Vệt đèn: theo hướng xe nhưng nằm phẳng trên đường (không nghiêng theo xe).
      r[13] = 0;
      setFrame();
      writeFramed(beams, i * 16, BEAM_LOCAL);
    }
    this.boxes.count = n * this.boxParts.length;
    this.cyls.count = n * this.cylParts.length;
    this.lamps.count = n * this.lampParts.length;
    this.boxes.instanceMatrix.needsUpdate = true;
    this.cyls.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.beams.count = n;
    this.beams.instanceMatrix.needsUpdate = true;
  }
}
