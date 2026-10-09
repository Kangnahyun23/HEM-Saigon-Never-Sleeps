import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { doorstep, JobBoard, jobPay } from '@/missions/jobs';
import { MissionRunner, type MissionContext, type MissionDef } from '@/missions/mission';
import { generateCity } from '@/world/city/layout';

const city = generateCity();
const at = (x: number, z: number, riding = false, heat = 0): MissionContext => ({ x, z, riding, heat });

const def: MissionDef = {
  id: 't',
  title: 'Thử',
  reward: 50_000,
  objectives: [
    { kind: 'mount', label: 'Lên xe' },
    { kind: 'goto', x: 10, z: 0, radius: 2, label: 'Tới A', bike: true },
    { kind: 'wait', x: 10, z: 0, radius: 3, seconds: 2, label: 'Chờ' },
  ],
  timeLimit: 10,
  timerFrom: 1,
  late: 'half',
};

describe('MissionRunner', () => {
  it('đi qua từng mục tiêu theo thứ tự, phát sự kiện, trả tiền khi xong', () => {
    const m = new MissionRunner(def);
    expect(m.update(1, at(0, 0))).toEqual([]);
    expect(m.timer).toBeNull();
    const ev = m.update(0.1, at(0, 0, true));
    expect(ev[0]).toMatchObject({ type: 'objective', index: 1 });
    expect(m.timer).toBe(0);
    // Đi bộ tới A không tính (phải chạy xe).
    expect(m.update(0.1, at(10, 0, false))).toEqual([]);
    expect(m.update(0.1, at(10, 0, true))[0]).toMatchObject({ type: 'objective', index: 2 });
    // Rời vòng chờ thì đếm lại.
    m.update(1.5, at(10, 0, true));
    m.update(0.1, at(30, 0, true));
    expect(m.update(1.5, at(10, 0, true))).toEqual([]);
    const done = m.update(1, at(10, 0, true));
    expect(done).toEqual([{ type: 'complete', reward: 50_000, late: false }]);
    expect(m.done).toBe(true);
  });

  it('trễ giờ: nửa tiền (late=half) hoặc thất bại (late=fail)', () => {
    const half = new MissionRunner(def);
    half.update(0.1, at(0, 0, true));
    half.update(11, at(50, 50, true));
    half.update(0.1, at(10, 0, true));
    expect(half.update(3, at(10, 0, true))).toEqual([{ type: 'complete', reward: 25_000, late: true }]);

    const strict = new MissionRunner({ ...def, late: 'fail' });
    strict.update(0.1, at(0, 0, true));
    expect(strict.update(11, at(50, 50, true))).toEqual([{ type: 'fail', reason: 'Hết giờ' }]);
    expect(strict.failed).toBe(true);
  });

  it('cắt đuôi: xong khi Độ Nóng về 0', () => {
    const m = new MissionRunner({ id: 'e', title: 'Chạy', reward: 0, objectives: [{ kind: 'escape', label: 'Cắt đuôi' }] });
    expect(m.update(1, at(0, 0, true, 2))).toEqual([]);
    expect(m.update(1, at(0, 0, true, 0))[0]).toMatchObject({ type: 'complete' });
  });
});

describe('JobBoard', () => {
  it('tiền công theo quãng đường, làm tròn nghìn', () => {
    expect(jobPay(0)).toBe(15_000);
    expect(jobPay(300)).toBe(54_000);
  });

  it('kèo hợp lệ: điểm lấy / giao ở ngoài nhà, trong khu chơi, xa vừa phải; có seed', () => {
    const board = new JobBoard(city, 5);
    const again = new JobBoard(city, 5);
    const offers = board.offers(city.spawn.x, city.spawn.z, 12);
    expect(JSON.stringify(again.offers(city.spawn.x, city.spawn.z, 12))).toBe(JSON.stringify(offers));
    let inHem = 0;
    for (const job of offers) {
      expect(job.objectives).toHaveLength(2);
      for (const o of job.objectives) {
        if (o.kind !== 'goto') throw new Error('kèo chỉ gồm điểm lấy và điểm giao');
        expect(containsPoint(city.playArea, o.x, o.z)).toBe(true);
        expect(city.lots.some((l) => containsPoint(l.rect, o.x, o.z))).toBe(false);
        if (o.label.includes('Hẻm')) inHem++;
      }
      const [a, b] = job.objectives as Array<{ x: number; z: number }>;
      const d = Math.hypot(a!.x - b!.x, a!.z - b!.z);
      expect(d).toBeGreaterThan(100);
      // Hàng nóng: tiền gần gấp đôi và có Độ Nóng.
      expect(job.reward).toBe(job.heat ? Math.round((jobPay(d) * 1.8) / 1000) * 1000 : jobPay(d));
      expect(job.timeLimit).toBeGreaterThan(45);
    }
    // Có kèo giao vào hẻm.
    expect(inHem).toBeGreaterThan(0);
  });

  it('điểm trước cửa nhà trong hẻm nằm trong lòng hẻm', () => {
    const lot = city.lots.find((l) => l.frontage === 'hem')!;
    const s = doorstep(city, lot);
    expect(city.hems.some((h) => containsPoint(h.rect, s.x, s.z))).toBe(true);
  });
});
