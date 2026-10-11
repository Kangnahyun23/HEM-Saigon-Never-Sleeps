import type { CityLayout } from '@/world/city/layout';
import { arrowAngle, mapImageTransform, markerOnMap, worldToMap, type MapView } from './minimapMath';

/** Màu bản đồ (tông đêm Sài Gòn: nền tối, đường sáng, mốc có màu). */
const MAP = {
  ground: '#1c1a22',
  block: '#2f2b37',
  lot: '#3d3746',
  road: '#8d8698',
  avenue: '#c2b59c',
  hem: '#66606f',
  market: '#c8762f',
  park: '#3d7a4b',
  river: '#2a5a78',
} as const;

const PX_PER_M = 1.4;
const SIZE = 196;

export interface Blip {
  x: number;
  z: number;
  color: string;
}

/** Xe công an trên bản đồ: chấm nhấp nháy đỏ – xanh + nón tầm nhìn theo hướng xe. */
export interface PoliceBlip {
  x: number;
  z: number;
  yaw: number;
}

/** Nón tầm nhìn trên bản đồ: nửa góc (rad) và chiều dài tối đa (px). */
const CONE_HALF = 0.45;
const CONE_PX = 34;

/** Điểm đánh dấu: chỗ cần tới (nhiệm vụ, kèo). */
export interface Waypoint {
  x: number;
  z: number;
  label?: string;
}

/**
 * Bản đồ nhỏ góc dưới trái. Ảnh nền khu phố vẽ MỘT lần từ bố cục rồi đặt thành một lớp riêng, mỗi khung hình chỉ đổi
 * CSS transform (xoay/dời theo camera) — trình duyệt ghép lớp trên card đồ hoạ, không phải vẽ lại ảnh 900×860 px.
 * (Vẽ xoay + cắt tròn ảnh đó bằng canvas 2D mỗi khung hình tốn ~8 ms khi canvas chạy bằng CPU.)
 * Canvas nhỏ phía trên chỉ vẽ mũi tên người chơi, điểm đánh dấu, các chấm (xe truy đuổi…) và chữ "B".
 */
export class Minimap {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: HTMLCanvasElement;
  /** Kích thước hiển thị thật / SIZE (CSS thu nhỏ bản đồ trên màn hình hẹp). */
  private cssScale = 1;
  private readonly x0: number;
  private readonly z0: number;
  private waypoint: Waypoint | null = null;
  private blips: Blip[] = [];
  private blipCount = 0;
  private zoom = 1.8;
  private police: readonly PoliceBlip[] = [];
  private policeCount = 0;
  /** Vùng tìm kiếm của công an (r = 0: không có). */
  private searchX = 0;
  private searchZ = 0;
  private searchR = 0;
  private flash = 0;

  constructor(parent: HTMLElement, layout: CityLayout) {
    this.root = document.createElement('div');
    this.root.className = 'hud-minimap';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-minimap-overlay';
    parent.appendChild(this.root);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = SIZE * dpr;
    this.canvas.height = SIZE * dpr;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.ctx.scale(dpr, dpr);

    const r = layout.playArea;
    this.x0 = r.x0 - 40;
    this.z0 = r.z0 - 40;
    const w = Math.ceil((r.x1 - r.x0 + 80) * PX_PER_M);
    const h = Math.ceil((r.z1 - r.z0 + 140) * PX_PER_M);
    this.image = document.createElement('canvas');
    this.image.width = w;
    this.image.height = h;
    this.image.className = 'hud-minimap-map';
    this.paintCity(layout);
    this.root.append(this.image, this.canvas);
    const measure = (): void => {
      this.cssScale = (this.root.clientWidth || SIZE) / SIZE;
    };
    measure();
    window.addEventListener('resize', measure);
  }

