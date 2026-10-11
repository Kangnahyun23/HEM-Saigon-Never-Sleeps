import type { Backend } from '@/render/renderer';
import type { CityLayout } from '@/world/city/layout';
import type { Inbox } from '@/systems/inbox';
import { formatVnd, type Wallet } from '@/systems/wallet';
import { Minimap } from './minimap';
import { Backpack } from './backpack';
import { Phone } from './phone';
import { OutcomeScreen } from './outcome';
import { WeaponWheel } from './weaponWheel';
import { ToastQueue } from './toastQueue';

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
  private readonly toasts = new ToastQueue(3);
  private readonly help: HTMLElement;
  private readonly helpHint: HTMLElement;
  private readonly health: HTMLElement;
  private readonly armor: HTMLElement;
  private readonly vitals: HTMLElement;
  private lastVitals = '';
  private readonly fps: HTMLElement;
  private readonly clock: HTMLElement;
  /** Bản đồ nhỏ (tạo sau khi có bố cục khu phố). */
  minimap: Minimap | null = null;
  phone: Phone | null = null;
  /** Balo (phím I). */
  readonly backpack: Backpack;
  /** Vòng chọn đồ (giữ Tab). */
  readonly wheel: WeaponWheel;
  /** Màn hình kết cục BỊ BẮT / GỤC. */
  readonly outcome: OutcomeScreen;
  private readonly weapon: HTMLElement;
  private lastWeapon = '';
  private readonly cash: HTMLElement;
  private readonly subtitle: HTMLElement;
  private subtitleTimer = 0;
  private readonly heat: HTMLElement;
  private lastHeat = '';
  private readonly wanted: HTMLElement;
  private readonly wantedStars: HTMLElement[];
  private lastWanted = -1;
  private lastWantedPhase = -1;
  private lastWantedPct = -1;
  private readonly wantedLabel: HTMLElement;
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
  /** Nhãn "F1" nhấp nháy ít giây đầu cho người mới biết chỗ xem phím. */
  private hintTimer = 20;
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
      <div class="hud-vitals" data-vitals><div class="bar health"><i data-health></i></div><div class="bar armor"><i data-armor></i></div></div>
      <div class="hud-help-hint panel" data-help-hint><kbd>F1</kbd> Phím điều khiển</div>
      <div class="hud-subtitle" data-subtitle aria-live="polite"><b></b><span></span></div>
      <div class="hud-help panel hidden" data-help>
        <div class="title">Điều khiển</div>
        <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> <b>đi / lái</b> · <kbd>Shift</kbd> <b>chạy</b> · <kbd>Space</kbd> <b>nhảy / phanh tay</b></div>
        <div><kbd>F</kbd> <b>lên / xuống xe</b> · <kbd>H</kbd> <b>bóp còi</b> · <kbd>L</kbd> <b>đèn pha</b> · <kbd>R</kbd> <b>dựng xe</b> · <kbd>M</kbd> <b>tắt tiếng</b></div>
        <div><kbd>P</kbd> <b>điện thoại</b> · <kbd>I</kbd> <b>balo</b> · giữ <kbd>Tab</kbd> <b>chọn đồ</b> · <kbd>1</kbd>–<kbd>4</kbd> <b>chọn nhanh</b></div>
        <div><b>Chuột trái</b> đánh (bấm liên tiếp: combo) · <b>chuột phải</b> đòn mạnh · <kbd>G</kbd> <b>nhặt đồ</b> (ghế nhựa, mũ bảo hiểm)</div>
        <div>Bấm vào màn hình rồi <b>rê chuột</b> để xoay camera · <b>cuộn</b> để zoom · <kbd>F1</kbd> <b>ẩn/hiện bảng này</b></div>
      </div>
      <div class="hud-fps" data-fps></div>
      <div class="hud-cash" data-cash></div>
      <div class="hud-right">
        <div class="hud-wanted" data-wanted hidden><span></span><span></span><span></span><span></span><span></span><small>Công an truy nã</small></div>
        <div class="hud-heat" data-heat hidden><span></span><span></span><span></span><span></span><span></span><small>Đang bị bám đuôi</small></div>
        <div class="hud-weapon panel" data-weapon hidden><span></span><i><u></u></i></div>
      </div>
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
    this.helpHint = q('[data-help-hint]');
    this.vitals = q('[data-vitals]');
    this.health = q('[data-health]');
    this.armor = q('[data-armor]');
    this.fps = q('[data-fps]');
    this.clock = q('[data-clock]');
    this.cash = q('[data-cash]');
    this.phoneHint = q('[data-phone-hint]');
    this.heat = q('[data-heat]');
    this.wanted = q('[data-wanted]');
    this.wantedStars = Array.from(this.wanted.querySelectorAll('span'));
    this.wantedLabel = this.wanted.querySelector('small') as HTMLElement;
    this.subtitle = q('[data-subtitle]');
    this.objective = q('[data-objective]');
    this.objectiveText = q('[data-objective-text]');
    this.objectiveTimer = q('[data-objective-timer]');
    this.backpack = new Backpack(root);
    this.wheel = new WeaponWheel(root);
    this.outcome = new OutcomeScreen(root);
    this.weapon = q('[data-weapon]');
  }

  /** Vũ khí đang cầm + độ bền 0..1 (null = tay không, ẩn ô). */
  setWeapon(label: string | null, durability: number): void {
    const key = label ? `${label}|${Math.round(durability * 50)}` : '';
    if (key === this.lastWeapon) return;
    this.lastWeapon = key;
    this.weapon.hidden = !label;
    if (!label) return;
    (this.weapon.querySelector('span') as HTMLElement).textContent = label;
    (this.weapon.querySelector('u') as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, durability))})`;
  }

  /** Phụ đề lời thoại (giữa dưới), tự ẩn sau vài giây. */
  showSubtitle(speaker: string, text: string, seconds = 3.6): void {
    (this.subtitle.querySelector('b') as HTMLElement).textContent = speaker;
    (this.subtitle.querySelector('span') as HTMLElement).textContent = text;
    this.subtitle.classList.add('show');
    this.subtitleTimer = seconds;
  }

  /** Độ Nóng / truy nã: 5 ô sao dưới tiền mặt (góc trên phải); khuất tầm nhìn thì sao nhấp nháy và chữ đổi thành tiến độ cắt đuôi. */
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

  /**
   * Sao truy nã (công an): trắng như GTA; công an đang thấy Tín thì nhấp nháy đỏ – xanh như đèn xe công an, khuất mặt
   * (đang bị tìm) thì sao mờ nhấp nháy và ghi tiến độ cắt đuôi. `escape` 0..1.
   */
  setWanted(level: number, escape: number, seen: boolean): void {
    const phase = level === 0 ? 0 : seen ? 1 : 2;
    const pct = phase === 2 ? Math.round(escape * 10) : 0;
    if (level === this.lastWanted && phase === this.lastWantedPhase && pct === this.lastWantedPct) return;
    if (level > this.lastWanted && this.lastWanted >= 0) {
      this.wanted.classList.remove('bump');
      void this.wanted.offsetWidth;
      this.wanted.classList.add('bump');
    }
    this.lastWanted = level;
    this.lastWantedPhase = phase;
    this.lastWantedPct = pct;
    this.wanted.hidden = level === 0;
    for (let i = 0; i < this.wantedStars.length; i++) this.wantedStars[i]!.classList.toggle('on', i < level);
    this.wanted.classList.toggle('alarm', phase === 1);
    this.wanted.classList.toggle('fading', phase === 2);
    this.wantedLabel.textContent = phase === 2 ? `Công an đang tìm… ${pct * 10}%` : 'Công an truy nã';
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

  /** Thông báo nhanh: xếp chồng ở góc dưới trái (trên bản đồ nhỏ), tối đa 3 dòng, không đè nhau. */
  showToast(text: string, seconds = 2.2): void {
    this.toasts.push(text, seconds);
    this.renderToasts();
  }

  private renderToasts(): void {
    const items = this.toasts.items;
    const nodes = this.toast.children;
    // Dùng lại thẻ có sẵn theo id (giữ hiệu ứng trượt vào cho dòng mới), bỏ thẻ của dòng đã hết hạn.
    for (let i = nodes.length - 1; i >= 0; i--) {
      const el = nodes[i] as HTMLElement;
      if (!items.some((t) => String(t.id) === el.dataset.id)) el.remove();
    }
    for (const t of items) {
      let el = this.toast.querySelector<HTMLElement>(`[data-id="${t.id}"]`);
      if (!el) {
        el = document.createElement('div');
        el.className = 'toast panel';
        el.dataset.id = String(t.id);
        el.textContent = t.text;
      }
      this.toast.appendChild(el);
    }
  }

  /** Bảng phím đầy đủ (F1); mặc định thu gọn thành nhãn nhỏ. */
  toggleHelp(): void {
    const show = this.help.classList.contains('hidden');
    this.help.classList.toggle('hidden', !show);
    this.helpHint.classList.toggle('hidden', show);
    this.hintTimer = 0;
    this.helpHint.classList.remove('ping');
  }

  /** Máu / giáp (0..1) — thanh ngang ngay trên bản đồ nhỏ; giáp 0 thì ẩn thanh giáp, máu thấp thì đỏ nhấp nháy. */
  setVitals(health: number, armor: number): void {
    const h = Math.max(0, Math.min(1, health));
    const a = Math.max(0, Math.min(1, armor));
    const key = `${Math.round(h * 200)}|${Math.round(a * 200)}`;
    if (key === this.lastVitals) return;
    this.lastVitals = key;
    this.health.style.transform = `scaleX(${h})`;
    this.armor.style.transform = `scaleX(${a})`;
    this.vitals.classList.toggle('low', h < 0.25);
    this.vitals.classList.toggle('no-armor', a <= 0);
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
    if (this.toasts.update(dt)) this.renderToasts();
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      this.helpHint.classList.toggle('ping', this.hintTimer > 0);
    }
  }
}
