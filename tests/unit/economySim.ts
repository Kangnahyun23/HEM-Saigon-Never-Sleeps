import { createRng, type Rng } from '@/core/random';
import { JobBoard } from '@/missions/jobs';
import type { MissionDef } from '@/missions/mission';
import { buildStory, type StoryMission } from '@/missions/story';
import { BUSTED, HOSPITAL, penalty, SHAKEDOWN } from '@/systems/economy';
import { ITEMS, type ItemDef } from '@/systems/inventory';
import { bargain, CATALOG, finalPrice, type Offer } from '@/systems/shopCatalog';
import { Wallet } from '@/systems/wallet';
import type { CityLayout } from '@/world/city/layout';

/**
 * Mô hình "chơi thử" kinh tế của game (dùng cho unit test cân bằng — N6.4): một người chơi giả chạy Hồi 1 rồi chạy kèo
 * giao hàng vài giờ, ăn uống, thỉnh thoảng bị bắt / gục / bị chặn đầu, có tiền thì mua đồ. Dùng thẳng dữ liệu thật của game
 * (JobBoard, buildStory, CATALOG, mức phạt) nên đổi số trong game là kết quả ở đây đổi theo. Chỉ có đi lại là ước lượng:
 * quãng đường chim bay × `DETOUR`, chia tốc độ trung bình của kiểu chơi.
 */

/** Đường thật dài hơn đường chim bay chừng này (lưới ô bàn cờ + hẻm). */
const DETOUR = 1.35;
/** Mỗi kèo mất thêm ngần này giây: mở điện thoại nhận kèo, dừng lấy hàng, dừng giao. */
const JOB_OVERHEAD = 12;
/** Bị bắt / gục: màn hình kết cục + định thần lại. */
const OUTCOME_TIME = 20;
/** Cắt đuôi đàn em của Phát mất chừng này giây cho mỗi cấp Độ Nóng. */
const ESCAPE_TIME = 20;

export interface PlayStyle {
  readonly name: string;
  /** Tốc độ trung bình cửa-tới-cửa khi chạy xe (m/s), đã tính cua, lách xe, dừng đèn. Xe tối đa 21 m/s. */
  readonly speed: number;
  /** Có nhận kèo "hàng nóng" không. */
  readonly takesHot: boolean;
  /** Xác suất bị đàn em chặn đầu mỗi lần bị bám đuôi. */
  readonly caughtChance: number;
  /** Số lần bị công an bắt / bị gục mỗi giờ chơi. */
  readonly bustsPerHour: number;
  readonly knockoutsPerHour: number;
  /** Máu mất mỗi giờ (té xe, bị đánh) — phải ăn uống bù lại. */
  readonly damagePerHour: number;
  /** Có mặc cả khi mua đồ không. */
  readonly bargains: boolean;
}

export const CAREFUL: PlayStyle = { name: 'cẩn thận', speed: 9, takesHot: false, caughtChance: 0, bustsPerHour: 0, knockoutsPerHour: 0, damagePerHour: 40, bargains: true };
export const AVERAGE: PlayStyle = { name: 'bình thường', speed: 11, takesHot: true, caughtChance: 0.25, bustsPerHour: 0.5, knockoutsPerHour: 0.5, damagePerHour: 120, bargains: true };
export const RECKLESS: PlayStyle = { name: 'liều', speed: 13, takesHot: true, caughtChance: 0.5, bustsPerHour: 3, knockoutsPerHour: 2, damagePerHour: 300, bargains: false };

export interface Purchase {
  readonly id: Offer['id'];
  readonly price: number;
  /** Giây chơi tính từ đầu game. */
  readonly at: number;
}

export interface EconomyReport {
  /** Giây chơi. */
  time: number;
  cash: number;
  debt: number;
  jobs: number;
  lateJobs: number;
  hotJobs: number;
  failedJobs: number;
  /** Tiền kiếm được: kèo (gồm boa) và thưởng nhiệm vụ. */
  jobIncome: number;
  storyIncome: number;
  /** Tiền mất: phạt, viện phí, bị lục túi, ăn uống, mua sắm. */
  fines: number;
  hospital: number;
  shakedowns: number;
  food: number;
  shopping: number;
  busts: number;
  knockouts: number;
  purchases: Purchase[];
}

