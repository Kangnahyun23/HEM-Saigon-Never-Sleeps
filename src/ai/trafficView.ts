import * as THREE from 'three/webgpu';
import { abs, float, mix, smoothstep, uv, vec3 } from 'three/tsl';
import { createRng, pick } from '@/core/random';
import { BIKE_BODY_COLORS, BIKE_PARTS, BIKE_ROLE_COLORS } from '@/vehicles/bikeModel';
import { nightUniform } from '@/world/nightGlow';
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

/** 'civilian': dân thường đủ màu; 'gang': đàn em của Phát — xe đen, áo đen, mũ đỏ. */
export type RiderStyle = 'civilian' | 'gang';

/**
 * Hình dòng xe NPC: mọi xe + người lái gom vào vài InstancedMesh (hộp, trụ, đèn, vệt đèn pha) ⇒ 4 draw call cho cả đàn xe.
 * Mỗi khung hình chỉ ghi lại ma trận instance từ vị trí nội suy giữa hai bước mô phỏng.
 */

type Look = 'shirt' | 'pants' | 'skin' | 'helmet' | 'shoe' | 'visor' | 'cargo';

interface Part {
  shape: 'box' | 'cyl';
  local: THREE.Matrix4;
  /** Màu cố định, hoặc vai trò lấy màu theo "diện mạo" từng xe. */
  color: string | Look | 'body';
  /** Chỉ hiện khi xe chở hàng. */
  cargo?: boolean;
  /** Đèn pha / đèn hậu: vẽ bằng vật liệu tự phát sáng, rực hơn khi tối. */
  lamp?: boolean;
}

const SHIRTS = ['#f2efe6', '#2b5fa8', '#c8402e', '#3b8a52', '#e0b43a', '#7a4fa0', '#2a2a2a', '#e98aa6', '#4ab0c2', '#d9d4c5'];
const PANTS = ['#2b2f3a', '#3d4b6b', '#5a4632', '#1f1f1f', '#6e6e6e', '#7c6a55'];
const SKINS = ['#c88d62', '#e0ac7f', '#a66d45', '#d9a07a'];
const HELMETS = ['#ff8c1a', '#1f8a3c', '#d22b2b', '#f2f2f2', '#2050c0', '#e6c220', '#222222', '#8a5a2b'];
const CARGO = ['#c9a26b', '#2e9b4f', '#e86a1c', '#b8b2a6'];
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

function buildParts(): Part[] {
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

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
/** Vệt đèn pha: rộng 2.6 m, dài 7 m, bắt đầu ngay trước đầu xe, sát mặt đường. */
const BEAM_LOCAL = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.04, 4.3), new THREE.Quaternion(), new THREE.Vector3(2.6, 1, 7));

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
    // Đèn: không chịu ánh sáng, màu theo instance (trắng ngà / đỏ), sáng gấp mấy lần khi tối.
    const lampMat = new THREE.MeshBasicNodeMaterial();
    lampMat.colorNode = vec3(1, 1, 1).mul(mix(float(0.9), float(4), nightUniform));
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

    // Vệt đèn pha in trên mặt đường phía trước xe (cộng sáng, chỉ hiện khi tối). uv.y = 1 ở sát xe, 0 ở xa.
    const beamMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const far = float(1).sub(uv().y);
    const side = abs(uv().x.sub(0.5)).mul(2);
    const shape = float(1).sub(smoothstep(far.mul(0.5).add(0.25), float(1), side)).mul(float(1).sub(far).pow(1.4)).mul(smoothstep(0, 0.12, far));
    beamMat.colorNode = vec3(1.0, 0.93, 0.78).mul(shape).mul(nightUniform.mul(0.3));
    this.beams = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 1, 'traffic-beams', beamMat);
    // Vệt đèn không dùng màu theo instance (bộ đệm màu khởi tạo bằng 0 sẽ làm tắt vệt sáng).
    this.beams.instanceColor = null;
    this.beams.castShadow = false;
    this.beams.receiveShadow = false;
    this.beams.renderOrder = 1;
    this.root.name = 'traffic';
  }

  /** Diện mạo (màu xe, áo, mũ, có chở hàng không) suy ra từ id + lượt thả ⇒ ổn định, không cần lưu. */
  private lookFor(agent: BikePose): AgentLook {
    let look = this.looks[agent.id];
    if (look && look.generation === agent.generation) return look;
    const rng = createRng(agent.id * 7919 + agent.generation * 104729);
    const gang = this.style === 'gang';
    look = {
      generation: agent.generation,
      cargo: !gang && rng() < CARGO_CHANCE,
      colors: {
        body: gang ? '#151515' : pick(rng, BIKE_BODY_COLORS),
        shirt: gang ? '#1d1d1f' : pick(rng, SHIRTS),
        pants: gang ? '#2a2a30' : pick(rng, PANTS),
        skin: pick(rng, SKINS),
        helmet: gang ? '#c4161c' : pick(rng, HELMETS),
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
  update(agents: readonly BikePose[], alpha: number): void {
    const n = Math.min(agents.length, this.capacity);
    for (let i = 0; i < n; i++) {
      const a = agents[i] as BikePose;
      const look = this.lookFor(a);
      const dyaw = Math.atan2(Math.sin(a.yaw - a.prevYaw), Math.cos(a.yaw - a.prevYaw));
      const yaw = a.prevYaw + dyaw * alpha;
      const lean = a.prevLean + (a.lean - a.prevLean) * alpha;
      _p.set(a.prevX + (a.x - a.prevX) * alpha, 0, a.prevZ + (a.z - a.prevZ) * alpha);
      _q.setFromEuler(_e.set(0, yaw, -lean, 'YXZ'));
      _w.compose(_p, _q, _one);
      const write = (mesh: THREE.InstancedMesh, parts: Part[]): void => {
        for (let k = 0; k < parts.length; k++) {
          const part = parts[k] as Part;
          if (part.cargo && !look.cargo) mesh.setMatrixAt(i * parts.length + k, ZERO);
          else mesh.setMatrixAt(i * parts.length + k, _m.multiplyMatrices(_w, part.local));
        }
      };
      write(this.boxes, this.boxParts);
      write(this.cyls, this.cylParts);
      write(this.lamps, this.lampParts);
      // Vệt đèn: theo hướng xe nhưng nằm phẳng trên đường (không nghiêng theo xe).
      _q.setFromAxisAngle(_up, yaw);
      _w.compose(_p, _q, _one);
      this.beams.setMatrixAt(i, _m.multiplyMatrices(_w, BEAM_LOCAL));
    }
    for (const [mesh, parts] of [
      [this.boxes, this.boxParts],
      [this.cyls, this.cylParts],
      [this.lamps, this.lampParts],
    ] as const) {
      mesh.count = n * parts.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.beams.count = n;
    this.beams.instanceMatrix.needsUpdate = true;
  }
}
