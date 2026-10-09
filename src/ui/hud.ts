import type { Backend } from '@/render/renderer';
import type { CityLayout } from '@/world/city/layout';
import type { Inbox } from '@/systems/inbox';
import { formatVnd, type Wallet } from '@/systems/wallet';
import { Minimap } from './minimap';
import { Phone } from './phone';

const SPEEDO_MAX = 80; // km/h
const ARC_START = 135; // độ, bắt đầu từ góc dưới trái
const ARC_SWEEP = 270;

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => {
    const rad = (a * Math.PI) / 180;
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
}

/** HUD: địa điểm, đồng hồ tốc độ, gợi ý thao tác, thông báo, bảng phím, FPS. */
export class Hud {
  private readonly place: HTMLElement;
  private readonly locationBox: HTMLElement;
  private readonly speedo: HTMLElement;
  private readonly speedNum: HTMLElement;
  private readonly speedArc: SVGPathElement;
  private readonly prompt: HTMLElement;
  private readonly toast: HTMLElement;
  private readonly help: HTMLElement;
  private readonly fps: HTMLElement;
  private readonly clock: HTMLElement;
  /** Bản đồ nhỏ (tạo sau khi có bố cục khu phố). */
  minimap: Minimap | null = null;
  phone: Phone | null = null;
  private readonly cash: HTMLElement;
  private readonly phoneHint: HTMLElement;
  private lastCash = NaN;
  private lastUnread = -1;
  private lastClock = '';
  private lastPlace = '';
  private lastPrompt = '';
  private toastTimer = 0;
  private helpTimer = 18;
  private frames = 0;
  private elapsed = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly backend: Backend,
  ) {
    root.innerHTML = `
      <div class="hud-location panel">
        <div class="brand">HẺM</div>
        <div class="district">Khu Trung Tâm · <span data-clock>--:--</span></div>
        <div class="place" data-place aria-live="polite">—</div>
      </div>
      <div class="hud-speedo hidden" data-speedo>
        <svg viewBox="0 0 172 172" aria-hidden="true">
          <circle cx="86" cy="86" r="80" fill="rgba(14,12,20,.6)"/>
          <path d="${arcPath(86, 86, 66, ARC_START, ARC_START + ARC_SWEEP)}" stroke="rgba(255,255,255,.14)" stroke-width="10" fill="none" stroke-linecap="round"/>
          <path data-arc d="" stroke="var(--hud-accent)" stroke-width="10" fill="none" stroke-linecap="round"/>
        </svg>
        <div class="value"><div><div class="num" data-speed>0</div><div class="unit">KM/H</div></div></div>
      </div>
      <div class="hud-prompt panel hidden" data-prompt></div>
      <div class="hud-toast" data-toast role="status" aria-live="polite"></div>
      <div class="hud-help panel" data-help>
        <div class="title">Điều khiển</div>
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <b>đi / lái</b> · <kbd>Shift</kbd> <b>chạy</b> · <kbd>Space</kbd> <b>nhảy / phanh tay</b></div>
        <div><kbd>F</kbd> <b>lên / xuống xe</b> · <kbd>H</kbd> <b>bóp còi</b> · <kbd>L</kbd> <b>đèn pha</b> · <kbd>R</kbd> <b>dựng xe</b> · <kbd>P</kbd> <b>điện thoại</b></div>
        <div>Bấm vào màn hình rồi <b>rê chuột</b> để xoay camera · <b>cuộn</b> để zoom · <kbd>Tab</kbd> <b>ẩn/hiện bảng này</b></div>
      </div>
      <div class="hud-fps" data-fps></div>
      <div class="hud-cash" data-cash></div>
      <div class="hud-phone-hint panel" data-phone-hint><kbd>P</kbd> Điện thoại</div>`;
    const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
    this.place = q('[data-place]');
    this.locationBox = q('.hud-location');
    this.speedo = q('[data-speedo]');
    this.speedNum = q('[data-speed]');
    this.speedArc = q<SVGPathElement>('[data-arc]');
    this.prompt = q('[data-prompt]');
    this.toast = q('[data-toast]');
    this.help = q('[data-help]');
    this.fps = q('[data-fps]');
    this.clock = q('[data-clock]');
    this.cash = q('[data-cash]');
    this.phoneHint = q('[data-phone-hint]');
  }

  createPhone(inbox: Inbox, wallet: Wallet): Phone {
    this.phone = new Phone(this.root, inbox, wallet, this.minimap);
    return this.phone;
  }

  /** Tiền mặt (góc trên phải) và số tin chưa đọc (nhắc mở điện thoại). */
  setStatus(cash: number, unread: number): void {
    if (cash !== this.lastCash) {
      const gained = Number.isFinite(this.lastCash) && cash > this.lastCash;
      this.lastCash = cash;
      this.cash.textContent = formatVnd(cash);
      this.cash.classList.remove('gain');
      if (gained) {
        void this.cash.offsetWidth;
        this.cash.classList.add('gain');
      }
      this.phone?.invalidate();
    }
    if (unread !== this.lastUnread) {
      this.lastUnread = unread;
      this.phoneHint.innerHTML = `<kbd>P</kbd> Điện thoại${unread > 0 ? ` <i>${unread}</i>` : ''}`;
      this.phoneHint.classList.toggle('ping', unread > 0);
    }
  }

  createMinimap(layout: CityLayout): Minimap {
    this.minimap = new Minimap(this.root, layout);
    return this.minimap;
  }

  /** Giờ trong game, dạng "HH:MM". */
  setClock(label: string): void {
    if (label === this.lastClock) return;
    this.lastClock = label;
    this.clock.textContent = label;
  }

  setPlace(name: string): void {
    if (name === this.lastPlace) return;
    this.lastPlace = name;
    this.place.textContent = name;
    this.locationBox.classList.remove('changed');
    void this.locationBox.offsetWidth;
    this.locationBox.classList.add('changed');
  }

  setSpeed(kmh: number | null): void {
    if (kmh === null) {
      this.speedo.classList.add('hidden');
      return;
    }
    this.speedo.classList.remove('hidden');
    const v = Math.round(Math.abs(kmh));
    this.speedNum.textContent = String(v);
    const f = Math.min(1, Math.abs(kmh) / SPEEDO_MAX);
    this.speedArc.setAttribute('d', f > 0.005 ? arcPath(86, 86, 66, ARC_START, ARC_START + ARC_SWEEP * f) : '');
  }

  /** Gợi ý thao tác; chuỗi có thể chứa <kbd>. Rỗng = ẩn. */
  setPrompt(html: string): void {
    if (html === this.lastPrompt) return;
    this.lastPrompt = html;
    if (html) {
      this.prompt.innerHTML = html;
      this.prompt.classList.remove('hidden');
    } else this.prompt.classList.add('hidden');
  }

  showToast(text: string, seconds = 2.2): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  toggleHelp(): void {
    this.helpTimer = this.help.classList.contains('hidden') ? 1e9 : 0;
    this.help.classList.toggle('hidden', this.helpTimer === 0);
  }

  update(dt: number): void {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed >= 0.5) {
      this.fps.textContent = `${this.backend} · ${Math.round(this.frames / this.elapsed)} fps`;
      this.frames = 0;
      this.elapsed = 0;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
    if (this.helpTimer > 0 && this.helpTimer < 1e8) {
      this.helpTimer -= dt;
      if (this.helpTimer <= 0) this.help.classList.add('hidden');
    }
  }
}