const dist = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);

/** Giá mỗi điểm máu của một món ăn / thuốc trong tiệm. */
function costPerHp(o: Offer): number {
  const def = ITEMS[o.id as keyof typeof ITEMS] as ItemDef | undefined;
  return def?.heal ? o.price / def.heal : Infinity;
}

/** Giá trung bình một điểm máu nếu ăn đủ thứ ở tạp hoá, quán cơm tấm, nhà thuốc (đồng / máu). */
export function typicalHealCost(): number {
  const costs = [...CATALOG.tapHoa, ...CATALOG.comTam, ...CATALOG.nhaThuoc].map(costPerHp).filter(Number.isFinite);
  return costs.reduce((a, b) => a + b, 0) / costs.length;
}

export class EconomySim {
  readonly wallet = new Wallet();
  readonly report: EconomyReport;
  /** Thứ muốn mua, theo thứ tự; đủ tiền (sau khi chừa `reserve`) là mua. */
  wishlist: Offer[] = [];
  /** Tiền chừa lại không tiêu (để dành trả nợ). */
  reserve = 0;
  private readonly rng: Rng;
  private readonly board: JobBoard;
  private readonly story: StoryMission[];
  private x: number;
  private z: number;
  /** Máu đã mất chưa ăn bù. */
  private hunger = 0;

  constructor(city: CityLayout, readonly style: PlayStyle, seed = 1) {
    this.rng = createRng(seed);
    this.board = new JobBoard(city, seed + 98);
    this.story = buildStory(city);
    this.x = city.spawn.x;
    this.z = city.spawn.z;
    this.report = {
      time: 0, cash: this.wallet.cash, debt: this.wallet.debt, jobs: 0, lateJobs: 0, hotJobs: 0, failedJobs: 0, jobIncome: 0, storyIncome: 0,
      fines: 0, hospital: 0, shakedowns: 0, food: 0, shopping: 0, busts: 0, knockouts: 0, purchases: [],
    };
  }

  /** Thời gian chạy xe từ chỗ đang đứng tới (x, z), rồi đứng luôn ở đó. */
  private ride(x: number, z: number): number {
    const t = (dist(this.x, this.z, x, z) * DETOUR) / this.style.speed;
    this.x = x;
    this.z = z;
    return t;
  }

  /** Thời gian trôi: ăn uống bù máu và các tai nạn theo kiểu chơi. Trả về true nếu bị bắt / gục (việc đang làm thất bại). */
  private pass(seconds: number): boolean {
    const r = this.report;
    const s = this.style;
    r.time += seconds;
    this.hunger += (s.damagePerHour * seconds) / 3600;
    if (this.hunger >= 20) {
      r.food += this.wallet.spend(Math.round((this.hunger * typicalHealCost()) / 1000) * 1000, 'Ăn uống');
      this.hunger = 0;
    }
    let failed = false;
    if (this.rng() < (s.bustsPerHour * seconds) / 3600) {
      r.fines += this.wallet.spend(penalty(BUSTED, this.wallet.cash), 'Nộp phạt');
      r.busts++;
      failed = true;
    }
    if (this.rng() < (s.knockoutsPerHour * seconds) / 3600) {
      r.hospital += this.wallet.spend(penalty(HOSPITAL, this.wallet.cash), 'Viện phí');
      r.knockouts++;
      this.hunger = 0;
      failed = true;
    }
    if (failed) r.time += OUTCOME_TIME;
    r.cash = this.wallet.cash;
    r.debt = this.wallet.debt;
    return failed;
  }

  /** Bị bám đuôi ở Độ Nóng `level`: cắt đuôi được, hoặc bị chặn đầu lục túi. Trả về số giây mất thêm. */
  private chased(level: number): number {
    if (this.rng() < this.style.caughtChance) this.report.shakedowns += this.wallet.spend(penalty(SHAKEDOWN, this.wallet.cash), 'Bị chặn đầu');
    return ESCAPE_TIME * level;
  }

