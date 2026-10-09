import { describe, expect, it } from 'vitest';
import { containsPoint } from '@/core/rect';
import { buildStory, FIRST_INSTALLMENT, insideAnyLot } from '@/missions/story';
import { MissionRunner } from '@/missions/mission';
import { generateCity } from '@/world/city/layout';

const city = generateCity();
const story = buildStory(city);

describe('Hồi 1', () => {
  it('đủ 5 nhiệm vụ, id riêng, có lời thoại mở / kết', () => {
    expect(story).toHaveLength(5);
    expect(new Set(story.map((s) => s.def.id)).size).toBe(5);
    for (const s of story) {
      expect(s.intro.length).toBeGreaterThan(0);
      expect(s.outro.length).toBeGreaterThan(0);
    }
  });

  it('mọi điểm hẹn / mục tiêu nằm trong khu chơi, không lọt vào nhà', () => {
    for (const s of story) {
      const points = [s.start, ...s.def.objectives.flatMap((o) => ('x' in o ? [o] : []))];
      for (const p of points) {
        expect(containsPoint(city.playArea, p.x, p.z)).toBe(true);
        expect(insideAnyLot(city, p.x, p.z)).toBe(false);
      }
    }
  });

  it('nhiệm vụ 2 luồn qua 3 hẻm; nhiệm vụ 4 có truy đuổi + cắt đuôi; nhiệm vụ 5 trả nợ kỳ đầu', () => {
    const hemPoints = story[1]!.def.objectives.filter((o) => o.kind === 'goto' && o.label.startsWith('Luồn hẻm'));
    expect(hemPoints).toHaveLength(3);
    for (const p of hemPoints) if (p.kind === 'goto') expect(city.hems.some((h) => containsPoint(h.rect, p.x, p.z))).toBe(true);
    expect(story[3]!.def.heat?.level).toBe(2);
    expect(story[3]!.def.objectives.some((o) => o.kind === 'escape')).toBe(true);
    expect(story[4]!.requiresCash).toBe(FIRST_INSTALLMENT);
    expect(story[4]!.paysDebt).toBe(FIRST_INSTALLMENT);
  });

  it('tiền thưởng Hồi 1 cộng lại chưa đủ trả kỳ đầu ⇒ phải chạy thêm kèo', () => {
    const total = story.reduce((n, s) => n + s.def.reward, 0) + 150_000; // + tiền mặt ban đầu
    expect(total).toBeLessThan(FIRST_INSTALLMENT);
    expect(total).toBeGreaterThan(FIRST_INSTALLMENT * 0.8);
  });

  it('chạy thử nhiệm vụ 4: lấy hàng, cắt đuôi, giao', () => {
    const def = story[3]!.def;
    const m = new MissionRunner(def);
    const [pick, , drop] = def.objectives as Array<{ x: number; z: number }>;
    m.update(2.1, { x: pick!.x, z: pick!.z, riding: true, heat: 0 });
    expect(m.index).toBe(1);
    // Còn Độ Nóng thì chưa xong bước cắt đuôi.
    m.update(1, { x: 0, z: 0, riding: true, heat: 2 });
    expect(m.index).toBe(1);
    m.update(1, { x: 0, z: 0, riding: true, heat: 0 });
    const ev = m.update(0.1, { x: drop!.x, z: drop!.z, riding: true, heat: 0 });
    expect(ev.at(-1)).toMatchObject({ type: 'complete', reward: 650_000 });
  });
});