  /** Vẽ ảnh nền một lần: block, nhà, đường, hẻm, chợ, công viên, sông. */
  private paintCity(layout: CityLayout): void {
    const g = this.image.getContext('2d') as CanvasRenderingContext2D;
    const k = PX_PER_M;
    const rect = (x0: number, z0: number, x1: number, z1: number, color: string): void => {
      g.fillStyle = color;
      g.fillRect((x0 - this.x0) * k, (z0 - this.z0) * k, (x1 - x0) * k, (z1 - z0) * k);
    };
    g.fillStyle = MAP.ground;
    g.fillRect(0, 0, this.image.width, this.image.height);
    const shore = layout.river.shoreZ;
    rect(this.x0, shore, this.x0 + this.image.width / k, this.z0 + this.image.height / k, MAP.river);
    for (const b of layout.blocks) rect(b.rect.x0, b.rect.z0, b.rect.x1, b.rect.z1, b.kind === 'park' ? MAP.park : MAP.block);
    for (const l of layout.lots) rect(l.rect.x0, l.rect.z0, l.rect.x1, l.rect.z1, MAP.lot);
    const m = layout.market.rect;
    rect(m.x0, m.z0, m.x1, m.z1, MAP.market);
    for (const h of layout.hems) rect(h.rect.x0, h.rect.z0, h.rect.x1, h.rect.z1, MAP.hem);
    for (const road of layout.roads) {
      const rr = road.rect;
      rect(rr.x0, rr.z0, rr.x1, Math.min(rr.z1, shore), road.kind === 'avenue' ? MAP.avenue : MAP.road);
    }
  }