  /** Chạy một nhiệm vụ / kèo từ chỗ đang đứng. Trả về tiền nhận được (0 nếu thất bại). */
  private run(def: MissionDef): { reward: number; late: boolean; failed: boolean } {
    let elapsed = 0;
    let timed = 0;
    def.objectives.forEach((o, i) => {
      let t = def.heat?.at === i ? this.chased(def.heat.level) : 0;
      if (o.kind === 'goto') t += this.ride(o.x, o.z);
      else if (o.kind === 'wait') t += this.ride(o.x, o.z) + o.seconds;
      else if (o.kind === 'mount') t += 3;
      elapsed += t;
      if (i >= (def.timerFrom ?? 0)) timed += t;
    });
    if (this.pass(elapsed)) return { reward: 0, late: false, failed: true };
    const late = def.timeLimit !== undefined && timed > def.timeLimit;
    if (late && def.late === 'fail') return { reward: 0, late, failed: true };
    return { reward: late && def.late === 'half' ? Math.round(def.reward / 2 / 1000) * 1000 : def.reward, late, failed: false };
  }

  /** Nhận kèo trả cao nhất trên bảng (người không nhận hàng nóng thì bỏ qua kèo nóng) rồi chạy. */
  doJob(): void {
    const r = this.report;
    const offers = this.board.offers(this.x, this.z).filter((o) => this.style.takesHot || !o.heat);
    const def = offers.sort((a, b) => b.reward - a.reward)[0];
    if (!def) return;
    this.pass(JOB_OVERHEAD);
    const res = this.run(def);
    if (res.failed) {
      r.failedJobs++;
      return;
    }
    r.jobs++;
    if (def.heat) r.hotJobs++;
    if (res.late) r.lateJobs++;
    const pay = res.reward + (res.late ? 0 : this.board.tip());
    this.wallet.earn(pay, 'Kèo');
    r.jobIncome += pay;
    this.shop();
  }

  /** Mua món đầu danh sách mong muốn nếu đủ tiền (sau khi chừa `reserve`). */
  private shop(): void {
    const r = this.report;
    for (;;) {
      const offer = this.wishlist[0];
      if (!offer) break;
      const price = this.style.bargains ? finalPrice(offer.price, bargain(this.rng).discount) : offer.price;
      if (this.wallet.cash - this.reserve < price) break;
      this.wallet.spend(price, 'Mua sắm');
      r.shopping += price;
      r.purchases.push({ id: offer.id, price, at: r.time });
      this.wishlist.shift();
    }
    r.cash = this.wallet.cash;
  }

  /**
   * Hồi 1: làm lần lượt 5 nhiệm vụ; thất bại thì làm lại; nhiệm vụ cần tiền (trả nợ kỳ đầu) thì chạy kèo tới khi đủ.
   * Trả về số kèo phải chạy thêm.
   */
  playAct1(): number {
    const r = this.report;
    const before = r.jobs;
    for (const m of this.story) {
      while (m.requiresCash && this.wallet.cash < m.requiresCash) this.doJob();
      for (;;) {
        this.pass(this.ride(m.start.x, m.start.z) + m.intro.length * 3);
        const res = this.run(m.def);
        if (res.failed) continue;
        this.wallet.earn(res.reward, m.def.title);
        r.storyIncome += res.reward;
        break;
      }
      if (m.paysDebt) this.wallet.payDebt(m.paysDebt);
      r.cash = this.wallet.cash;
      r.debt = this.wallet.debt;
    }
    return r.jobs - before;
  }

  /** Chạy kèo liên tục thêm `seconds` giây chơi. */
  playJobs(seconds: number): void {
    const end = this.report.time + seconds;
    while (this.report.time < end) this.doJob();
  }
}

/** Tìm một món trong danh mục cửa hàng. */
export function offerOf(id: Offer['id']): Offer {
  for (const offers of Object.values(CATALOG)) {
    const o = offers.find((x) => x.id === id);
    if (o) return o;
  }
  throw new Error(`Không tiệm nào bán ${id}`);
}
