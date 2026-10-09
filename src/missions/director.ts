import type * as THREE from 'three/webgpu';
import type { Contact, Inbox } from '@/systems/inbox';
import { formatVnd, type Wallet } from '@/systems/wallet';
import type { Hud } from '@/ui/hud';
import type { PhoneJob } from '@/ui/phone';
import type { CityLayout } from '@/world/city/layout';
import { JobBoard } from './jobs';
import { MissionMarker } from './marker';
import { MissionRunner, type MissionContext, type MissionDef, type MissionEvent } from './mission';

export interface StartOptions {
  /** Kèo giao hàng (lặp lại) hay nhiệm vụ cốt truyện. */
  kind: 'job' | 'story';
  /** Người giao việc: nhận tin nhắn khi xong / thất bại. */
  from?: Contact;
  onComplete?: () => void;
  onFail?: () => void;
  /** Gọi mỗi khi sang mục tiêu mới (để kịch bản chen sự kiện: tin nhắn, truy đuổi…). */
  onObjective?: (index: number) => void;
}

/**
 * Điều phối nhiệm vụ trong game: một nhiệm vụ đang chạy, bảng kèo trong điện thoại, điểm đánh dấu 3D + bản đồ,
 * khung mục tiêu trên HUD, trả tiền vào ví.
 */
export class MissionDirector {
  readonly board: JobBoard;
  active: MissionRunner | null = null;
  private activeOpts: StartOptions | null = null;
  private offers: MissionDef[] = [];
  private readonly marker = new MissionMarker();
  /** Số kèo đã giao xong (thống kê, lưu game). */
  jobsDone = 0;
  private hourOfOffers = -1;

  constructor(
    scene: THREE.Scene,
    layout: CityLayout,
    private readonly hud: Hud,
    private readonly wallet: Wallet,
    private readonly inbox: Inbox,
    private readonly hour: () => number,
    /** Đặt Độ Nóng (nhiệm vụ / hàng nóng gây truy đuổi). */
    private readonly setHeat: (level: number) => void = () => undefined,
  ) {
    this.board = new JobBoard(layout, layout.seed + 3);
    scene.add(this.marker.root);
  }

  /** Làm mới bảng kèo quanh người chơi (mỗi giờ game một lần, hoặc khi vừa xong kèo). */
  refreshOffers(px: number, pz: number): void {
    this.offers = this.board.offers(px, pz, 3);
    this.hourOfOffers = Math.floor(this.hour());
    this.syncPhone();
  }

  start(def: MissionDef, opts: StartOptions): void {
    this.active = new MissionRunner(def);
    this.activeOpts = opts;
    this.offers = this.offers.filter((o) => o.id !== def.id);
    this.hud.showToast(opts.kind === 'job' ? `Nhận kèo: ${def.title}` : def.title, 2.4);
    this.showTarget();
    this.syncPhone();
  }

  cancel(): void {
    if (!this.active) return;
    this.hud.showToast('Đã huỷ kèo', 1.6);
    this.finish();
  }

  private finish(): void {
    this.active = null;
    this.activeOpts = null;
    this.marker.hide();
    this.hud.minimap?.setWaypoint(null);
    this.hud.setObjective(null, null);
    this.syncPhone();
  }

  private showTarget(): void {
    const t = this.active?.target() ?? null;
    if (t) {
      this.marker.show(t.x, t.z);
      this.hud.minimap?.setWaypoint({ x: t.x, z: t.z });
    } else {
      this.marker.hide();
      this.hud.minimap?.setWaypoint(null);
    }
  }

  private syncPhone(): void {
    const jobs: PhoneJob[] = [];
    if (this.active && this.activeOpts?.kind === 'job') {
      const last = this.active.def.objectives.at(-1);
      const where = last && last.kind === 'goto' ? `Tới ${last.place ?? ''}` : '';
      jobs.push({ id: this.active.def.id, title: this.active.def.title, detail: where, pay: this.active.def.reward, active: true });
    }
    if (!this.active)
      for (const o of this.offers) {
        const first = o.objectives[0];
        const last = o.objectives[o.objectives.length - 1];
        const place = (x: typeof first): string => (x && x.kind === 'goto' ? (x.place ?? '') : '');
        jobs.push({ id: o.id, title: o.title, detail: `${place(first)} → ${place(last)}`, pay: o.reward });
      }
    this.hud.phone?.setJobs(
      jobs,
      (id) => {
        const def = this.offers.find((o) => o.id === id);
        if (def && !this.active) {
          this.start(def, { kind: 'job', from: 'Tổng đài kèo' });
          this.hud.phone?.setOpen(false);
        }
      },
      () => this.cancel(),
    );
  }

  update(dt: number, ctx: MissionContext): void {
    if (!this.active && Math.floor(this.hour()) !== this.hourOfOffers) this.refreshOffers(ctx.x, ctx.z);
    const m = this.active;
    if (!m) return;
    const events = m.update(dt, ctx);
    for (const e of events) this.handle(e, ctx);
    if (this.active) {
      const o = this.active.objective;
      this.hud.setObjective(o?.label ?? null, this.active.remaining);
    }
  }

  private handle(e: MissionEvent, ctx: MissionContext): void {
    const def = this.active?.def;
    const opts = this.activeOpts;
    if (!def || !opts) return;
    if (e.type === 'objective') {
      this.showTarget();
      if (def.heat && e.index === def.heat.at) {
        this.setHeat(def.heat.level);
        this.hud.showToast('Bị bám đuôi! Cắt đuôi trong hẻm', 2.6);
      }
      opts.onObjective?.(e.index);
      return;
    }
    if (e.type === 'complete') {
      if (e.reward > 0) this.wallet.earn(e.reward, opts.kind === 'job' ? `Kèo: ${def.title}` : def.title, this.hour());
      if (opts.kind === 'job') {
        this.jobsDone++;
        const tip = e.late ? 0 : this.board.tip();
        if (tip > 0) this.wallet.earn(tip, 'Tiền boa', this.hour());
        this.inbox.receive(
          'Tổng đài kèo',
          e.late ? `Khách phàn nàn giao trễ, chỉ trả ${formatVnd(e.reward)}. Lần sau nhanh tay hơn nha tài xế.` : `Khách đã nhận hàng. +${formatVnd(e.reward)}${tip ? `, boa thêm ${formatVnd(tip)}` : ''}. Cảm ơn tài xế!`,
          this.hour(),
        );
      }
      this.hud.showToast(e.reward > 0 ? `+${formatVnd(e.reward)}` : 'Xong!', 2.4);
      this.finish();
      opts.onComplete?.();
      if (opts.kind === 'job') this.refreshOffers(ctx.x, ctx.z);
      return;
    }
    this.hud.showToast(`Thất bại: ${e.reason}`, 2.6);
    this.finish();
    opts.onFail?.();
  }
}