  /** Bản đồ toàn khu (hướng Bắc lên trên) cho tab Bản đồ của điện thoại: vị trí người chơi + điểm đánh dấu. */
  drawFull(canvas: HTMLCanvasElement, px: number, pz: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth || 260));
    const h = Math.round((w * this.image.height) / this.image.width);
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const c = canvas.getContext('2d') as CanvasRenderingContext2D;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.drawImage(this.image, 0, 0, w, h);
    const s = w / this.image.width;
    const toU = (x: number): number => (x - this.x0) * PX_PER_M * s;
    const toV = (z: number): number => (z - this.z0) * PX_PER_M * s;
    if (this.waypoint) {
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#1c1a22';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(toU(this.waypoint.x), toV(this.waypoint.z), 6, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    for (let i = 0; i < this.blipCount; i++) {
      const blip = this.blips[i]!;
      c.fillStyle = blip.color;
      c.beginPath();
      c.arc(toU(blip.x), toV(blip.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < this.policeCount; i++) {
      const u = this.police[i]!;
      c.fillStyle = '#3b7bff';
      c.beginPath();
      c.arc(toU(u.x), toV(u.z), 3.5, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ff8c1a';
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(toU(px), toV(pz), 5.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  setWaypoint(w: Waypoint | null): void {
    this.waypoint = w;
  }

  /** Các chấm (xe truy đuổi…); `count`: chỉ vẽ `count` chấm đầu (mảng dùng lại). */
  setBlips(blips: Blip[], count = blips.length): void {
    this.blips = blips;
    this.blipCount = count;
  }

  /** `count` xe công an đầu của `units` (mảng dùng lại, không tạo mới mỗi khung hình). */
  setPolice(units: readonly PoliceBlip[], count: number): void {
    this.police = units;
    this.policeCount = count;
  }

  /** Vùng tìm kiếm (tâm, bán kính m); r = 0 thì ẩn. */
  setSearch(x: number, z: number, r: number): void {
    this.searchX = x;
    this.searchZ = z;
    this.searchR = r;
  }

  /** `yaw`: hướng người chơi (xe hoặc người); `riding`: đang chạy xe thì thu nhỏ bản đồ để thấy xa hơn. */
  update(dt: number, px: number, pz: number, fx: number, fz: number, yaw: number, riding: boolean): void {
    const goal = riding ? 1.15 : 1.8;
    this.zoom += (goal - this.zoom) * (1 - Math.exp(-2.5 * dt));
    const c = this.ctx;
    const half = SIZE / 2;
    const radius = half - 6;
    const view: MapView = { px, pz, fx, fz, cx: half, cy: half, scale: this.zoom };

    // Ảnh nền: chỉ đổi transform (pixel ảnh → pixel CSS của bản đồ, nhân tỉ lệ hiển thị).
    const k = this.cssScale;
    const [a, b, cc, d, e, f] = mapImageTransform(view, this.x0, this.z0, PX_PER_M);
    this.image.style.transform = `matrix(${a * k},${b * k},${cc * k},${d * k},${e * k},${f * k})`;

    c.clearRect(0, 0, SIZE, SIZE);

    // Viền + chữ "B" (Bắc = −Z) chạy quanh mép.
    c.strokeStyle = 'rgba(255,255,255,.22)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(half, half, radius, 0, Math.PI * 2);
    c.stroke();
    const north = markerOnMap(view, px, pz - 1e5, radius - 9);
    c.fillStyle = 'rgba(14,12,20,.85)';
    c.beginPath();
    c.arc(north.u, north.v, 9, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#f7f1e6';
    c.font = '700 11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('B', north.u, north.v + 0.5);

    // Vùng tìm kiếm của công an: vòng xanh mờ (khuất mặt + ra khỏi vòng thì mau hết truy nã).
    if (this.searchR > 0) {
      const o = worldToMap(view, this.searchX, this.searchZ);
      c.fillStyle = 'rgba(70,120,255,.14)';
      c.strokeStyle = 'rgba(130,170,255,.55)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(o.u, o.v, this.searchR * this.zoom, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // Xe công an: nón tầm nhìn theo hướng xe + chấm nhấp nháy đỏ – xanh.
    this.flash += dt;
    const red = Math.floor(this.flash * 4) % 2 === 0;
    for (let i = 0; i < this.policeCount; i++) {
      const u = this.police[i]!;
      const p = markerOnMap(view, u.x, u.z, radius - 4);
      if (!p.edge) {
        const hx = Math.sin(u.yaw);
        const hz = Math.cos(u.yaw);
        const right = -hx * fz + hz * fx;
        const ahead = hx * fx + hz * fz;
        const a = Math.atan2(-ahead, right);
        c.fillStyle = 'rgba(110,150,255,.24)';
        c.beginPath();
        c.moveTo(p.u, p.v);
        c.arc(p.u, p.v, CONE_PX, a - CONE_HALF, a + CONE_HALF);
        c.closePath();
        c.fill();
      }
      c.fillStyle = red ? '#ff3b3b' : '#3b7bff';
      c.strokeStyle = '#fff';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(p.u, p.v, p.edge ? 3.5 : 4.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

    for (let i = 0; i < this.blipCount; i++) {
      const blip = this.blips[i]!;
      const p = markerOnMap(view, blip.x, blip.z, radius - 4);
      c.fillStyle = blip.color;
      c.beginPath();
      c.arc(p.u, p.v, p.edge ? 3.5 : 4.5, 0, Math.PI * 2);
      c.fill();
    }

    if (this.waypoint) {
      const p = markerOnMap(view, this.waypoint.x, this.waypoint.z, radius - 8);
      c.fillStyle = '#ffd23f';
      c.strokeStyle = '#1c1a22';
      c.lineWidth = 2;
      c.beginPath();
      // Hình giọt nước (ghim bản đồ).
      c.arc(p.u, p.v - 6, 6, Math.PI * 0.85, Math.PI * 2.15);
      c.lineTo(p.u, p.v + 4);
      c.closePath();
      c.fill();
      c.stroke();
    }

    // Mũi tên người chơi.
    c.save();
    c.translate(half, half);
    c.rotate(arrowAngle(yaw, fx, fz));
    c.fillStyle = '#ff8c1a';
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6.5, 7);
    c.lineTo(0, 3.5);
    c.lineTo(-6.5, 7);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
