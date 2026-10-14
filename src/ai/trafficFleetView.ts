import * as THREE from 'three/webgpu';
import { createRng, pick } from '@/core/random';
import { NPC_PAINT, npcCarPaint, POLICE_PAINT, npcVehicleParts, WALKER_HIP, type NpcLook, type NpcPart, type NpcVehicleKind } from '@/vehicles/npcVehicleModels';
import { addNightOnly } from '@/world/nightGlow';
import type { TrafficAgent } from './traffic';
import { VEHICLE_SPECS, type TrafficKind } from './trafficKinds';
import { beamMaterial, CARGO, HELMETS, lampMaterial, PANTS, SHIRTS, SKINS } from './trafficView';

/**
 * Hình các xe NPC không phải xe máy (ô tô, taxi, bán tải, buýt, ba gác, xích lô, xe đẩy): mọi khối của mọi xe gom vào
 * ba InstancedMesh (hộp, trụ, đèn) + một cho vệt đèn pha ⇒ 4 lệnh vẽ cho cả đoàn, bất kể mấy loại xe.
 * Loại xe của từng chỗ cố định suốt đời (xe được thả lại vẫn là loại đó) nên chỗ trong bộ đệm chia sẵn một lần.
 */

/** Tư thế một xe để vẽ. */
export type FleetPose = Pick<TrafficAgent, 'id' | 'kind' | 'x' | 'z' | 'yaw' | 'prevX' | 'prevZ' | 'prevYaw' | 'wheel' | 'generation'>;

interface Piece {
  part: NpcPart;
  local: THREE.Matrix4;
}

interface KindPieces {
  boxes: Piece[];
  cyls: Piece[];
  lamps: Piece[];
  /** Vệt đèn pha trên mặt đường (null = xe không có đèn pha). */
  beam: THREE.Matrix4 | null;
}

interface Slot {
  pieces: KindPieces;
  /** Vị trí khối đầu tiên của xe này trong từng InstancedMesh. */
  box: number;
  cyl: number;
  lamp: number;
  generation: number;
  /** Xe này có phần "tuỳ xe" không (hàng trên thùng, khách ngồi). */
  optional: boolean;
  /** Đang ẩn (chỗ chưa dùng — xe truy đuổi có lúc ít lúc nhiều). */
  hidden: boolean;
}

const HATS = ['#d9c48a', '#d9c48a', '#e8dcb0', '#3a5a8a', '#5a5a5a'];
const OPTIONAL_CHANCE = 0.6;
/** Biên độ đung đưa chân người đẩy xe (rad). */
const STRIDE = 0.45;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _w = new THREE.Matrix4();
const _swing = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _colors: Record<NpcLook, string> = { body: '', trim: '', shirt: '', pants: '', skin: '', hat: '', cargo: '', guest: '' };

function buildPieces(kind: NpcVehicleKind): KindPieces {
  const out: KindPieces = { boxes: [], cyls: [], lamps: [], beam: null };
  let headlights = false;
  for (const part of npcVehicleParts(kind)) {
    _p.set(part.pos[0], part.pos[1], part.pos[2]);
    _q.setFromEuler(_e.set(part.tilt ?? 0, 0, 0));
    if (part.shape === 'box') _s.set(part.size[0], part.size[1], part.size[2]);
    else _s.set(part.size[1], part.size[0], part.size[0]);
    const piece = { part, local: new THREE.Matrix4().compose(_p, _q, _s) };
    if (part.lamp) {
      out.lamps.push(piece);
      // Đèn ở nửa trước xe, thấp hơn nóc: đèn pha (hộp đèn taxi / bảng tuyến buýt nằm cao hơn nên không tính).
      if (part.pos[2] > 0.8 && part.pos[1] < 1.2) headlights = true;
    } else if (part.shape === 'box') out.boxes.push(piece);
    else out.cyls.push(piece);
  }
  if (headlights) {
    const spec = VEHICLE_SPECS[kind];
    // Vệt sáng dài 7 m bắt đầu ngay trước mũi xe, rộng hơn thân một chút.
    out.beam = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.04, spec.length / 2 + 3.4), new THREE.Quaternion(), new THREE.Vector3(spec.halfWidth * 2 + 1.4, 1, 7));
  }
  return out;
}

