import type { Contact, Inbox } from '@/systems/inbox';
import { playSfx } from '@/audio/sfx';
import { TIER_LABELS, type Tier } from '@/systems/hardware';
import { clampSensitivity, clampVolume, QUALITY_LABELS, sceneTier, type Quality, type Settings } from '@/systems/settings';
import { formatVnd, LENDER, type Wallet } from '@/systems/wallet';
import type { Minimap } from './minimap';

export type PhoneTab = 'jobs' | 'map' | 'messages' | 'wallet' | 'settings';

/** Một kèo hiện trong tab "Kèo" (M3 cung cấp). */
export interface PhoneJob {
  id: string;
  title: string;
  detail: string;
  pay: number;
  /** Đang chạy kèo này. */
  active?: boolean;
}

const TABS: Array<{ id: PhoneTab; label: string; key: string }> = [
  { id: 'jobs', label: 'Kèo', key: '1' },
  { id: 'map', label: 'Bản đồ', key: '2' },
  { id: 'messages', label: 'Tin nhắn', key: '3' },
  { id: 'wallet', label: 'Ví', key: '4' },
  { id: 'settings', label: 'Cài đặt', key: '5' },
];

const QUALITY_HINT: Record<Quality, string> = {
  auto: 'Game tự giảm bóng đổ rồi độ phân giải khi máy chậm, tự nâng lại khi máy dư sức.',
  low: 'Tắt bóng đổ, vẽ ít điểm ảnh, ít chi tiết ở xa — cho laptop yếu.',
  medium: 'Có bóng đổ, độ phân giải chuẩn.',
  high: 'Nét nhất, nhiều chi tiết ở xa — cho máy có card đồ hoạ rời.',
};

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

/**
 * Điện thoại của Tín (phím P): Kèo, Bản đồ, Tin nhắn, Ví, Cài đặt. Game vẫn chạy khi mở điện thoại (như ngoài đời — đừng
 * vừa chạy xe vừa bấm nhé). Bấm chuột hoặc phím 1–5 để đổi tab, P / Esc để cất điện thoại.
 */
