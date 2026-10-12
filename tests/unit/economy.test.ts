import { describe, expect, it } from 'vitest';
import { JobBoard } from '@/missions/jobs';
import { FIRST_INSTALLMENT } from '@/missions/story';
import { BUSTED, HOSPITAL, penalty, SHAKEDOWN, type Penalty } from '@/systems/economy';
import { ITEMS, type ItemDef, type ItemId } from '@/systems/inventory';
import { CATALOG, finalPrice, isService, sellPrice } from '@/systems/shopCatalog';
import { generateCity } from '@/world/city/layout';
import { AVERAGE, CAREFUL, EconomySim, offerOf, RECKLESS, type EconomyReport, type PlayStyle } from './economySim';

const city = generateCity();
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);
/** Thứ một người chơi muốn sắm dần: vũ khí rẻ nhất → bộ đồ → balo → mã tấu → điện thoại Pro → balo to nhất. */
const WISHLIST = (['gaySat', 'doiDo', 'balo16', 'maTau', 'dienThoaiPro', 'balo24'] as const).map(offerOf);
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

interface Run {
  /** Số kèo phải chạy thêm để đủ tiền trả kỳ đầu, và số phút chơi tới lúc xong Hồi 1. */
  extraJobs: number;
  act1Minutes: number;
  /** Hai giờ chạy kèo sau Hồi 1. */
  income: number;
  jobs: number;
  penalties: number;
  shakedowns: number;
  food: number;
  /** Phút (sau Hồi 1) tới lúc mua xong món cuối trong danh sách; NaN nếu chưa mua hết. */
  boughtAllAt: number;
  firstBuyAt: number;
}

/** Chơi Hồi 1 rồi chạy kèo thêm 2 giờ, vừa chạy vừa sắm đồ. */
function play(style: PlayStyle, seed: number): Run {
  const sim = new EconomySim(city, style, seed);
  const extraJobs = sim.playAct1();
  const a: EconomyReport = { ...sim.report };
  sim.wishlist = [...WISHLIST];
  sim.playJobs(2 * 3600);
  const b = sim.report;
  const minutes = (i: number): number => ((b.purchases.at(i)?.at ?? NaN) - a.time) / 60;
  return {
    extraJobs,
    act1Minutes: a.time / 60,
    income: b.jobIncome - a.jobIncome,
    jobs: b.jobs - a.jobs,
    penalties: b.fines - a.fines + (b.hospital - a.hospital) + (b.shakedowns - a.shakedowns),
    shakedowns: b.shakedowns - a.shakedowns,
    food: b.food - a.food,
    boughtAllAt: b.purchases.length === WISHLIST.length ? minutes(-1) : NaN,
    firstBuyAt: minutes(0),
  };
}

const runs = (style: PlayStyle): Run[] => SEEDS.map((seed) => play(style, seed));
const careful = runs(CAREFUL);
const average = runs(AVERAGE);
const reckless = runs(RECKLESS);

describe('tiền phạt, viện phí, bị lục túi', () => {
  it('có sàn, có trần, giữa hai mốc thì theo phần trăm tiền mặt (làm tròn nghìn)', () => {
    expect(penalty(BUSTED, 0)).toBe(150_000);
    expect(penalty(BUSTED, 1_000_000)).toBe(200_000);
    expect(penalty(BUSTED, 50_000_000)).toBe(400_000);
    expect(penalty(HOSPITAL, 200_000)).toBe(100_000);
    expect(penalty(HOSPITAL, 1_504_400)).toBe(150_000);
    expect(penalty(HOSPITAL, 50_000_000)).toBe(250_000);
    expect(penalty(SHAKEDOWN, 0)).toBe(50_000);
    expect(penalty(SHAKEDOWN, 300_000)).toBe(90_000);
    expect(penalty(SHAKEDOWN, 50_000_000)).toBe(150_000);
  });

  it('bị công an bắt là khoản nặng nhất ở mọi mức tiền', () => {
    for (const cash of [0, 100_000, 500_000, 1_500_000, 5_000_000, 30_000_000]) {
      expect(penalty(BUSTED, cash)).toBeGreaterThan(penalty(HOSPITAL, cash));
      expect(penalty(BUSTED, cash)).toBeGreaterThanOrEqual(penalty(SHAKEDOWN, cash));
    }
  });

  it('một lần xui không xoá quá một phần ba số tiền đang gom trả kỳ đầu', () => {
    for (const p of [BUSTED, HOSPITAL, SHAKEDOWN] as Penalty[]) expect(penalty(p, FIRST_INSTALLMENT)).toBeLessThan(FIRST_INSTALLMENT / 3);
  });

  it('kèo hàng nóng đáng nhận: thoát được 3 lần trên 4 thì tiền thêm đủ bù lần bị lục túi', () => {
    const board = new JobBoard(city, 7);
    const hot = Array.from({ length: 600 }, () => board.make(city.spawn.x, city.spawn.z)).filter((j) => j.heat);
    expect(hot.length).toBeGreaterThan(30);
    const bonus = mean(hot.map((j) => j.reward - j.reward / 1.8));
    expect(SHAKEDOWN.max * 0.25).toBeLessThan(bonus);
  });
});