export class TrafficFleetView {
  readonly root = new THREE.Group();
  private readonly slots: Slot[] = [];
  private readonly boxes: THREE.InstancedMesh;
  private readonly cyls: THREE.InstancedMesh;
  private readonly lamps: THREE.InstancedMesh;
  private readonly beams: THREE.InstancedMesh;

  /** `kinds`: loại xe của từng chỗ, theo đúng thứ tự các xe sẽ đưa vào `update`. */
  constructor(kinds: readonly (TrafficKind | NpcVehicleKind)[]) {
    const cache = new Map<TrafficKind, KindPieces>();
    let box = 0;
    let cyl = 0;
    let lamp = 0;
    for (const kind of kinds) {
      if (kind === 'bike') throw new Error('TrafficFleetView không vẽ xe máy (đã có TrafficView)');
      let pieces = cache.get(kind);
      if (!pieces) cache.set(kind, (pieces = buildPieces(kind)));
      this.slots.push({ pieces, box, cyl, lamp, generation: -1, optional: false, hidden: false });
      box += pieces.boxes.length;
      cyl += pieces.cyls.length;
      lamp += pieces.lamps.length;
    }

    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0.15 });
    const mesh = (geo: THREE.BufferGeometry, count: number, name: string, material: THREE.Material, shadow: boolean): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(geo, material, Math.max(1, count));
      m.count = count;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      m.name = name;
      this.root.add(m);
      return m;
    };
    this.boxes = mesh(new THREE.BoxGeometry(1, 1, 1), box, 'fleet-boxes', mat, true);
    this.cyls = mesh(new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2), cyl, 'fleet-wheels', mat, true);
    this.lamps = mesh(new THREE.BoxGeometry(1, 1, 1), lamp, 'fleet-lamps', lampMaterial(), false);
    this.beams = mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), kinds.length, 'fleet-beams', beamMaterial(), false);
    // Vệt đèn không dùng màu theo instance (bộ đệm màu khởi tạo bằng 0 sẽ làm tắt vệt sáng).
    this.beams.instanceColor = null;
    this.beams.renderOrder = 1;
    addNightOnly(this.beams);
    this.root.name = 'traffic-fleet';
  }

  /** Chọn diện mạo (màu sơn, áo quần, có hàng / khách không) theo id + lượt thả rồi tô màu các khối của xe. */
  private paint(agent: FleetPose, slot: Slot): void {
    const rng = createRng(agent.id * 7919 + agent.generation * 104729 + 13);
    const kind = agent.kind;
    slot.generation = agent.generation;
    slot.optional = rng() < OPTIONAL_CHANCE;
    if (kind === 'bus' || kind === 'baGac' || kind === 'xichLo' || kind === 'cart') {
      _colors.body = pick(rng, NPC_PAINT[kind].body);
      _colors.trim = pick(rng, NPC_PAINT[kind].trim);
    } else if (kind === 'police') {
      _colors.body = POLICE_PAINT.body;
      _colors.trim = POLICE_PAINT.trim;
    } else if (kind !== 'bike') {
      const paint = npcCarPaint(kind, agent.id, agent.generation);
      _colors.body = paint.body;
      _colors.trim = paint.trim;
    }
    _colors.shirt = pick(rng, SHIRTS);
    _colors.pants = pick(rng, PANTS);
    _colors.skin = pick(rng, SKINS);
    // Người đẩy xe đội nón lá, người lái ba gác / đạp xích lô đội mũ bảo hiểm hoặc nón vải.
    _colors.hat = kind === 'cart' ? (HATS[0] as string) : pick(rng, kind === 'xichLo' ? HATS : HELMETS);
    _colors.cargo = pick(rng, CARGO);
    _colors.guest = pick(rng, SHIRTS);
    this.tint(this.boxes, slot.box, slot.pieces.boxes);
    this.tint(this.cyls, slot.cyl, slot.pieces.cyls);
    this.tint(this.lamps, slot.lamp, slot.pieces.lamps);
  }

  private tint(mesh: THREE.InstancedMesh, first: number, pieces: readonly Piece[]): void {
    for (let k = 0; k < pieces.length; k++) {
      const color = (pieces[k] as Piece).part.color;
      _c.set(color in _colors ? _colors[color as NpcLook] : color);
      mesh.setColorAt(first + k, _c);
    }
    if (pieces.length > 0) (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  private place(mesh: THREE.InstancedMesh, first: number, pieces: readonly Piece[], optional: boolean, stride: number): void {
    for (let k = 0; k < pieces.length; k++) {
      const { part, local } = pieces[k] as Piece;
      if (part.optional && !optional) {
        mesh.setMatrixAt(first + k, ZERO);
      } else if (part.swing) {
        // Chân bước: quay quanh trục ngang đi qua hông.
        _swing.makeRotationX(stride * part.swing);
        _t.makeTranslation(0, WALKER_HIP, part.pos[2]);
        _m.multiplyMatrices(_w, _t).multiply(_swing);
        _t.makeTranslation(0, -WALKER_HIP, -part.pos[2]);
        mesh.setMatrixAt(first + k, _m.multiply(_t).multiply(local));
      } else {
        mesh.setMatrixAt(first + k, _m.multiplyMatrices(_w, local));
      }
    }
  }

  /** Giấu mọi khối của chỗ `i` (thu về điểm 0). */
  private hide(i: number): void {
    const slot = this.slots[i] as Slot;
    if (slot.hidden) return;
    slot.hidden = true;
    const { pieces } = slot;
    for (let k = 0; k < pieces.boxes.length; k++) this.boxes.setMatrixAt(slot.box + k, ZERO);
    for (let k = 0; k < pieces.cyls.length; k++) this.cyls.setMatrixAt(slot.cyl + k, ZERO);
    for (let k = 0; k < pieces.lamps.length; k++) this.lamps.setMatrixAt(slot.lamp + k, ZERO);
    this.beams.setMatrixAt(i, ZERO);
  }

  /**
   * Ghi ma trận cho các xe `agents[first]`, `agents[first + 1]`… (đúng thứ tự `kinds` lúc tạo);
   * `alpha` nội suy giữa bước mô phỏng trước và sau. `count`: chỉ vẽ ngần ấy chỗ đầu, các chỗ sau ẩn đi.
   */
  update(agents: readonly FleetPose[], first: number, alpha: number, count = Infinity): void {
    const n = Math.min(this.slots.length, agents.length - first, count);
    // Không còn xe nào (đoàn xe công an lúc không bị truy nã): ẩn cả nhóm — khỏi tốn 6 lệnh vẽ + ghi bộ đệm mỗi khung.
    this.root.visible = n > 0;
    for (let i = n; i < this.slots.length; i++) this.hide(i);
    for (let i = 0; i < n; i++) {
      const a = agents[first + i] as FleetPose;
      const slot = this.slots[i] as Slot;
      slot.hidden = false;
      if (slot.generation !== a.generation) this.paint(a, slot);
      const dyaw = Math.atan2(Math.sin(a.yaw - a.prevYaw), Math.cos(a.yaw - a.prevYaw));
      _p.set(a.prevX + (a.x - a.prevX) * alpha, 0, a.prevZ + (a.z - a.prevZ) * alpha);
      _q.setFromAxisAngle(_up, a.prevYaw + dyaw * alpha);
      _w.compose(_p, _q, _one);
      const stride = Math.sin(a.wheel) * STRIDE;
      this.place(this.boxes, slot.box, slot.pieces.boxes, slot.optional, stride);
      this.place(this.cyls, slot.cyl, slot.pieces.cyls, slot.optional, stride);
      this.place(this.lamps, slot.lamp, slot.pieces.lamps, slot.optional, stride);
      this.beams.setMatrixAt(i, slot.pieces.beam ? _m.multiplyMatrices(_w, slot.pieces.beam) : ZERO);
    }
    this.boxes.instanceMatrix.needsUpdate = true;
    this.cyls.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
  }
}
