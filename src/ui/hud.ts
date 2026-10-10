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
  private readonly subtitle: HTMLElement;
  private subtitleTimer = 0;
  private readonly heat: HTMLElement;
  private lastHeat = '';
  private readonly objective: HTMLElement;
  private readonly objectiveText: HTMLElement;
  private readonly objectiveTimer: HTMLElement;
  private readonly phoneHint: HTMLElement;
  private lastCash = NaN;
  private lastUnread = -1;
  private lastClock = '';
  private lastSpeed = -1;
  private lastSpeedHidden: boolean | null = null;
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
      <div class="hud-subtitle" data-subtitle aria-live="polite"><b></b><span></span></div>
      <div class="hud-help panel" data-help>
        <div class="title">Điều khiển</div>
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <b>đi / lái</b> · <kbd>Shift</kbd> <b>chạy</b> · <kbd>Space</kbd> <b>nhảy / phanh tay</b></div>
        <div><kbd>F</kbd> <b>lên / xuống xe</b> · <kbd>H</kbd> <b>bóp còi</b> · <kbd>L</kbd> <b>đèn pha</b> · <kbd>R</kbd> <b>dựng xe</b> · <kbd>P</kbd> <b>điện thoại</b> · <kbd>M</kbd> <b>tắt tiếng</b></div>
        <div>Bấm vào màn hình rồi <b>rê chuột</b> để xoay camera · <b>cuộn</b> để zoom · <kbd>Tab</kbd> <b>ẩn/hiện bảng này</b></div>
      </div>
      <div class="hud-fps" data-fps></div>
      <div class="hud-cash" data-cash></div>
      <div class="hud-heat" data-heat hidden><span></span><span></span><span></span><small>Đang bị bám đuôi</small></div>
      <div class="hud-objective panel" data-objective hidden><span data-objective-text></span><b data-objective-timer></b></div>
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
    this.heat = q('[data-heat]');
    this.subtitle = q('[data-subtitle]');
    this.objective = q('[data-objective]');
    this.objectiveText = q('[data-objective-text]');
    this.objectiveTimer = q('[data-objective-timer]');
  }

  /** Phụ đề lời thoại (giữa dưới), tự ẩn sau vài giây. */
  showSubtitle(speaker: string, text: string, seconds = 3.6): void {
    (this.subtitle.querySelector('b') as HTMLElement).textContent = speaker;
    (this.subtitle.querySelector('span') as HTMLElement).textContent = text;
    this.subtitle.classList.add('show');
    this.subtitleTimer = seconds;
  }

  /** Độ Nóng: sao đỏ dưới tiền mặt; khuất tầm nhìn thì sao nhấp nháy và chữ đổi thành tiến độ cắt đuôi. */
  setHeat(level: number, escape: number, seen: boolean): void {
    const key = `${level}|${seen}|${Math.round(escape * 10)}`;
    if (key === this.lastHeat) return;
    this.lastHeat = key;
    this.heat.hidden = level === 0;
    if (level === 0) return;
    this.heat.querySelectorAll('span').forEach((s, i) => s.classList.toggle('on', i < level));
    this.heat.classList.toggle('hiding', !seen);
    (this.heat.querySelector('small') as HTMLElement).textContent = seen ? 'Đang bị bám đuôi' : `Đang cắt đuôi… ${Math.round(escape * 100)}%`;
  }

  /** Mục tiêu nhiệm vụ đang làm (giữa trên) + đồng hồ đếm ngược (giây). null = ẩn. */
  setObjective(text: string | null, remaining: number | null): void {
    this.objective.hidden = text === null;
    if (text === null) return;
    if (this.objectiveText.textContent !== text) this.objectiveText.textContent = text;
    let t = '';
    if (remaining !== null) {
      const s = Math.max(0, Math.ceil(remaining));
      t = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    if (this.objectiveTimer.textContent !== t) this.objectiveTimer.textContent = t;
    this.objectiveTimer.classList.toggle('late', remaining !== null && remaining <= 0);
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

  /** Ô hiển thị số khung hình / giây (bật bằng ?fps=1). */
  createPerfBox(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'hud-perf';
    this.root.appendChild(box);
    return box;
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
    // Chỉ chạm vào DOM khi giá trị hiển thị thật sự đổi (ghi lại mỗi khung hình bắt trình duyệt vẽ lại đồng hồ).
    const hidden = kmh === null;
    if (hidden !== this.lastSpeedHidden) {
      this.lastSpeedHidden = hidden;
      this.speedo.classList.toggle('hidden', hidden);
    }
    if (kmh === null) return;
    const v = Math.round(Math.abs(kmh));
    if (v === this.lastSpeed) return;
    this.lastSpeed = v;
    this.speedNum.textContent = String(v);
    const f = Math.min(1, v / SPEEDO_MAX);
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
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      if (this.subtitleTimer <= 0) this.subtitle.classList.remove('show');
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