describe('giá cửa hàng', () => {
  it('mua rồi bán lại ở tiệm cầm đồ luôn lỗ, kể cả khi mặc cả được 20 %', () => {
    for (const offers of Object.values(CATALOG))
      for (const o of offers) if (!isService(o.id)) expect(sellPrice(o.id)).toBeLessThan(finalPrice(o.price, 0.2));
  });

  it('trong một tiệm không có món ăn / thuốc nào vừa đắt hơn vừa hồi ít máu hơn món cùng loại', () => {
    for (const offers of Object.values(CATALOG)) {
      const heals = offers.flatMap((o) => (isService(o.id) ? [] : [{ id: o.id, price: o.price, def: ITEMS[o.id as ItemId] as ItemDef }])).filter((x) => x.def.heal);
      for (const a of heals)
        for (const b of heals) {
          if (a === b || a.def.kind !== b.def.kind) continue;
          const worse = a.price >= b.price && a.def.heal! <= b.def.heal! && a.def.stack <= b.def.stack;
          expect(worse && (a.price > b.price || a.def.heal! < b.def.heal!), `${a.def.name} thua ${b.def.name}`).toBe(false);
        }
    }
  });
});

describe('chơi thử Hồi 1', () => {
  it('người cẩn thận phải chạy thêm vài kèo mới đủ 1,5 triệu, xong Hồi 1 trong khoảng 8–20 phút', () => {
    for (const r of careful) {
      expect(r.extraJobs).toBeGreaterThanOrEqual(2);
      expect(r.extraJobs).toBeLessThanOrEqual(6);
      expect(r.act1Minutes).toBeGreaterThan(8);
      expect(r.act1Minutes).toBeLessThan(20);
    }
  });

  it('người bình thường (đôi lần bị bắt, bị lục túi) vẫn xong trong nửa giờ', () => {
    for (const r of average) expect(r.act1Minutes).toBeLessThan(30);
    expect(mean(average.map((r) => r.extraJobs))).toBeLessThan(8);
  });

  it('người chơi liều không bị kẹt mãi dưới mốc 1,5 triệu', () => {
    for (const r of reckless) expect(r.act1Minutes).toBeLessThan(90);
    expect(mean(reckless.map((r) => r.act1Minutes))).toBeLessThan(30);
  });
});

describe('chơi thử 2 giờ chạy kèo sau Hồi 1', () => {
  const payPerJob = mean(careful.map((r) => r.income / r.jobs));
  const perHour = mean(careful.map((r) => r.income / 2));

  it('một kèo trả 50–90 nghìn, một giờ chạy đều tay kiếm 2–4 triệu', () => {
    expect(payPerJob).toBeGreaterThan(50_000);
    expect(payPerJob).toBeLessThan(90_000);
    expect(perHour).toBeGreaterThan(2_000_000);
    expect(perHour).toBeLessThan(4_000_000);
  });

  it('vũ khí rẻ nhất mua được sau vài kèo; món đắt nhất tiệm đáng 6–12 kèo', () => {
    const prices = Object.values(CATALOG).flat().map((o) => o.price);
    const weapons = CATALOG.camDo.map((o) => o.price);
    expect(Math.min(...weapons) / payPerJob).toBeLessThan(3);
    expect(Math.max(...prices) / payPerJob).toBeGreaterThan(6);
    expect(Math.max(...prices) / payPerJob).toBeLessThan(12);
    for (const r of careful) expect(r.firstBuyAt).toBeLessThan(6);
  });

  it('sắm hết vũ khí + nâng cấp mất 25–60 phút chạy kèo; người chơi liều cũng sắm hết trong 2 giờ', () => {
    for (const r of careful) {
      expect(r.boughtAllAt).toBeGreaterThan(25);
      expect(r.boughtAllAt).toBeLessThan(60);
    }
    for (const r of reckless) expect(r.boughtAllAt).toBeLessThan(120);
  });

  it('ăn uống chỉ là khoản lặt vặt: dưới 5 % thu nhập, người hay bị đánh cũng dưới 15 %', () => {
    for (const r of careful) expect(r.food / r.income).toBeLessThan(0.05);
    for (const r of reckless) expect(r.food / r.income).toBeLessThan(0.15);
  });

  it('phạt + viện phí + bị lục túi: người bình thường mất dưới 1/3 thu nhập, người liều vẫn còn lời', () => {
    expect(mean(average.map((r) => r.penalties / r.income))).toBeLessThan(0.25);
    for (const r of average) expect(r.penalties / r.income).toBeLessThan(1 / 3);
    for (const r of reckless) expect((r.penalties + r.food) / r.income).toBeLessThan(0.75);
  });

  it('khoản nợ 30 triệu vẫn là mục tiêu dài hơi: chỉ chạy kèo thì hơn 8 giờ mới trả hết', () => {
    expect(new EconomySim(city, CAREFUL).wallet.debt / perHour).toBeGreaterThan(8);
  });

  it('cùng seed thì cùng kết quả', () => {
    expect(play(AVERAGE, 3)).toEqual(average[2]);
  });
});
