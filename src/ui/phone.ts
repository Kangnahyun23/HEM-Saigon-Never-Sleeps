import type { Contact, Inbox } from '@/systems/inbox';
import { playSfx } from '@/audio/sfx';
import { TIER_LABELS, type Tier } from '@/systems/hardware';
import { clampSensitivity, clampVolume, QUALITY_LABELS, sceneTier, type Quality, type Settings } from '@/systems/settings';
import { formatCount, generateFeed, type FeedContext } from '@/systems/social';
import { formatVnd, LENDER, type Wallet } from '@/systems/wallet';
import type { Minimap } from './minimap';

/** Các app trên điện thoại (phím số mở thẳng app, giữ thứ tự 1–5 như bản cũ). */
export type PhoneTab = 'jobs' | 'map' | 'messages' | 'wallet' | 'settings' | 'bank' | 'social' | 'camera';
export type PhoneApp = 'home' | PhoneTab;

/** Một kèo hiện trong app "Kèo" (M3 cung cấp). */
export interface PhoneJob {
  id: string;
  title: string;
  detail: string;
  pay: number;
  /** Đang chạy kèo này. */
  active?: boolean;
}

/** Biểu tượng app: hình SVG đơn giản (không dùng emoji — máy không có font emoji sẽ ra ô vuông). */
const ICON: Record<PhoneTab, string> = {
  jobs: '<path d="M8 7V5h8v2h4v12H4V7zm2 0h4V6h-4z"/>',
  map: '<path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>',
  messages: '<path d="M4 4h16v12H8l-4 4z"/>',
  wallet: '<path d="M3 6h15v3h3v10H3zm13 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>',
  settings: '<path d="M10 2h4l.6 3 2.4 1.4 2.9-1 2 3.4-2.3 2v2.4l2.3 2-2 3.4-2.9-1L14.6 19 14 22h-4l-.6-3L7 17.6l-2.9 1-2-3.4 2.3-2v-2.4l-2.3-2 2-3.4 2.9 1L9.4 5zm2 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>',
  bank: '<path d="M12 2l10 5v2H2V7zM4 11h3v7H4zm6.5 0h3v7h-3zM17 11h3v7h-3zM2 20h20v2H2z"/>',
  social: '<path d="M8 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm9 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM1 20c0-4 3-7 7-7s7 3 7 7zm15 0c0-2-.7-4-2-5.5 3.5-.8 8 1.5 8 5.5z"/>',
  camera: '<path d="M8 5l2-2h4l2 2h5v15H3V5zm4 4a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/>',
};

const APPS: Array<{ id: PhoneTab; label: string; key: string; color: string }> = [
  { id: 'jobs', label: 'Kèo', key: '1', color: '#ff8c1a' },
  { id: 'map', label: 'Bản đồ', key: '2', color: '#2f9e6b' },
  { id: 'messages', label: 'Tin nhắn', key: '3', color: '#3b82f6' },
  { id: 'wallet', label: 'Ví', key: '4', color: '#d9a400' },
  { id: 'settings', label: 'Cài đặt', key: '5', color: '#6b7280' },
  { id: 'bank', label: 'Ngân hàng', key: '6', color: '#0f766e' },
  { id: 'social', label: 'Phây', key: '7', color: '#4f46e5' },
  { id: 'camera', label: 'Camera', key: '8', color: '#e11d48' },
];

const QUALITY_HINT: Record<Quality, string> = {
  auto: 'Game tự giảm bóng đổ rồi độ phân giải khi máy chậm, tự nâng lại khi máy dư sức.',
  low: 'Tắt bóng đổ, vẽ ít điểm ảnh, ít chi tiết ở xa — cho laptop yếu.',
  medium: 'Có bóng đổ, độ phân giải chuẩn.',
  high: 'Nét nhất, nhiều chi tiết ở xa — cho máy có card đồ hoạ rời.',
};