export class Phone {
  readonly root: HTMLElement;
  open = false;
  tab: PhoneTab = 'messages';
  private thread: Contact | null = null;
  private jobs: PhoneJob[] = [];
  private onAccept: ((id: string) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private settings: Settings | null = null;
  private onSettings: ((s: Settings) => void) | null = null;
  private hardware: { summary: string; autoTier: Tier; loadedTier: Tier } | null = null;
  private readonly screen: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly tabBar: HTMLElement;
  private readonly mapCanvas: HTMLCanvasElement;
  private dirty = true;
  private lastHour = '';

  constructor(
    parent: HTMLElement,
    private readonly inbox: Inbox,
    private readonly wallet: Wallet,
    private readonly minimap: Minimap | null,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hud-phone';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="phone-status"><span data-phone-clock>--:--</span><span>HẺM·4G</span></div>
      <div class="phone-screen" data-phone-screen></div>
      <nav class="phone-tabs" data-phone-tabs></nav>`;
    parent.appendChild(this.root);
    this.screen = this.root.querySelector('[data-phone-screen]') as HTMLElement;
    this.clock = this.root.querySelector('[data-phone-clock]') as HTMLElement;
    this.tabBar = this.root.querySelector('[data-phone-tabs]') as HTMLElement;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.className = 'phone-map';

    this.tabBar.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
      if (t) this.show(t.dataset.tab as PhoneTab);
    });
    this.screen.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const thread = el.closest('[data-thread]') as HTMLElement | null;
      if (thread) {
        this.thread = thread.dataset.thread as Contact;
        this.inbox.markRead(this.thread);
        this.dirty = true;
      }
      if (el.closest('[data-back]')) {
        this.thread = null;
        this.dirty = true;
      }
      const job = el.closest('[data-accept]') as HTMLElement | null;
      if (job) this.onAccept?.(job.dataset.accept as string);
      if (el.closest('[data-cancel]')) this.onCancel?.();
      this.handleSettingsClick(el);
      const pay = el.closest('[data-pay]') as HTMLElement | null;
      if (pay) {
        this.wallet.payDebt(Number(pay.dataset.pay));
        this.dirty = true;
      }
    });
    inbox.onMessage = () => (this.dirty = true);
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (open !== this.open) playSfx(open ? 'phoneOpen' : 'phoneClose');
    this.open = open;
    this.root.hidden = !open;
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      if (this.tab === 'messages' && this.thread) this.inbox.markRead(this.thread);
      this.dirty = true;
    }
  }

  show(tab: PhoneTab): void {
    this.tab = tab;
    this.thread = null;
    this.dirty = true;
  }

  setJobs(jobs: PhoneJob[], onAccept: (id: string) => void, onCancel: (() => void) | null = null): void {
    this.jobs = jobs;
    this.onAccept = onAccept;
    this.onCancel = onCancel;
    this.dirty = true;
  }

  /** Cài đặt hiện tại + nơi nhận cài đặt mới khi người chơi đổi (tab Cài đặt). */
  setSettings(settings: Settings, onChange: (s: Settings) => void): void {
    this.settings = settings;
    this.onSettings = onChange;
    this.dirty = true;
  }

  /** Máy nhận diện được (tên card, bậc gợi ý) và bậc đã dùng để dựng cảnh lần tải này. */
  setHardware(summary: string, autoTier: Tier, loadedTier: Tier): void {
    this.hardware = { summary, autoTier, loadedTier };
    this.dirty = true;
  }

  private handleSettingsClick(el: HTMLElement): void {
    if (el.closest('[data-reload]')) {
      location.reload();
      return;
    }
    const s = this.settings;
    if (!s) return;
    let next: Settings | null = null;
    const q = el.closest('[data-quality]') as HTMLElement | null;
    if (q) next = { ...s, quality: q.dataset.quality as Quality };
    const toggle = el.closest('[data-toggle]') as HTMLElement | null;
    if (toggle?.dataset.toggle === 'showFps') next = { ...s, showFps: !s.showFps };
    if (toggle?.dataset.toggle === 'invertY') next = { ...s, invertY: !s.invertY };
    const sens = el.closest('[data-sens]') as HTMLElement | null;
    if (sens) next = { ...s, mouseSensitivity: clampSensitivity(s.mouseSensitivity + Number(sens.dataset.sens)) };
    const vol = el.closest('[data-vol]') as HTMLElement | null;
    if (vol) next = { ...s, volume: clampVolume(s.volume + Number(vol.dataset.vol)) };
    if (!next) return;
    this.settings = next;
    this.onSettings?.(next);
    this.dirty = true;
  }

  private hardwareNote(s: Settings): string {
    const hw = this.hardware;
    if (!hw) return '';
    const note = `<p class="muted small">Máy: ${esc(hw.summary)} — nhận là máy <b>${TIER_LABELS[hw.autoTier]}</b>.</p>`;
    if (sceneTier(s.quality, hw.autoTier) === hw.loadedTier) return note;
    return `${note}<button type="button" class="setting reload" data-reload><span>Số xe, người đi bộ, độ nét bóng đổ theo mức mới áp dụng khi tải lại</span><b>Tải lại</b></button>`;
  }

  /** Báo dữ liệu đổi (tiền, tin nhắn…) để vẽ lại khi đang mở. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Gọi mỗi khung hình. `px, pz`: vị trí người chơi (cho tab Bản đồ). */
  update(hourLabel: string, px: number, pz: number): void {
    if (!this.open) return;
    if (hourLabel !== this.lastHour) {
      this.lastHour = hourLabel;
      this.clock.textContent = hourLabel;
    }
    if (this.tab === 'map') this.minimap?.drawFull(this.mapCanvas, px, pz);
    if (!this.dirty) return;
    this.dirty = false;
    const unread = this.inbox.unread;
    this.tabBar.innerHTML = TABS.map(
      (t) =>
        `<button type="button" data-tab="${t.id}" class="${t.id === this.tab ? 'on' : ''}"><kbd>${t.key}</kbd>${t.label}${
          t.id === 'messages' && unread > 0 ? `<i>${unread}</i>` : ''
        }</button>`,
    ).join('');
    this.screen.innerHTML = this.render();
    if (this.tab === 'map') {
      this.screen.appendChild(this.mapCanvas);
      this.minimap?.drawFull(this.mapCanvas, px, pz);
    }
  }

  private render(): string {
    switch (this.tab) {
      case 'jobs':
        return `<h3>Kèo hôm nay</h3>${
          this.jobs.length === 0
            ? '<p class="muted">Chưa có kèo nào. Chạy một vòng quanh chợ rồi mở lại xem sao.</p>'
            : this.jobs
                .map(
                  (j) => `<div class="card${j.active ? ' active' : ''}"><b>${esc(j.title)}</b><span>${esc(j.detail)}</span>
                    <div class="row"><em>${formatVnd(j.pay)}</em>${
                      j.active ? '<span class="tag">Đang chạy</span><button type="button" class="ghost" data-cancel>Huỷ</button>' : `<button type="button" data-accept="${esc(j.id)}">Nhận kèo</button>`
                    }</div></div>`,
                )
                .join('')
        }`;
      case 'map':
        return '<h3>Bản đồ Khu Trung Tâm</h3>';
      case 'messages': {
        if (this.thread) {
          const t = this.inbox.thread(this.thread);
          return `<button type="button" class="back" data-back>‹ ${esc(t.contact)}</button><div class="chat">${t.messages
            .map((m) => `<p class="${m.from === 'Tín' ? 'me' : 'them'}">${esc(m.text)}</p>`)
            .join('')}</div>`;
        }
        if (this.inbox.threads.length === 0) return '<h3>Tin nhắn</h3><p class="muted">Không có tin nhắn.</p>';
        return `<h3>Tin nhắn</h3>${this.inbox.threads
          .map((t) => {
            const last = t.messages.at(-1);
            return `<button type="button" class="thread${t.unread ? ' unread' : ''}" data-thread="${esc(t.contact)}"><b>${esc(t.contact)}</b><span>${esc(
              last?.text ?? '',
            )}</span>${t.unread ? `<i>${t.unread}</i>` : ''}</button>`;
          })
          .join('')}`;
      }
      case 'settings': {
        const s = this.settings;
        if (!s) return '<h3>Cài đặt</h3>';
        const onOff = (on: boolean): string => `<span class="switch${on ? ' on' : ''}">${on ? 'Bật' : 'Tắt'}</span>`;
        return `<h3>Cài đặt</h3>
          <h4>Chất lượng đồ hoạ</h4>
          <div class="seg">${(Object.keys(QUALITY_LABELS) as Quality[])
            .map((q) => `<button type="button" data-quality="${q}" class="${q === s.quality ? 'on' : ''}">${QUALITY_LABELS[q]}</button>`)
            .join('')}</div>
          <p class="muted small">${QUALITY_HINT[s.quality]}</p>${this.hardwareNote(s)}
          <button type="button" class="setting" data-toggle="showFps"><span>Hiện FPS</span>${onOff(s.showFps)}</button>
          <h4>Âm thanh</h4>
          <div class="setting"><span>Âm lượng <small class="muted">(M: tắt / bật tiếng)</small></span><span class="stepper"><button type="button" data-vol="-0.1">−</button><b data-volume>${Math.round(s.volume * 100)}%</b><button type="button" data-vol="0.1">+</button></span></div>
          <h4>Điều khiển</h4>
          <div class="setting"><span>Độ nhạy chuột</span><span class="stepper"><button type="button" data-sens="-0.1">−</button><b data-sensitivity>${s.mouseSensitivity.toFixed(1)}</b><button type="button" data-sens="0.1">+</button></span></div>
          <button type="button" class="setting" data-toggle="invertY"><span>Đảo trục dọc</span>${onOff(s.invertY)}</button>
          <p class="muted small">Cài đặt được lưu lại cho lần chơi sau.</p>`;
      }
      case 'wallet': {
        const w = this.wallet;
        const canPay = Math.min(w.cash, w.debt);
        return `<h3>Ví</h3>
          <div class="money"><span>Tiền mặt</span><b>${formatVnd(w.cash)}</b></div>
          <div class="money debt"><span>Nợ ${LENDER}</span><b>${formatVnd(w.debt)}</b></div>
          ${canPay >= 100_000 ? `<button type="button" class="pay" data-pay="${canPay}">Trả nợ ${formatVnd(canPay)}</button>` : ''}
          <h4>Giao dịch gần đây</h4>
          ${
            w.ledger.length === 0
              ? '<p class="muted">Chưa có giao dịch.</p>'
              : [...w.ledger]
                  .reverse()
                  .slice(0, 8)
                  .map((e) => `<div class="tx"><span>${esc(e.reason)}</span><b class="${e.amount < 0 ? 'neg' : 'pos'}">${formatVnd(e.amount)}</b></div>`)
                  .join('')
          }`;
      }
    }
  }
}