/** Lãi app vay mỗi ngày (châm biếm — app vay "0,3 %/ngày" ≈ 110 %/năm). */
const DAILY_INTEREST = 0.003;
/** Số ảnh máy giữ được (máy thường / bản Pro mua ở tiệm điện thoại). */
const MAX_PHOTOS = 6;
const MAX_PHOTOS_PRO = 12;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const icon = (id: PhoneTab): string => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[id]}</svg>`;

/**
 * Điện thoại "Sầu Riêng S9" của Tín (phím P): máy hư cấu cầm tay ở góc dưới phải — màn hình chính là lưới app
 * (Kèo, Bản đồ, Tin nhắn, Ví, Cài đặt, Ngân hàng, Phây, Camera). Game vẫn chạy khi mở máy, vẫn đi lại được.
 * Phím 1–8 mở thẳng app, Backspace / Esc về màn hình chính (đang ở màn hình chính thì cất máy), P cất máy.
 */
export class Phone {
  readonly root: HTMLElement;
  open = false;
  /** App đang mở ('home' = màn hình chính). */
  tab: PhoneApp = 'home';
  private thread: Contact | null = null;
  private jobs: PhoneJob[] = [];
  private onAccept: ((id: string) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private settings: Settings | null = null;
  private onSettings: ((s: Settings) => void) | null = null;
  private hardware: { summary: string; autoTier: Tier; loadedTier: Tier } | null = null;
  private feedSource: (() => FeedContext & { day: number; seed: number }) | null = null;
  /** Main gọi lại sau khung hình kế tiếp với ảnh chụp màn hình (data URL). */
  onCapture: (() => void) | null = null;
  private readonly photos: string[] = [];
  private readonly screen: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly mapCanvas: HTMLCanvasElement;
  private bannerTimeout = 0;
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
      <div class="phone-body">
        <i class="phone-key vol-up"></i><i class="phone-key vol-down"></i><i class="phone-key power"></i>
        <div class="phone-glass">
          <div class="phone-status"><span data-phone-clock>--:--</span><span class="notch"></span><span class="net">4G ▮▮▮ 76%</span></div>
          <div class="phone-banner" data-phone-banner></div>
          <div class="phone-screen" data-phone-screen></div>
          <button type="button" class="phone-homebar" data-home aria-label="Màn hình chính"></button>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.screen = this.root.querySelector('[data-phone-screen]') as HTMLElement;
    this.clock = this.root.querySelector('[data-phone-clock]') as HTMLElement;
    this.banner = this.root.querySelector('[data-phone-banner]') as HTMLElement;
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.className = 'phone-map';

    this.root.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-home]')) {
        this.show('home');
        return;
      }
      const app = el.closest('[data-app]') as HTMLElement | null;
      if (app) {
        this.show(app.dataset.app as PhoneApp);
        return;
      }
      const thread = el.closest('[data-thread]') as HTMLElement | null;
      if (thread) {
        this.thread = thread.dataset.thread as Contact;
        this.inbox.markRead(this.thread);
        this.dirty = true;
      }
      if (el.closest('[data-back]')) this.back();
      const job = el.closest('[data-accept]') as HTMLElement | null;
      if (job) this.onAccept?.(job.dataset.accept as string);
      if (el.closest('[data-cancel]')) this.onCancel?.();
      this.handleSettingsClick(el);
      const pay = el.closest('[data-pay]') as HTMLElement | null;
      if (pay) {
        this.wallet.payDebt(Number(pay.dataset.pay));
        this.dirty = true;
      }
      if (el.closest('[data-shutter]')) this.onCapture?.();
    });
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  setOpen(open: boolean): void {
    if (open !== this.open) playSfx(open ? 'phoneOpen' : 'phoneClose');
    this.open = open;
    if (open) {
      this.root.hidden = false;
      // Khung hình sau mới thêm lớp "up" để có hiệu ứng đưa máy lên.
      requestAnimationFrame(() => this.root.classList.add('up'));
      if (document.pointerLockElement) document.exitPointerLock();
      if (this.tab === 'messages' && this.thread) this.inbox.markRead(this.thread);
      this.dirty = true;
    } else {
      // Hạ máy xuống (hiệu ứng theo giờ thật, kể cả khi game tạm dừng) rồi mới ẩn hẳn.
      this.root.classList.remove('up');
      window.setTimeout(() => {
        if (!this.open) this.root.hidden = true;
      }, 220);
    }
  }

  /** Mở app (hoặc 'home'). */
  show(tab: PhoneApp): void {
    this.tab = tab;
    this.thread = null;
    this.dirty = true;
  }

  /** Lùi một bước: đang đọc tin ⇒ về danh sách; đang trong app ⇒ màn hình chính. Trả false nếu đã ở màn hình chính. */
  back(): boolean {
    if (this.thread) {
      this.thread = null;
      this.dirty = true;
      return true;
    }
    if (this.tab === 'home') return false;
    this.show('home');
    return true;
  }

  /** Thông báo trượt xuống trên màn hình máy (tin nhắn mới lúc đang mở máy). */
  notify(title: string, text: string): void {
    this.banner.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
    this.banner.classList.add('show');
    window.clearTimeout(this.bannerTimeout);
    this.bannerTimeout = window.setTimeout(() => this.banner.classList.remove('show'), 3000);
  }

  setJobs(jobs: PhoneJob[], onAccept: (id: string) => void, onCancel: (() => void) | null = null): void {
    this.jobs = jobs;
    this.onAccept = onAccept;
    this.onCancel = onCancel;
    this.dirty = true;
  }

  /** Cài đặt hiện tại + nơi nhận cài đặt mới khi người chơi đổi (app Cài đặt). */
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

  /** Nguồn dữ liệu cho bảng tin "Phây" (Độ Nóng, mưa, nợ, giờ, ngày). */
  setFeedSource(source: () => FeedContext & { day: number; seed: number }): void {
    this.feedSource = source;
  }

  /** Ảnh vừa chụp (data URL) — giữ 6 ảnh mới nhất trong máy. */
  /** Máy Sầu Riêng S9 Pro (mua ở tiệm điện thoại): lưu nhiều ảnh hơn, hình nền khác. */
  private pro = false;
  setPro(on: boolean): void {
    this.pro = on;
    this.root.classList.toggle('pro', on);
    this.dirty = true;
  }

  addPhoto(url: string): void {
    this.photos.unshift(url);
    const max = this.pro ? MAX_PHOTOS_PRO : MAX_PHOTOS;
    if (this.photos.length > max) this.photos.length = max;
    this.notify('Camera', 'Đã lưu ảnh vào máy');
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
    if (toggle?.dataset.toggle === 'blood') next = { ...s, blood: !s.blood };
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

  /** Gọi mỗi khung hình. `px, pz`: vị trí người chơi (cho app Bản đồ). */
  update(hourLabel: string, px: number, pz: number): void {
    if (!this.open) return;
    if (hourLabel !== this.lastHour) {
      this.lastHour = hourLabel;
      this.clock.textContent = hourLabel;
      if (this.tab === 'home' || this.tab === 'social') this.dirty = true;
    }
    if (this.tab === 'map') this.minimap?.drawFull(this.mapCanvas, px, pz);
    if (!this.dirty) return;
    this.dirty = false;
    this.screen.dataset.view = this.tab;
    this.screen.innerHTML = this.tab === 'home' ? this.renderHome() : `<div class="app-head"><button type="button" class="back" data-home>‹</button><b>${esc(this.title())}</b></div>${this.render()}`;
    if (this.tab === 'map') {
      this.screen.appendChild(this.mapCanvas);
      this.minimap?.drawFull(this.mapCanvas, px, pz);
    }
  }

  private title(): string {
    return APPS.find((a) => a.id === this.tab)?.label ?? '';
  }

  private renderHome(): string {
    const unread = this.inbox.unread;
    const badge = (id: PhoneTab): string => {
      if (id === 'messages' && unread > 0) return `<i>${unread}</i>`;
      if (id === 'jobs' && this.jobs.some((j) => !j.active) && !this.jobs.some((j) => j.active)) return `<i>${this.jobs.length}</i>`;
      return '';
    };
    return `<div class="home-clock">${esc(this.lastHour)}</div><div class="home-date">Sài Gòn · ${this.wallet.debt > 0 ? 'còn nợ ' + formatVnd(this.wallet.debt) : 'hết nợ rồi!'}</div>
      <div class="app-grid">${APPS.map(
        (a) => `<button type="button" class="app" data-app="${a.id}"><span class="app-icon" style="background:${a.color}">${icon(a.id)}${badge(a.id)}</span><span class="app-label"><kbd>${a.key}</kbd>${a.label}</span></button>`,
      ).join('')}</div>`;
  }

  private render(): string {
    switch (this.tab) {
      case 'home':
        return '';
      case 'jobs':
        return this.jobs.length === 0
          ? '<p class="muted">Chưa có kèo nào. Chạy một vòng quanh chợ rồi mở lại xem sao.</p>'
          : this.jobs
              .map(
                (j) => `<div class="card${j.active ? ' active' : ''}"><b>${esc(j.title)}</b><span>${esc(j.detail)}</span>
                    <div class="row"><em>${formatVnd(j.pay)}</em>${
                      j.active ? '<span class="tag">Đang chạy</span><button type="button" class="ghost" data-cancel>Huỷ</button>' : `<button type="button" data-accept="${esc(j.id)}">Nhận kèo</button>`
                    }</div></div>`,
              )
              .join('');
      case 'map':
        return '<p class="muted small">Khu Trung Tâm — chấm cam là bạn.</p>';
      case 'messages': {
        if (this.thread) {
          const t = this.inbox.thread(this.thread);
          return `<button type="button" class="back thread-back" data-back>‹ ${esc(t.contact)}</button><div class="chat">${t.messages
            .map((m) => `<p class="${m.from === 'Tín' ? 'me' : 'them'}">${esc(m.text)}</p>`)
            .join('')}</div>`;
        }
        if (this.inbox.threads.length === 0) return '<p class="muted">Không có tin nhắn.</p>';
        return this.inbox.threads
          .map((t) => {
            const last = t.messages.at(-1);
            return `<button type="button" class="thread${t.unread ? ' unread' : ''}" data-thread="${esc(t.contact)}"><b>${esc(t.contact)}</b><span>${esc(
              last?.text ?? '',
            )}</span>${t.unread ? `<i>${t.unread}</i>` : ''}</button>`;
          })
          .join('');
      }
      case 'settings': {
        const s = this.settings;
        if (!s) return '';
        const onOff = (on: boolean): string => `<span class="switch${on ? ' on' : ''}">${on ? 'Bật' : 'Tắt'}</span>`;
        return `<h4>Chất lượng đồ hoạ</h4>
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
          <h4>Nội dung (18+)</h4>
          <button type="button" class="setting" data-toggle="blood"><span>Máu khi đánh nhau</span>${onOff(s.blood)}</button>
          <p class="muted small">Cài đặt được lưu lại cho lần chơi sau.</p>`;
      }
      case 'wallet': {
        const w = this.wallet;
        return `<div class="money"><span>Tiền mặt</span><b>${formatVnd(w.cash)}</b></div>
          <div class="money debt"><span>Nợ ${LENDER}</span><b>${formatVnd(w.debt)}</b></div>
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
      case 'bank': {
        const w = this.wallet;
        const canPay = Math.min(w.cash, w.debt);
        const interest = Math.round((w.debt * DAILY_INTEREST) / 1000) * 1000;
        return `<div class="bank-card"><span>${LENDER}</span><b>${formatVnd(w.debt)}</b><small>Lãi "chỉ" 0,3%/ngày ≈ ${formatVnd(interest)} mỗi ngày*</small></div>
          ${
            w.debt <= 0
              ? '<p class="muted">Hết nợ rồi! App vay vẫn sẽ gửi tin mời vay thêm mỗi ngày.</p>'
              : canPay >= 100_000
                ? `<button type="button" class="pay" data-pay="${canPay}">Trả nợ ${formatVnd(canPay)}</button>`
                : '<p class="muted">Tiền mặt dưới 100.000 đ — chạy thêm kèo rồi quay lại trả.</p>'
          }
          <h4>Điều khoản (chữ nhỏ)</h4>
          <p class="muted small">*Chưa gồm phí hồ sơ, phí giải ngân, phí nhắc nợ, phí gọi cho người thân, phí "tinh thần". Trễ hạn: đội ngũ chăm sóc khách hàng sẽ ghé thăm tận nhà.</p>`;
      }
      case 'social': {
        const src = this.feedSource?.();
        if (!src) return '<p class="muted">Mất mạng rồi…</p>';
        return generateFeed(src.seed, src.day, src)
          .map(
            (p) => `<article class="post${p.hot ? ' hot' : ''}${p.sponsored ? ' ad' : ''}"><header><b>${esc(p.author)}</b>${p.sponsored ? '<small>Được tài trợ</small>' : p.hot ? '<small>Đang hot</small>' : ''}</header><p>${esc(
              p.text,
            )}</p><footer><span>♥ ${formatCount(p.likes)}</span><span>${formatCount(p.comments)} bình luận</span></footer></article>`,
          )
          .join('');
      }
      case 'camera':
        return `<button type="button" class="shutter" data-shutter>Chụp ảnh</button>
          <p class="muted small">Ảnh chụp cảnh trước mặt (giữ ${this.pro ? MAX_PHOTOS_PRO : MAX_PHOTOS} ảnh mới nhất).</p>
          <div class="gallery">${this.photos.map((u) => `<img src="${u}" alt="Ảnh đã chụp">`).join('') || '<p class="muted">Chưa có ảnh nào.</p>'}</div>`;
    }
  }
}
